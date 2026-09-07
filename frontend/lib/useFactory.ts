// frontend/lib/useFactory.ts
/**
 * useFactory — wagmi hook for deploying a CFOx suite from the user's wallet.
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
      { name: 'USDTAddress',  type: 'address' },
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

function getUSDTAddress(): `0x${string}` {
  const addr = process.env.NEXT_PUBLIC_USDT_ADDRESS
  if (!addr?.startsWith('0x')) throw new Error('NEXT_PUBLIC_USDT_ADDRESS not set')
  return addr as `0x${string}`
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DeployParams {
  founderName: string
  orgName: string
  perTxLimit: number
  dailyLimit: number
  weeklyLimit: number
}

export interface DeployResult {
  txHash: string
  governanceAddress: string
  treasuryAddress: string
  policyAddress: string
  treasuryId: string
}

export interface RegisterParams {
  founderAddress: string
  founderName: string
  orgName: string
  governanceAddress: string
  treasuryAddress: string
  policyAddress: string
  perTxLimit: number
  dailyLimit: number
  weeklyLimit: number
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useFactory() {
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient()
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function deployInstance(
    params: DeployParams,
    founderAddress: string,
  ): Promise<DeployResult> {
    setIsPending(true)
    setError(null)

    try {
      const perTxRaw  = parseUnits(String(params.perTxLimit),  6)
      const dailyRaw  = parseUnits(String(params.dailyLimit),  6)
      const weeklyRaw = parseUnits(String(params.weeklyLimit), 6)

      const txHash = await writeContractAsync({
        address: getFactoryAddress(),
        abi: FACTORY_ABI,
        functionName: 'deploy',
        args: [
          params.founderName || 'Founder',
          getUSDTAddress(),
          perTxRaw,
          dailyRaw,
          weeklyRaw,
        ],
      })

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

      const { treasury_id } = await _callRegister({
        founderAddress,
        founderName:        params.founderName || 'Founder',
        orgName:            params.orgName || 'My Organization',
        governanceAddress,
        treasuryAddress,
        policyAddress,
        perTxLimit:  params.perTxLimit,
        dailyLimit:  params.dailyLimit,
        weeklyLimit: params.weeklyLimit,
        txHash,
      })

      return { txHash, governanceAddress, treasuryAddress, policyAddress, treasuryId: treasury_id }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      throw e
    } finally {
      setIsPending(false)
    }
  }

  /**
   * Register an already-deployed instance in the backend DB.
   * Use when the on-chain deploy succeeded but backend registration failed
   * (treasury_id is null despite contracts being live).
   */
  async function registerInstance(params: RegisterParams): Promise<DeployResult> {
    setIsPending(true)
    setError(null)
    try {
      const { treasury_id } = await _callRegister({
        ...params,
        txHash: '',   // no new tx — contracts already on-chain
      })
      return {
        txHash: '',
        governanceAddress: params.governanceAddress,
        treasuryAddress:   params.treasuryAddress,
        policyAddress:     params.policyAddress,
        treasuryId:        treasury_id,
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      throw e
    } finally {
      setIsPending(false)
    }
  }

  return { deployInstance, registerInstance, isPending, error }
}

// ─── Internal helper ──────────────────────────────────────────────────────────

async function _callRegister(body: {
  txHash: string
  founderAddress: string
  founderName: string
  orgName: string
  governanceAddress: string
  treasuryAddress: string
  policyAddress: string
  perTxLimit: number
  dailyLimit: number
  weeklyLimit: number
}): Promise<{ treasury_id: string }> {
  const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
  const res = await fetch(`${BASE}/api/factory/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tx_hash:             body.txHash,
      founder_address:     body.founderAddress,
      founder_name:        body.founderName,
      org_name:            body.orgName,
      governance_address:  body.governanceAddress,
      treasury_address:    body.treasuryAddress,
      policy_address:      body.policyAddress,
      per_tx_limit:        body.perTxLimit,
      daily_limit:         body.dailyLimit,
      weekly_limit:        body.weeklyLimit,
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText)
    throw new Error(`Registration failed: ${detail}`)
  }
  return res.json()
}