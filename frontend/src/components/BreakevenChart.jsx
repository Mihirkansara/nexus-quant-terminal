import { useEffect, useState } from 'react'
import _Plot from 'react-plotly.js'
const Plot = _Plot?.default ?? _Plot
import { usePortfolioStore } from '../store/portfolio'
import { computeSurface } from '../api/client'

export default function BreakevenChart() {
  const { legs, S, sigma, T, r_d, r_f, pair } = usePortfolioStore()
  const [chartData, setChartData] = useState(null)
  const [loading, setLoading]     = useState(false)

  useEffect(() => {
    if (!legs.length) return
    setLoading(true)
    computeSurface({
      options: legs.map(({ type, K, T, qty }) => ({ type, K, T, qty })),
      S_low: S * 0.70, S_high: S * 1.30, S_steps: 80,
      vol_low: sigma, vol_high: sigma + 0.001, vol_steps: 2,
      T, r_d, r_f,
    })
      .then(d => {
        const spots = d.S_range
        const pnl   = d.pnl.map(row => row[0])
        setChartData({ spots, pnl })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [S, sigma, T, r_d, r_f, JSON.stringify(legs)])

  if (loading) return (
    <div style={{ padding:20 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
        <div className="live-dot"/>
        <span style={{ color:'var(--text-muted)', fontSize:12 }}>Computing breakeven profile…</span>
      </div>
      <div className="skeleton" style={{ height:300, borderRadius:8 }}/>
    </div>
  )
  if (!chartData) return null

  const { spots, pnl } = chartData
  const zeroLine = spots.map(() => 0)

  // Find breakeven crossings
  const breakevens = []
  for (let i = 0; i < pnl.length - 1; i++) {
    if (Math.sign(pnl[i]) !== Math.sign(pnl[i + 1])) {
      const be = spots[i] + (spots[i+1]-spots[i])*(-pnl[i]/(pnl[i+1]-pnl[i]))
      breakevens.push(parseFloat(be.toFixed(5)))
    }
  }

  // Find min/max pnl idx for annotation
  const maxPnlIdx = pnl.reduce((mi,v,i,a) => v>a[mi]?i:mi, 0)
  const minPnlIdx = pnl.reduce((mi,v,i,a) => v<a[mi]?i:mi, 0)

  const traces = [
    {
      type:'scatter', mode:'lines', name:'Book P&L',
      x: spots, y: pnl,
      line:{ color:'#ddb05a', width:2.5 },
      fill:'tozeroy',
      fillcolor:'rgba(221,176,90,0.07)',
    },
    {
      type:'scatter', mode:'lines', name:'Zero',
      x: spots, y: zeroLine,
      line:{ color:'rgba(255,255,255,0.15)', width:1, dash:'dash' },
      showlegend:false, hoverinfo:'skip',
    },
    // Current spot
    {
      type:'scatter', mode:'markers+text',
      x:[S], y:[pnl[Math.round((S-spots[0])/(spots[1]-spots[0]))] ?? 0],
      marker:{ color:'#e4dcc3', size:10.5, symbol:'circle', line:{ color:'#09130f', width:2 } },
      text:['Current'], textposition:'top center',
      textfont:{ color:'#e4dcc3', size:11 },
      name:'Current Spot',
    },
    // Breakeven markers
    ...breakevens.map((be, i) => ({
      type:'scatter', mode:'markers+text',
      x:[be], y:[0],
      marker:{ color:'#4fc690', size:10.5, symbol:'diamond', line:{ color:'#09130f', width:2 } },
      text:[`BE ${be}`], textposition:'top center',
      textfont:{ color:'#4fc690', size:10.5 },
      name:`Breakeven ${i+1}`,
    })),
    // Max profit / loss markers
    {
      type:'scatter', mode:'markers',
      x:[spots[maxPnlIdx]], y:[pnl[maxPnlIdx]],
      marker:{ color:'#4fc690', size:7, symbol:'triangle-up', opacity:0.8 },
      showlegend:false, hovertemplate:'Max Profit: %{y:.5f}<extra></extra>',
    },
    {
      type:'scatter', mode:'markers',
      x:[spots[minPnlIdx]], y:[pnl[minPnlIdx]],
      marker:{ color:'#ee6b5b', size:7, symbol:'triangle-down', opacity:0.8 },
      showlegend:false, hovertemplate:'Max Loss: %{y:.5f}<extra></extra>',
    },
  ]

  return (
    <div style={{ padding:16 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <div>
          <div className="section-title">P&L at Expiry vs Spot ({pair})</div>
          <div style={{ fontSize:10.5, color:'var(--text-muted)', marginTop:2 }}>
            Fixed vol σ={sigma} · r_d={r_d} · r_f={r_f}
          </div>
        </div>
        {breakevens.length > 0 && (
          <div style={{ display:'flex', gap:6 }}>
            {breakevens.map((be, i) => (
              <span key={i} className="font-mono" style={{ padding:'3px 10px', borderRadius:20,
                background:'rgba(79,198,144,0.1)', color:'var(--green)',
                border:'1px solid rgba(79,198,144,0.3)', fontSize:11, fontWeight:600 }}>
                BE: {be}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display:'flex', gap:8, marginBottom:10, flexWrap:'wrap' }}>
        {[
          { label:'Max Profit', value: Math.max(...pnl).toFixed(5), pos:true },
          { label:'Max Loss',   value: Math.min(...pnl).toFixed(5), pos:false },
          { label:'Breakevens', value: breakevens.length, pos: true },
          { label:'Spot',       value: S, pos:true },
        ].map(({ label, value, pos }) => (
          <div key={label} className="glass" style={{ padding:'5px 12px', borderRadius:6, fontSize:11 }}>
            <span style={{ color:'var(--text-muted)' }}>{label}: </span>
            <span className="font-mono" style={{ color: pos ? 'var(--green)' : 'var(--red)', fontWeight:600 }}>
              {value}
            </span>
          </div>
        ))}
      </div>

      <div className="glass" style={{ borderRadius:8, padding:8 }}>
        <Plot data={traces}
          layout={{
            paper_bgcolor:'transparent', plot_bgcolor:'#0a1511',
            font:{ family:"'Geist Variable', sans-serif", color:'#9eab9f', size:11 },
            margin:{ l:52, r:16, t:16, b:50 },
            xaxis:{ title:`${pair} Spot Rate`, gridcolor:'#1c2e26', color:'#7e8f84', zeroline:false },
            yaxis:{ title:'Portfolio P&L', gridcolor:'#1c2e26', color:'#7e8f84',
              zeroline:true, zerolinecolor:'rgba(255,255,255,0.15)' },
            legend:{ bgcolor:'transparent', font:{ size:10.5 }, orientation:'h',
              x:0, y:-0.15 },
            hovermode:'x unified',
            hoverlabel:{ bgcolor:'#0f1d18', font:{ color:'#ebe5d3' }, bordercolor:'rgba(169,154,255,0.15)' },
          }}
          config={{ responsive:true, displayModeBar:false }}
          style={{ width:'100%', height:320 }} />
      </div>
    </div>
  )
}
