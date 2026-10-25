import { useState, useEffect, useCallback } from 'react'
import { Search, RefreshCw, LogOut, PanelLeft } from 'lucide-react'
import { usePortfolioStore, PAIR_META } from '../store/portfolio'
import { fetchForexRates } from '../api/client'
import { NexusMark } from './BookSeal'
import MarketTape from './MarketTape'

const GREEKS = 'NEXUS · DELTA · GAMMA · VEGA · THETA · RHO · VANNA · VOLGA · CHARM · SPEED · '

function UtcClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id) }, [])
  return <time className="nx-clock" dateTime={now.toISOString()}>{now.toLocaleTimeString('en-GB', { hour12: false, timeZone: 'UTC' })} UTC</time>
}

export default function TopBar({ onLogout, onOpenIndex, onToggleBook }) {
  const { pair, setPair, S, setS } = usePortfolioStore()
  const [rates, setRates] = useState([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const meta = PAIR_META[pair] || {}
  const dp = meta.dp ?? (meta.pip === 0.01 ? 3 : 5)

  // Sets state only after the request settles; callers that want a spinner set it first.
  const loadRates = useCallback(async (syncSpot = true) => {
    try {
      const data = await fetchForexRates()
      setRates(data)
      setFailed(false)
      const cur = data.find(d => d.pair === usePortfolioStore.getState().pair)
      if (syncSpot && cur?.spot) setS(cur.spot)
    } catch { setFailed(true) /* rates are optional; the book keeps its spot */ }
    finally { setLoading(false) }
  }, [setS])

  // Fetch-on-mount: state is only set once the request settles.
  useEffect(() => { loadRates() }, [loadRates]) // eslint-disable-line react-hooks/set-state-in-effect
  useEffect(() => { const id = setInterval(() => loadRates(false), 5 * 60 * 1000); return () => clearInterval(id) }, [loadRates])

  const live = rates.find(r => r.pair === pair)
  const chg = live?.change_pct

  return (
    <header>
      <div className="nx-top">
        <button className="nx-icon-btn nx-only-narrow" onClick={onToggleBook} aria-label="Toggle book panel"><PanelLeft size={17} /></button>
        <div className="nx-brand">
          <NexusMark size={28} />
          <div className="nx-wordmark">NEXUS<small>Options terminal</small></div>
        </div>

        <select className="input-field nx-pair" aria-label="Instrument" value={pair}
          onChange={e => {
            setPair(e.target.value)
            const r = rates.find(d => d.pair === e.target.value)
            if (r?.spot) setS(r.spot)
          }}>
          {Object.keys(PAIR_META).map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <div className="nx-spot" aria-live="polite">
          {rates.length || failed
            ? <span className="nx-spot-val" style={rates.length ? undefined : { color: 'var(--text-dim)' }}
                title={rates.length ? 'Live spot' : 'Book spot: live rates are offline'}>
                {Number(S).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }).replace(/,/g, '\u2009')}
              </span>
            : <span className="nx-spot-val" style={{ color: 'var(--text-faint)' }} title="Waiting for live rates">—</span>}
          {chg != null && <span className="nx-spot-chg" style={{ color: chg >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{chg >= 0 ? '+' : '−'}{Math.abs(chg).toFixed(2)}%</span>}
        </div>

        <span className="nx-live" title={rates.length ? 'Rates connected; refresh every 5 minutes' : failed ? 'Rates unavailable; the book keeps its own spot' : 'Connecting to rates'}
          style={rates.length ? undefined : { color: 'var(--text-muted)' }}>
          {rates.length ? <span className="live-dot" /> : <span className={failed ? undefined : 'live-dot-blink'} style={{ width: 7, height: 7, borderRadius: '50%', border: '1px solid var(--text-muted)', background: failed ? 'transparent' : 'var(--text-muted)' }} />}
          <span>{rates.length ? 'Live' : failed ? 'Offline' : 'Connecting'}</span>
        </span>

        <button className="nx-search" onClick={onOpenIndex} aria-label="Open desk index">
          <Search size={14} /><span>Jump to a desk, pair or tool</span><kbd>Ctrl K</kbd>
        </button>
        <button className="nx-icon-btn" onClick={() => { setLoading(true); loadRates() }} disabled={loading} aria-label="Refresh rates" title="Refresh rates">
          <RefreshCw size={15} style={loading ? { animation: 'spin 0.9s linear infinite' } : undefined} />
        </button>
        <UtcClock />
        <button className="nx-icon-btn" onClick={onLogout} aria-label="Sign out" title="Sign out"><LogOut size={15} /></button>
      </div>
      <div className="microtext" aria-hidden="true">{GREEKS.repeat(14)}</div>
      <MarketTape rates={rates} />
    </header>
  )
}
