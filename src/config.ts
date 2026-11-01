/**
 * wagmi configuration. Arc Mainnet is the only chain. Chain, RPC and retry
 * behavior live in /config/network.ts and src/services/rpc.ts.
 */

import { createConfig } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { ARC_RPC_URLS, arcMainnet } from '../config/network'
import { createArcTransport } from './services/rpc'
import { registerChain } from './tracing'

registerChain(arcMainnet.id, ARC_RPC_URLS[0])

export const config = createConfig({
  chains: [arcMainnet],
  // injected() also surfaces every EIP-6963 wallet (MetaMask, Rabby, Coinbase Wallet, ...).
  connectors: [injected()],
  transports: { [arcMainnet.id]: createArcTransport() },
  multiInjectedProviderDiscovery: true,
})
