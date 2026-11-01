# TopPay contract deployment

TopPay targets **Arc Mainnet only** (chain ID 5042). Mainnet moves real USDC and transactions are irreversible. Review everything below yourself, test with small amounts, and consider an independent audit before relying on it.

> The optional receipt contract keeps its original name, **ArcSend**: the source file, the onchain identifier `ArcSend.v1` and the `VITE_ARCSEND_CONTRACT_ADDRESS` variable are unchanged, so any existing deployment and configuration keep working.

## What needs deploying

| Piece | Needs a contract? |
| --- | --- |
| Sending USDC | No. The app sends a plain native USDC transfer from your wallet. |
| Receiving, balance, history | No. They are read directly from Arc Mainnet. |
| `contracts/ArcSend.sol` | Optional. A stateless helper that forwards USDC and emits a receipt with a memo. The app does not route payments through it. |

You can ship the app without deploying any contract.

## 1. Configure

All configuration lives in two files you should not need to edit for normal changes:

- `config/network.ts`: Arc Mainnet chain, RPC list, explorer, USDC facts, fee floor, retry and history settings.
- `config/contract.ts` and `config/abi.ts`: optional contract address handling and the ABI.

Set values through environment variables (see `config/env.example`):

| Variable | Purpose |
| --- | --- |
| `VITE_ARCSEND_CONTRACT_ADDRESS` | Address of a deployed ArcSend contract. Empty means "not configured". |
| `VITE_ARC_RPC_URL` | Your own RPC (https), tried first. |
| `VITE_ARC_RPC_FALLBACK_URLS` | Comma separated backup RPCs (https). |
| `VITE_HISTORY_CHUNK_BLOCKS` | Blocks per history request. |

To change the contract address later, change `VITE_ARCSEND_CONTRACT_ADDRESS` and restart or rebuild the app. No component edits are needed.

## 2. Build and test the contract

```bash
forge build
```

The compiler is pinned to Solidity 0.8.28 in `foundry.toml`. Run `forge test` for the unit, fuzz and invariant tests in `contracts/test/ArcSend.t.sol`. Local simulators run a standard EVM, not Arc's, so also try your deployment with a small amount on Arc before relying on it.

## 3. Deploy the contract (optional)

You deploy from your own wallet. The script reads the key from your shell environment only, never from a file, and never prints it. Use a dedicated deployer wallet funded with just enough USDC for gas.

```bash
# Dry run: checks the network, estimates gas, broadcasts nothing
DEPLOYER_PRIVATE_KEY=0x... bun run deploy:arcsend

# Real mainnet deployment
DEPLOYER_PRIVATE_KEY=0x... bun run deploy:arcsend --confirm
```

After a successful deployment the script confirms there is code at the address and that `identifier()` matches, then prints the line to add to your environment:

```
VITE_ARCSEND_CONTRACT_ADDRESS=0x...
```

Alternatively deploy with Foundry using an encrypted keystore (`cast wallet import`) rather than a raw key on the command line. Use the RPC URL from `config/network.ts` (`https://rpc.mainnet.arc.io`), include `--broadcast`, and still set the resulting address through the environment variable.

This repository has not deployed the contract for you. Until you do, the app shows "Not configured" for it.

## 4. Deploy the web app

See [PRODUCTION.md](PRODUCTION.md) for hosting, security headers, the pre-launch checklist and operations notes.

```bash
bun install
bun run build
```

Serve the `dist/` folder from any static host and set the `VITE_` variables in the host's settings before building. Users need a browser wallet (MetaMask or another EVM wallet). The app asks the wallet to switch to or add Arc Mainnet.

## Operational notes

- Arc requires `maxFeePerGas` of at least 20 gwei. The app enforces this on every send.
- Finality is immediate: one block inclusion is final.
- The public RPC rate limits and caps `eth_getLogs` ranges. History scans in small chunks, retries, and offers "Scan older blocks" instead of crawling from genesis. For heavy use, set `VITE_ARC_RPC_URL` to a dedicated provider.
- Transaction history comes from the EIP-7708 system `Transfer` log. Reverted transactions emit no log and do not appear.
