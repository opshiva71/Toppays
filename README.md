# TopPay

A lightweight dashboard to send and receive USDC on Arc Mainnet from a browser wallet such as MetaMask. It shows your real USDC balance, a QR code to receive payments, and your recent sent and received transactions read from the chain.

Built with [Arc Studio](https://studio.arc.io)

> Arc Mainnet moves real USDC and transactions cannot be reversed. Test with small amounts, and review the code and any contract you deploy before relying on it.

> The optional payments contract keeps its original name, **ArcSend**. It is now version 2 (onchain identifier `ArcSend.v2`): single and batch payments, payment requests and escrow. Version 1 was never deployed. The `VITE_ARCSEND_CONTRACT_ADDRESS` variable is unchanged.

## Features

- Connect MetaMask or another browser wallet; the app reacts to account and network changes
- Send USDC with address and amount validation, a fee estimate, a summary step and wallet approval
- Success is shown only after the transaction is confirmed onchain; a transaction hash and explorer link are shown
- Receive with a copyable address and QR code; incoming payments appear automatically
- Recent activity grouped by day with Sent/Received filters, status badges and a link to the explorer on every row
- One-tap copy of your wallet address
- Compact Arc Mainnet and RPC status on the dashboard; a Settings sheet holds RPC endpoints and the optional receipt contract status

## Tech stack

React, TypeScript, Vite, Tailwind CSS, wagmi and viem, qrcode.react, framer-motion. Optional Solidity contract in `contracts/` built with Foundry.

## Project layout

- `config/network.ts`: Arc Mainnet chain, RPC list, explorer and fee settings
- `config/contract.ts`, `config/abi.ts`: optional contract address and ABI
- `src/`: app code (`components/`, `pages/`, `hooks/`, `services/`)
- `contracts/ArcSend.sol`: optional receipt helper contract
- `scripts/deploy-arcsend.ts`: deploys the contract from your own wallet
- `scripts/verify-mainnet.ts`: read-only production checks (no funds, no keys)
- `docs/PRODUCTION.md`: production hosting guide and checklist
- `docs/DEPLOYMENT.md`: optional contract deployment guide
- `public/_headers`, `vercel.json`: security headers for static hosts

## Development

Prerequisites: [Bun](https://bun.sh), and [Foundry](https://getfoundry.sh) if you work on the contract.

```bash
bun install
bun run dev          # start the app
bun run check        # lint and typecheck
bun run contracts:build
bun run build        # production build into dist/
bun run verify:mainnet   # read-only live checks against Arc Mainnet
```

### Environment variables

All are optional. See `config/env.example`.

| Name | Purpose |
| --- | --- |
| `VITE_ARCSEND_CONTRACT_ADDRESS` | Address of a deployed ArcSend contract |
| `VITE_ARC_RPC_URL` | Your own Arc Mainnet RPC (https), tried first |
| `VITE_ARC_RPC_FALLBACK_URLS` | Comma separated backup RPCs (https) |
| `VITE_HISTORY_CHUNK_BLOCKS` | Blocks per history request |
| `DEPLOYER_PRIVATE_KEY` | Only for `bun run deploy:arcsend`; set in your shell, never commit it |

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for contract and app deployment.
