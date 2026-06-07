import { useState } from 'react'
import _Plot from 'react-plotly.js'
const Plot = _Plot?.default ?? _Plot
import { usePortfolioStore } from '../store/portfolio'
import { computeMonteCarlo } from '../api/client'

export default function MonteCarloChart() {
  const { legs, S, sigma, r_d, r_f, T, pair } = usePortfolioStore()
  const [result, setResult]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [nPaths, setNPaths]   = useState(1000)
  const [view, setView]       = useState('paths')

  const run = async () => {
    if (!legs.length) return
    setLoading(true)
    try {
      const data = await computeMonteCarlo({
        options: legs.map(({ type, K, T, qty }) => ({ type, K, T, qty })),
        S0: S, sigma, r_d, r_f, T, n_paths: nPaths, n_steps: 100,
      })
      setResult(data)
    } catch (e) {
      alert('Simulation failed: ' + (e?.response?.data?.detail || e.message))
    } finally { setLoading(false) }
  }

  const cyanBase = [0,212,255]
  const pathPlotData = result ? result.sample_paths.slice(0, 60).map((path, i) => ({
    type:'scatter', mode:'lines',
    x: result.time_axis, y: path,
    line:{ width:0.7, color:`rgba(${cyanBase.join(',')},${0.06 + (i%10)*0.02})` },
    showlegend:false, hoverinfo:'skip',
  })) : []

  const histData = result ? [{
    type:'histogram', x: result.pnl, nbinsx:60,
    marker:{ color:'rgba(0,212,255,0.5)', line:{ color:'var(--cyan)', width:0.5 } },
    name:'P&L Distribution',
  }] : []

  const bgLayout = {
    paper_bgcolor:'transparent', plot_bgcolor:'#080d18',
    font:{ color:'#94a3b8', size:11 },
    margin:{ l:52, r:16, t:32, b:50 },
    xaxis:{ gridcolor:'#1e293b', color:'#475569', zeroline:false },
    yaxis:{ gridcolor:'#1e293b', color:'#475569' },
    showlegend:false,
  }

  return (
    <div style={{ padding:16 }}>
      {/* Controls */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
        <div className="section-title">Monte Carlo — GBM (Forex)</div>
        <div style={{ flex:1 }}/>
        <span style={{ fontSize:10, color:'var(--text-muted)' }}>Paths:</span>
        <select className="input-field" style={{ width:80, fontSize:11, padding:'4px 8px' }}
          value={nPaths} onChange={e => setNPaths(+e.target.value)}>
          {[500, 1000, 2000, 5000].map(n => <option key={n} value={n}>{n.toLocaleString()}</option>)}
        </select>
        <button className="btn-primary" onClick={run} disabled={loading}
          style={{ padding:'6px 18px', fontSize:12 }}>
          {loading ? '⟳ Simulating…' : '▶ Run'}
        </button>
      </div>

      {/* Model info */}
      <div style={{ display:'flex', gap:8, marginBottom:10, flexWrap:'wrap' }}>
        {[
          { label:'Model',  value:'GBM — Geometric Brownian Motion' },
          { label:'Drift',  value:`r_d − r_f = ${((r_d-r_f)*100).toFixed(2)}%` },
          { label:'Pair',   value:pair },
          { label:'σ',      value:`${(sigma*100).toFixed(1)}%` },
        ].map(({ label, value }) => (
          <div key={label} className="glass" style={{ padding:'4px 10px', borderRadius:6, fontSize:9 }}>
            <span style={{ color:'var(--text-muted)' }}>{label}: </span>
            <span className="font-mono" style={{ color:'var(--cyan)' }}>{value}</span>
          </div>
        ))}
      </div>

      {loading && (
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:16 }}>
          <div className="live-dot"/>
          <span style={{ fontSize:12, color:'var(--text-muted)' }}>
            Running {nPaths.toLocaleString()} paths…
          </span>
        </div>
      )}

      {result && (
        <>
          {/* Stats strip */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:8, marginBottom:12 }}>
            {[
              { label:'Mean P&L',    value: result.pnl_mean,         pos: result.pnl_mean >= 0 },
              { label:'Std Dev',     value: result.pnl_std,          pos: true },
              { label:'5th Pct',     value: result.pnl_5pct,         pos: result.pnl_5pct >= 0 },
              { label:'95th Pct',    value: result.pnl_95pct,        pos: result.pnl_95pct >= 0 },
              { label:'P(Profit)',   value: `${(result.prob_profit*100).toFixed(1)}%`, pos: result.prob_profit>=0.5 },
            ].map(({ label, value, pos }) => (
              <div key={label} className="glass" style={{ borderRadius:8, padding:'8px 10px', textAlign:'center' }}>
                <div style={{ fontSize:9, color:'var(--text-muted)', marginBottom:3 }}>{label}</div>
                <div className="font-mono" style={{ fontSize:14, fontWeight:700,
                  color: pos ? 'var(--green)' : 'var(--red)' }}>
                  {typeof value === 'string' ? value : (value>=0?'+':'')+value.toFixed(4)}
                </div>
              </div>
            ))}
          </div>

          {/* View toggle */}
          <div style={{ display:'flex', gap:6, marginBottom:10 }}>
            {[['paths','📈 Price Paths'],['histogram','📊 P&L Distribution']].map(([v,lbl]) => (
              <button key={v} className="btn-tab" onClick={() => setView(v)}
                style={{ background: view===v?'var(--cyan)':'var(--bg3)',
                  color: view===v?'var(--bg)':'var(--text-muted)' }}>{lbl}</button>
            ))}
          </div>

          <div className="glass" style={{ borderRadius:8, padding:8 }}>
            {view === 'paths' ? (
              <Plot data={pathPlotData}
                layout={{ ...bgLayout,
                  title:{ text:'Simulated FX Rate Paths (GBM)', font:{ color:'var(--cyan)', size:12 } },
                  xaxis:{ ...bgLayout.xaxis, title:'Time (years)' },
                  yaxis:{ ...bgLayout.yaxis, title:`${pair} Rate` } }}
                config={{ responsive:true, displayModeBar:false }}
                style={{ width:'100%', height:380 }} />
            ) : (
              <Plot data={histData}
                layout={{ ...bgLayout,
                  title:{ text:'P&L Distribution at Expiry', font:{ color:'var(--cyan)', size:12 } },
                  xaxis:{ ...bgLayout.xaxis, title:'P&L' },
                  yaxis:{ ...bgLayout.yaxis, title:'Frequency' } }}
                config={{ responsive:true, displayModeBar:false }}
                style={{ width:'100%', height:380 }} />
            )}
          </div>
        </>
      )}

      {!result && !loading && (
        <div className="glass" style={{ display:'flex', alignItems:'center', justifyContent:'center',
          height:200, borderRadius:8, color:'var(--text-muted)', fontSize:13 }}>
          Click Run to simulate GBM price paths for {pair}
        </div>
      )}
    </div>
  )
}
