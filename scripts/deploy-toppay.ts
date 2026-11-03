/**
 * Deploys contracts/TopPay.sol to Arc Mainnet from YOUR wallet.
 *
 *   forge build                       (run from the project root)
 *   DEPLOYER_PRIVATE_KEY=0x... bun run deploy:toppay            # dry run: estimates only
 *   DEPLOYER_PRIVATE_KEY=0x... bun run deploy:toppay --confirm  # broadcasts a real mainnet transaction
 *
 * The key is read from the environment only. It is never written to disk or printed.
 * Prefer a throwaway deployer wallet funded with just enough USDC for gas.
 * Nothing is written to .env: copy the printed address into VITE_TOPPAY_CONTRACT_ADDRESS yourself.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPublicClient, createWalletClient, formatUnits, http, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { ARC_EXPLORER_URL, ARC_MAINNET_CHAIN_ID, ARC_RPC_URLS, MIN_MAX_FEE_PER_GAS, arcMainnet } from '../config/network'
import { TOPPAY_ABI, TOPPAY_IDENTIFIER } from '../config/contract'

function fail(message: string): never {
  console.error(`\nDeploy aborted: ${message}\n`)
  process.exit(1)
}

const confirm = process.argv.includes('--confirm')

const rawKey = process.env.DEPLOYER_PRIVATE_KEY?.trim()
if (!rawKey) fail('set DEPLOYER_PRIVATE_KEY in your shell environment (never in a committed file).')
if (!/^0x[0-9a-fA-F]{64}$/.test(rawKey)) fail('DEPLOYER_PRIVATE_KEY must be 0x followed by 64 hex characters.')

const artifactPath = resolve(process.cwd(), 'contracts/out/TopPay.sol/TopPay.json')
if (!existsSync(artifactPath)) fail('artifact not found. Run `forge build` first.')
const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as { bytecode?: { object?: string } }
const bytecode = artifact.bytecode?.object as Hex | undefined
if (!bytecode || bytecode === '0x') fail('artifact has no bytecode. Run `forge build` again.')

const account = privateKeyToAccount(rawKey as Hex)
const transport = http(ARC_RPC_URLS[0], { timeout: 15_000, retryCount: 3 })
const publicClient = createPublicClient({ chain: arcMainnet, transport })
const walletClient = createWalletClient({ account, chain: arcMainnet, transport })

const chainId = await publicClient.getChainId()
if (chainId !== ARC_MAINNET_CHAIN_ID) fail(`RPC reports chain ${chainId}, expected Arc Mainnet (${ARC_MAINNET_CHAIN_ID}).`)

const fees = await publicClient.estimateFeesPerGas()
const maxFeePerGas = fees.maxFeePerGas > MIN_MAX_FEE_PER_GAS ? fees.maxFeePerGas : MIN_MAX_FEE_PER_GAS
const maxPriorityFeePerGas = fees.maxPriorityFeePerGas > maxFeePerGas ? maxFeePerGas : fees.maxPriorityFeePerGas
const balance = await publicClient.getBalance({ address: account.address })
if (balance === 0n) fail(`deployer ${account.address} has no USDC on Arc Mainnet. Fund it with enough USDC for gas first.`)
let gas: bigint
try {
  gas = await publicClient.estimateGas({ account, data: bytecode })
} catch (error) {
  fail(`gas estimation failed: ${error instanceof Error ? error.message.split('\n')[0] : 'unknown error'}`)
}
const maxCost = gas * maxFeePerGas

console.log(`Network:        Arc Mainnet (${chainId})`)
console.log(`Deployer:       ${account.address}`)
console.log(`Balance:        ${formatUnits(balance, 18)} USDC (native view)`)
console.log(`Gas estimate:   ${gas.toString()}`)
console.log(`Max fee cost:   ${formatUnits(maxCost, 18)} USDC`)

if (balance < maxCost) fail('deployer balance cannot cover the maximum gas cost.')

if (!confirm) {
  console.log('\nDry run only. Re-run with --confirm to broadcast this deployment to Arc Mainnet.\n')
  process.exit(0)
}

console.log('\nBroadcasting deployment to Arc Mainnet...')
const hash = await walletClient.deployContract({
  abi: TOPPAY_ABI,
  bytecode,
  gas: (gas * 110n) / 100n,
  maxFeePerGas,
  maxPriorityFeePerGas,
})
console.log(`Transaction:    ${hash}`)
console.log(`Explorer:       ${ARC_EXPLORER_URL}/tx/${hash}`)

const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 })
if (receipt.status !== 'success' || !receipt.contractAddress) {
  fail(`deployment transaction did not succeed (status: ${receipt.status}). Do not retry blindly: inspect ${hash} first.`)
}

const deployed = receipt.contractAddress
const code = await publicClient.getCode({ address: deployed })
if (!code || code === '0x') fail(`no code found at ${deployed} after deployment.`)
const id = await publicClient.readContract({ address: deployed, abi: TOPPAY_ABI, functionName: 'identifier' })
if (id !== TOPPAY_IDENTIFIER) fail(`contract at ${deployed} returned an unexpected identifier.`)

console.log(`\nDeployed and verified TopPay at ${deployed}`)
console.log(`Explorer:       ${ARC_EXPLORER_URL}/address/${deployed}`)
console.log('\nNext: add this line to your environment (.env or your host settings), then restart / rebuild the app:')
console.log(`VITE_TOPPAY_CONTRACT_ADDRESS=${deployed}\n`)
