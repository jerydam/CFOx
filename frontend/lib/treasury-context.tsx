'use client'

/**
 * Provides the active treasury_id to the entire app.
 * Multi-treasury aware: checks localStorage for a saved treasury_id,
 * falls back to NEXT_PUBLIC_TREASURY_ID env var.
 * Updated by the onboard page after a successful factory deploy.
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const ENV_DEFAULT = process.env.NEXT_PUBLIC_TREASURY_ID || ''
const STORAGE_KEY = 'cfox_treasury_id'

type TreasuryContextValue = {
  treasuryId: string
  setTreasuryId: (id: string) => void
}

const TreasuryContext = createContext<TreasuryContextValue>({
  treasuryId: ENV_DEFAULT,
  setTreasuryId: () => {},
})

export function TreasuryProvider({ children }: { children: React.ReactNode }) {
  const [treasuryId, setIdState] = useState<string>(ENV_DEFAULT)

  // Hydrate from localStorage on mount (client only)
  useEffect(() => {
    const saved = typeof window !== 'undefined'
      ? localStorage.getItem(STORAGE_KEY)
      : null
    if (saved) setIdState(saved)
  }, [])

  const setTreasuryId = useCallback((id: string) => {
    setIdState(id)
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, id)
  }, [])

  return (
    <TreasuryContext.Provider value={{ treasuryId, setTreasuryId }}>
      {children}
    </TreasuryContext.Provider>
  )
}

/** Returns the active treasury UUID. Returns '' during SSR/build. */
export function useTreasuryId(): string {
  const { treasuryId } = useContext(TreasuryContext)
  return treasuryId
}

/** Returns the setter — used by the onboard page after deploy. */
export function useSetTreasuryId() {
  return useContext(TreasuryContext).setTreasuryId
}

/** Safe version — returns '' instead of throwing. Use in the shell/sidebar. */
export function useTreasuryIdSafe(): string {
  return useContext(TreasuryContext).treasuryId
}
