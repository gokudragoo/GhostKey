import fs from "node:fs";
import { ContractFactory, JsonRpcProvider, Wallet, formatEther } from "ethers";
import { compileContract } from "./compile-contract.mjs";

const rpcUrl = process.env.OG_RPC_URL || "https://evmrpc-testnet.0g.ai";
const explorerUrl =
  process.env.OG_EXPLORER_URL || "https://chainscan-galileo.0g.ai";
const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
if (!privateKey) throw new Error("DEPLOYER_PRIVATE_KEY is required.");

const provider = new JsonRpcProvider(rpcUrl, {
  chainId: 16602,
  name: "0G Galileo",
});
const wallet = new Wallet(privateKey, provider);
const network = await provider.getNetwork();
if (Number(network.chainId) !== 16602)
  throw new Error("RPC is not 0G Galileo.");
const balance = await provider.getBalance(wallet.address);
if (balance === 0n)
  throw new Error("Deployment wallet has no 0G testnet balance.");

const artifact = compileContract();
const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
const contract = await factory.deploy();
const deployment = contract.deploymentTransaction();
await contract.waitForDeployment();
const address = await contract.getAddress();
const record = {
  network: "0G Galileo",
  chainId: 16602,
  address,
  deployer: wallet.address,
  transactionHash: deployment?.hash,
  explorer: explorerUrl + "/address/" + address,
  deployedAt: new Date().toISOString(),
};
fs.mkdirSync("deployments", { recursive: true });
fs.writeFileSync("deployments/galileo.json", JSON.stringify(record, null, 2));
console.log("Deployer:", wallet.address);
console.log("Balance before deployment:", formatEther(balance), "0G");
console.log("Contract:", address);
console.log("Transaction:", deployment?.hash);
console.log("Explorer:", record.explorer);
