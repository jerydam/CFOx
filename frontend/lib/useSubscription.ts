/**
 * useSubscription — fetches AI quota status and handles on-chain subscription payment.
 *
 * Free tier  : 5 AI calls per 28 days (tracked server-side).
 * Paid tier  : founder calls factory.paySubscription() from their wallet,
 *              then POSTs the tx hash to the backend to activate the period.
 *
 * Only the factory address and AI wallet come from env.
 * The treasury_id and founder address come from app state (user's signed session).
 */

import { useState, useEffect, useCallback } from 'react'
import { useWriteContract } from 'wagmi'
import { parseEther } from 'viem'

const FREE_CALLS_LIMIT = 5
const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

// ─── ABI (only paySubscription) ──────────────────────────────────────────────

const FACTORY_ABI = [
  {
    name: 'paySubscription',
    type: 'function',
    stateMutability: 'payable',
    inputs: [],
    outputs: [],
  },
  {
    name: 'subscriptionFee',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SubscriptionStatus {
  is_subscribed: boolean
  free_calls_used: number
  free_calls_remaining: number
  period_start: string
  period_end: string
  ai_allowed: boolean
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useSubscription(treasuryId: string, founderAddress?: string) {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { writeContractAsync } = useWriteContract()

  const fetchStatus = useCallback(async () => {
    if (!treasuryId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${BASE}/api/subscription/${treasuryId}/status`)
      if (!res.ok) throw new Error(await res.text())
      setStatus(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [treasuryId])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  /**
   * Pay on-chain then tell the backend to activate the subscription.
   * The fee amount is read from the factory contract at call time so it's
   * always current (owner can update it to track $5 in token terms).
   */
  async function subscribe(subscriptionFeeWei: bigint) {
    if (!founderAddress) throw new Error('Wallet not connected')
    if (!treasuryId) throw new Error('No treasury selected')

    const factoryAddr = process.env.NEXT_PUBLIC_FACTORY_CONTRACT
    if (!factoryAddr?.startsWith('0x')) throw new Error('NEXT_PUBLIC_FACTORY_CONTRACT not set')

    setPaying(true)
    setError(null)
    try {
      // 1. User's wallet signs and sends paySubscription()
      const txHash = await writeContractAsync({
        address: factoryAddr as `0x${string}`,
        abi: FACTORY_ABI,
        functionName: 'paySubscription',
        value: subscriptionFeeWei,
      })

      // 2. Tell backend to verify and activate
      const res = await fetch(`${BASE}/api/subscription/${treasuryId}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tx_hash: txHash, founder_address: founderAddress }),
      })
      if (!res.ok) throw new Error(await res.text())

      // 3. Refresh status
      await fetchStatus()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      throw e
    } finally {
      setPaying(false)
    }
  }

  return {
    status,
    loading,
    paying,
    error,
    refetch: fetchStatus,
    subscribe,
    FREE_CALLS_LIMIT,
  }
}