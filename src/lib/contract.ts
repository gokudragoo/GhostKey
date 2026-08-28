import {
  BrowserProvider,
  JsonRpcSigner,
  Contract,
  formatUnits,
  id,
  isAddress,
  parseUnits,
} from "ethers";

export const OG_CHAIN_ID = Number(import.meta.env.VITE_OG_CHAIN_ID || 16602);
export const OG_RPC_URL =
  import.meta.env.VITE_OG_RPC_URL || "https://evmrpc-testnet.0g.ai";
export const OG_EXPLORER_URL =
  import.meta.env.VITE_OG_EXPLORER_URL || "https://chainscan-galileo.0g.ai";
export const MANAGER_ADDRESS =
  import.meta.env.VITE_GHOSTKEY_MANAGER_ADDRESS || "";
export const ASSET_SYMBOL = import.meta.env.VITE_ASSET_SYMBOL || "USDC";
export const ASSET_DECIMALS = Number(import.meta.env.VITE_ASSET_DECIMALS || 6);

export const managerAbi = [
  "function nextPolicyId() view returns (uint256)",
  "function getOwnerPolicies(address owner) view returns (uint256[])",
  "function getPolicy(uint256 policyId) view returns (tuple(address owner,address agent,address target,uint256 maxPerTx,uint256 totalLimit,uint256 spent,uint256 expiresAt,uint256 maxTransactions,uint256 transactionCount,uint8 actionMask,bytes4 allowedSelector,bool active))",
  "function createPolicy(address agent,address target,uint256 maxPerTx,uint256 totalLimit,uint256 expiresAt,uint256 maxTransactions,uint8 actionMask,bytes4 allowedSelector) returns (uint256)",
  "function revokePolicy(uint256 policyId)",
  "function executePolicy(uint256 policyId,uint8 action,uint256 amount,bytes data)",
  "event PolicyCreated(uint256 indexed policyId,address indexed owner,address indexed agent)",
  "event PolicyRevoked(uint256 indexed policyId,address indexed owner)",
  "event PolicyExecuted(uint256 indexed policyId,address indexed agent,uint8 action,uint256 amount,bool success)",
];

export type PolicyRecord = {
  id: string;
  agent: string;
  target: string;
  maxPerTx: string;
  totalLimit: string;
  spent: string;
  expiresAt: number;
  maxTransactions: number;
  transactionCount: number;
  actionMask: number;
  allowedSelector: string;
  active: boolean;
  source: "chain" | "local";
};

export function getInjectedProvider() {
  const ethereum = (window as Window & { ethereum?: unknown }).ethereum;
  return ethereum ? new BrowserProvider(ethereum as never) : null;
}

export async function ensureOgNetwork() {
  const ethereum = (
    window as Window & {
      ethereum?: {
        request: (args: {
          method: string;
          params?: unknown[];
        }) => Promise<unknown>;
      };
    }
  ).ethereum;
  if (!ethereum)
    throw new Error("Install MetaMask or another EVM wallet to continue.");
  const chainId = "0x" + OG_CHAIN_ID.toString(16);
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  } catch (error: unknown) {
    if ((error as { code?: number })?.code !== 4902) throw error;
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId,
          chainName: "0G Galileo Testnet",
          nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
          rpcUrls: [OG_RPC_URL],
          blockExplorerUrls: [OG_EXPLORER_URL],
        },
      ],
    });
  }
}

export async function getSigner(): Promise<JsonRpcSigner> {
  const provider = getInjectedProvider();
  if (!provider) throw new Error("Connect an EVM wallet first.");
  await ensureOgNetwork();
  return provider.getSigner();
}

export function managerWith(providerOrSigner: BrowserProvider | JsonRpcSigner) {
  if (!MANAGER_ADDRESS)
    throw new Error(
      "Manager contract is not configured. Add VITE_GHOSTKEY_MANAGER_ADDRESS to .env.",
    );
  return new Contract(MANAGER_ADDRESS, managerAbi, providerOrSigner);
}

export function toPolicyRecord(
  id: bigint,
  raw: Record<string, unknown>,
  source: "chain" | "local",
): PolicyRecord {
  const tuple = raw as {
    agent: string;
    target: string;
    maxPerTx: bigint;
    totalLimit: bigint;
    spent: bigint;
    expiresAt: bigint;
    maxTransactions: bigint;
    transactionCount: bigint;
    actionMask: bigint;
    allowedSelector: string;
    active: boolean;
  };
  return {
    id: id.toString(),
    agent: tuple.agent,
    target: tuple.target,
    maxPerTx: formatUnits(tuple.maxPerTx, ASSET_DECIMALS),
    totalLimit: formatUnits(tuple.totalLimit, ASSET_DECIMALS),
    spent: formatUnits(tuple.spent, ASSET_DECIMALS),
    expiresAt: Number(tuple.expiresAt),
    maxTransactions: Number(tuple.maxTransactions),
    transactionCount: Number(tuple.transactionCount),
    actionMask: Number(tuple.actionMask),
    allowedSelector: tuple.allowedSelector,
    active: tuple.active,
    source,
  };
}

export function amountToUnits(value: string) {
  return parseUnits(value || "0", ASSET_DECIMALS);
}
export function isValidAddress(value: string) {
  return isAddress(value);
}
export function selectorFromSignature(value: string) {
  const normalized = value
    .trim()
    .replace(/^function\s+/, "")
    .replace(/\s+/g, "");
  if (!/^[A-Za-z_][A-Za-z0-9_]*\([^)]*\)$/.test(normalized))
    throw new Error("Enter a function signature like swap(address,uint256).");
  return id(normalized).slice(0, 10);
}
