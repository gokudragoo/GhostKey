// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title GhostKey Manager
/// @notice Minimal policy guard for autonomous agents on 0G Galileo.
contract GhostKeyManager {
    uint8 public constant ACTION_SWAP = 1;
    uint8 public constant ACTION_TRANSFER = 2;

    struct Policy {
        address owner;
        address agent;
        address target;
        uint256 maxPerTx;
        uint256 totalLimit;
        uint256 spent;
        uint256 expiresAt;
        uint256 maxTransactions;
        uint256 transactionCount;
        uint8 actionMask;
        bytes4 allowedSelector;
        bool active;
    }

    uint256 public nextPolicyId;
    mapping(uint256 => Policy) private policies;
    mapping(address => uint256[]) private ownerPolicies;
    bool private executing;

    event PolicyCreated(uint256 indexed policyId, address indexed owner, address indexed agent);
    event PolicyRevoked(uint256 indexed policyId, address indexed owner);
    event PolicyExecuted(uint256 indexed policyId, address indexed agent, uint8 action, uint256 amount, bool success);

    modifier onlyOwner(uint256 policyId) {
        require(policies[policyId].owner == msg.sender, "not policy owner");
        _;
    }

    modifier nonReentrant() {
        require(!executing, "reentrant call");
        executing = true;
        _;
        executing = false;
    }

    function createPolicy(
        address agent,
        address target,
        uint256 maxPerTx,
        uint256 totalLimit,
        uint256 expiresAt,
        uint256 maxTransactions,
        uint8 actionMask,
        bytes4 allowedSelector
    ) external returns (uint256 policyId) {
        require(agent != address(0), "agent required");
        require(target != address(0), "target required");
        require(maxPerTx > 0 && totalLimit >= maxPerTx, "invalid limits");
        require(expiresAt > block.timestamp, "expiry in past");
        require(maxTransactions > 0, "transaction count required");
        require(actionMask > 0, "action required");
        require(allowedSelector != bytes4(0), "selector required");
        require(target.code.length > 0, "target must be contract");

        policyId = nextPolicyId++;
        policies[policyId] = Policy({
            owner: msg.sender,
            agent: agent,
            target: target,
            maxPerTx: maxPerTx,
            totalLimit: totalLimit,
            spent: 0,
            expiresAt: expiresAt,
            maxTransactions: maxTransactions,
            transactionCount: 0,
            actionMask: actionMask,
            allowedSelector: allowedSelector,
            active: true
        });
        ownerPolicies[msg.sender].push(policyId);
        emit PolicyCreated(policyId, msg.sender, agent);
    }

    function revokePolicy(uint256 policyId) external onlyOwner(policyId) {
        policies[policyId].active = false;
        emit PolicyRevoked(policyId, msg.sender);
    }

    function getPolicy(uint256 policyId) external view returns (Policy memory) {
        return policies[policyId];
    }

    function getOwnerPolicies(address owner) external view returns (uint256[] memory) {
        return ownerPolicies[owner];
    }

    function executePolicy(
        uint256 policyId,
        uint8 action,
        uint256 amount,
        bytes calldata data
    ) external nonReentrant returns (bytes memory result) {
        Policy storage policy = policies[policyId];
        require(policy.active, "policy inactive");
        require(msg.sender == policy.agent, "agent not authorized");
        require(block.timestamp < policy.expiresAt, "policy expired");
        require((policy.actionMask & action) == action, "action not allowed");
        require(action != 0, "invalid action");
        require(amount > 0, "amount required");
        require(amount <= policy.maxPerTx, "per transaction limit exceeded");
        require(policy.spent + amount <= policy.totalLimit, "total limit exceeded");
        require(policy.transactionCount < policy.maxTransactions, "transaction count exceeded");
        require(data.length >= 4, "calldata selector required");

        bytes4 selector;
        assembly {
            selector := calldataload(data.offset)
        }
        require(selector == policy.allowedSelector, "function not allowed");

        policy.spent += amount;
        policy.transactionCount += 1;
        (bool success, bytes memory returned) = policy.target.call(data);
        emit PolicyExecuted(policyId, msg.sender, action, amount, success);
        require(success, "target call failed");
        return returned;
    }
}
