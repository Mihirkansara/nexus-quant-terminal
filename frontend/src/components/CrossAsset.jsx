import { useEffect, useState } from 'react'
import _Plot from 'react-plotly.js'
const Plot = _Plot?.default ?? _Plot
import { fetchCrossAsset, priceMargrabe } from '../api/client'

const LAYOUT = {
  paper_bgcolor:'transparent', plot_bgcolor:'#080d18',
  font:{ color:'#94a3b8', size:11 },
  margin:{ l:52, r:16, t:12, b:40 },
  legend:{ bgcolor:'transparent', font:{ size:9 }, orientation:'h', x:0, y:-0.2 },
  hoverlabel:{ bgcolor:'#0f172a', font:{ color:'#e2e8f0' }, bordercolor:'rgba(0,212,255,0.15)' },
}
const axis = (title, extra = {}) => ({ title:{ text:title }, gridcolor:'#1e293b', color:'#475569', zeroline:false, ...extra })
const WINDOWS = [['30d', '30D'], ['90d', '90D'], ['250d', '1Y'], ['ewma', 'EWMA']]
const LABEL = { XAUUSD:'Gold', XAGUSD:'Silver', BTCUSD:'BTC', ETHUSD:'ETH', EURUSD:'EURUSD', DXY:'DXY', US10Y:'US 10Y', WTI:'WTI' }
const OPT_PAIRS = [['XAGUSD', 'XAUUSD'], ['XAUUSD', 'XAGUSD'], ['BTCUSD', 'XAUUSD'], ['ETHUSD', 'BTCUSD'], ['BTCUSD', 'ETHUSD']]
const fmt = (v, dp = 2) => (v == null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: dp, minimumFractionDigits: dp }))

export default function CrossAsset() {
  const [nonce, setNonce] = useState(0)
  const [response, setResponse] = useState({ key:null, data:null, error:null })
  const [win, setWin] = useState('90d')
  const [pairKey, setPairKey] = useState('BTCUSD/XAUUSD')
  const key = String(nonce)

  useEffect(() => {
    let stale = false
    fetchCrossAsset()
      .then(data => { if (!stale) setResponse({ key, data, error:null }) })
      .catch(e => { if (!stale) setResponse({ key, data:null, error: e?.response?.data?.detail ?? e?.message ?? 'Unavailable' }) })
    return () => { stale = true }
  }, [key])

  const loading = response.key !== key
  const d = response.data

  return (
    <div style={{ padding:16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, marginBottom:12, flexWrap:'wrap' }}>
        <div>
          <div className="section-title">Cross-Asset Desk — correlations, gold/silver ratio &amp; outperformance options</div>
          <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:2 }}>
            Gold · Silver · BTC · ETH · EURUSD · DXY · US 10Y · WTI on common trading days{d && <> · data to {d.correlations.last_date}</>}
          </div>
        </div>
        <button className="btn-ghost" onClick={() => setNonce(n => n + 1)} disabled={loading} style={{ fontSize:10 }}>
          {loading ? '⟳ Loading' : '↻ Refresh'}
        </button>
      </div>
      {response.error && response.key === key && (
        <div style={{ padding:8, borderRadius:6, marginBottom:8, fontSize:11, background:'rgba(255,61,90,0.1)',
          border:'1px solid #ff3d5a', color:'#ff3d5a' }}>{response.error}</div>
      )}
      {!d && loading && <div className="skeleton" style={{ height:360, borderRadius:8 }}/>}
      {d && (
        <div style={{ opacity: loading ? 0.6 : 1 }}>
          <GsrKpis g={d.gsr} />
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(420px, 1fr))', gap:12, marginBottom:12 }}>
            <GsrChart g={d.gsr} />
            <Heatmap c={d.correlations} win={win} setWin={setWin} />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(420px, 1fr))', gap:12, marginBottom:12 }}>
            <Breaks c={d.correlations} pairKey={pairKey} setPairKey={setPairKey} />
            <RollingCorr c={d.correlations} pairKey={pairKey} />
          </div>
          <Margrabe d={d} />
          <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:10, lineHeight:1.5 }}>
            Returns on common dates (yields as changes). EWMA λ = 0.94 (RiskMetrics). Breaks: z-score of today&apos;s 30D correlation
            vs its own history. GSR: OU half-life from AR(1) on log ratio; Engle-Granger ADF vs MacKinnon 5% −3.34; Kalman
            random-walk hedge ratio with unit-scaled innovation z. Margrabe (1978) exchange option; ratio vol
            √(σ₁²+σ₂²−2ρσ₁σ₂) — short correlation (Derman 1992).
          </div>
        </div>
      )}
    </div>
  )
}

function Card({ title, right, children }) {
  return (
    <div className="glass" style={{ borderRadius:8, padding:8 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', margin:'2px 6px 4px' }}>
        <span className="section-title" style={{ fontSize:10 }}>{title}</span>{right}
      </div>
      {children}
    </div>
  )
}

const Chip = ({ active, onClick, children }) => (
  <button onClick={onClick} className="font-mono" style={{ padding:'2px 7px', borderRadius:4, fontSize:9, cursor:'pointer',
    border:'1px solid ' + (active ? 'var(--cyan)' : 'var(--border)'), background: active ? 'rgba(0,212,255,0.1)' : 'transparent',
    color: active ? 'var(--cyan)' : 'var(--text-muted)' }}>{children}</button>
)

function GsrKpis({ g }) {
  const eg = g.engle_granger
  const items = [
    { label:'Gold / Silver ratio', value: fmt(g.current, 2), sub:`XAU ${fmt(g.xau, 0)} / XAG ${fmt(g.xag, 2)}` },
    { label:'z-score (1Y)', value: fmt(g.stats_1y.z, 2), color: Math.abs(g.stats_1y.z) > 2 ? 'var(--amber)' : undefined,
      sub:`1Y mean ${fmt(g.stats_1y.mean, 1)}` },
    { label:'Percentile (3Y)', value: `${g.stats_3y.percentile.toFixed(0)}th`, sub:`range ${fmt(g.stats_3y.min, 0)}–${fmt(g.stats_3y.max, 0)}` },
    { label:'OU half-life', value: `${g.ou.half_life_days.toFixed(0)}d`, sub:`equilibrium ${fmt(g.ou.mean_level, 1)}` },
    { label:'Engle-Granger', value: eg.cointegrated_5pct ? 'COINTEGRATED' : 'NOT AT 5%',
      color: eg.cointegrated_5pct ? 'var(--green)' : 'var(--amber)', sub:`ADF ${fmt(eg.adf_stat)} vs ${eg.critical['5%']}` },
    { label:'Kalman hedge β (log XAU on log XAG)', value: fmt(g.kalman.beta_now, 3), sub:`spread z ${fmt(g.kalman.z_now)}`,
      color: Math.abs(g.kalman.z_now) > 2 ? 'var(--amber)' : undefined },
    { label:'Ratio vol (3M)', value: `${(g.ratio_vol_3m * 100).toFixed(1)}%` },
  ]
  return (
    <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' }}>
      {items.map(k => (
        <div key={k.label} className="glass" style={{ padding:'6px 12px', borderRadius:6, fontSize:11 }}>
          <div style={{ color:'var(--text-muted)', fontSize:9, letterSpacing:'0.05em' }}>{k.label}</div>
          <div className="font-mono" style={{ color: k.color ?? 'var(--cyan)', fontWeight:700, fontSize:14 }}>{k.value}</div>
          {k.sub && <div className="font-mono" style={{ fontSize:9, color:'var(--text-muted)' }}>{k.sub}</div>}
        </div>
      ))}
    </div>
  )
}

function GsrChart({ g }) {
  const s = g.series, k = g.kalman
  const x = s.dates
  const zx = x.slice(k.valid_from), z = k.z.slice(k.valid_from)
  return (
    <Card title="Gold/Silver ratio · 1Y mean ±2σ · Kalman spread z">
      <Plot data={[
          { x, y:s.upper_1y, type:'scatter', mode:'lines', line:{ width:0 }, hoverinfo:'skip', showlegend:false },
          { x, y:s.lower_1y, type:'scatter', mode:'lines', line:{ width:0 }, fill:'tonexty', fillcolor:'rgba(0,212,255,0.08)', name:'±2σ (1Y)' },
          { x, y:s.mean_1y, type:'scatter', mode:'lines', name:'1Y mean', line:{ color:'rgba(0,212,255,0.6)', dash:'dash', width:1 } },
          { x, y:s.gsr, type:'scatter', mode:'lines', name:'GSR', line:{ color:'#ffd700', width:2 } },
          { x:zx, y:z, type:'scatter', mode:'lines', name:'Kalman z', yaxis:'y2', line:{ color:'#c084fc', width:1.2 } },
        ]}
        layout={{ ...LAYOUT, hovermode:'x unified', xaxis:axis(''),
          yaxis:axis('GSR', { domain:[0.38, 1] }), yaxis2:axis('z', { domain:[0, 0.3], range:[-4, 4] }),
          shapes:[-2, 2].map(v => ({ type:'line', xref:'paper', x0:0, x1:1, yref:'y2', y0:v, y1:v,
            line:{ color:'rgba(255,61,90,0.4)', dash:'dot', width:1 } })) }}
        config={{ responsive:true, displayModeBar:false }} style={{ width:'100%', height:330 }} />
    </Card>
  )
}

function Heatmap({ c, win, setWin }) {
  const m = c.matrices[win] ?? c.matrices['90d']
  const labels = c.assets.map(a => LABEL[a] ?? a)
  return (
    <Card title="Correlation matrix" right={
      <div style={{ display:'flex', gap:4 }}>{WINDOWS.filter(([k]) => c.matrices[k]).map(([k, l]) =>
        <Chip key={k} active={k === win} onClick={() => setWin(k)}>{l}</Chip>)}</div>}>
      <Plot data={[{ z:m, x:labels, y:labels, type:'heatmap', zmin:-1, zmax:1,
          colorscale:[[0, '#ff3d5a'], [0.5, '#0b1220'], [1, '#00d4ff']],
          text:m.map(r => r.map(v => v.toFixed(2))), texttemplate:'%{text}', textfont:{ size:9 },
          hovertemplate:'%{y} / %{x}: %{z:.2f}<extra></extra>', colorbar:{ thickness:8, tickfont:{ size:8 } } }]}
        layout={{ ...LAYOUT, margin:{ l:60, r:10, t:8, b:50 }, yaxis:{ autorange:'reversed', color:'#94a3b8' },
          xaxis:{ color:'#94a3b8' } }}
        config={{ responsive:true, displayModeBar:false }} style={{ width:'100%', height:330 }} />
    </Card>
  )
}

const pairLabel = p => p.split('/').map(a => LABEL[a] ?? a).join(' / ')

function Breaks({ c, pairKey, setPairKey }) {
  return (
    <Card title="Correlation-break monitor (30D vs its own history)">
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
          <thead><tr style={{ background:'var(--bg3)' }}>
            {['Pair', '30D', '90D', 'Hist. mean', 'z', 'Pctile', ''].map((h, i) => (
              <th key={i} style={{ padding:'6px 8px', fontSize:9, color:'var(--text-muted)', textAlign: i ? 'right' : 'left' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>{c.breaks.map(b => (
            <tr key={b.pair} onClick={() => setPairKey(b.pair)} style={{ cursor:'pointer', borderTop:'1px solid var(--border)',
              background: b.pair === pairKey ? 'rgba(0,212,255,0.06)' : undefined }}>
              <td style={{ padding:'5px 8px' }}>{pairLabel(b.pair)}</td>
              {[b.corr_now, b.corr_90d, b.mean].map((v, i) => (
                <td key={i} className="font-mono" style={{ padding:'5px 8px', textAlign:'right', color: v >= 0 ? 'var(--cyan)' : 'var(--red)' }}>{fmt(v)}</td>
              ))}
              <td className="font-mono" style={{ padding:'5px 8px', textAlign:'right' }}>{fmt(b.z)}</td>
              <td className="font-mono" style={{ padding:'5px 8px', textAlign:'right' }}>{b.percentile.toFixed(0)}</td>
              <td style={{ padding:'5px 8px', textAlign:'right', fontWeight:700, fontSize:9,
                color: b.flag === 'BREAK' ? 'var(--red)' : 'var(--amber)' }}>{b.flag}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </Card>
  )
}

function RollingCorr({ c, pairKey }) {
  const r = c.rolling[pairKey] ?? Object.values(c.rolling)[0]
  if (!r) return null
  return (
    <Card title={`Rolling correlation · ${pairLabel(pairKey)}`}>
      <Plot data={[
          { x:r.dates, y:r.corr_30d, type:'scatter', mode:'lines', name:'30D', line:{ color:'#00d4ff', width:1.5 } },
          { x:r.dates, y:r.corr_90d, type:'scatter', mode:'lines', name:'90D', line:{ color:'#ffd700', width:2 } },
        ]}
        layout={{ ...LAYOUT, hovermode:'x unified', xaxis:axis(''), yaxis:axis('ρ', { range:[-1, 1] }),
          shapes:[{ type:'line', xref:'paper', x0:0, x1:1, y0:0, y1:0, line:{ color:'rgba(255,255,255,0.2)', dash:'dot', width:1 } }] }}
        config={{ responsive:true, displayModeBar:false }} style={{ width:'100%', height:280 }} />
    </Card>
  )
}

function Margrabe({ d }) {
  const [pi, setPi] = useState(0)
  const [notional, setNotional] = useState(1000000)
  const [days, setDays] = useState(91)
  const [strike, setStrike] = useState(100)
  const [over, setOver] = useState({})
  const [res, setRes] = useState({ key:null, data:null, error:null })
  const available = OPT_PAIRS.map((pr, i) => [pr, i]).filter(([pr]) => pr.every(a => d.spot[a] != null))
  const [a1, a2] = (available.find(([, i]) => i === pi) ?? available[0] ?? [OPT_PAIRS[0]])[0]
  const c = d.correlations
  const i1 = c.assets.indexOf(a1), i2 = c.assets.indexOf(a2)
  const rhoDefault = i1 >= 0 && i2 >= 0 ? c.matrices['90d'][i1][i2] : 0.5
  const p = {
    sigma1: over.sigma1 ?? +(c.vol_3m[a1] * 100).toFixed(1), sigma2: over.sigma2 ?? +(c.vol_3m[a2] * 100).toFixed(1),
    rho: over.rho ?? +rhoDefault.toFixed(2),
    q1: over.q1 ?? +((d.lease_defaults[a1] ?? 0) * 100).toFixed(2), q2: over.q2 ?? +((d.lease_defaults[a2] ?? 0) * 100).toFixed(2),
  }
  const body = { S1:d.spot[a1], S2:d.spot[a2], notional, T:days / 365, strike_pct:strike,
    sigma1:p.sigma1 / 100, sigma2:p.sigma2 / 100, rho:p.rho, q1:p.q1 / 100, q2:p.q2 / 100 }
  const key = JSON.stringify(body)
  useEffect(() => {
    let stale = false
    priceMargrabe(JSON.parse(key))
      .then(data => { if (!stale) setRes({ key, data, error:null }) })
      .catch(e => { if (!stale) setRes({ key, data:null, error: e?.response?.data?.detail?.toString() ?? 'Pricing failed' }) })
    return () => { stale = true }
  }, [key])
  const r = res.data
  const set = (k, v) => setOver(o => ({ ...o, [k]: v }))
  const num = (label, value, onChange, step = 0.1) => (
    <label style={{ display:'flex', flexDirection:'column', gap:3, fontSize:9, color:'var(--text-muted)' }}>{label}
      <input type="number" value={value} step={step} onChange={e => onChange(+e.target.value)}
        style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:4, color:'var(--cyan)',
          fontSize:11, padding:'4px 6px', fontFamily:'var(--font-mono)', width:'100%' }} />
    </label>
  )
  return (
    <Card title={`Outperformance option (Margrabe): receive ${LABEL[a1]}, deliver ${LABEL[a2]}`}
      right={<div style={{ display:'flex', gap:4 }}>{available.map(([[x, y], i]) =>
        <Chip key={i} active={i === pi} onClick={() => { setPi(i); setOver({}) }}>{LABEL[x]} vs {LABEL[y]}</Chip>)}</div>}>
      <div style={{ display:'grid', gridTemplateColumns:'minmax(260px, 1fr) minmax(320px, 1.4fr)', gap:12, padding:'4px 6px' }}>
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:8 }}>
            {num('Notional (USD)', notional, setNotional, 100000)}
            {num('Tenor (days)', days, setDays, 1)}
            {num(`σ ${LABEL[a1]} (%)`, p.sigma1, v => set('sigma1', v), 0.5)}
            {num(`σ ${LABEL[a2]} (%)`, p.sigma2, v => set('sigma2', v), 0.5)}
            {num('Correlation ρ', p.rho, v => set('rho', v), 0.05)}
            {num('Strike (% of notional)', strike, setStrike, 1)}
            {num(`Yield/lease ${LABEL[a1]} (%)`, p.q1, v => set('q1', v), 0.1)}
            {num(`Yield/lease ${LABEL[a2]} (%)`, p.q2, v => set('q2', v), 0.1)}
          </div>
          <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:6 }}>
            Pays max(N·S₁(T)/S₁(0) − k·N·S₂(T)/S₂(0), 0). Vols default to 3M realised, ρ to 90D correlation.
          </div>
        </div>
        <div>
          {res.error && <div style={{ color:'var(--red)', fontSize:11 }}>{res.error}</div>}
          {r && (
            <>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:6 }}>
                {[['Premium', `${fmt(r.price, 0)} USD`], ['% of notional', `${fmt(r.price_pct, 2)}%`],
                  ['Ratio vol', `${(r.ratio_vol * 100).toFixed(1)}%`], ['P(exercise)', `${(r.prob_exercise * 100).toFixed(0)}%`],
                  [`Δ ${LABEL[a1]}`, `${fmt(r.delta_1, 2)} units`], [`Δ ${LABEL[a2]}`, `${fmt(r.delta_2, 4)} units`],
                  ['Vega / 1 vol pt (ratio)', fmt(r.vega_ratio / 100, 0)], ['∂V per +0.10 ρ', fmt(r.corr_sens * 0.1, 0)]].map(([l, v]) => (
                  <div key={l} className="glass" style={{ padding:'4px 10px', borderRadius:6 }}>
                    <div style={{ fontSize:9, color:'var(--text-muted)' }}>{l}</div>
                    <div className="font-mono" style={{ fontSize:12, color:'var(--cyan)', fontWeight:700 }}>{v}</div>
                  </div>
                ))}
              </div>
              <Plot data={[{ x:r.rho_grid, y:r.price_vs_rho.map(v => v / notional * 100), type:'scatter', mode:'lines',
                  line:{ color:'#00d4ff', width:2 }, name:'Premium' },
                { x:[p.rho], y:[r.price_pct], type:'scatter', mode:'markers', marker:{ color:'#ffd700', size:9 }, name:'Current ρ' }]}
                layout={{ ...LAYOUT, showlegend:false, margin:{ l:46, r:10, t:6, b:36 },
                  xaxis:axis('Correlation ρ'), yaxis:axis('Premium (% notional)') }}
                config={{ responsive:true, displayModeBar:false }} style={{ width:'100%', height:190 }} />
            </>
          )}
        </div>
      </div>
    </Card>
  )
}
