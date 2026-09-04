/**
 * Wallet connection helpers using wagmi + viem.
 * Re-exports the hooks/config the rest of the app uses.
 *
 * WagmiProvider is mounted in app/layout.tsx so every page
 * can call useAccount(), useConnect(), useSignMessage(), etc.
 */

import { http, createConfig } from 'wagmi'
import { celo, celoAlfajores } from 'wagmi/chains'
import { injected, walletConnect } from 'wagmi/connectors'

// Botchain (chain ID 677) — add to the chain list once wagmi supports it,
// or define it manually:
import { defineChain } from 'viem'

export const botchain = defineChain({
  id: 677,
  name: 'BOT Chain',
  nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.botchain.network'] },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://explorer.botchain.network' },
  },
})

const wcProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID || ''

export const wagmiConfig = createConfig({
  chains: [botchain, celo, celoAlfajores],
  connectors: [
    injected(),
    ...(wcProjectId
      ? [walletConnect({ projectId: wcProjectId })]
      : []),
  ],
  transports: {
    [botchain.id]: http(),
    [celo.id]: http(),
    [celoAlfajores.id]: http(),
  },
})

// Re-export wagmi hooks for convenience — pages just import from here
export {
  useAccount,
  useConnect,
  useDisconnect,
  useSignMessage,
  useChainId,
  useSwitchChain,
} from 'wagmi'