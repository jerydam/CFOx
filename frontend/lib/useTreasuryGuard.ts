/**
 * useTreasuryGuard
 *
 * Every protected page (overview, proposals, members, treasury…) calls this.
 * It verifies onchain that the connected wallet has a deployed CFOx instance,
 * auto-corrects a stale treasury_id when the user switches wallets, and
 * redirects to /onboard (or landing) when no instance exists.
 *
 * Returns { ready, treasuryId } — render nothing until ready === true.
 *
 * Usage:
 *   const { ready, treasuryId } = useTreasuryGuard()
 *   if (!ready) return <GateLoader />
 */

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount } from '@/lib/wallet'
import { useTreasuryIdSafe, useSetTreasuryId } from '@/lib/treasury-context'
import { factory } from '@/lib/api'

export function useTreasuryGuard() {
  const router         = useRouter()
  const { address, isConnected } = useAccount()
  const storedId       = useTreasuryIdSafe()
  const setTreasuryId  = useSetTreasuryId()

  const [ready, setReady]           = useState(false)
  const [treasuryId, setLocalId]    = useState(storedId)

  useEffect(() => {
    setReady(false)

    // 1. Not connected → always go to landing
    if (!isConnected || !address) {
      router.replace('/')
      return
    }

    let cancelled = false

    ;(async () => {
      try {
        const instance = await factory.getInstance(address)

        if (cancelled) return

        if (!instance.has_instance || !instance.treasury_id) {
          // Wallet has no deployment — clear stale ID and send to onboard
          setTreasuryId('')
          router.replace('/onboard')
          return
        }

        // Wallet switched and the stored treasury_id is stale
        if (instance.treasury_id !== storedId) {
          setTreasuryId(instance.treasury_id)
          setLocalId(instance.treasury_id)
        } else {
          setLocalId(instance.treasury_id)
        }

        if (!cancelled) setReady(true)
      } catch {
        // Backend/RPC unavailable — trust localStorage as best-effort
        if (cancelled) return
        if (!storedId) {
          router.replace('/onboard')
          return
        }
        setLocalId(storedId)
        setReady(true)
      }
    })()

    return () => { cancelled = true }
  }, [isConnected, address]) // eslint-disable-line react-hooks/exhaustive-deps

  return { ready, treasuryId }
}
