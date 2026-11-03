# TopPay Swap (direct Uniswap V3 on Arc Mainnet)

The **Swap** tab trades USDC, EURC, cirBTC and WETH directly against Uniswap V3 on Arc Mainnet (chain ID 5042). There is **no Uniswap API, no API key, no backend and no custom contract**: TopPay reads pools and quotes over the normal Arc RPC and sends the swap from your own wallet to Uniswap's own `SwapRouter02`.

> Swaps move real funds on Arc Mainnet and cannot be reversed. Start with a small amount.

## Verified deployment (independently checked)

| Contract | Address | Evidence |
| --- | --- | --- |
| Uniswap V3 Factory | `0xf0db7b58379503491d857dB50AC9ece64c653918` | Uniswap `sdk-core` ARC_ADDRESSES, Uniswap `v3-subgraph` `arc-mainnet` config, Arc Explorer shows source-verified `UniswapV3Factory` (Uniswap path `src/pkgs/v3-core/...`), 24,535 bytes of code |
| SwapRouter02 | `0x53BF6B0684Ec7eF91e1387Da3D1a1769bC5A6F77` | `sdk-core` `swapRouter02Address`, Arc Explorer source-verified `SwapRouter02` whose constructor arguments are the V2 factory `0x89e5...`, this V3 factory and the position manager `0x3965...`; `router.factory()` returns the factory above |
| QuoterV2 | `0x7DfD4F31be6814D2906BDE155c3e1B146EAc1468` | `sdk-core` `quoterAddress`, Arc Explorer source-verified `QuoterV2`; `quoter.factory()` returns the factory above |

The router and quoter bytecode contain the selectors TopPay calls (`multicall(uint256,bytes[])`, `exactInputSingle`, `exactInput`, `quoteExactInputSingle`, `quoteExactInput`). The Arc "WETH9" slot (`0x8bce...`) is an unsupported stub because USDC is Arc's native token; TopPay never uses it. Arc Explorer reports these contracts as verified by partial match against Uniswap's source. Ethereum addresses are never assumed.

Uniswap V3 pools on Arc (liquidity checked live; tiers 0.01%, 0.05%, 0.3%, 1% are enabled on the factory):

- USDC/EURC: 0.05% (deep), 0.3%, 1% (0.01% exists, empty)
- USDC/cirBTC: 0.01%, 1% (0.3% exists, empty)
- USDC/WETH: 0.3%, 1% (0.05% exists, empty)
- cirBTC/WETH: 0.3%
- No direct EURC/cirBTC or EURC/WETH pool, so those trades route through USDC in two hops.

Uniswap V2 and V4 are also deployed on Arc (V2 router `0x1f7d...`, V4 PoolManager `0x8366...`), but TopPay uses V3 only.

## How a swap works

1. **Find the pool.** For your pair, the app asks the factory for every fee tier, directly and through USDC or WETH, and reads each pool's liquidity and price.
2. **Quote.** Each live route is priced with `QuoterV2` (an `eth_call` that runs the real pool math). The route paying the most wins. Price impact is measured against the pool's spot price, excluding the pool fee.
3. **Allowance.** If your allowance for `SwapRouter02` is below the swap amount, the button says **Approve**. The approval is for exactly the swap amount, never unlimited, and is estimated against Arc first.
4. **Simulate, then sign.** Before your wallet is asked, the exact swap transaction is dry-run against Arc. If it would fail (price moved, deadline, balance, blocklist) you get the reason and nothing is sent.
5. **Execute.** The swap is `SwapRouter02.multicall(deadline, [exactInputSingle | exactInput])` with the minimum received set from your slippage and your own address as recipient. If it is mined after the deadline (20 minutes) or pays out less than the minimum, it reverts.
6. **Confirm.** Success is shown only after the receipt confirms onchain, with the real change in your token balance.

## Safety rules built in

- Only the four listed tokens, only Arc Mainnet (5042), only Uniswap's router; the wallet must be on chain 5042.
- Exact-amount approvals only. A quote older than 30 seconds is refreshed before you can sign.
- Price impact of 5% or more needs an extra tick-box; slippage of 5% or more shows a warning; 50% is the ceiling.
- Quotes are never presented as completed swaps. No quote means no price shown.
- Gas for the swap is estimated with a real `eth_estimateGas` and padded; Arc's 20 gwei minimum fee is respected. MAX on a USDC swap leaves a USDC reserve for the fee.

## "Contracts verified" badge

The badge runs live checks: the factory, router and quoter have contract code and the functions TopPay calls, the router and quoter both point at the same factory, and each token reports the expected symbol and decimals. It is green only if all pass. It is not an audit of Uniswap's code.

## Testing without spending anything

```bash
bun run test:swap        # offline: path encoding, slippage, price impact, routes, calldata, approvals
bun run verify:uniswap   # live read-only: contracts, pools, fee tiers, QuoterV2 quotes, simulation guard
bun run test:swap-fork   # runs approve + swap on a LOCAL fork (see below); no real transaction
bun run test:rpc         # live: the shared RPC transport absorbs bursts, fails over, refuses a wrong chain
```

`test:swap-fork` needs Arc's Foundry build, because stock Foundry cannot move USDC or Circle tokens (their transfers call Arc precompiles). Install it from <https://docs.arc.io/arc/tutorials/install-arc-foundry.md>, then:

```bash
arc-anvil --network arc --fork-url https://rpc.mainnet.arc.io --port 8599
bun run test:swap-fork
```

## Troubleshooting a stopped swap

Every stop shows its reason and a **Technical details** box (stage, decoded revert reason, amounts, allowance, minimum received, deadline, and the raw RPC text). The common ones:

- **"The Arc RPC is rate-limiting or unreachable"**: not a problem with your swap. The public RPC rejects bursts (about 20 calls inside a few hundred milliseconds), so the simulation could not run. Nothing was sent. The app now smooths its own requests and falls over to a second official endpoint (`rpc.blockdaemon.mainnet.arc.io`, listed in the Arc docs, used only after it proves it is chain 5042). Press Swap again; for heavy use set `VITE_ARC_RPC_URL` to a dedicated provider.
- **Allowance lower than the amount** / **balance lower**: the app re-reads both right before simulating and tells you the numbers.
- **"Too little received"**: the price moved past your slippage. The quote refreshes automatically and the minimum received is recalculated.
- **"Transaction too old"**: the 20 minute deadline passed (or your device clock is far off). The quote refreshes with a new deadline.
- **Reverted without a reason**: usually a token restriction on an address (Arc tokens consult a blocklist). Technical details show the pool and calldata.

## Limits to know about

- Tokens are limited to USDC, EURC, cirBTC and WETH. To add one, verify its address and pools first, then edit `config/uniswap-constants.ts`.
- Only V3 liquidity is used. A better V2 or V4 price may exist.
- Liquidity is thin in some pools (see `verify:uniswap`); large trades show high price impact.
- The app depends on the Arc RPC for quotes and sending. Use `VITE_ARC_RPC_URL` for a dedicated endpoint if you expect heavy use.
