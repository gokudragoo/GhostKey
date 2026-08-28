# GhostKey

GhostKey is a small, auditable permission layer for autonomous agents on 0G Galileo. The frontend runs in local preview mode until a deployed `GhostKeyManager` address is provided, then reads and writes real policy state through an injected wallet.

## Run

```bash
npm install
copy .env.example .env
npm run dev
```

Set `VITE_GHOSTKEY_MANAGER_ADDRESS` in `.env` after deploying `contracts/GhostKeyManager.sol` to Galileo. The official network defaults are chain ID `16602`, RPC `https://evmrpc-testnet.0g.ai`, and explorer `https://chainscan-galileo.0g.ai`.

The contract intentionally keeps the MVP narrow: each policy has one approved target, action bitmask, per-transaction cap, total cap, transaction count, and expiry. Expand calldata-level checks before using it with real funds.
