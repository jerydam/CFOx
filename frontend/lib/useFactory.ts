/**
 * useFactory — wagmi hook for deploying a CFOx suite from the user's wallet.
 *
 * The factory's deploy() takes msg.sender as the founder, so the tx MUST be
 * signed by the user's wallet — not the backend agent.  This hook handles the
 * on-chain call; the backend is only contacted afterward to register the
 * resulting addresses in the DB.
 *
 * The agentWallet is now set in the factory constructor (from deployer env) —
 * founders no longer need to supply it.
 */

import { useWriteContract, usePublicClient } from 'wagmi'
import { useState } from 'react'
import { parseUnits, decodeEventLog } from 'viem'

// ─── ABI (only what the frontend calls) ──────────────────────────────────────

const FACTORY_ABI = [
  {
    name: 'deploy',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'founderName',  type: 'string' },
      { name: 'usdcAddress',  type: 'address' },
      { name: 'perTxLimit',   type: 'uint256' },
      { name: 'dailyLimit',   type: 'uint256' },
      { name: 'weeklyLimit',  type: 'uint256' },
    ],
    outputs: [
      { name: 'governance', type: 'address' },
      { name: 'treasury',   type: 'address' },
      { name: 'policy',     type: 'address' },
    ],
  },
  {
    name: 'subscriptionFee',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'CFOxDeployed',
    type: 'event',
    inputs: [
      { name: 'founder',    type: 'address', indexed: true },
      { name: 'governance', type: 'address', indexed: false },
      { name: 'treasury',   type: 'address', indexed: false },
      { name: 'policy',     type: 'address', indexed: false },
    ],
  },
] as const

// ─── Env helpers ──────────────────────────────────────────────────────────────

function getFactoryAddress(): `0x${string}` {
  const addr = process.env.NEXT_PUBLIC_FACTORY_CONTRACT
  if (!addr?.startsWith('0x')) throw new Error('NEXT_PUBLIC_FACTORY_CONTRACT not set')
  return addr as `0x${string}`
}

function getUsdcAddress(): `0x${string}` {
  const addr = process.env.NEXT_PUBLIC_USDC_ADDRESS
  if (!addr?.startsWith('0x')) throw new Error('NEXT_PUBLIC_USDC_ADDRESS not set')
  return addr as `0x${string}`
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DeployParams {
  founderName: string
  orgName: string
  perTxLimit: number    // USD, e.g. 100
  dailyLimit: number    // USD, e.g. 500
  weeklyLimit: number   // USD, e.g. 2000
}

export interface DeployResult {
  txHash: string
  governanceAddress: string
  treasuryAddress: string
  policyAddress: string
  treasuryId: string    // DB UUID returned by backend registration
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useFactory() {
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient()
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Deploy a full CFOx suite.
   *
   * Flow:
   *   1. User's wallet signs and sends factory.deploy(...)  ← msg.sender = founder
   *   2. We parse the CFOxDeployed event from the receipt
   *   3. POST /api/factory/register — backend records addresses in DB
   *   4. Return all addresses + DB treasury_id to caller
   */
  async function deployInstance(
    params: DeployParams,
    founderAddress: string,
  ): Promise<DeployResult> {
    setIsPending(true)
    setError(null)

    try {
      // USDC is 6 decimals
      const perTxRaw  = parseUnits(String(params.perTxLimit),  6)
      const dailyRaw  = parseUnits(String(params.dailyLimit),  6)
      const weeklyRaw = parseUnits(String(params.weeklyLimit), 6)

      // 1. Send tx from user wallet (agentWallet is set in factory constructor)
      const txHash = await writeContractAsync({
        address: getFactoryAddress(),
        abi: FACTORY_ABI,
        functionName: 'deploy',
        args: [
          params.founderName || 'Founder',
          getUsdcAddress(),
          perTxRaw,
          dailyRaw,
          weeklyRaw,
        ],
      })

      // 2. Wait for receipt and parse event
      if (!publicClient) throw new Error('No public client available')
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })

      let governanceAddress = ''
      let treasuryAddress   = ''
      let policyAddress     = ''

      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: FACTORY_ABI,
            eventName: 'CFOxDeployed',
            topics: log.topics,
            data: log.data,
          })
          governanceAddress = decoded.args.governance
          treasuryAddress   = decoded.args.treasury
          policyAddress     = decoded.args.policy
          break
        } catch {
          // not the event we want, skip
        }
      }

      if (!governanceAddress) {
        throw new Error('CFOxDeployed event not found in receipt')
      }

      // 3. Register in backend DB
      const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
      const res = await fetch(`${BASE}/api/factory/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tx_hash:             txHash,
          founder_address:     founderAddress,
          founder_name:        params.founderName || 'Founder',
          org_name:            params.orgName || 'My Organization',
          governance_address:  governanceAddress,
          treasury_address:    treasuryAddress,
          policy_address:      policyAddress,
          per_tx_limit:        params.perTxLimit,
          daily_limit:         params.dailyLimit,
          weekly_limit:        params.weeklyLimit,
        }),
      })

      if (!res.ok) {
        const detail = await res.text().catch(() => res.statusText)
        throw new Error(`Registration failed: ${detail}`)
      }

      const { treasury_id } = await res.json()

      return {
        txHash,
        governanceAddress,
        treasuryAddress,
        policyAddress,
        treasuryId: treasury_id,
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      throw e
    } finally {
      setIsPending(false)
    }
  }

  return { deployInstance, isPending, error }
}