# TopPay production readiness report

Date: 2026-11-01. Target: Arc Mainnet (chain ID 5042). No contract was deployed and no funds were sent during this review.

> The optional payments contract keeps its original name, **ArcSend**. It is now version 2 (onchain identifier `ArcSend.v2`): single and batch payments, payment requests and escrow. Version 1 was never deployed. The `VITE_ARCSEND_CONTRACT_ADDRESS` variable is unchanged.

> This report covers the app and the original (v1) receipt helper. ArcSend v2 was written, reviewed and tested afterwards; see `contracts/ArcSend-design.md` and `docs/DEPLOYMENT.md`.

## Verdict

**Ready for a controlled mainnet launch of the app**, subject to the manual steps in "Still on you" below. The payment path is native USDC transfers from the user's own wallet; the optional ArcSend contract is not deployed and not required.

## Results by requirement

| # | Requirement | Result | Evidence |
|---|---|---|---|
| 1 | Security audit | Done. 1 contract hardened, 4 frontend fixes, 1 real bug fixed | See "Security" |
| 2 | Chain ID 5042 | Pass | Registry marks 5042 as non-testnet Arc; `config/network.ts` throws at load otherwise; RPC `eth_chainId` = 0x13b2; app blocks sends if the RPC reports another chain |
| 3 | Official RPC | Pass | `https://rpc.mainnet.arc.io` matches the Arc docs primary endpoint; https-only enforcement on custom RPCs |
| 4 | Native USDC transfers | Pass (simulated, not sent) | Real mainnet transfer inspected: tx value equals the 18-decimal log value; `estimateGas` for a 1 USDC send = 21,227 gas; browser test confirms the wallet request is a plain native transfer (no data) with exact value and maxFeePerGas at or above 20 gwei |
| 5 | Real confirmations | Pass | Success is set only from a mined receipt with status success; reverted, timed-out and rejected paths verified in code; wallet rejection shows "Cancelled", exactly one wallet request per review; no automatic resubmission |
| 6 | History from real data | Pass | History reproduces a real mainnet transfer; every entry maps to a successful receipt; no stored or generated records |
| 7 | Mobile | Pass | Headless Chromium at 360, 375 and 1280 px: no horizontal overflow, sheets usable, 16px inputs (no iOS zoom), 44px tap targets |
| 8 | Errors and RPC fallback | Pass | Dead primary endpoint falls back to the official one; blocked RPC shows an honest status and retry; wrong wallet network shows a banner and blocks send |
| 9 | Unused code and dependencies | Done | See "Cleanup" |
| 10 | Production docs | Done | `docs/PRODUCTION.md`, `docs/DEPLOYMENT.md`, security headers |

## Security

**Contract (`contracts/ArcSend.sol`, optional)**
- Maximum-depth review found two low findings; both fixed: the receipt event is now emitted before the external call (a re-entering recipient can no longer reorder receipts), and `TransferFailed` now carries the recipient and amount. Pragma pinned to exactly 0.8.28.
- Re-review after the fixes: no findings. Static analysis: informational only (a low-level call that is intentional, and the pragma note that the pin resolves).
- 32 Foundry tests pass (unit, fuzz, and two invariants: the contract never holds funds, and all forwarded value reaches the recipient).
- Residual: `identifier()` is a version check, not proof of authenticity. Always take the address from your own deployment. Funds forced in by selfdestruct or block rewards cannot be recovered.

**Frontend**
- Added: refuse to quote or send when the RPC reports a chain other than 5042; sanity caps on fee (RPC cannot talk a user into an absurd fee) and gas; wallet icons only render as data-image or https URLs.
- Verified clean: no `innerHTML`, `eval` or `localStorage`; no secrets in client code; all explorer links use `noopener noreferrer`; recipient validation rejects zero address, own address, malformed or bad-checksum input, and protocol addresses; amounts use exact integer math (no floats) and reject more than 6 decimals; an account change during review discards the unsent review.
- Contract recipients are probed first: sending to a contract that rejects plain value is blocked with a clear message (observed live against a real mainnet contract).
- Security headers and a strict Content-Security-Policy ship in `public/_headers` and `vercel.json`. The production build was loaded under that policy in a browser with zero violations.

**Real bugs found and fixed during this pass**
1. History fetched one block per row to get timestamps. On a busy wallet that was about 1,900 requests and the public RPC answered 429. It now uses the timestamp already in each log: about 12 requests for the same wallet.
2. On phones the fixed "Built with Arc Studio" badge covered the main button in the send sheet, making it untappable. Sheets now leave room for it.
3. A 6-decimal balance could overflow the card on narrow phones. The balance text now scales and wraps.
4. Very busy wallets could render thousands of rows. The list now shows 25 at a time with "Show more".

**Dependencies:** `bun audit` lists 8 advisories (2 high, 5 moderate, 1 low), all in transitive packages: wagmi's optional wallet connectors (WalletConnect, zod, uuid) and the Circle SDK used only by optional deployment scripts. None are on the send, balance or history path. Re-run `bun audit` before each release.

## Cleanup

- Removed 9 unused dependencies: 5 Circle packages the app never imports, `clsx`, `tailwind-merge`, ConnectKit, and the Node polyfill plugin.
- Removed the unused ConnectKit provider (its wallet modal was not used) and stale config entries.
- Production bundle: one 740 kB script (232 kB gzipped), down from 1.55 MB (490 kB gzipped) plus about 100 extra wallet-modal chunks.
- Kept: the Circle developer-controlled-wallets and smart-contract-platform packages and the `compass`/`self-deploy` scripts, which are Arc Studio deployment tooling rather than app code.

## How this was tested

- `bun run check` (lint and typecheck): clean.
- `bun run verify:mainnet`: all checks passed, including with a dead primary RPC (failover).
- Headless browser run against the live app with a test wallet that rejects every transaction (so nothing can be sent): connect, balance, history, validation, review summary, wallet rejection, QR, wrong network, RPC outage, on mobile and desktop.
- Production build served under the Content-Security-Policy.
- Contract: maximum-depth review twice, static analysis, 32 tests.

## Not verifiable here, still on you

1. **A real send.** Signing needs a wallet, and no funds were sent. Do a 0.01 USDC send between two wallets you own and watch it reach "Payment confirmed" before launch.
2. **Real MetaMask UI.** Tested with a scripted wallet, not the extension's own prompts.
3. **Production RPC capacity.** The public endpoint rate-limits. Set `VITE_ARC_RPC_URL` to a dedicated provider before real traffic.
4. **Optional contract.** Deploy it yourself only if you want memo receipts, then set `VITE_ARCSEND_CONTRACT_ADDRESS` and confirm the Network panel shows "verified". Consider an independent paid audit if value will flow through it.
5. **Reverted sends are not in history.** Only the send flow reports them.
