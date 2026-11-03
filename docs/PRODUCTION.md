# TopPay production guide

TopPay runs on **Arc Mainnet only** (chain ID 5042). It moves real USDC and transfers cannot be reversed. This guide covers hosting the web app and the checks to run before and after launch. Contract deployment (optional) is in [DEPLOYMENT.md](DEPLOYMENT.md).

## 1. Before you launch

Run these from the project root. None of them sends funds or needs a private key.

```bash
bun install
bun run check            # lint + typecheck
bun run verify:mainnet   # live, read-only checks against Arc Mainnet
bun run build            # production build into dist/
forge build && forge test   # only if you ship the optional contract
```

`verify:mainnet` confirms: every configured RPC reports chain 5042 over https, the USDC predeploy answers, the fee cap respects Arc's 20 gwei floor, real native transfers have successful receipts whose logs match, native and ERC-20 balances agree, a transfer simulates at about 21,000 gas, and the app's history reader reproduces a real transfer. To test failover, run `VITE_ARC_RPC_URL=https://127.0.0.1:9 bun run verify:mainnet` (a dead endpoint first, the official one second).

Then do one **manual test with a small amount** from a wallet you control: send 0.01 USDC to a second address you own, confirm the wallet prompt shows the right recipient and amount, wait for "Payment confirmed", and check the transaction on the explorer.

## 2. Configuration

Everything has a safe default. Set variables in your host's environment settings **before building**, because `VITE_` values are baked into the build. Only public values belong in `VITE_` variables.

| Variable | Purpose |
| --- | --- |
| `VITE_ARC_RPC_URL` | Dedicated Arc Mainnet RPC (https), tried first. Recommended for production traffic. |
| `VITE_ARC_RPC_FALLBACK_URLS` | Comma separated backup RPCs (https). |
| `VITE_TOPPAY_CONTRACT_ADDRESS` | Optional deployed TopPay contract. Leave empty if you have not deployed one. |
| `VITE_HISTORY_CHUNK_BLOCKS` | Blocks per history request (default 5000). |

Chain, RPC list and fee settings live in `config/network.ts`. Never put a private key, API key or deployer credential in any `VITE_` variable.

## 3. Hosting

The app is a static site. Build with `bun run build` and serve `dist/`.

- **Netlify / Cloudflare Pages:** `public/_headers` is copied into `dist/` and sets the security headers.
- **Vercel:** `vercel.json` sets the same headers.
- **Other hosts:** apply the headers from `vercel.json` yourself.
- Serve over HTTPS only.

If you set a custom RPC, add its origin to `connect-src` in the Content-Security-Policy, otherwise the browser blocks it. The policy also allows Google Fonts for the typefaces and lets the Arc Studio share frame embed the page (`frame-ancestors`). Remove those origins if you do not use them.

## 4. Operations

- **Monitoring:** the in-app Network panel shows RPC status, latest block and latency. For uptime checks, run `bun run verify:mainnet` on a schedule.
- **RPC limits:** the public endpoint rate-limits and caps `eth_getLogs` ranges. History scans in small chunks, backs off on rate limits, and never starts from block 0. Use a dedicated provider for real traffic.
- **Fee floor:** Arc silently drops transactions with `maxFeePerGas` under 20 gwei. The app enforces the floor on every send.
- **Finality:** Arc finality is immediate, so one block inclusion is final. The app still waits for a successful receipt before showing success.
- **Stuck status:** if a payment shows "Not confirmed yet", the app never resubmits. Check the transaction hash on the explorer; do not send again until you know it did not land.
- **Updating the contract address:** change `VITE_TOPPAY_CONTRACT_ADDRESS` and rebuild.

## 5. Security checklist

- [ ] `bun run check` passes and `bun run verify:mainnet` reports all checks passed
- [ ] Manual 0.01 USDC test completed on mainnet from your own wallet
- [ ] Hosted over HTTPS with the security headers applied
- [ ] No secrets in `VITE_` variables or committed files (`.env` is git-ignored)
- [ ] If you deploy the contract: deployed from a dedicated wallet, address verified onchain, `VITE_TOPPAY_CONTRACT_ADDRESS` set, and the app's Network panel shows "verified"
- [ ] Dependencies reviewed with `bun audit` (see known items below)
- [ ] An independent professional audit if you route significant value through the contract

## 6. Known limitations

- History is read from Arc's USDC transfer logs. **Reverted transactions do not appear**, and very old activity needs "Scan older blocks".
- Only browser wallets that inject an EIP-1193 provider are supported (MetaMask, Rabby, Coinbase Wallet extension and similar). WalletConnect is not included.
- `bun audit` reports advisories in transitive dependencies of wagmi (WalletConnect, zod, uuid) and of the Circle SDK used only by optional deployment scripts. None are on the payment path, but re-check with `bun audit` and update before each release.
- **RPC reliability.** The public endpoint rate-limits bursts. TopPay smooths its requests, skips an endpoint for a while after it rate-limits, and falls back to the official Blockdaemon endpoint from the Arc docs (only after it proves it is chain 5042). Add more with `VITE_ARC_RPC_FALLBACK_URLS`, or put a dedicated provider first with `VITE_ARC_RPC_URL`; both must be https and added to the Content-Security-Policy `connect-src` (and `public/_headers` / `vercel.json`) because the browser calls them directly. The shipped CSP already allows `https://rpc.blockdaemon.mainnet.arc.io`.
- **Swap** uses Uniswap V3 directly over the Arc RPC (no API key, no backend), so it works on any static host. Quotes are live and can change before you confirm; liquidity in some pools is thin, so check price impact.
- The optional TopPay contract has no admin and cannot recover native funds forced into it by other means.
