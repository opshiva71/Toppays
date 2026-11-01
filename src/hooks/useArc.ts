import { useQuery } from '@tanstack/react-query'
import { useAccount, useBalance, useReadContract, useSwitchChain } from 'wagmi'
import { erc20Abi, type Address } from 'viem'
import { ARC_SEND_CONTRACT, verifyArcSendContract } from '../../config/contract'
import { ARC_MAINNET_CHAIN_ID, ARC_USDC, RPC_SETTINGS } from '../../config/network'
import { checkRpcHealth, publicClient } from '@/services/rpc'

/** Wallet connection + network state. Wallet account and chain changes flow in via wagmi events. */
export function useArcWallet() {
  const { address, isConnected, isConnecting, isReconnecting, chainId, connector } = useAccount()
  const { switchChain, isPending: isSwitching, error: switchError } = useSwitchChain()
  const isWrongNetwork = isConnected && chainId !== ARC_MAINNET_CHAIN_ID

  return {
    address,
    isConnected,
    isConnecting: isConnecting || isReconnecting,
    chainId,
    connectorName: connector?.name,
    isWrongNetwork,
    isSwitching,
    switchError,
    switchToArc: () => switchChain({ chainId: ARC_MAINNET_CHAIN_ID }),
  }
}

/** Single USDC balance, ERC-20 view (6 decimals). Always read from Arc Mainnet, whatever chain the wallet is on. */
export function useUsdcBalance(address: Address | undefined) {
  return useReadContract({
    address: ARC_USDC.address,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_MAINNET_CHAIN_ID,
    query: { enabled: Boolean(address), refetchInterval: 8_000 },
  })
}

/**
 * Same funds as the USDC balance, read in the 18-decimal native view. Used ONLY
 * to compute the spendable maximum after fees, never displayed next to the USDC balance.
 */
export function useSpendableNative(address: Address | undefined) {
  return useBalance({
    address,
    chainId: ARC_MAINNET_CHAIN_ID,
    query: { enabled: Boolean(address), refetchInterval: 8_000 },
  })
}

export function useRpcHealth() {
  return useQuery({
    queryKey: ['rpc-health'],
    queryFn: checkRpcHealth,
    refetchInterval: RPC_SETTINGS.healthPollMs,
    staleTime: 5_000,
  })
}

export function useContractStatus() {
  return useQuery({
    queryKey: ['arcsend-contract', ARC_SEND_CONTRACT.state, ARC_SEND_CONTRACT.address],
    queryFn: () => verifyArcSendContract(publicClient),
    staleTime: 60_000,
  })
}
