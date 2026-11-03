# TopPay

A lightweight dashboard to send and receive USDC on Arc Mainnet from a browser wallet such as MetaMask. It shows your real USDC balance, a QR code to receive payments, and your recent sent and received transactions read from the chain.

Built with [Arc Studio](https://studio.arc.io)

> Arc Mainnet moves real USDC and transactions cannot be reversed. Test with small amounts, and review the code and any contract you deploy before relying on it.

> The optional payments contract is now named **TopPay** (`contracts/TopPay.sol`, previously `ArcSend.sol`). Behavior and security protections are unchanged. It is version 2: single and batch payments, payment requests and escrow. Its onchain identifier is deliberately still `keccak256("ArcSend.v2")`, so a contract already deployed from the old source stays recognized by the app. Version 1 was never deployed. The address variable is now `VITE_TOPPAY_CONTRACT_ADDRESS`; the old `VITE_ARCSEND_CONTRACT_ADDRESS` is still read if the new one is empty.

## Features

- Connect MetaMask or another browser wallet; the app reacts to account and network changes
- Send USDC with address and amount validation, a fee estimate, a summary step and wallet approval
- Success is shown only after the transaction is confirmed onchain; a transaction hash and explorer link are shown
- Receive with a copyable address and QR code; incoming payments appear automatically
- Recent activity grouped by day with Sent/Received filters, status badges and a link to the explorer on every row
- One-tap copy of your wallet address
- Swap USDC, EURC, cirBTC and WETH directly on Uniswap V3 on Arc Mainnet: live onchain quotes, pool fee tier, price impact, minimum received, exact-amount approvals and a simulation before every swap (no API key; see `docs/UNISWAP.md`)
- Compact Arc Mainnet and RPC status on the dashboard; a Settings sheet holds RPC endpoints and the optional receipt contract status

## Tech stack

React, TypeScript, Vite, Tailwind CSS, wagmi and viem, qrcode.react, framer-motion. Optional Solidity contract in `contracts/` built with Foundry.

## Project layout

- `config/network.ts`: Arc Mainnet chain, RPC list, explorer and fee settings
- `config/contract.ts`, `config/abi.ts`: optional contract address and ABI
- `src/`: app code (`components/`, `pages/`, `hooks/`, `services/`)
- `contracts/TopPay.sol`: optional receipt helper contract
- `scripts/deploy-toppay.ts`: deploys the contract from your own wallet
- `scripts/verify-mainnet.ts`: read-only production checks (no funds, no keys)
- `docs/UNISWAP.md`: swap setup, security model and testing
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
bun run test:swap        # offline tests for the Swap feature
bun run verify:uniswap   # read-only live checks of Uniswap V3 on Arc (contracts, pools, quotes)
bun run test:swap-fork   # approve and swap on a local arc-anvil fork (see docs/UNISWAP.md)
bun run test:rpc         # live check of RPC burst smoothing, failover and wrong-chain refusal
```

### Environment variables

All are optional. See `config/env.example`.

| Name | Purpose |
| --- | --- |
| `VITE_TOPPAY_CONTRACT_ADDRESS` | Address of a deployed TopPay contract |
| `VITE_ARC_RPC_URL` | Your own Arc Mainnet RPC (https), tried first |
| `VITE_ARC_RPC_FALLBACK_URLS` | Comma separated backup RPCs (https) |
| `VITE_HISTORY_CHUNK_BLOCKS` | Blocks per history request |
| `DEPLOYER_PRIVATE_KEY` | Only for `bun run deploy:toppay`; set in your shell, never commit it |

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for contract and app deployment.
