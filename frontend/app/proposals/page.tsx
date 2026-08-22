'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'
import Icon from '@/components/Icon'
import {
  treasury as treasuryApi, proposals as proposalsApi,
  money, timeAgo, shortAddr, bpsToPercent,
  type Proposal, type ProposalStatus,
} from '@/lib/api'
import { useTreasuryId } from '@/lib/treasury-context'
import { useAccount, useSignMessage } from '@/lib/wallet'

type Filter = 'PENDING' | 'APPROVED' | 'EXECUTED' | 'CANCELLED' | 'ALL'

export default function ProposalsPage() {
  const treasuryId      = useTreasuryId()
  const { address }     = useAccount()
  const { signMessageAsync } = useSignMessage()

  const [proposals, setProposals]     = useState<Proposal[]>([])
  const [loading, setLoading]         = useState(true)
  const [filter, setFilter]           = useState<Filter>('PENDING')
  const [acting, setActing]           = useState<string | null>(null)
  const [error, setError]             = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Load pending + approved in parallel for the "all" view
      const statuses: ProposalStatus[] = filter === 'ALL'
        ? ['PENDING', 'APPROVED', 'EXECUTED', 'CANCELLED']
        : [filter as ProposalStatus]

      const arrays = await Promise.all(
        statuses.map((s) => treasuryApi.proposals(treasuryId, s))
      )
      setProposals(arrays.flat())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [treasuryId, filter])

  useEffect(() => { load() }, [load])

  async function signProposal(p: Proposal) {
    if (!address) {
      setError('Connect your wallet first.')
      return
    }
    setActing(p.id)
    setError(null)
    try {
      // Build a simple human-readable message; production would use EIP-712
      const msg = `CFOx CFO: approve proposal ${p.id}\nAmount: ${p.value ?? '—'} ${p.token ?? ''}\nRecipient: ${p.target ?? '—'}`
      const signature = await signMessageAsync({ message: msg })
      const result = await proposalsApi.sign(p.id, { signature, signer: address })
      if (result.threshold_reached) {
        // Auto-reflect the new status locally so the UI updates without a full reload
        setProposals((prev) =>
          prev.map((x) => x.id === p.id ? { ...x, status: 'APPROVED', approved_weight: result.approved_weight } : x)
        )
      } else {
        setProposals((prev) =>
          prev.map((x) => x.id === p.id ? { ...x, approved_weight: result.approved_weight } : x)
        )
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setActing(null)
    }
  }

  async function executeProposal(p: Proposal) {
    setActing(p.id)
    setError(null)
    try {
      const result = await proposalsApi.execute(p.id)
      setProposals((prev) =>
        prev.map((x) => x.id === p.id ? { ...x, status: 'EXECUTED' } : x)
      )
      // Show tx hash
      if (result.tx_hash) {
        alert(`Executed! Tx: ${result.tx_hash}`)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setActing(null)
    }
  }

  async function cancelProposal(p: Proposal) {
    setActing(p.id)
    try {
      await proposalsApi.cancel(p.id)
      setProposals((prev) => prev.map((x) => x.id === p.id ? { ...x, status: 'CANCELLED' } : x))
    } catch (e) {
      setError(String(e))
    } finally {
      setActing(null)
    }
  }

  const pendingCount    = proposals.filter((p) => p.status === 'PENDING').length
  const pendingAmount   = proposals.filter((p) => p.status === 'PENDING').reduce((s, p) => s + Number(p.value ?? 0), 0)

  const filters: Filter[] = ['PENDING', 'APPROVED', 'EXECUTED', 'ALL']

  return (
    <Shell pendingCount={pendingCount}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Proposals</p>
          <h1>Payment proposals</h1>
          <p className="subheading">Equity-weighted governance — signatures accumulate until the required threshold is met.</p>
        </div>
        <Link href="/proposals/new" className="primary-button">
          <Icon name="plus" size={17} /> New proposal
        </Link>
      </div>

      {error && <div className="form-error" style={{ marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <div className="loading-state">Loading proposals…</div>
      ) : (
        <>
          <div className="metrics">
            <div className="metric">
              <div className="metric-top"><span>Pending</span><span className="metric-icon"><Icon name="clock" size={17} /></span></div>
              <strong>{String(pendingCount).padStart(2, '0')}</strong>
              <div className="metric-foot"><span>awaiting signatures</span></div>
            </div>
            <div className="metric">
              <div className="metric-top"><span>Total requested</span><span className="metric-icon"><Icon name="wallet" size={17} /></span></div>
              <strong>{money(pendingAmount)}</strong>
              <div className="metric-foot"><span>across pending</span></div>
            </div>
            <div className="metric">
              <div className="metric-top"><span>Approved</span><span className="metric-icon"><Icon name="check" size={17} /></span></div>
              <strong>{String(proposals.filter((p) => p.status === 'APPROVED').length).padStart(2, '0')}</strong>
              <div className="metric-foot"><span>this period</span></div>
            </div>
            <div className="metric">
              <div className="metric-top"><span>Executed</span><span className="metric-icon"><Icon name="zap" size={17} /></span></div>
              <strong>{String(proposals.filter((p) => p.status === 'EXECUTED').length).padStart(2, '0')}</strong>
              <div className="metric-foot"><span>on-chain</span></div>
            </div>
          </div>

          <section className="card">
            <div className="card-header">
              <div><p className="card-kicker">All proposals</p><h2>Review queue</h2></div>
              <div className="filter-group">
                {filters.map((f) => (
                  <button
                    key={f}
                    className={`filter-chip ${filter === f ? 'active' : ''}`}
                    onClick={() => setFilter(f)}
                  >
                    {f.charAt(0) + f.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Proposal</th>
                    <th>Token</th>
                    <th>Recipient</th>
                    <th>Amount</th>
                    <th>Approval progress</th>
                    <th>Status</th>
                    <th>Age</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {proposals.length === 0 && (
                    <tr><td colSpan={8} className="empty-row">No proposals match this filter.</td></tr>
                  )}
                  {proposals.map((p) => {
                    const pct = p.required_weight
                      ? Math.min(100, Math.round((p.approved_weight / p.required_weight) * 100))
                      : 100
                    const isBusy = acting === p.id
                    const canSign   = p.status === 'PENDING' && !!address
                    const canExec   = p.status === 'APPROVED'
                    return (
                      <tr key={p.id}>
                        <td>
                          <div className="merchant">
                            <span className="merchant-icon generic">{(p.description || 'P').charAt(0).toUpperCase()}</span>
                            <span>
                              <strong>{p.description?.slice(0, 30) ?? 'Proposal'}</strong>
                              <small>{p.type}</small>
                            </span>
                          </div>
                        </td>
                        <td><span className="chip">{p.token ?? '—'}</span></td>
                        <td>
                          {p.target
                            ? <code style={{ fontSize: 11 }}>{shortAddr(p.target)}</code>
                            : '—'}
                        </td>
                        <td><strong>{p.value ? money(p.value) : '—'}</strong></td>
                        <td>
                          <div style={{ minWidth: 120 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                              <span>{bpsToPercent(p.approved_weight)} / {bpsToPercent(p.required_weight)}</span>
                              <span style={{ fontWeight: 600 }}>{pct}%</span>
                            </div>
                            <div style={{ height: 5, background: 'var(--border)', borderRadius: 3 }}>
                              <div
                                style={{
                                  height: '100%',
                                  width: `${pct}%`,
                                  background: pct >= 100 ? '#22c55e' : 'var(--accent)',
                                  borderRadius: 3,
                                  transition: 'width 0.3s',
                                }}
                              />
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`status ${
                            p.status === 'APPROVED' ? 'approved'
                            : p.status === 'EXECUTED' ? 'approved'
                            : p.status === 'CANCELLED' ? 'rejected'
                            : 'pending'
                          }`}>
                            <span />{p.status}
                          </span>
                        </td>
                        <td><small>{p.created_at ? timeAgo(p.created_at) : '—'}</small></td>
                        <td>
                          <div className="row-actions">
                            {canSign && (
                              <button
                                className="action-btn approve"
                                disabled={isBusy}
                                onClick={() => signProposal(p)}
                              >
                                <Icon name="check" size={13} /> Sign
                              </button>
                            )}
                            {canExec && (
                              <button
                                className="action-btn approve"
                                disabled={isBusy}
                                onClick={() => executeProposal(p)}
                              >
                                <Icon name="zap" size={13} /> Execute
                              </button>
                            )}
                            {p.status === 'PENDING' && (
                              <button
                                className="action-btn reject"
                                disabled={isBusy}
                                onClick={() => cancelProposal(p)}
                              >
                                <Icon name="x" size={13} /> Cancel
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </Shell>
  )
}