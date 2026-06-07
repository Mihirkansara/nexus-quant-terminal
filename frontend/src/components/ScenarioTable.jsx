import { useState, useEffect } from 'react'
import { usePortfolioStore } from '../store/portfolio'
import { computeScenarios } from '../api/client'

export default function ScenarioTable() {
  const { legs, S, sigma, T, r_d, r_f, pair } = usePortfolioStore()
  const [result, setResult]   = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!legs.length) return
    setLoading(true)
    computeScenarios({
      options: legs.map(({ type, K, T, qty }) => ({ type, K, T, qty })),
      S0: S, sigma0: sigma, T, r_d, r_f,
    })
      .then(setResult)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [S, sigma, T, r_d, r_f, JSON.stringify(legs)])

  if (loading) return (
    <div style={{ padding:20 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
        <div className="live-dot"/>
        <span style={{ color:'var(--text-muted)', fontSize:12 }}>Computing scenario shocks…</span>
      </div>
      {[...Array(5)].map((_,i) => (
        <div key={i} className="skeleton" style={{ height:36, marginBottom:4, borderRadius:4 }}/>
      ))}
    </div>
  )
  if (!result) return null

  const maxAbs = Math.max(...result.scenarios.map(s => Math.abs(s.pnl)), 1)

  return (
    <div style={{ padding:16 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <div>
          <div className="section-title">Scenario Shock Analysis</div>
          <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:2 }}>
            Garman-Kohlhagen repricing · {pair} · r_d={r_d} r_f={r_f}
          </div>
        </div>
        <div className="glass" style={{ padding:'6px 12px', borderRadius:6, fontSize:11 }}>
          <span style={{ color:'var(--text-muted)' }}>Base value: </span>
          <span className="font-mono neon-cyan">{result.base_value.toFixed(5)}</span>
        </div>
      </div>

      <div style={{ overflowX:'auto', borderRadius:8, border:'1px solid var(--border)' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
          <thead>
            <tr style={{ background:'var(--bg3)' }}>
              {['Scenario','ΔSpot','ΔVol','New Spot','New Vol','P&L','P&L %','Bar'].map(h => (
                <th key={h} style={{ padding:'8px 10px', fontWeight:600, fontSize:9,
                  color:'var(--text-muted)', letterSpacing:'0.05em',
                  textAlign: h==='Scenario'?'left':'right', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.scenarios.map((s, i) => {
              const isBase = s.label === 'Base Case'
              const isProfit = s.pnl >= 0
              return (
                <tr key={i} style={{
                  borderTop:'1px solid var(--border)',
                  background: isBase
                    ? 'rgba(0,212,255,0.06)'
                    : i%2===0?'transparent':'rgba(255,255,255,0.01)',
                }}>
                  <td style={{ padding:'7px 10px',
                    color: isBase ? 'var(--cyan)' : 'var(--text-dim)', fontWeight: isBase?600:400 }}>
                    {isBase && <span style={{ marginRight:4 }}>●</span>}{s.label}
                  </td>
                  <td className="font-mono" style={{ padding:'7px 10px', textAlign:'right',
                    color: s.dS_pct<0?'var(--red)':s.dS_pct>0?'var(--green)':'var(--text-muted)' }}>
                    {s.dS_pct>=0?'+':''}{(s.dS_pct*100).toFixed(0)}%
                  </td>
                  <td className="font-mono" style={{ padding:'7px 10px', textAlign:'right',
                    color: s.dVol>0?'var(--red)':s.dVol<0?'var(--green)':'var(--text-muted)' }}>
                    {s.dVol>=0?'+':''}{(s.dVol*100).toFixed(0)}pp
                  </td>
                  <td className="font-mono" style={{ padding:'7px 10px', textAlign:'right', color:'var(--text-dim)' }}>
                    {s.S_shocked}
                  </td>
                  <td className="font-mono" style={{ padding:'7px 10px', textAlign:'right', color:'var(--text-dim)' }}>
                    {(s.vol_shocked*100).toFixed(0)}%
                  </td>
                  <td className="font-mono" style={{ padding:'7px 10px', textAlign:'right', fontWeight:700,
                    color: isProfit?'var(--green)':'var(--red)' }}>
                    {isProfit?'+':''}{s.pnl.toFixed(4)}
                  </td>
                  <td className="font-mono" style={{ padding:'7px 10px', textAlign:'right',
                    color: isProfit?'var(--green)':'var(--red)' }}>
                    {isProfit?'+':''}{s.pnl_pct.toFixed(1)}%
                  </td>
                  <td style={{ padding:'7px 10px', width:80 }}>
                    <div style={{ height:6, borderRadius:3, background:'var(--bg2)', overflow:'hidden' }}>
                      <div style={{
                        height:'100%', borderRadius:3,
                        width:`${(Math.abs(s.pnl)/maxAbs)*100}%`,
                        background: isProfit
                          ? 'linear-gradient(90deg,var(--green),var(--cyan))'
                          : 'linear-gradient(90deg,var(--red),#ff0040)',
                        transition:'width 0.4s ease',
                      }}/>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
