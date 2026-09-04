/**
 * CFOx CFO — API client
 * Replaces lib/supabase.ts entirely.
 * All data flows through the FastAPI backend; no Supabase JS client.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// ─── Shared fetch helper ──────────────────────────────────────────────────────

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText)
    throw new Error(`API ${res.status}: ${detail}`)
  }
  return res.json() as Promise<T>
}

// ─── Types matching backend schemas.py ───────────────────────────────────────

export type TokenBalance = {
  token: string
  symbol: string
  address: string
  balance: string      // comes as string for Decimal precision
  balance_usd: string
  decimals: number
}

export type TreasuryBalance = {
  treasury_id: string
  address: string
  chain_id: number
  balances: TokenBalance[]
  total_usd: string
  is_paused: boolean
}

export type Member = {
  address: string
  name: string
  role: string
  equity_weight: number   // basis points
  equity_percent: number  // 0–100
  active: boolean
  created_at: string
}

export type ProposalStatus = 'PENDING' | 'APPROVED' | 'EXECUTED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED'
export type ProposalType =
  | 'PAYMENT' | 'BATCH_PAYMENT'
  | 'ADD_MEMBER' | 'REMOVE_MEMBER'
  | 'TRANSFER_EQUITY' | 'CHANGE_THRESHOLD'
  | 'CHANGE_POLICY' | 'EMERGENCY_ACTION'
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type ExecutionMode = 'AUTO_EXECUTE' | 'MULTISIG_REQUIRED' | 'BLOCKED'

export type ProposalSignature = {
  signer: string
  weight: number
  signed_at: string
}

export type Proposal = {
  id: string
  proposal_id_onchain: number | null
  type: ProposalType
  status: ProposalStatus
  title: string | null
  description: string | null
  token: string | null
  value: string | null       // human-readable amount string
  target: string | null      // recipient address
  required_weight: number
  approved_weight: number
  operation_hash: string | null
  created_by: string | null
  created_at: string
  expires_at: string | null
  executed_at: string | null
  // enriched by backend join
  signatures?: ProposalSignature[]
}

export type Transaction = {
  id: string
  treasury_id: string
  tx_hash: string
  chain_id: number
  from_address: string | null
  to_address: string | null
  token: string | null
  amount: string | null
  amount_usd: number | null
  direction: 'in' | 'out'
  category: string
  description: string | null
  block_number: number | null
  timestamp: string | null
  proposal_id: string | null
}

export type Policy = {
  id: string
  treasury_id: string
  per_transaction_limit_usd: number
  daily_limit_usd: number
  weekly_limit_usd: number
  medium_threshold_bps: number
  large_threshold_bps: number
  large_payment_amount_usd: number
  recipient_whitelist_enabled: boolean
  updated_at: string
}

export type SpendingAnalytics = {
  monthly_burn_usd: string
  monthly_burn_trend: { month: string; amount_usd: number }[]
  top_categories: { category: string; amount: number; pct: number }[]
  top_vendors: { address: string; name: string; amount: number; pct: number }[]
  runway_months: number
  budget_utilization: Record<string, number>
}

export type AgentChatMessage = { role: 'user' | 'assistant'; content: string }

export type CreateProposalResponse = {
  proposal_id: string | null
  onchain_id: number | null
  execution_mode: ExecutionMode
  required_weight: number
  risk_level: RiskLevel
  risk_concerns: string[]
  auto_executed: boolean
  tx_hash: string | null
}

// ─── Treasury ─────────────────────────────────────────────────────────────────

export const treasury = {
  balances: (id: string) =>
    api<TreasuryBalance>(`/api/treasuries/${id}/balances`),

  transactions: (id: string, limit = 20, direction: 'all' | 'in' | 'out' = 'all') =>
    api<{ transactions: Transaction[] }>(
      `/api/treasuries/${id}/transactions?limit=${limit}&direction=${direction}`
    ).then((r) => r.transactions),

  members: (id: string) =>
    api<Member[]>(`/api/treasuries/${id}/members`),

  proposals: (id: string, status = 'PENDING') =>
    api<{ proposals: Proposal[] }>(
      `/api/treasuries/${id}/proposals?status=${status}`
    ).then((r) => r.proposals),

  analytics: (id: string, monthsBack = 3) =>
    api<SpendingAnalytics>(`/api/treasuries/${id}/analytics?months_back=${monthsBack}`),

  policy: (id: string) =>
    api<Policy>(`/api/treasuries/${id}/policy`),

  budgets: (id: string, period = 'current_month') =>
    api<{ budgets: { category: string; amount_usd: number; spent_usd: number; pct: number }[] }>(
      `/api/treasuries/${id}/budgets?period=${period}`
    ).then((r) => r.budgets),
}

// ─── Proposals ────────────────────────────────────────────────────────────────

export const proposals = {
  get: (id: string) =>
    api<Proposal>(`/api/proposals/${id}`),

  createPayment: (body: {
    treasury_id: string        // ← required: was missing, caused treasury_id bug
    token: string
    recipient: string
    amount: number
    description: string
    category?: string
  }) => api<CreateProposalResponse>('/api/proposals/payment', { method: 'POST', body: JSON.stringify(body) }),

  sign: (id: string, body: { signature: string; signer: string }) =>
    api<{ status: string; threshold_reached: boolean; approved_weight: number; required_weight: number }>(
      `/api/proposals/${id}/sign`,
      { method: 'POST', body: JSON.stringify(body) }
    ),

  execute: (id: string) =>
    api<{ tx_hash: string; status: string }>(`/api/proposals/${id}/execute`, { method: 'POST' }),

  cancel: (id: string) =>
    api<{ status: string }>(`/api/proposals/${id}/cancel`, { method: 'POST' }),
}

// ─── Agent (AI CFO) ──────────────────────────────────────────────────────────

export const agent = {
  /** Non-streaming chat */
  chat: (treasuryId: string, message: string, history: AgentChatMessage[] = []) =>
    api<{ message: string; proposals_created: unknown[]; risk_flags: string[]; tool_calls_made: number }>(
      '/api/agent/chat',
      { method: 'POST', body: JSON.stringify({ message, treasury_id: treasuryId, history }) }
    ),

  /**
   * Streaming SSE chat. Returns an AsyncGenerator that yields text chunks.
   * Usage: for await (const chunk of agent.stream(...)) { ... }
   */
  async *stream(treasuryId: string, message: string, history: AgentChatMessage[] = []) {
    const res = await fetch(`${BASE}/api/agent/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, treasury_id: treasuryId, history }),
    })
    if (!res.ok || !res.body) throw new Error('Stream failed')
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') return
        try {
          const parsed = JSON.parse(data)
          if (parsed.chunk) yield parsed.chunk as string
        } catch { /* ignore malformed */ }
      }
    }
  },
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

export function money(n: number | string, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(n))
}

export function bpsToPercent(bps: number): string {
  return (bps / 100).toFixed(2) + '%'
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d === 1) return 'Yesterday'
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function riskColor(level: RiskLevel): string {
  return { LOW: 'green', MEDIUM: 'orange', HIGH: 'red', CRITICAL: 'red' }[level]
}

export function proposalApprovalPct(p: Proposal): number {
  if (!p.required_weight) return 100
  return Math.min(100, Math.round((p.approved_weight / p.required_weight) * 100))
}
// ─── Factory ──────────────────────────────────────────────────────────────────

export type DeployRequest = {
  founder_address: string
  founder_name: string
  org_name: string
  per_tx_limit?: number
  daily_limit?: number
  weekly_limit?: number
}

export type DeployResponse = {
  tx_hash: string
  factory_address: string
  governance_address: string
  treasury_address: string
  policy_address: string
  treasury_id: string
}

export type InstanceResponse = {
  has_instance: boolean
  governance_address: string | null
  treasury_address: string | null
  policy_address: string | null
  treasury_id: string | null
}

export const factory = {
  deploy: (body: DeployRequest) =>
    api<DeployResponse>('/api/factory/deploy', { method: 'POST', body: JSON.stringify(body) }),

  getInstance: (founderAddress: string) =>
    api<InstanceResponse>(`/api/factory/instance/${founderAddress}`),
}
