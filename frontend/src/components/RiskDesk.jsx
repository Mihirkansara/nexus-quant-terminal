import { useEffect, useState } from 'react'
import _Plot from 'react-plotly.js'
const Plot = _Plot?.default ?? _Plot
import { usePortfolioStore, PAIR_META } from '../store/portfolio'
import { fetchBookRisk, explainPnl } from '../api/client'

const LAYOUT = {
  paper_bgcolor:'transparent', plot_bgcolor:'#080d18',
  font:{ color:'#94a3b8', size:11 },
  margin:{ l:56, r:16, t:12, b:42 },
  legend:{ bgcolor:'transparent', font:{ size:9 }, orientation:'h', x:0, y:-0.22 },
  hoverlabel:{ bgcolor:'#0f172a', font:{ color:'#e2e8f0' }, bordercolor:'rgba(0,212,255,0.15)' },
}
const CFG = { responsive:true, displayModeBar:false }
const axis = (title, extra = {}) => ({ title:{ text:title }, gridcolor:'#1e293b', color:'#475569', zeroline:false, ...extra })
const num = (v, d = 2) => (v == null ? '—' : Number(v).toLocaleString(undefined, { minimumFractionDigits:d, maximumFractionDigits:d }))
const BUCKETS = ['delta', 'gamma', 'vega', 'vanna', 'volga', 'theta', 'unexplained']
const BUCKET_COLOR = { delta:'#00d4ff', gamma:'#c084fc', vega:'#ffd700', vanna:'#fb923c', volga:'#f472b6', theta:'#94a3b8', unexplained:'#475569' }
const ZONE_COLOR = { green:'var(--green)', amber:'#ffb020', red:'var(--red)' }
const METHOD_NOTE = {
  'HS':'Historical simulation, full revaluation',
  'FHS':'Filtered HS — shocks rescaled to today’s EWMA vol',
  'Delta-gamma CF':'Taylor (Δ, Γ, vega, vanna, volga, θ) + Cornish-Fisher',
  'MC Student-t':'Monte Carlo, t(4) factors, full revaluation',
  'Delta-normal':'Linear Δ + vega, normal — the naive number',
}

function useLoad(fn, key, enabled = true) {
  const [res, setRes] = useState({ key:null, data:null, error:null })
  useEffect(() => {
    if (!enabled) return
    let stale = false
    const t = setTimeout(() => {
      fn(JSON.parse(key))
        .then(data => { if (!stale) setRes({ key, data, error:null }) })
        .catch(e => { if (!stale) setRes({ key, data:null, error: e?.response?.data?.detail?.toString() ?? 'Request failed — is the backend up?' }) })
    }, 300)
    return () => { stale = true; clearTimeout(t) }
  }, [fn, key, enabled])
  return { ...res, loading: res.key !== key }
}

const Chip = ({ active, onClick, children }) => (
  <button onClick={onClick} className="font-mono" style={{ padding:'3px 9px', borderRadius:4, fontSize:9, cursor:'pointer',
    border:'1px solid ' + (active ? 'var(--cyan)' : 'var(--border)'), background: active ? 'rgba(0,212,255,0.1)' : 'transparent',
    color: active ? 'var(--cyan)' : 'var(--text-muted)' }}>{children}</button>
)

function Card({ title, right, children }) {
  return (
    <div className="glass" style={{ borderRadius:8, padding:8 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', margin:'2px 6px 4px', gap:8, flexWrap:'wrap' }}>
        <span className="section-title" style={{ fontSize:10 }}>{title}</span>{right}
      </div>
      {children}
    </div>
  )
}

function Kpis({ items }) {
  return (
    <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' }}>
      {items.map(k => (
        <div key={k.label} className="glass" title={k.hint} style={{ padding:'6px 12px', borderRadius:6, fontSize:11 }}>
          <div style={{ color:'var(--text-muted)', fontSize:9, letterSpacing:'0.05em' }}>{k.label}</div>
          <div className="font-mono" style={{ color: k.color ?? 'var(--cyan)', fontWeight:700, fontSize:14 }}>{k.value}</div>
          {k.sub && <div className="font-mono" style={{ fontSize:9, color:'var(--text-muted)' }}>{k.sub}</div>}
        </div>
      ))}
    </div>
  )
}

function ErrorBox({ msg }) {
  return <div style={{ padding:8, borderRadius:6, fontSize:11, marginBottom:10, background:'rgba(255,61,90,0.1)', border:'1px solid #ff3d5a', color:'#ff3d5a' }}>{msg}</div>
}

export default function RiskDesk() {
  const { legs, S, sigma, r_d, r_f, pair } = usePortfolioStore()
  const [horizon, setHorizon] = useState(1)
  const dp = PAIR_META[pair]?.dp ?? 2
  const options = legs.map(({ type, K, T, qty }) => ({ type, K:+K, T:+T, qty:+qty }))
  const valid = options.length > 0 && options.every(o => o.K > 0 && o.T > 0)
  const body = { pair, S, sigma, r_d, r_f, options, horizon }
  const { data:d, error, loading } = useLoad(fetchBookRisk, JSON.stringify(body), valid)
  const fhs = d?.methods?.FHS
  const g = d?.greeks
  const bt = d?.backtest

  return (
    <div style={{ padding:16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, marginBottom:12, flexWrap:'wrap' }}>
        <div>
          <div className="section-title">Risk Desk — VaR / ES, stress, backtest &amp; P&amp;L explain ({pair}, {legs.length} legs)</div>
          <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:2 }}>
            Full revaluation of the portfolio book on joint spot × implied-vol history · FRTB ES 97.5% · Basel traffic light
          </div>
        </div>
        <div style={{ display:'flex', gap:4, alignItems:'center' }}>
          <span style={{ fontSize:9, color:'var(--text-muted)' }}>Horizon</span>
          <Chip active={horizon === 1} onClick={() => setHorizon(1)}>1 day</Chip>
          <Chip active={horizon === 10} onClick={() => setHorizon(10)}>10 days</Chip>
        </div>
      </div>
      {!valid && <ErrorBox msg="Add at least one option leg in the portfolio builder." />}
      {error && <ErrorBox msg={error} />}
      {valid && !d && !error && <div style={{ fontSize:11, color:'var(--text-muted)', padding:12 }}>Revaluing the book across history…</div>}
      {d && (
        <div style={{ opacity: loading ? 0.6 : 1, transition:'opacity .2s' }}>
          <Kpis items={[
            { label:'Book value', value:num(d.value, dp), sub:`Δ ${num(g.delta, 3)} · Γ ${num(g.gamma, 5)}` },
            { label:'Vega / vol pt', value:num(g.vega / 100, dp), sub:`θ/day ${num(g.theta, dp)}`, color: g.vega < 0 ? 'var(--red)' : 'var(--cyan)' },
            { label:`FHS VaR 99% · ${horizon}d`, value:num(fhs.var_990, dp), color:'var(--red)', hint:'Loss not exceeded on 99% of days under today’s vol regime' },
            { label:`FHS ES 97.5% · ${horizon}d`, value:num(fhs.es_975, dp), color:'var(--red)', hint:'FRTB expected shortfall: average loss beyond the 97.5% quantile' },
            ...(d.stressed ? [{ label:'Stressed ES 97.5% (1d)', value:num(d.stressed.es_975, dp), color:'#ff3d5a',
              sub:`${d.stressed.start} → ${d.stressed.end}`, hint:'Worst 250-day window of history for this book' }] : []),
            ...(bt ? [{ label:'Backtest (250d)', value:`${bt.exceptions_last_250} exc. · ${bt.traffic_light.toUpperCase()}`, color:ZONE_COLOR[bt.traffic_light],
              sub:`Kupiec p ${bt.kupiec_p.toFixed(2)} · Christoffersen p ${bt.christoffersen_p.toFixed(2)}` }] : []),
          ]} />
          <div style={{ fontSize:9, color:'var(--text-muted)', marginBottom:10 }}>
            Factors: {d.factor.n_days} days ({d.factor.start} → {d.factor.end}) · vol shocks from <b>{d.factor.vol_label}</b> ·
            spot–vol correlation {d.correlation == null ? '—' : d.correlation.toFixed(2)} · today&apos;s EWMA spot vol {(d.vol_now.spot_ann * 100).toFixed(1)}%
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(420px, 1fr))', gap:12, marginBottom:12 }}>
            <MethodsTable methods={d.methods} dp={dp} horizon={horizon} />
            <Card title={`P&L distribution · FHS · ${horizon}-day`}>
              <Plot data={[{ x:d.distribution.centers, y:d.distribution.counts, type:'bar',
                  marker:{ color:d.distribution.centers.map(c => c < -fhs.var_990 ? '#ff3d5a' : c < 0 ? 'rgba(255,61,90,0.45)' : 'rgba(0,255,136,0.45)') } }]}
                layout={{ ...LAYOUT, showlegend:false, bargap:0.04, xaxis:axis(`P&L (${pair.slice(3)})`), yaxis:axis('Scenarios'),
                  shapes:[-fhs.var_990, -fhs.es_975].map((x, i) => ({ type:'line', x0:x, x1:x, yref:'paper', y0:0, y1:1,
                    line:{ color: i ? '#ffd700' : '#ff3d5a', dash:'dot', width:1.5 } })),
                  annotations:[{ x:-fhs.var_990, y:1, yref:'paper', text:'VaR99', showarrow:false, font:{ size:9, color:'#ff3d5a' }, yanchor:'bottom' },
                    { x:-fhs.es_975, y:0.9, yref:'paper', text:'ES97.5', showarrow:false, font:{ size:9, color:'#ffd700' }, yanchor:'bottom' }] }}
                config={CFG} style={{ width:'100%', height:280 }} />
            </Card>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(420px, 1fr))', gap:12, marginBottom:12 }}>
            <Ladder lad={d.ladder} dp={dp} />
            {bt && <Backtest bt={bt} />}
          </div>
          <WorstDays rows={d.worst_days} dp={dp} />
          <WhatIf body={body} dp={dp} />
          <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:10, lineHeight:1.5 }}>
            Scenarios move spot by the historical log-return and the book&apos;s vol by the historical log-change of the vol index
            (parallel, sticky-strike). FHS: Barone-Adesi, Giannopoulos &amp; Vosper (1999), Hull &amp; White (1998), EWMA λ = 0.94.
            Cornish-Fisher: Zangari (1996). Stressed VaR: BCBS (2009). ES 97.5%: FRTB MAR33. Backtest: Kupiec (1995) POF, Christoffersen (1998)
            independence; Basel zones green ≤ 4 / amber 5–9 / red ≥ 10 exceptions in 250 days. Static book — legs are not rolled through history.
          </div>
        </div>
      )}
    </div>
  )
}

function MethodsTable({ methods, dp, horizon }) {
  const cols = [['var_990', 'VaR 99%'], ['es_990', 'ES 99%'], ['var_975', 'VaR 97.5%'], ['es_975', 'ES 97.5%']]
  return (
    <Card title={`VaR / ES by method · ${horizon}-day · loss in quote ccy`}>
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
          <thead><tr style={{ color:'var(--text-muted)', fontSize:9, textAlign:'right' }}>
            <th style={{ textAlign:'left', padding:'4px 8px' }}>Method</th>
            {cols.map(([, l]) => <th key={l} style={{ padding:'4px 8px' }}>{l}</th>)}</tr></thead>
          <tbody>{Object.entries(methods).map(([m, v]) => (
            <tr key={m} title={METHOD_NOTE[m]} style={{ borderTop:'1px solid var(--border)', textAlign:'right' }}>
              <td style={{ textAlign:'left', padding:'5px 8px' }}>{m}
                <div style={{ fontSize:8, color:'var(--text-muted)' }}>{METHOD_NOTE[m]}</div></td>
              {cols.map(([k]) => <td key={k} className="font-mono" style={{ padding:'5px 8px', color: k.startsWith('es') ? '#ffd700' : 'var(--red)' }}>{num(v[k], dp)}</td>)}
            </tr>))}</tbody>
        </table>
      </div>
      <div style={{ fontSize:9, color:'var(--text-muted)', padding:'6px 8px' }}>
        Large gaps between Delta-normal and the full-reval methods are the book&apos;s convexity and vol risk; FHS ≫ HS means today is more volatile than the sample average.
      </div>
    </Card>
  )
}

function Ladder({ lad, dp }) {
  return (
    <Card title="Spot × vol ladder — full revaluation P&L">
      <Plot data={[{ z:lad.pnl, x:lad.spot_pct.map(v => `${v > 0 ? '+' : ''}${v}%`), y:lad.vol_pts.map(v => `${v > 0 ? '+' : ''}${v} vol`),
          type:'heatmap', colorscale:[[0, '#ff3d5a'], [0.5, '#0f172a'], [1, '#00ff88']], zmid:0,
          text:lad.pnl.map(r => r.map(v => num(v, dp))), texttemplate:'%{text}', textfont:{ size:8 },
          hovertemplate:'spot %{x}, vol %{y}: %{z:.2f}<extra></extra>', showscale:false }]}
        layout={{ ...LAYOUT, margin:{ l:62, r:10, t:8, b:36 }, xaxis:axis('Spot move', { type:'category' }), yaxis:axis('', { type:'category' }) }}
        config={CFG} style={{ width:'100%', height:300 }} />
    </Card>
  )
}

function Backtest({ bt }) {
  const exc = bt.pnl.map((p, i) => p < -bt.var[i])
  return (
    <Card title={`Backtest · rolling 1-day FHS VaR 99% vs book P&L · ${bt.n} days`}
      right={<span className="font-mono" style={{ fontSize:10, color:ZONE_COLOR[bt.traffic_light] }}>
        {bt.exceptions} exceptions (exp. {bt.expected.toFixed(1)})</span>}>
      <Plot data={[
          { x:bt.dates, y:bt.pnl, type:'bar', name:'Book P&L', marker:{ color:exc.map(e => e ? '#ff3d5a' : 'rgba(0,212,255,0.35)') } },
          { x:bt.dates, y:bt.var.map(v => -v), type:'scatter', mode:'lines', name:'−VaR 99%', line:{ color:'#ffd700', width:1.4 } },
        ]}
        layout={{ ...LAYOUT, hovermode:'x unified', bargap:0, xaxis:axis('', { type:'date' }), yaxis:axis('P&L') }}
        config={CFG} style={{ width:'100%', height:300 }} />
    </Card>
  )
}

function ExplainBars({ rows, labels }) {
  return (
    <Plot data={BUCKETS.map(b => ({ x:labels, y:rows.map(r => r[b]), type:'bar', name:b, marker:{ color:BUCKET_COLOR[b] } }))}
      layout={{ ...LAYOUT, barmode:'relative', hovermode:'x unified', xaxis:axis('', { type:'category' }), yaxis:axis('P&L contribution') }}
      config={CFG} style={{ width:'100%', height:280 }} />
  )
}

function WorstDays({ rows, dp }) {
  return (
    <Card title="Worst historical days for this book — and which Greek did the damage">
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(420px, 1fr))', gap:8 }}>
        <ExplainBars rows={rows.map(r => r.explain)} labels={rows.map(r => r.date)} />
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
            <thead><tr style={{ color:'var(--text-muted)', fontSize:9, textAlign:'right' }}>
              <th style={{ textAlign:'left', padding:'4px 8px' }}>Date</th><th style={{ padding:'4px 8px' }}>Spot</th>
              <th style={{ padding:'4px 8px' }}>Vol</th><th style={{ padding:'4px 8px' }}>P&amp;L</th><th style={{ padding:'4px 8px' }}>Main driver</th></tr></thead>
            <tbody>{rows.map(r => {
              const main = BUCKETS.filter(b => b !== 'unexplained').reduce((a, b) => (Math.abs(r.explain[b]) > Math.abs(r.explain[a]) ? b : a), 'delta')
              return (
                <tr key={r.date} className="font-mono" style={{ borderTop:'1px solid var(--border)', textAlign:'right' }}>
                  <td style={{ textAlign:'left', padding:'5px 8px' }}>{r.date}</td>
                  <td style={{ padding:'5px 8px', color: r.spot_move_pct < 0 ? 'var(--red)' : 'var(--green)' }}>{r.spot_move_pct.toFixed(2)}%</td>
                  <td style={{ padding:'5px 8px' }}>{r.vol_move_pts >= 0 ? '+' : ''}{r.vol_move_pts.toFixed(1)}</td>
                  <td style={{ padding:'5px 8px', color:'var(--red)' }}>{num(r.pnl, dp)}</td>
                  <td style={{ padding:'5px 8px', color:BUCKET_COLOR[main] }}>{main}</td>
                </tr>)
            })}</tbody>
          </table>
        </div>
      </div>
    </Card>
  )
}

function WhatIf({ body, dp }) {
  const [m, setM] = useState({ spot_move_pct:-5, vol_move_pts:5, days:1 })
  const req = { S:body.S, sigma:body.sigma, r_d:body.r_d, r_f:body.r_f, options:body.options, ...m }
  const { data:e, error } = useLoad(explainPnl, JSON.stringify(req))
  const field = (label, k, step) => (
    <label key={k} style={{ display:'flex', flexDirection:'column', gap:3, fontSize:9, color:'var(--text-muted)' }}>{label}
      <input type="number" value={m[k]} step={step} onChange={ev => setM(q => ({ ...q, [k]: +ev.target.value }))}
        style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:4, color:'var(--cyan)', fontSize:11,
          padding:'4px 6px', fontFamily:'var(--font-mono)', width:'100%' }} />
    </label>
  )
  return (
    <div style={{ marginTop:12 }}>
      <Card title="What-if P&L explain — full revaluation vs Greek buckets">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(120px, 1fr))', gap:10, alignItems:'end', padding:'0 6px 6px' }}>
          {field('Spot move (%)', 'spot_move_pct', 0.5)}
          {field('Vol move (pts)', 'vol_move_pts', 1)}
          {field('Days elapsed', 'days', 1)}
          {e && <div className="font-mono" style={{ fontSize:13, color: e.pnl < 0 ? 'var(--red)' : 'var(--green)', paddingBottom:4 }}>
            P&amp;L {num(e.pnl, dp)}</div>}
        </div>
        {error && <ErrorBox msg={error} />}
        {e && <Plot data={[{ type:'waterfall', x:BUCKETS.concat(['total']), measure:BUCKETS.map(() => 'relative').concat(['total']),
            y:BUCKETS.map(b => e.explain[b]).concat([e.pnl]),
            increasing:{ marker:{ color:'#00ff88' } }, decreasing:{ marker:{ color:'#ff3d5a' } }, totals:{ marker:{ color:'#00d4ff' } },
            connector:{ line:{ color:'#334155' } } }]}
          layout={{ ...LAYOUT, showlegend:false, xaxis:axis(''), yaxis:axis('P&L') }}
          config={CFG} style={{ width:'100%', height:260 }} />}
        <div style={{ fontSize:9, color:'var(--text-muted)', padding:'0 8px 4px' }}>
          A large &quot;unexplained&quot; bar means the move is too big for second-order Greeks — exactly where Taylor-based VaR fails and full revaluation matters.
        </div>
      </Card>
    </div>
  )
}
