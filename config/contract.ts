/**
 * TopPay optional receipt contract configuration. The contract itself is still named
 * ArcSend (file, onchain identifier and env var), so existing deployments keep working.
 *
 * The contract is OPTIONAL. Payments are plain native USDC transfers and never
 * route through it. When an address is configured the app verifies it onchain
 * before reporting it as usable.
 *
 * To set or update the deployed address, change ONE environment value and
 * restart the dev server / rebuild. No component needs to be edited:
 *
 *   VITE_ARCSEND_CONTRACT_ADDRESS=0x...
 */

import { getAddress, isAddress, keccak256, toBytes, type Address, type PublicClient } from 'viem'
import { ARC_SEND_ABI } from './abi'
import { ARC_MAINNET_CHAIN_ID } from './network'

export { ARC_SEND_ABI }

/** keccak256("ArcSend.v1"): what `identifier()` returns on a genuine ArcSend deployment. */
export const ARC_SEND_IDENTIFIER = keccak256(toBytes('ArcSend.v1'))

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
      reason: 'VITE_ARCSEND_CONTRACT_ADDRESS is not a valid address.',
    }
  }
  return { state: 'configured', address: getAddress(value.toLowerCase()), chainId: ARC_MAINNET_CHAIN_ID }
}

export const ARC_SEND_CONTRACT: ContractConfig = resolveContractConfig(
  (import.meta.env as Record<string, string | undefined>).VITE_ARCSEND_CONTRACT_ADDRESS,
)

export type ContractVerification =
  | { state: 'not-configured' }
  | { state: 'invalid'; reason: string }
  | { state: 'no-code'; address: Address }
  | { state: 'wrong-contract'; address: Address }
  | { state: 'verified'; address: Address }
  | { state: 'unreachable'; address: Address }

/** Confirms the configured address has code and answers with the ArcSend identifier. */
export async function verifyArcSendContract(
  client: Pick<PublicClient, 'getCode' | 'readContract'>,
  config: ContractConfig = ARC_SEND_CONTRACT,
): Promise<ContractVerification> {
  if (config.state === 'not-configured') return { state: 'not-configured' }
  if (config.state === 'invalid') return { state: 'invalid', reason: config.reason }

  const address = config.address
  try {
    const code = await client.getCode({ address })
    if (!code || code === '0x') return { state: 'no-code', address }
    const id = await client.readContract({ address, abi: ARC_SEND_ABI, functionName: 'identifier' })
    return id === ARC_SEND_IDENTIFIER ? { state: 'verified', address } : { state: 'wrong-contract', address }
  } catch {
    // Code present but identifier() failed or RPC down: cannot call it verified.
    return { state: 'unreachable', address }
  }
}
