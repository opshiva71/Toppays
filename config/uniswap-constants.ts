/**
 * Raw Uniswap V3 constants for Arc Mainnet (chain 5042), with no imports.
 *
 * Sources (cross-checked, see docs/UNISWAP.md):
 * - Uniswap sdk-core `ARC_ADDRESSES` (github.com/Uniswap/sdks, sdks/sdk-core/src/addresses.ts)
 * - Uniswap v3-subgraph `deployments/5042.md` and `config/arc-mainnet`
 * - Arc Explorer (Blockscout) contract pages: SwapRouter02, QuoterV2 and UniswapV3Factory are
 *   source-verified (partial match) with Uniswap's own file paths, and the constructor arguments
 *   link them to each other (factory 0xf0db..., WETH9 stub 0x8bce...).
 * - Arc docs for the token addresses.
 * Ethereum addresses are never assumed: every address below was read from an Arc source and
 * checked onchain (code present, router.factory() and quoter.factory() equal the factory).
 */
export const SWAP_CHAIN_ID_RAW = 5042

/** Tokens offered in Swap. Checksummed. USDC's ERC-20 view (0x3600...) is the same asset as native USDC. */
export const SWAP_TOKEN_DEFS = [
  { symbol: 'USDC', name: 'USD Coin', address: '0x3600000000000000000000000000000000000000', decimals: 6 },
  { symbol: 'EURC', name: 'Euro Coin', address: '0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1', decimals: 6 },
  { symbol: 'cirBTC', name: 'Circle Wrapped Bitcoin', address: '0x171A4217b86A807A64eB94757Db6849fb4bDbAA0', decimals: 8 },
  { symbol: 'WETH', name: 'Wrapped Ether', address: '0x128cC466B61f542da60c70e3aA11c10e19B84EDB', decimals: 18 },
] as const

export const UNISWAP_V3_DEFS = {
  factory: '0xf0db7b58379503491d857dB50AC9ece64c653918',
  swapRouter02: '0x53BF6B0684Ec7eF91e1387Da3D1a1769bC5A6F77',
  quoterV2: '0x7DfD4F31be6814D2906BDE155c3e1B146EAc1468',
} as const

/** Fee tiers enabled on the Arc factory (feeAmountTickSpacing returns 1, 10, 60, 200). */
export const V3_FEE_TIERS = [100, 500, 3000, 10000] as const
