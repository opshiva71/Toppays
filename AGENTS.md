# TopPay

> Built with Arc Studio. Project memory for future agents and humans.

## What This App Does

Send and receive native USDC on Arc Mainnet (chain 5042) from a browser wallet. Dashboard with balance, send flow (validate, quote, review, wallet approval, receipt polling), receive (address + QR), and transaction history read from Arc logs.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS, framer-motion, sonner
- Web3: wagmi v2 + viem (injected / EIP-6963 wallets only). ConnectKit and node polyfills were removed on purpose
- Chain: Arc Mainnet only (5042). Gas token is USDC (18 decimals native view, 6 decimals ERC-20 view at the USDC predeploy)
- App name: TOPpay (display spelling: TOP bold, pay lighter; code, contract and file names stay `TopPay`). The optional contract is `contracts/TopPay.sol` (variable `VITE_TOPPAY_CONTRACT_ADDRESS`, script `deploy:toppay`). Its onchain identifier tag is frozen as `ArcSend.v2`: do not change it, that would break recognition of any deployed instance.
- Contract: `contracts/TopPay.sol` (optional, stateless receipt helper). NOT deployed by Arc Studio. Address comes from `VITE_TOPPAY_CONTRACT_ADDRESS`.

## Key Files

- `config/network.ts`: the single source for chain, RPC list, explorer, fee floor, history and receipt settings. Facts come from `src/onchain-facts.ts` (generated, do not edit)
- `config/contract.ts`, `config/abi.ts`: optional contract address handling + verification via `identifier()`
- `src/services/rpc.ts`: centralized client (timeout, retry, fallback), health check, `withRpcRetry`
- `src/services/send.ts`: validation, fee floor (maxFeePerGas >= 20 gwei), quote building
- `src/services/history.ts`: history from the EIP-7708 system emitter `0xffff...fffE` (18 decimals). Never also read the ERC-20 logs (double count)
- `src/hooks/useSendUsdc.ts`: send state machine. One submission per review, no auto-resubmit, success only from a mined receipt
- `src/pages/Dashboard.tsx` composes the components in `src/components/`: hero `BalanceCard`, `ActionCards`, `TransactionList` (filters, day groups, `StatusBadge`), compact `NetworkInfo`. Contract and RPC details live only in the Settings sheet (`DeveloperSettings`), never as warnings on the main screen
- `docs/PRODUCTION.md`, `docs/DEPLOYMENT.md`, `scripts/deploy-toppay.ts`: production guide and user-run contract deployment (key via shell env only)
- `scripts/verify-mainnet.ts` (`bun run verify:mainnet`): read-only live checks
- History uses `log.blockTimestamp` from the RPC; never fetch one block per row (it rate-limits on busy wallets)
- The fixed Arc Studio badge overlaps bottom-right on phones: sheets keep extra bottom padding for it

## Rules

- Never show native and ERC-20 USDC as separate balances: the UI shows the 6-decimal ERC-20 balance; native is read only for max-send math
- Use `@/onchain-money` for every USDC amount conversion
- Arc mainnet moves real funds. Never deploy or transact on mainnet on the user's behalf
- Deployed contract address: none yet (not deployed)

## Share links

- `src/lib/share.ts` ships `getShareBase`, `buildShareLink`, `installShareSync`; keep the `installShareSync()` call in `src/main.tsx`
- Never put secrets in URL paths or queries

## To Run

```bash
bun install
bun run dev
bun run check
```
