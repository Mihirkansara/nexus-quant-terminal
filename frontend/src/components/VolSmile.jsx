import { useEffect, useState } from 'react'
import _Plot from 'react-plotly.js'
const Plot = _Plot?.default ?? _Plot
import { usePortfolioStore } from '../store/portfolio'
import { computeSmile } from '../api/client'

// Quotes are entered in vol points (%) like on a dealer screen.
const QUOTE_FIELDS = [
  { key:'atm',  label:'ATM σ',   hint:'Delta-neutral straddle' },
  { key:'rr25', label:'25Δ RR',  hint:'σ(25Δ call) − σ(25Δ put)' },
  { key:'bf25', label:'25Δ BF',  hint:'Wing premium over ATM' },
]

export default function VolSmile() {
  const { legs, S, sigma, T, r_d, r_f, pair, smileQuotes } = usePortfolioStore()
  const [quotes, setQuotes]   = useState(() => smileQuotes ?? { atm: +(sigma * 100).toFixed(2), rr25: -0.40, bf25: 0.20 })
  // Each response is tagged with the request it answers, so "loading" is derived
  // (latest request != last answered one) instead of set inside the effect.
  const [response, setResponse] = useState({ key:null, data:null, error:null })

  const { atm, rr25, bf25 } = quotes
  const valid = [atm, rr25, bf25].every(Number.isFinite) && atm > 0
  const requestKey = valid ? JSON.stringify({
    S, T, r_d, r_f, sigma,
    atm: atm / 100, rr25: rr25 / 100, bf25: bf25 / 100,
    options: legs.map(({ type, K, T, qty }) => ({ type, K, T, qty })),
  }) : null

  useEffect(() => {
    if (!requestKey) return
    let stale = false
    computeSmile(JSON.parse(requestKey))
      .then(data => { if (!stale) setResponse({ key:requestKey, data, error:null }) })
      .catch(e => { if (!stale) setResponse(r => ({ ...r, key:requestKey,
        error: e?.response?.data?.detail ?? 'Could not build smile' })) })
    return () => { stale = true }
  }, [requestKey])

  const result  = response.data
  const error   = response.key === requestKey ? response.error : null
  const loading = requestKey !== null && response.key !== requestKey

  const setQuote = (key, v) => setQuotes(q => ({ ...q, [key]: parseFloat(v) }))
  const pct = v => (v * 100).toFixed(3) + '%'

  const traces = result ? [
    {
      type:'scatter', mode:'lines', name:'Vanna-Volga smile',
      x: result.strikes, y: result.vols.map(v => v * 100),
      line:{ color:'#00d4ff', width:2.5 },
      hovertemplate:'K %{x:.5f}<br>σ %{y:.3f}%<extra></extra>',
    },
    {
      type:'scatter', mode:'lines', name:`Flat σ ${(sigma * 100).toFixed(2)}%`,
      x:[result.strikes[0], result.strikes.at(-1)], y:[sigma * 100, sigma * 100],
      line:{ color:'rgba(255,255,255,0.25)', width:1, dash:'dash' }, hoverinfo:'skip',
    },
    {
      type:'scatter', mode:'markers+text', name:'Market pillars',
      x: result.pillars.map(p => p.K), y: result.pillars.map(p => p.vol * 100),
      text: result.pillars.map(p => p.label), textposition:'top center',
      textfont:{ color:'#ffd700', size:9 },
      marker:{ color:'#ffd700', size:9, symbol:'diamond', line:{ color:'#0a0e1a', width:2 } },
      hovertemplate:'%{text}<br>K %{x:.5f}<br>σ %{y:.3f}%<extra></extra>',
    },
    ...(result.legs.length ? [{
      type:'scatter', mode:'markers', name:'Portfolio strikes',
      x: result.legs.map(l => l.K), y: result.legs.map(l => l.smile_vol * 100),
      marker:{ color:'#00ff88', size:8, symbol:'circle', line:{ color:'#0a0e1a', width:2 } },
      text: result.legs.map(l => l.label),
      hovertemplate:'%{text}<br>σ %{y:.3f}%<extra></extra>',
    }] : []),
  ] : []

  return (
    <div style={{ padding:16 }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12, gap:12, flexWrap:'wrap' }}>
        <div>
          <div className="section-title">FX Volatility Smile — Vanna-Volga ({pair})</div>
          <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:2 }}>
            Built from ATM / 25Δ RR / 25Δ BF quotes · spot delta, DNS ATM · T={T}y
            {result && <> · Fwd {result.forward}</>}
          </div>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {QUOTE_FIELDS.map(({ key, label, hint }) => (
            <label key={key} title={hint} className="glass"
              style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 10px', borderRadius:6, fontSize:10 }}>
              <span style={{ color:'var(--text-muted)' }}>{label}</span>
              <input type="number" step="0.05" value={Number.isFinite(quotes[key]) ? quotes[key] : ''}
                onChange={e => setQuote(key, e.target.value)}
                className="font-mono"
                style={{ width:60, background:'transparent', border:'none', outline:'none',
                  color:'var(--cyan)', fontSize:11, fontWeight:600 }}/>
              <span style={{ color:'var(--text-muted)' }}>%</span>
            </label>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ padding:10, borderRadius:6, marginBottom:10, background:'rgba(255,61,90,0.1)',
          border:'1px solid #ff3d5a', color:'#ff3d5a', fontSize:11 }}>{error}</div>
      )}

      {!result && loading && <div className="skeleton" style={{ height:320, borderRadius:8 }}/>}

      {result && (
        <>
          <div className="glass" style={{ borderRadius:8, padding:8, marginBottom:12, opacity: loading ? 0.6 : 1 }}>
            <Plot data={traces}
              layout={{
                paper_bgcolor:'transparent', plot_bgcolor:'#080d18',
                font:{ color:'#94a3b8', size:11 },
                margin:{ l:52, r:16, t:16, b:50 },
                xaxis:{ title:`Strike (${pair})`, gridcolor:'#1e293b', color:'#475569', zeroline:false },
                yaxis:{ title:'Implied vol (%)', gridcolor:'#1e293b', color:'#475569', zeroline:false },
                legend:{ bgcolor:'transparent', font:{ size:9 }, orientation:'h', x:0, y:-0.18 },
                shapes:[{ type:'line', x0:S, x1:S, yref:'paper', y0:0, y1:1,
                  line:{ color:'rgba(255,215,0,0.35)', width:1, dash:'dot' } }],
                hoverlabel:{ bgcolor:'#0f172a', font:{ color:'#e2e8f0' }, bordercolor:'rgba(0,212,255,0.15)' },
              }}
              config={{ responsive:true, displayModeBar:false }}
              style={{ width:'100%', height:320 }} />
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:12 }}>
            <SmileTable title="Market Pillars"
              headers={['Pillar', 'Strike', 'Vol']}
              rows={result.pillars.map(p => [p.label, p.K.toFixed(5), pct(p.vol)])} />
            {result.legs.length > 0 && (
              <SmileTable title="Portfolio: Smile vs Flat Vol"
                headers={['Leg', 'Smile σ', 'Flat value', 'Smile value', 'Smile adj.']}
                rows={[
                  ...result.legs.map(l => [l.label, pct(l.smile_vol),
                    l.value_flat.toFixed(5), l.value_smile.toFixed(5), signed(l.smile_adj)]),
                  ['Total', '', result.total.value_flat.toFixed(5),
                    result.total.value_smile.toFixed(5), signed(result.total.smile_adj)],
                ]} />
            )}
          </div>
          <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:10 }}>
            Castagna &amp; Mercurio (2007) second-order approximation. Pillar vols use σ25 = ATM + BF ± RR/2
            (smile-strangle convention). All legs are priced off the smile for tenor T.
          </div>
        </>
      )}
    </div>
  )
}

const signed = v => (
  <span style={{ color: v >= 0 ? 'var(--green)' : 'var(--red)' }}>{(v >= 0 ? '+' : '') + v.toFixed(5)}</span>
)

function SmileTable({ title, headers, rows }) {
  return (
    <div>
      <div className="section-title" style={{ fontSize:10, marginBottom:6 }}>{title}</div>
      <div style={{ overflowX:'auto', borderRadius:8, border:'1px solid var(--border)' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
          <thead>
            <tr style={{ background:'var(--bg3)' }}>
              {headers.map((h, i) => (
                <th key={h} style={{ padding:'7px 10px', fontWeight:600, fontSize:9, color:'var(--text-muted)',
                  letterSpacing:'0.05em', textAlign: i === 0 ? 'left' : 'right', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} style={{ borderTop:'1px solid var(--border)' }}>
                {row.map((cell, i) => (
                  <td key={i} className={i ? 'font-mono' : undefined}
                    style={{ padding:'6px 10px', textAlign: i === 0 ? 'left' : 'right', whiteSpace:'nowrap' }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
