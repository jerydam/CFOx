/**
 * useGovernance — wagmi hooks for calling the CFOxGovernance contract.
 *
 * approve(proposalId)  → calls governance.approve(onchain_id) from user wallet
 * execute(proposalId)  → calls governance.execute(onchain_id) from user wallet
 *
 * The contract address comes from NEXT_PUBLIC_GOVERNANCE_CONTRACT env var,
 * which the onboard flow sets after factory deployment.
 */

import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useState } from 'react'

// Minimal ABI — only what the frontend calls
const GOVERNANCE_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'proposalId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'execute',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'proposalId', type: 'uint256' }],
    outputs: [],
  },
] as const

function getGovernanceAddress(): `0x${string}` {
  const addr = process.env.NEXT_PUBLIC_GOVERNANCE_CONTRACT
  if (!addr || !addr.startsWith('0x')) {
    throw new Error('NEXT_PUBLIC_GOVERNANCE_CONTRACT not set')
  }
  return addr as `0x${string}`
}

/**
 * Returns helpers for approving and executing proposals onchain.
 *
 * Usage:
 *   const { approveOnchain, executeOnchain, isPending, error } = useGovernance()
 *   const txHash = await approveOnchain(proposal.proposal_id_onchain)
 */
export function useGovernance() {
  const { writeContractAsync } = useWriteContract()
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function approveOnchain(onchainId: number): Promise<`0x${string}`> {
    setIsPending(true)
    setError(null)
    try {
      const hash = await writeContractAsync({
        address: getGovernanceAddress(),
        abi: GOVERNANCE_ABI,
        functionName: 'approve',
        args: [BigInt(onchainId)],
      })
      return hash
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      throw e
    } finally {
      setIsPending(false)
    }
  }

  async function executeOnchain(onchainId: number): Promise<`0x${string}`> {
    setIsPending(true)
    setError(null)
    try {
      const hash = await writeContractAsync({
        address: getGovernanceAddress(),
        abi: GOVERNANCE_ABI,
        functionName: 'execute',
        args: [BigInt(onchainId)],
      })
      return hash
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      throw e
    } finally {
      setIsPending(false)
    }
  }

  return { approveOnchain, executeOnchain, isPending, error }
}
