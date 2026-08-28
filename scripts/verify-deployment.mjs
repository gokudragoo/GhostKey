import fs from "node:fs";
import { Contract, JsonRpcProvider } from "ethers";

const deployment = JSON.parse(
  fs.readFileSync("deployments/galileo.json", "utf8"),
);
const artifact = JSON.parse(
  fs.readFileSync("artifacts/GhostKeyManager.json", "utf8"),
);
const provider = new JsonRpcProvider(
  process.env.OG_RPC_URL || "https://evmrpc-testnet.0g.ai",
  { chainId: 16602, name: "0G Galileo" },
);
const network = await provider.getNetwork();
if (Number(network.chainId) !== 16602) throw new Error("Unexpected chain.");
const code = await provider.getCode(deployment.address);
if (code === "0x") throw new Error("No bytecode at deployed address.");
const manager = new Contract(deployment.address, artifact.abi, provider);
const nextPolicyId = await manager.nextPolicyId();
console.log("Verified GhostKeyManager at", deployment.address);
console.log("Runtime bytecode:", (code.length - 2) / 2, "bytes");
console.log("Next policy ID:", nextPolicyId.toString());
