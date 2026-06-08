import { useState, useEffect } from 'react'
import { usePortfolioStore, PAIR_META } from '../store/portfolio'
import { fetchForexRates } from '../api/client'
import NewsBanner from './NewsBanner'
import { NexusIcon } from './NexusLogo'

const TickerItem = ({ item }) => {
  const up = item.change_pct >= 0
  return (
    <div className="ticker-item">
      <span className="ticker-pair">{item.pair}</span>
      <span className="ticker-rate font-mono">{item.spot?.toFixed(item.pair==='USDJPY'||item.pair.includes('JPY')?3:5)}</span>
      <span className="font-mono" style={{ fontSize:10, color: up?'var(--green)':'var(--red)', fontWeight:600 }}>
        {up?'▲':'▼'}{Math.abs(item.change_pct).toFixed(2)}%
      </span>
    </div>
  )
}

export default function Navbar({ onLogout }) {
  const { pair, setPair, setS, toShareURL } = usePortfolioStore()
  const [rates, setRates]   = useState([])
  const [time, setTime]     = useState(new Date())
  const [loading, setLoading] = useState(false)

  const loadRates = async () => {
    setLoading(true)
    try {
      const data = await fetchForexRates()
      setRates(data)
      // Auto-update spot for current pair
      const current = data.find(d => d.pair === pair)
      if (current?.spot) setS(current.spot)
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => { loadRates() }, [])
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  // Auto-refresh every 5 minutes
  useEffect(() => {
    const id = setInterval(loadRates, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [pair])

  const doubled = [...rates, ...rates] // seamless loop

  const [toast, setToast] = useState(null)
  const handleShare = () => {
    navigator.clipboard.writeText(toShareURL()).then(() => {
      setToast('Portfolio URL copied!')
      setTimeout(() => setToast(null), 3000)
    })
  }

  return (
    <nav style={{ background:'rgba(2,8,23,0.95)', borderBottom:'1px solid var(--border)',
      backdropFilter:'blur(20px)', position:'sticky', top:0, zIndex:100 }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position:'fixed', bottom:24, right:24, zIndex:999,
          background:'rgba(0,255,136,0.12)', border:'1px solid rgba(0,255,136,0.35)',
          borderRadius:8, padding:'10px 16px',
          fontSize:12, color:'#00ff88', fontWeight:600,
          backdropFilter:'blur(12px)',
          boxShadow:'0 4px 20px rgba(0,0,0,0.5)',
          display:'flex', alignItems:'center', gap:8,
          animation:'lp-reveal 0.25s ease',
        }}>
          <span style={{fontSize:14}}>✓</span> {toast}
        </div>
      )}
      {/* Top bar */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'0 20px', height:48 }}>
        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <NexusIcon size={38} />
          <div>
            <div style={{
              fontFamily:'var(--font-mono)', fontSize:15, fontWeight:800,
              letterSpacing:'0.2em', color:'var(--cyan)', lineHeight:1,
              textShadow:'0 0 16px rgba(0,200,240,0.55)',
              animation:'nx-flicker 9s ease-in-out infinite',
            }}>
              NEXUS
            </div>
            <div style={{
              fontFamily:'var(--font-mono)', fontSize:7.5, fontWeight:500,
              letterSpacing:'0.22em', color:'var(--text-muted)', lineHeight:1.5,
              textTransform:'uppercase',
            }}>
              TERMINAL · FX OPTIONS
            </div>
          </div>
          <div style={{ width:1, height:24, background:'var(--border)', margin:'0 8px' }}/>
          {/* Pair selector in nav */}
          <select
            className="input-field"
            style={{ width:100, fontSize:12, fontWeight:600, padding:'4px 8px' }}
            value={pair}
            onChange={e => {
              setPair(e.target.value)
              const r = rates.find(d => d.pair === e.target.value)
              if (r?.spot) setS(r.spot)
            }}>
            {Object.keys(PAIR_META).map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {/* Right controls */}
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <div className="live-dot"/>
            <span className="font-mono" style={{ fontSize:10, color:'var(--text-muted)' }}>LIVE</span>
          </div>
          <button className="btn-ghost" onClick={loadRates} disabled={loading}
            style={{ fontSize:10 }}>{loading ? '⟳' : '↻'} Refresh</button>
          <button className="btn-ghost" onClick={handleShare} style={{ fontSize:10 }}>
            🔗 Share
          </button>
          <div style={{ width:1, height:20, background:'var(--border)' }}/>
          <div className="font-mono" style={{ fontSize:11, color:'var(--text-muted)', minWidth:56 }}>
            {time.toLocaleTimeString('en-GB', { hour12:false })}
          </div>
          <div style={{ fontSize:9, color:'var(--text-muted)' }}>UTC</div>
          <div style={{ width:1, height:20, background:'var(--border)' }}/>
          <button className="btn-ghost" onClick={onLogout}
            style={{ fontSize:10, color:'var(--red)', borderColor:'rgba(239,68,68,0.3)' }}>
            ⏻ Logout
          </button>
        </div>
      </div>

      {/* Rate ticker tape */}
      {rates.length > 0 && (
        <div className="ticker-wrap" style={{ height:26 }}>
          <div className="ticker-inner">
            {doubled.map((item, i) => <TickerItem key={i} item={item} />)}
          </div>
        </div>
      )}

      {/* Economic events strip */}
      <NewsBanner />
    </nav>
  )
}
