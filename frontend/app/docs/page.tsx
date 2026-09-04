'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

/* ─── Section data ─────────────────────────────────────────────────────────── */
const sections = [
  { id: 'intro',       label: 'Introduction' },
  { id: 'quickstart',  label: 'Quick start' },
  { id: 'architecture',label: 'Architecture' },
  { id: 'treasury',    label: 'Treasury' },
  { id: 'governance',  label: 'Governance' },
  { id: 'proposals',   label: 'Proposals' },
  { id: 'policies',    label: 'Policies & limits' },
  { id: 'ai-agent',    label: 'AI CFO agent' },
  { id: 'members',     label: 'Members & equity' },
  { id: 'activity',    label: 'Activity & analytics' },
  { id: 'onboard',     label: 'Onboarding flow' },
  { id: 'chains',      label: 'Supported chains' },
  { id: 'security',    label: 'Security model' },
  { id: 'faq',         label: 'FAQ' },
]

export default function DocsPage() {
  const [active, setActive] = useState('intro')
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length > 0) setActive(visible[0].target.id)
      },
      { rootMargin: '-20% 0px -70% 0px' }
    )
    sections.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) observerRef.current?.observe(el)
    })
    return () => observerRef.current?.disconnect()
  }, [])

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActive(id)
  }

  return (
    <div className="docs-shell">
      {/* ── Top bar ── */}
      <header className="docs-topbar">
        <div className="docs-topbar-inner">
          <Link href="/" className="docs-brand">
            <span className="brand-mark"><span /></span>
            <span className="docs-brand-name">CFOx</span>
            <span className="docs-brand-sep">/</span>
            <span className="docs-brand-section">Docs</span>
          </Link>
          <nav className="docs-topnav">
            <Link href="/" className="docs-topnav-link">← Back to app</Link>
            <a href="https://github.com/faucetdrops/cfox" className="docs-topnav-link" target="_blank" rel="noreferrer">GitHub ↗</a>
          </nav>
        </div>
      </header>

      <div className="docs-body">
        {/* ── Left nav ── */}
        <aside className="docs-sidebar">
          <p className="docs-sidebar-label">On this page</p>
          <nav>
            {sections.map((s) => (
              <button
                key={s.id}
                className={`docs-nav-item ${active === s.id ? 'active' : ''}`}
                onClick={() => scrollTo(s.id)}
              >
                {s.label}
              </button>
            ))}
          </nav>
          <div className="docs-sidebar-cta">
            <strong>Ready to deploy?</strong>
            <span>It takes under a minute.</span>
            <Link href="/onboard" className="docs-cta-btn">Launch app →</Link>
          </div>
        </aside>

        {/* ── Content ── */}
        <main className="docs-content">

          {/* ─── Introduction ─────────────────────────────────────────── */}
          <section id="intro" className="docs-section">
            <Eyebrow>Overview</Eyebrow>
            <h1 className="docs-h1">What is CFOx?</h1>
            <Lead>
              CFOx is an autonomous, on-chain treasury management suite for Web3
              organizations. It combines smart-contract governance, AI-driven
              payment execution, and a real-time analytics dashboard into a single
              product you deploy from your wallet — no back-end accounts, no
              custodians.
            </Lead>
            <p className="docs-p">
              Once deployed, CFOx gives your organization three interconnected
              contracts — <Code>Governance</Code>, <Code>Treasury</Code>, and{' '}
              <Code>Policy</Code> — wired together so that spending decisions are
              enforced on-chain, not just in a spreadsheet. An AI agent monitors
              inflows and outflows, auto-executes payments that fall within
              pre-approved limits, and escalates anything above the threshold to
              equity holders for a vote.
            </p>
            <Callout type="info">
              CFOx is currently deployed on <strong>Celo Mainnet</strong> and{' '}
              <strong>Botchain (chain ID 677)</strong>. Testnet support on Celo
              Alfajores is available for evaluation.
            </Callout>
          </section>

          <Divider />

          {/* ─── Quick start ──────────────────────────────────────────── */}
          <section id="quickstart" className="docs-section">
            <Eyebrow>Getting started</Eyebrow>
            <h2 className="docs-h2">Quick start</h2>
            <p className="docs-p">
              You can have a live treasury in under 60 seconds. Here's the full
              path from nothing to operational:
            </p>
            <StepList>
              <Step n={1} title="Connect your wallet">
                Visit the CFOx landing page and click <strong>Connect Wallet</strong>.
                MetaMask, Rabby, and any WalletConnect-compatible wallet work. Your
                connected address becomes the <strong>founder</strong> — it holds
                100% of the initial equity weight and can add members later.
              </Step>
              <Step n={2} title="Fill in your organization details">
                On the onboard screen, enter your name, your organization name, and
                the three AI spending limits (per-transaction, daily cap, weekly
                cap). These are denominated in USDC and encoded directly into your
                Policy contract — they can be changed later via a governance
                proposal.
              </Step>
              <Step n={3} title="Deploy your CFO suite">
                Hit <strong>Deploy contracts</strong>. A single transaction deploys
                all three contracts in sequence: Governance → Treasury → Policy →
                cross-wired initialization. The whole process takes 5–15 seconds on
                Celo.
              </Step>
              <Step n={4} title="Fund your treasury">
                Send CELO, USDC, or cUSD to your newly deployed Treasury address
                (shown on the success screen). The on-chain indexer picks up
                incoming transactions within one block and surfaces them in your
                dashboard.
              </Step>
              <Step n={5} title="Invite members">
                Go to <strong>Members → Add member</strong> to create an equity
                grant proposal. Once enough existing equity holders approve it, the
                new member's weight is registered on-chain.
              </Step>
            </StepList>
          </section>

          <Divider />

          {/* ─── Architecture ─────────────────────────────────────────── */}
          <section id="architecture" className="docs-section">
            <Eyebrow>System design</Eyebrow>
            <h2 className="docs-h2">Architecture</h2>
            <p className="docs-p">
              CFOx has two main layers: a <strong>smart-contract layer</strong>{' '}
              (on-chain) and an <strong>off-chain layer</strong> (the API, indexer,
              and AI agent). They communicate only through on-chain state — the
              off-chain layer reads the chain and submits signed transactions; it
              never holds funds.
            </p>
            <ArchDiagram />
            <h3 className="docs-h3">Smart-contract layer</h3>
            <PropTable rows={[
              ['Governance', 'Tracks member registry and equity weights. Validates quorum on proposal votes.'],
              ['Treasury',   'Holds all funds. Executes outbound transfers only when called by Governance after quorum, or by Policy for auto-approved amounts.'],
              ['Policy',     'Enforces per-tx, daily, and weekly spend limits for the AI agent. Blocks execution if any cap would be breached.'],
              ['Factory',    'One-click deployer. Deploys and wires the three contracts above in a single transaction.'],
            ]} />
            <h3 className="docs-h3">Off-chain layer</h3>
            <PropTable rows={[
              ['FastAPI backend',  'REST API consumed by the Next.js frontend. Reads on-chain state via Web3.py, submits transactions from the agent wallet.'],
              ['Indexer worker',   'Background process that polls the chain for new blocks and indexes transactions into Supabase.'],
              ['AI CFO agent',     'LLM agent with tools for reading balances, submitting payments, querying analytics, and explaining treasury state in plain English.'],
              ['Supabase / asyncpg', 'Relational database for indexed transaction history, proposal metadata, and member records.'],
            ]} />
          </section>

          <Divider />

          {/* ─── Treasury ─────────────────────────────────────────────── */}
          <section id="treasury" className="docs-section">
            <Eyebrow>Core contract</Eyebrow>
            <h2 className="docs-h2">Treasury</h2>
            <p className="docs-p">
              The Treasury contract is the actual custodian of your organization's
              funds. It accepts any ERC-20 token or native CELO and maintains
              on-chain balances. All outbound transfers are gated — nothing leaves
              without either a passing governance vote or a valid Policy-compliant
              AI agent call.
            </p>
            <h3 className="docs-h3">Balances</h3>
            <p className="docs-p">
              The dashboard's <strong>Treasury</strong> page fetches live balances
              from the chain on every load. Each token shows its raw balance, USD
              value (from an on-chain price feed), and a sparkline of recent
              movement. The total USD value is the sum across all held tokens.
            </p>
            <h3 className="docs-h3">Pause mechanism</h3>
            <p className="docs-p">
              The founder can pause the Treasury at any time. While paused, no
              outbound transfers execute — including AI-agent auto-payments. The
              dashboard surfaces a <Code>⏸ PAUSED</Code> badge on every affected
              panel. Unpausing requires a governance proposal above the quorum
              threshold.
            </p>
            <Callout type="warning">
              Pausing does <strong>not</strong> prevent inbound transfers. Funds can
              still be received while the treasury is paused.
            </Callout>
            <h3 className="docs-h3">Supported tokens</h3>
            <p className="docs-p">
              Any ERC-20 token can be held. However, USD-denominated analytics
              (burn rate, runway) only cover tokens for which a price feed is
              registered on the Policy contract. Out of the box this includes CELO,
              USDC, and cUSD.
            </p>
          </section>

          <Divider />

          {/* ─── Governance ───────────────────────────────────────────── */}
          <section id="governance" className="docs-section">
            <Eyebrow>Voting system</Eyebrow>
            <h2 className="docs-h2">Governance</h2>
            <p className="docs-p">
              CFOx uses <strong>equity-weighted voting</strong>. Each member holds
              a weight (expressed as an integer — think of it as basis points of
              total equity). A proposal passes when the sum of approving weights
              meets or exceeds the configured quorum threshold.
            </p>
            <h3 className="docs-h3">Quorum</h3>
            <p className="docs-p">
              The default quorum is <Code>51%</Code> of total equity weight. This
              can be changed via a governance proposal. There is no time-lock by
              default, but one can be added via a Policy rule.
            </p>
            <h3 className="docs-h3">Vote lifecycle</h3>
            <StepList compact>
              <Step n={1} title="Proposal created">Any member can submit a proposal.</Step>
              <Step n={2} title="Voting open">All members with equity weight can vote APPROVE or REJECT.</Step>
              <Step n={3} title="Quorum reached">If approvals ≥ quorum, the proposal moves to EXECUTABLE.</Step>
              <Step n={4} title="Execution">Any member (or the AI agent) triggers execution. The action runs on-chain.</Step>
              <Step n={5} title="Settled">The proposal is marked COMPLETED or REJECTED and immutably recorded.</Step>
            </StepList>
            <h3 className="docs-h3">Equity weight</h3>
            <p className="docs-p">
              Weights are whole numbers stored on the Governance contract. The
              founder starts at <Code>10000</Code> (representing 100%). When a new
              member is added with weight <Code>2000</Code>, the total supply
              increases to <Code>12000</Code> and quorum recalculates accordingly.
              Weights can be adjusted or revoked via proposals.
            </p>
          </section>

          <Divider />

          {/* ─── Proposals ────────────────────────────────────────────── */}
          <section id="proposals" className="docs-section">
            <Eyebrow>Workflow</Eyebrow>
            <h2 className="docs-h2">Proposals</h2>
            <p className="docs-p">
              Proposals are the primary interface for any action that requires
              governance consent. There are several proposal types:
            </p>
            <PropTable rows={[
              ['PAYMENT',        'Transfer tokens from the treasury to a recipient address.'],
              ['MEMBER_ADD',     'Register a new address as a member with a specified equity weight.'],
              ['MEMBER_REMOVE',  'Revoke a member\'s equity weight and remove them from the registry.'],
              ['POLICY_UPDATE',  'Change one or more spending limits on the Policy contract.'],
              ['PAUSE',          'Pause or unpause the treasury.'],
              ['CUSTOM',         'Arbitrary calldata — used for advanced contract interactions.'],
            ]} />
            <h3 className="docs-h3">Creating a proposal</h3>
            <p className="docs-p">
              Navigate to <strong>Proposals → New proposal</strong>. Fill in the
              type, recipient (for payments), token, amount, and a plain-English
              description. The description is stored off-chain in Supabase and
              surfaced in the dashboard and AI agent context — it is not on-chain.
            </p>
            <h3 className="docs-h3">Voting</h3>
            <p className="docs-p">
              On the Proposals list page, open any pending proposal and click{' '}
              <strong>Approve</strong> or <strong>Reject</strong>. Your wallet
              signs a transaction that calls <Code>castVote()</Code> on the
              Governance contract. The approval progress bar updates in real time.
            </p>
            <Callout type="info">
              You can only vote once per proposal per address. Changing your vote is
              not supported — choose carefully.
            </Callout>
          </section>

          <Divider />

          {/* ─── Policies ─────────────────────────────────────────────── */}
          <section id="policies" className="docs-section">
            <Eyebrow>Spending rules</Eyebrow>
            <h2 className="docs-h2">Policies &amp; limits</h2>
            <p className="docs-p">
              The Policy contract is a programmable rule engine that sits between
              the AI agent and the Treasury. Before any auto-payment executes, the
              Policy contract checks three limits simultaneously:
            </p>
            <PropTable rows={[
              ['Per-transaction limit', 'Maximum USDC value of a single AI-initiated payment. Payments above this always go to a governance vote, regardless of daily/weekly headroom.'],
              ['Daily cap',   'Total USDC the AI agent can spend in a rolling 24-hour window. Resets at UTC midnight.'],
              ['Weekly cap',  'Total USDC the AI agent can spend in a rolling 7-day window. Resets Monday 00:00 UTC.'],
            ]} />
            <p className="docs-p">
              If any limit would be breached, the transaction reverts on-chain. The
              AI agent catches this revert and automatically escalates the payment
              to a governance proposal, notifying you in the CFO Chat.
            </p>
            <h3 className="docs-h3">Changing limits</h3>
            <p className="docs-p">
              Submit a <Code>POLICY_UPDATE</Code> proposal with the new values.
              Once it passes quorum, the Policy contract updates atomically. There
              is no delay.
            </p>
            <h3 className="docs-h3">Policy rules (advanced)</h3>
            <p className="docs-p">
              Beyond the three numeric limits, the Policy contract supports
              allowlist rules (only pay to pre-approved addresses) and token rules
              (only spend specific tokens autonomously). These are configured via
              raw calldata in a <Code>CUSTOM</Code> proposal.
            </p>
          </section>

          <Divider />

          {/* ─── AI agent ─────────────────────────────────────────────── */}
          <section id="ai-agent" className="docs-section">
            <Eyebrow>Automation</Eyebrow>
            <h2 className="docs-h2">AI CFO agent</h2>
            <p className="docs-p">
              The AI agent is a tool-using LLM (Claude Sonnet) with direct access
              to your treasury's on-chain state. It can answer questions in plain
              English, execute payments autonomously within your Policy limits, and
              escalate decisions that require a vote.
            </p>
            <h3 className="docs-h3">What the agent can do</h3>
            <PropTable rows={[
              ['Read balances',       'Fetches live token balances and USD valuations.'],
              ['Execute payments',    'Submits signed transactions to the Treasury (Policy-gated).'],
              ['Query history',       'Reads indexed transaction history from Supabase.'],
              ['Explain analytics',   'Calculates burn rate, runway, and spending breakdowns in natural language.'],
              ['Create proposals',    'Drafts and submits governance proposals when a payment exceeds Policy limits.'],
              ['Summarize activity',  'Gives a plain-English summary of recent treasury events.'],
            ]} />
            <h3 className="docs-h3">How to use CFO Chat</h3>
            <p className="docs-p">
              Go to <strong>CFO Chat</strong> in the sidebar. Type any question or
              instruction in natural language. Examples:
            </p>
            <CodeBlock>{`"What's our current runway at this burn rate?"
"Pay 500 USDC to 0xABC... for the Figma subscription."
"Show me the top 3 spending categories this month."
"Draft a proposal to add Alice (0xDEF...) as a member with 15% equity."`}</CodeBlock>
            <p className="docs-p">
              The agent responds with an explanation of what it did or found. For
              payments, it shows the transaction hash once confirmed. For proposals
              it couldn't auto-execute, it shows the draft for you to review and
              submit.
            </p>
            <Callout type="warning">
              The agent uses your backend's signer wallet, not your personal
              wallet, to submit transactions. The signer wallet must be funded with
              native gas tokens (CELO or BOT). It only has authority within Policy
              limits — it cannot drain the treasury.
            </Callout>
          </section>

          <Divider />

          {/* ─── Members ──────────────────────────────────────────────── */}
          <section id="members" className="docs-section">
            <Eyebrow>Access control</Eyebrow>
            <h2 className="docs-h2">Members &amp; equity</h2>
            <p className="docs-p">
              Every address that participates in governance must be registered as a
              member with an equity weight. Only members can vote on proposals.
              Anyone can <em>see</em> the dashboard if they have a Treasury ID, but
              only registered members can take governance actions.
            </p>
            <h3 className="docs-h3">Adding a member</h3>
            <p className="docs-p">
              Go to <strong>Members → Add member</strong> (or ask the AI CFO to
              draft the proposal). Specify the member's wallet address and their
              equity weight. The weight is relative — the system normalizes it
              against total supply automatically.
            </p>
            <h3 className="docs-h3">Removing a member</h3>
            <p className="docs-p">
              Submit a <Code>MEMBER_REMOVE</Code> proposal with the target address.
              If it passes, the member's weight is set to zero and they can no
              longer vote. Their past votes are immutably recorded on-chain.
            </p>
            <h3 className="docs-h3">Equity dilution</h3>
            <p className="docs-p">
              When a new member is added, the total equity weight increases by
              their allocation. Existing members' percentages are diluted
              proportionally. This is the same behaviour as issuing new shares — be
              deliberate with the numbers you choose.
            </p>
          </section>

          <Divider />

          {/* ─── Activity ─────────────────────────────────────────────── */}
          <section id="activity" className="docs-section">
            <Eyebrow>Reporting</Eyebrow>
            <h2 className="docs-h2">Activity &amp; analytics</h2>
            <p className="docs-p">
              The <strong>Activity</strong> page shows every indexed on-chain
              transaction touching your treasury address: inbound transfers,
              outbound payments, proposal executions, and contract events. The{' '}
              <strong>Treasury</strong> page adds burn-rate charts and category
              breakdowns.
            </p>
            <h3 className="docs-h3">How indexing works</h3>
            <p className="docs-p">
              A background worker polls the chain every block (~5 seconds on Celo).
              It reads logs from your Treasury contract, maps them to transaction
              records, resolves USD values using the Policy price feed, and writes
              the results to Supabase. There is a short lag between a transaction
              confirming and appearing in the dashboard.
            </p>
            <h3 className="docs-h3">Analytics calculations</h3>
            <PropTable rows={[
              ['Monthly burn',   'Average USD outflow over the trailing 90 days, expressed per month.'],
              ['Runway',         'Total treasury USD value ÷ monthly burn. Shown in months.'],
              ['Category spend', 'Outflows grouped by the description tag set on each transaction or proposal.'],
            ]} />
            <Callout type="info">
              The indexer requires the Treasury address to be registered in the
              backend's <Code>.env</Code> as <Code>TREASURY_ADDRESS</Code>. If you
              deployed via the factory, the onboard page sends this automatically.
            </Callout>
          </section>

          <Divider />

          {/* ─── Onboard flow ─────────────────────────────────────────── */}
          <section id="onboard" className="docs-section">
            <Eyebrow>Setup</Eyebrow>
            <h2 className="docs-h2">Onboarding flow</h2>
            <p className="docs-p">
              The onboard page (<Code>/onboard</Code>) handles first-time setup for
              new wallets. It checks on mount whether your connected address already
              has a deployed instance via the Factory contract.
            </p>
            <h3 className="docs-h3">Existing instance detection</h3>
            <p className="docs-p">
              If the Factory contract finds an existing deployment for your address,
              a banner appears offering to restore it. Clicking{' '}
              <strong>Use it →</strong> loads that treasury ID into your browser
              session and routes you to the dashboard. You do not need to redeploy.
            </p>
            <h3 className="docs-h3">Treasury ID persistence</h3>
            <p className="docs-p">
              After a successful deploy, CFOx saves your Treasury ID in{' '}
              <Code>localStorage</Code> under the key <Code>cfox_treasury_id</Code>.
              For a permanent setup (multi-device, CI, etc.) set it in your{' '}
              <Code>.env</Code>:
            </p>
            <CodeBlock>NEXT_PUBLIC_TREASURY_ID=your-treasury-uuid-here</CodeBlock>
            <p className="docs-p">
              The env var takes precedence over <Code>localStorage</Code> when both
              are present.
            </p>
            <h3 className="docs-h3">Routing logic</h3>
            <PropTable rows={[
              ['/ (landing)',   'All users land here. Wallet connect button present. Unauthenticated.'],
              ['/onboard',     'First-time users after wallet connect. Redirects to /overview if treasury already exists.'],
              ['/overview',    'Main dashboard. Redirects to /onboard if no treasury ID found, or / if wallet disconnected.'],
            ]} />
          </section>

          <Divider />

          {/* ─── Chains ───────────────────────────────────────────────── */}
          <section id="chains" className="docs-section">
            <Eyebrow>Network</Eyebrow>
            <h2 className="docs-h2">Supported chains</h2>
            <PropTable rows={[
              ['Celo Mainnet (chain 42220)',   'Primary production chain. Low fees, EVM-compatible, strong stablecoin support (USDC, cUSD).'],
              ['Botchain (chain 677)',          'Custom EVM chain used by FaucetDrops. Native token: BOT. Configured via NEXT_PUBLIC_RPC_URL.'],
              ['Celo Alfajores (chain 44787)', 'Testnet. Use for evaluation and development — tokens have no real value.'],
            ]} />
            <h3 className="docs-h3">Adding Botchain to MetaMask</h3>
            <CodeBlock>{`Network name:  BOT Chain
RPC URL:       https://rpc.botchain.network
Chain ID:      677
Currency:      BOT
Explorer:      https://explorer.botchain.network`}</CodeBlock>
            <p className="docs-p">
              WalletConnect is available if a <Code>NEXT_PUBLIC_WC_PROJECT_ID</Code>{' '}
              is set in the frontend <Code>.env</Code>. Without it, only injected
              wallets (MetaMask, Rabby, etc.) are offered.
            </p>
          </section>

          <Divider />

          {/* ─── Security ─────────────────────────────────────────────── */}
          <section id="security" className="docs-section">
            <Eyebrow>Trust model</Eyebrow>
            <h2 className="docs-h2">Security model</h2>
            <p className="docs-p">
              CFOx is designed so that the off-chain layer (API, indexer, AI agent)
              can never take actions that exceed on-chain constraints. Here's what
              each actor can and cannot do:
            </p>
            <PropTable rows={[
              ['Your wallet (founder)',     'Can submit any proposal, vote, and trigger execution. Has no special bypass — still needs quorum.'],
              ['Members',                   'Can submit proposals and vote. Voting power is proportional to equity weight.'],
              ['AI agent signer wallet',    'Can call the Treasury only within Policy limits. Cannot vote. Cannot change Policy limits. Cannot pause/unpause.'],
              ['Backend API server',        'Read-only access to chain state plus submitting AI agent transactions. Cannot override governance.'],
              ['Supabase database',         'Stores off-chain metadata (descriptions, categories). No on-chain authority — corrupting it does not change contract state.'],
            ]} />
            <h3 className="docs-h3">Key risks to be aware of</h3>
            <ul className="docs-ul">
              <li>The backend's <strong>signer private key</strong> controls the AI agent's spending authority. Keep it in a secrets manager, not a plain <Code>.env</Code> file in production.</li>
              <li>Smart contracts on Celo Alfajores (testnet) are <strong>not audited</strong> and should never hold real funds.</li>
              <li>The Policy limits are your first line of defence against a compromised agent. Set them conservatively.</li>
              <li>There is currently no time-lock on governance proposals. A proposal can be executed immediately after quorum. For high-value treasuries, consider adding a delay policy.</li>
            </ul>
          </section>

          <Divider />

          {/* ─── FAQ ──────────────────────────────────────────────────── */}
          <section id="faq" className="docs-section">
            <Eyebrow>Help</Eyebrow>
            <h2 className="docs-h2">FAQ</h2>

            <FAQ q="Can I use CFOx without the AI agent?">
              Yes. The AI agent is an optional automation layer. You can submit and
              execute proposals entirely through the dashboard UI or directly via
              the contracts without ever using the CFO Chat page.
            </FAQ>

            <FAQ q="What happens if I lose my Treasury ID?">
              Connect your founder wallet and visit <Code>/onboard</Code>. The
              onboard page queries the Factory contract for any existing instance
              tied to your address. If found, it will offer to restore it with one
              click.
            </FAQ>

            <FAQ q="Can I have multiple treasuries?">
              The Factory allows one instance per founder address. To run multiple
              treasuries, use different wallet addresses as the founder for each.
              The dashboard currently manages one treasury at a time — switch by
              updating your Treasury ID.
            </FAQ>

            <FAQ q="How are USD values calculated?">
              Token USD prices are fetched from on-chain price feeds registered on
              the Policy contract. For CELO, USDC, and cUSD, these are Chainlink
              feeds bridged to Celo. Custom tokens without a registered feed show a
              balance of zero USD in the analytics.
            </FAQ>

            <FAQ q="Is there a fee to use CFOx?">
              CFOx itself charges no protocol fee. You pay only on-chain gas costs
              (very low on Celo, typically under $0.01 per transaction) and any
              infrastructure costs for self-hosting the backend.
            </FAQ>

            <FAQ q="Can the AI agent drain my treasury?">
              No. The AI agent submits transactions through the Policy contract,
              which enforces your configured per-transaction, daily, and weekly
              limits in a single <Code>require()</Code> check on-chain. Even if the
              agent or backend is fully compromised, it cannot exceed these limits
              without a passing governance vote.
            </FAQ>

            <FAQ q="How do I update the frontend to point to my own backend?">
              Set <Code>NEXT_PUBLIC_API_URL</Code> in <Code>frontend/.env</Code> to
              your backend's base URL. All API calls in{' '}
              <Code>lib/api.ts</Code> read from this variable.
            </FAQ>
          </section>

          <div style={{ height: 80 }} />
        </main>
      </div>
    </div>
  )
}

/* ─── Small components ─────────────────────────────────────────────────────── */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="docs-eyebrow">{children}</p>
}

function Lead({ children }: { children: React.ReactNode }) {
  return <p className="docs-lead">{children}</p>
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="docs-code">{children}</code>
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return <pre className="docs-codeblock"><code>{children}</code></pre>
}

function Divider() {
  return <hr className="docs-divider" />
}

function Callout({ type, children }: { type: 'info' | 'warning'; children: React.ReactNode }) {
  return <div className={`docs-callout docs-callout-${type}`}>{children}</div>
}

function PropTable({ rows }: { rows: [string, string][] }) {
  return (
    <div className="docs-proptable-wrap">
      <table className="docs-proptable">
        <tbody>
          {rows.map(([key, val]) => (
            <tr key={key}>
              <td className="docs-proptable-key"><code>{key}</code></td>
              <td className="docs-proptable-val">{val}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StepList({ children, compact }: { children: React.ReactNode; compact?: boolean }) {
  return <ol className={`docs-steplist ${compact ? 'compact' : ''}`}>{children}</ol>
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="docs-step">
      <span className="docs-step-n">{n}</span>
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </li>
  )
}

function FAQ({ q, children }: { q: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`docs-faq ${open ? 'open' : ''}`}>
      <button className="docs-faq-q" onClick={() => setOpen(!open)}>
        <span>{q}</span>
        <span className="docs-faq-chevron">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="docs-faq-a">{children}</div>}
    </div>
  )
}

function ArchDiagram() {
  return (
    <div className="docs-arch">
      <div className="docs-arch-col">
        <div className="docs-arch-label">On-chain</div>
        <div className="docs-arch-box green">Governance</div>
        <div className="docs-arch-box green">Treasury</div>
        <div className="docs-arch-box green">Policy</div>
        <div className="docs-arch-box green" style={{ opacity: .65 }}>Factory</div>
      </div>
      <div className="docs-arch-arrows">
        <span>↔</span>
        <span className="docs-arch-arrow-label">reads &amp; submits txns</span>
      </div>
      <div className="docs-arch-col">
        <div className="docs-arch-label">Off-chain</div>
        <div className="docs-arch-box blue">FastAPI backend</div>
        <div className="docs-arch-box blue">Indexer worker</div>
        <div className="docs-arch-box blue">AI CFO agent</div>
        <div className="docs-arch-box blue" style={{ opacity: .65 }}>Supabase</div>
      </div>
      <div className="docs-arch-arrows">
        <span>↔</span>
        <span className="docs-arch-arrow-label">REST API</span>
      </div>
      <div className="docs-arch-col">
        <div className="docs-arch-label">Frontend</div>
        <div className="docs-arch-box purple">Next.js / React</div>
        <div className="docs-arch-box purple">wagmi / viem</div>
        <div className="docs-arch-box purple" style={{ opacity: .65 }}>CFO Chat UI</div>
      </div>
    </div>
  )
}
