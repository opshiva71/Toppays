/**
 * TopPay optional payments contract configuration (contracts/TopPay.sol, previously named ArcSend).
 *
 * The contract is OPTIONAL. Payments are plain native USDC transfers and never
 * route through it. When an address is configured the app verifies it onchain
 * before reporting it as usable.
 *
 * To set or update the deployed address, change ONE environment value and
 * restart the dev server / rebuild. No component needs to be edited:
 *
 *   VITE_TOPPAY_CONTRACT_ADDRESS=0x...
 */

import { getAddress, isAddress, keccak256, toBytes, type Address, type PublicClient } from 'viem'
import { TOPPAY_ABI } from './abi'
import { ARC_MAINNET_CHAIN_ID } from './network'

export { TOPPAY_ABI }

/**
 * Frozen onchain interface tag. It keeps the contract's original name on purpose, so a contract
 * deployed from the earlier ArcSend source is still recognized. Changing it would change what
 * `identifier()` must return, so do not rename it.
 */
export const TOPPAY_INTERFACE_TAG = 'ArcSend.v2'

/** keccak256 of the tag: what `identifier()` returns on a genuine TopPay v2 deployment. */
export const TOPPAY_IDENTIFIER = keccak256(toBytes(TOPPAY_INTERFACE_TAG))

export type ContractConfig =
  | { state: 'not-configured'; address: null; chainId: typeof ARC_MAINNET_CHAIN_ID }
  | { state: 'invalid'; address: null; chainId: typeof ARC_MAINNET_CHAIN_ID; reason: string }
  | { state: 'configured'; address: Address; chainId: typeof ARC_MAINNET_CHAIN_ID }

export function resolveContractConfig(raw: string | undefined): ContractConfig {
  const value = raw?.trim()
  if (!value) return { state: 'not-configured', address: null, chainId: ARC_MAINNET_CHAIN_ID }
  if (!isAddress(value, { strict: false })) {
    return {
      state: 'invalid',
      address: null,
      chainId: ARC_MAINNET_CHAIN_ID,
      reason: 'VITE_TOPPAY_CONTRACT_ADDRESS is not a valid address.',
    }
  }
  return { state: 'configured', address: getAddress(value.toLowerCase()), chainId: ARC_MAINNET_CHAIN_ID }
}

const env = import.meta.env as Record<string, string | undefined>

/** VITE_TOPPAY_CONTRACT_ADDRESS, falling back to the former VITE_ARCSEND_CONTRACT_ADDRESS so an existing setting keeps working. */
export const TOPPAY_CONTRACT: ContractConfig = resolveContractConfig(env.VITE_TOPPAY_CONTRACT_ADDRESS?.trim() || env.VITE_ARCSEND_CONTRACT_ADDRESS)

export type ContractVerification =
  | { state: 'not-configured' }
  | { state: 'invalid'; reason: string }
  | { state: 'no-code'; address: Address }
  | { state: 'wrong-contract'; address: Address }
  | { state: 'verified'; address: Address }
  | { state: 'unreachable'; address: Address }

/** Confirms the configured address has code and answers with the TopPay identifier. */
export async function verifyTopPayContract(
  client: Pick<PublicClient, 'getCode' | 'readContract'>,
  config: ContractConfig = TOPPAY_CONTRACT,
): Promise<ContractVerification> {
  if (config.state === 'not-configured') return { state: 'not-configured' }
  if (config.state === 'invalid') return { state: 'invalid', reason: config.reason }

  const address = config.address
  try {
    const code = await client.getCode({ address })
    if (!code || code === '0x') return { state: 'no-code', address }
    const id = await client.readContract({ address, abi: TOPPAY_ABI, functionName: 'identifier' })
    return id === TOPPAY_IDENTIFIER ? { state: 'verified', address } : { state: 'wrong-contract', address }
  } catch {
    // Code present but identifier() failed or RPC down: cannot call it verified.
    return { state: 'unreachable', address }
  }
}
