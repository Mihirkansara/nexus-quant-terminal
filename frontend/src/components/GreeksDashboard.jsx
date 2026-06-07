import { useState, useEffect } from 'react'
import { usePortfolioStore } from '../store/portfolio'
import { computeGreeks, exportCSV } from '../api/client'

const GREEK_INFO = {
  delta: { label:'Δ DELTA',  sym:'Δ', color:'var(--cyan)',   desc:'Spot price sensitivity',    tip:'Change in option value per unit change in spot. Delta 0.8 = option moves 80¢ per $1 of spot.', cls:'cyan'   },
  gamma: { label:'Γ GAMMA',  sym:'Γ', color:'var(--purple)', desc:'Delta convexity',            tip:'Rate of change of Delta w.r.t. spot. High Gamma = Delta shifts rapidly near the strike price.', cls:'purple' },
  vega:  { label:'ν VEGA',   sym:'ν', color:'var(--green)',  desc:'Volatility sensitivity /1%', tip:'P&L impact per 1% move in implied vol. Long options = positive Vega (vol rising helps you).',   cls:'green'  },
  theta: { label:'Θ THETA',  sym:'Θ', color:'var(--red)',    desc:'Time decay per year',        tip:'Daily P&L erosion due to time passing. Long options pay theta — short options earn it.',        cls:'red'    },
  rho_d: { label:'ρ RHO_D',  sym:'ρ', color:'var(--amber)',  desc:'Domestic rate sensitivity',  tip:'Sensitivity to the domestic (quote currency) interest rate. Usually small on short expirations.', cls:'gold'  },
  phi:   { label:'φ PHI',    sym:'φ', color:'#fb923c',       desc:'Foreign rate sensitivity',   tip:'Sensitivity to the foreign (base currency) rate. This greek is unique to FX options.',           cls:'orange' },
}

export default function GreeksDashboard() {
  const { legs, S, sigma, T, r_d, r_f, pair } = usePortfolioStore()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  const payload = {
    options: legs.map(({ type, K, T, qty }) => ({ type, K, T, qty })),
    S, sigma, T, r_d, r_f,
  }

  useEffect(() => {
    if (!legs.length) return
    setLoading(true); setError(null)
    computeGreeks(payload)
      .then(setData)
      .catch(e => setError(e?.response?.data?.detail || 'Greeks computation failed'))
      .finally(() => setLoading(false))
  }, [S, sigma, T, r_d, r_f, JSON.stringify(legs)])

  const handleExport = async () => {
    const blob = await exportCSV(payload)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `greeks_${pair}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return (
    <div style={{ padding:20 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
        <div className="live-dot"/>
        <span style={{ color:'var(--text-muted)', fontSize:12 }}>Computing Garman-Kohlhagen Greeks…</span>
      </div>
      {[...Array(3)].map((_,i) => (
        <div key={i} className="skeleton" style={{ height:60, marginBottom:8, borderRadius:8 }}/>
      ))}
    </div>
  )

  if (error) return (
    <div style={{ padding:20 }}>
      <div style={{ padding:12, borderRadius:6, background:'rgba(255,61,90,0.1)',
        border:'1px solid var(--red)', color:'var(--red)', fontSize:12 }}>{error}</div>
    </div>
  )

  if (!data) return null

  return (
    <div style={{ padding:16 }}>
      {/* Terminal header */}
      <div className="term-header" style={{ margin:'-16px -16px 14px', padding:'8px 16px' }}>
        <span className="term-header-cyan">PORTFOLIO GREEKS</span>
        <span style={{ marginLeft:4, opacity:0.5 }}>·</span>
        <span className="term-header-title">{pair}</span>
        <span style={{ marginLeft:4, opacity:0.5 }}>·</span>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:9.5, color:'var(--text-muted)', letterSpacing:'0.04em' }}>
          S={S} · σ={sigma} · r_d={r_d} · r_f={r_f}
        </span>
        <div style={{ flex:1 }}/>
        <button className="btn-ghost" onClick={handleExport} style={{ fontSize:10, padding:'3px 9px' }}>
          ↓ CSV
        </button>
      </div>

      {/* Greek cards — left-border Bloomberg style, 3+3 grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6, marginBottom:14 }}>
        {Object.entries(GREEK_INFO).map(([key, info]) => {
          const val = data.total[key]
          const formatted = val !== undefined ? (val >= 0 ? '+' : '') + val.toFixed(4) : '—'
          return (
            <div key={key} className={`greek-card ${info.cls}`} title={info.tip}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:6 }}>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-muted)',
                  textTransform:'uppercase', letterSpacing:'0.08em' }}>{info.desc}</span>
                <span style={{ fontFamily:'var(--font-mono)', fontSize:17, fontWeight:800,
                  color:info.color, lineHeight:1, fontVariantNumeric:'tabular-nums' }}>
                  {info.sym}
                </span>
              </div>
              <div className="greek-value" style={{ color:info.color, marginBottom:4 }}>{formatted}</div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:9.5, fontWeight:700,
                color:info.color, opacity:0.7, letterSpacing:'0.1em' }}>{info.label}</div>
            </div>
          )
        })}
      </div>

      {/* Quick stats */}
      <div style={{ display:'flex', gap:12, marginBottom:14, flexWrap:'wrap' }}>
        <div className="glass" style={{ padding:'8px 14px', borderRadius:6, fontSize:11 }}>
          <span style={{ color:'var(--text-muted)' }}>Daily Theta: </span>
          <span className="font-mono" style={{ color:'var(--red)' }}>
            {data.total.theta !== undefined ? (data.total.theta / 365).toFixed(5) : '—'} /day
          </span>
        </div>
        <div className="glass" style={{ padding:'8px 14px', borderRadius:6, fontSize:11 }}>
          <span style={{ color:'var(--text-muted)' }}>Vega per 1% vol: </span>
          <span className="font-mono" style={{ color:'var(--green)' }}>
            {data.total.vega !== undefined ? (data.total.vega / 100).toFixed(5) : '—'}
          </span>
        </div>
        <div className="glass" style={{ padding:'8px 14px', borderRadius:6, fontSize:11 }}>
          <span style={{ color:'var(--text-muted)' }}>Net Delta: </span>
          <span className="font-mono" style={{ color: data.total.delta >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {data.total.delta !== undefined ? (data.total.delta >= 0 ? '+' : '') + data.total.delta.toFixed(4) : '—'}
          </span>
        </div>
      </div>

      {/* Per-leg breakdown */}
      <div className="section-header" style={{ marginBottom:6 }}>
        <span className="section-title">Per-Leg Breakdown</span>
      </div>
      <div style={{ overflowX:'auto', borderRadius:8, border:'1px solid var(--border)' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
          <thead>
            <tr style={{ background:'var(--bg3)', color:'var(--text-muted)' }}>
              {['Leg','Type','Strike','Delta','Gamma','Vega','Theta','Rho_d','Phi'].map(h => (
                <th key={h} style={{ textAlign: h==='Leg'||h==='Type'?'left':'right',
                  padding:'6px 10px', fontWeight:600, fontSize:9, letterSpacing:'0.05em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.legs.map((leg, i) => (
              <tr key={i} style={{ borderTop:'1px solid var(--border)',
                background: i%2===0?'transparent':'rgba(0,212,255,0.015)' }}>
                <td style={{ padding:'5px 10px', color:'var(--cyan)', fontSize:10 }}>{leg.label}</td>
                <td style={{ padding:'5px 10px', color:'var(--text-dim)', fontSize:9 }}>{leg.type?.toUpperCase()}</td>
                <td className="font-mono" style={{ padding:'5px 10px', textAlign:'right', color:'var(--text-dim)' }}>
                  {leg.K?.toFixed(5)}
                </td>
                <td className="font-mono" style={{ padding:'5px 10px', textAlign:'right',
                  color: leg.delta >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {leg.delta !== undefined ? (leg.delta >= 0 ? '+' : '') + leg.delta : '—'}
                </td>
                <td className="font-mono" style={{ padding:'5px 10px', textAlign:'right', color:'#a78bfa' }}>{leg.gamma}</td>
                <td className="font-mono" style={{ padding:'5px 10px', textAlign:'right', color:'var(--green)' }}>{leg.vega}</td>
                <td className="font-mono" style={{ padding:'5px 10px', textAlign:'right', color:'var(--red)' }}>{leg.theta}</td>
                <td className="font-mono" style={{ padding:'5px 10px', textAlign:'right', color:'var(--gold)' }}>{leg.rho_d ?? '—'}</td>
                <td className="font-mono" style={{ padding:'5px 10px', textAlign:'right', color:'#fb923c' }}>{leg.phi ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
