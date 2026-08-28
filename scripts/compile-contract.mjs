import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";

export function compileContract() {
  const sourcePath = path.resolve("contracts/GhostKeyManager.sol");
  const input = {
    language: "Solidity",
    sources: {
      "GhostKeyManager.sol": { content: fs.readFileSync(sourcePath, "utf8") },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
        },
      },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors || []).filter(
    (entry) => entry.severity === "error",
  );
  if (errors.length) {
    throw new Error(errors.map((entry) => entry.formattedMessage).join("\n"));
  }
  const compiled = output.contracts["GhostKeyManager.sol"].GhostKeyManager;
  const artifact = {
    contractName: "GhostKeyManager",
    abi: compiled.abi,
    bytecode: "0x" + compiled.evm.bytecode.object,
    deployedBytecode: "0x" + compiled.evm.deployedBytecode.object,
  };
  fs.mkdirSync("artifacts", { recursive: true });
  fs.writeFileSync(
    "artifacts/GhostKeyManager.json",
    JSON.stringify(artifact, null, 2),
  );
  return artifact;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const artifact = compileContract();
  console.log(
    "GhostKeyManager compiled:",
    artifact.bytecode.length / 2 - 1,
    "bytes",
  );
}
