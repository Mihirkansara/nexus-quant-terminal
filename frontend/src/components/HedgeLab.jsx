import { useEffect, useState } from 'react'
import _Plot from 'react-plotly.js'
const Plot = _Plot?.default ?? _Plot
import { usePortfolioStore, PAIR_META, isCrypto } from '../store/portfolio'
import { simulateHedge, fetchVolForecast } from '../api/client'

const LAYOUT = {
  paper_bgcolor:'transparent', plot_bgcolor:'#080d18',
  font:{ color:'#94a3b8', size:11 },
  margin:{ l:56, r:16, t:12, b:44 },
  legend:{ bgcolor:'transparent', font:{ size:9 }, orientation:'h', x:0, y:-0.22 },
  hoverlabel:{ bgcolor:'#0f172a', font:{ color:'#e2e8f0' }, bordercolor:'rgba(0,212,255,0.15)' },
}
const axis = (title, extra = {}) => ({ title:{ text:title }, gridcolor:'#1e293b', color:'#475569', zeroline:false, ...extra })
const FREQS = [[1, 'Daily'], [2, '2× / day'], [4, '4× / day'], [8, '8× / day'], [24, 'Hourly']]
const MODELS = [['gbm', 'Lognormal (GBM)'], ['jump', 'Jump-diffusion (Merton)'], ['bootstrap', 'Historical bootstrap']]

const defaultsFor = (pair, sigma) => ({
  sigma_realised: +(sigma * 100).toFixed(2),
  model: isCrypto(pair) ? 'jump' : 'gbm',
  steps_per_day: isCrypto(pair) ? 4 : 1,
  rule: 'time', band: 0.05, cost_bps: isCrypto(pair) ? 3 : 1, n_paths: 2000,
  jump: { intensity: 12, mean: -1, sd: 5 },                // % units in the UI
  weekend_gap: PAIR_META[pair]?.assetClass === 'metal' ? 1.0 : 0.3,
  rescale_bootstrap: true,
})

export default function HedgeLab() {
  const { legs, S, sigma, r_d, r_f, pair } = usePortfolioStore()
  const [cfg, setCfg] = useState(() => ({ pair, ...defaultsFor(pair, sigma) }))
  const [run, setRun] = useState(0)
  const [response, setResponse] = useState({ key:null, data:null, error:null })
  const [fcNote, setFcNote] = useState(null)
  // Reset scenario defaults when the instrument changes (derived, no effect needed).
  const params = cfg.pair === pair ? cfg : { pair, ...defaultsFor(pair, sigma) }
  const set = (k, v) => setCfg({ ...params, [k]: v })
  const crypto = isCrypto(pair)
  const maxT = legs.length ? Math.max(...legs.map(l => +l.T)) : 0

  const body = {
    pair, S, r_d, r_f,
    options: legs.map(({ type, K, T, qty }) => ({ type, K:+K, T:+T, qty:+qty })),
    sigma_implied: sigma, sigma_realised: params.sigma_realised / 100,
    model: params.model, steps_per_day: params.steps_per_day, rule: params.rule, band: params.band,
    cost_bps: params.cost_bps, n_paths: params.n_paths,
    jump: { intensity: params.jump.intensity, mean: params.jump.mean / 100, sd: params.jump.sd / 100 },
    weekend_gap: crypto ? 0 : params.weekend_gap / 100, rescale_bootstrap: params.rescale_bootstrap,
  }
  const requestKey = `${run}:${JSON.stringify(body)}`
  const [submitted, setSubmitted] = useState(null)

  useEffect(() => {
    if (!submitted) return
    let stale = false
    simulateHedge(JSON.parse(submitted.slice(submitted.indexOf(':') + 1)))
      .then(data => { if (!stale) setResponse({ key:submitted, data, error:null }) })
      .catch(e => { if (!stale) setResponse({ key:submitted, data:null,
        error: e?.response?.data?.detail?.toString() ?? e?.message ?? 'Simulation failed' }) })
    return () => { stale = true }
  }, [submitted])

  const loading = submitted !== null && response.key !== submitted
  const d = response.data?.pair === pair ? response.data : null
  const stale = d && response.key !== requestKey
  const go = () => { setRun(r => r + 1); setSubmitted(`${run + 1}:${JSON.stringify(body)}`) }

  const loadForecast = async () => {
    setFcNote('Loading Vol Forecast…')
    try {
      const f = await fetchVolForecast(pair)
      const days = maxT * (crypto ? 365 : 252)
      const h = days <= 3 ? '1D' : days <= 14 ? '1W' : '1M'
      const v = f.current[h].Ensemble
      set('sigma_realised', +(v * 100).toFixed(2))
      setFcNote(`Realised vol set to the ${h} ensemble forecast (${(v * 100).toFixed(1)}%)`)
    } catch (e) {
      setFcNote(`Vol Forecast unavailable: ${e?.response?.data?.detail ?? e.message}`)
    }
  }

  return (
    <div style={{ padding:16 }}>
      <div style={{ marginBottom:10 }}>
        <div className="section-title">Hedge Lab — delta-hedged P&amp;L of your portfolio ({pair})</div>
        <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:2 }}>
          Options traded &amp; hedged at implied σ = {(sigma * 100).toFixed(2)}% · {legs.length} leg(s), longest {maxT}y ·
          Monte Carlo with discrete hedging, {crypto ? 'jumps' : 'weekend gaps, jumps'}, transaction costs and carry
        </div>
      </div>

      <Controls params={params} set={set} crypto={crypto} onRun={go} loading={loading}
        onForecast={loadForecast} fcNote={fcNote} />

      {response.error && response.key === submitted && (
        <div style={{ padding:8, borderRadius:6, margin:'8px 0', fontSize:11,
          background:'rgba(255,61,90,0.1)', border:'1px solid #ff3d5a', color:'#ff3d5a' }}>{response.error}</div>
      )}
      {!d && !loading && !response.error && (
        <div style={{ padding:24, textAlign:'center', color:'var(--text-muted)', fontSize:12 }}>
          Set the realised-vol scenario and hedging rule, then press <b style={{ color:'var(--cyan)' }}>Run simulation</b>.
        </div>
      )}
      {loading && !d && <div className="skeleton" style={{ height:340, borderRadius:8, marginTop:10 }}/>}

      {d && (
        <div style={{ opacity: loading ? 0.6 : 1, marginTop:10 }}>
          {stale && <div style={{ fontSize:10, color:'var(--amber)', marginBottom:6 }}>Inputs changed — re-run to update.</div>}
          <Kpis d={d} />
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(380px, 1fr))', gap:12, marginBottom:12 }}>
            <Histogram d={d} />
            <Sweep d={d} />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(380px, 1fr))', gap:12 }}>
            <Attribution d={d} />
            <Paths d={d} />
          </div>
          <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:10, lineHeight:1.5 }}>
            Delta-hedged P&amp;L ≈ ½ΓS²(σ²<sub>realised</sub> − σ²<sub>implied</sub>)dt, plus discrete-hedging noise
            (Derman &amp; Kamal 1999: sd ≈ √(π/4N)·vega·σ), jump/gap losses no hedge can follow, and costs
            (Leland 1985). Jump-diffusion keeps total variance equal to the realised vol (Merton 1976); the bootstrap
            resamples the asset&apos;s own daily returns in blocks (Politis &amp; Romano 1994). Theoretical edge = value at
            realised minus premium at implied (Ahmad &amp; Wilmott 2005).
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children, hint }) {
  return (
    <label title={hint} style={{ display:'flex', flexDirection:'column', gap:3, fontSize:9, color:'var(--text-muted)' }}>
      {label}{children}
    </label>
  )
}

const inputStyle = { width:'100%', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:4,
  color:'var(--cyan)', fontSize:11, padding:'4px 6px', fontFamily:'var(--font-mono)' }

function Num({ value, onChange, step = 0.1, min, max }) {
  return <input type="number" style={inputStyle} value={value} step={step} min={min} max={max}
    onChange={e => onChange(e.target.value === '' ? '' : +e.target.value)} />
}

function Controls({ params, set, crypto, onRun, loading, onForecast, fcNote }) {
  return (
    <div className="glass" style={{ borderRadius:8, padding:10 }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(130px, 1fr))', gap:10, alignItems:'end' }}>
        <Field label="Realised σ (%)" hint="Volatility the market actually delivers over the life of the trade">
          <Num value={params.sigma_realised} onChange={v => set('sigma_realised', v)} step={0.5} min={1} />
        </Field>
        <Field label="Path model">
          <select style={inputStyle} value={params.model} onChange={e => set('model', e.target.value)}>
            {MODELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Hedge frequency">
          <select style={inputStyle} value={params.steps_per_day} onChange={e => set('steps_per_day', +e.target.value)}>
            {FREQS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Hedge rule">
          <select style={inputStyle} value={params.rule} onChange={e => set('rule', e.target.value)}>
            <option value="time">Every step</option>
            <option value="band">Delta band</option>
          </select>
        </Field>
        {params.rule === 'band' && (
          <Field label="Band (Δ per unit)" hint="Rebalance only when off target by more than this delta per option unit">
            <Num value={params.band} onChange={v => set('band', v)} step={0.01} min={0.01} max={1} />
          </Field>
        )}
        <Field label="Cost (bps one-way)"><Num value={params.cost_bps} onChange={v => set('cost_bps', v)} step={0.5} min={0} /></Field>
        <Field label="Paths"><Num value={params.n_paths} onChange={v => set('n_paths', v)} step={500} min={200} max={5000} /></Field>
        {params.model === 'jump' && <>
          <Field label="Jumps / year"><Num value={params.jump.intensity} onChange={v => set('jump', { ...params.jump, intensity:v })} step={1} min={0} /></Field>
          <Field label="Mean jump (%)"><Num value={params.jump.mean} onChange={v => set('jump', { ...params.jump, mean:v })} step={0.5} /></Field>
          <Field label="Jump sd (%)"><Num value={params.jump.sd} onChange={v => set('jump', { ...params.jump, sd:v })} step={0.5} min={0} /></Field>
        </>}
        {params.model === 'bootstrap' && (
          <Field label="Scale to realised σ">
            <select style={inputStyle} value={params.rescale_bootstrap ? 'y' : 'n'} onChange={e => set('rescale_bootstrap', e.target.value === 'y')}>
              <option value="y">Yes (shape only)</option><option value="n">No (raw history)</option>
            </select>
          </Field>
        )}
        {!crypto && (
          <Field label="Weekend gap sd (%)" hint="Monday-open gap the hedge cannot trade through (24/5 markets)">
            <Num value={params.weekend_gap} onChange={v => set('weekend_gap', v)} step={0.1} min={0} />
          </Field>
        )}
        <button className="btn-primary" onClick={onRun} disabled={loading} style={{ padding:'7px 10px', fontSize:11 }}>
          {loading ? '⟳ Simulating…' : '▶ Run simulation'}
        </button>
      </div>
      <div style={{ display:'flex', gap:8, alignItems:'center', marginTop:8 }}>
        <button className="btn-ghost" onClick={onForecast} style={{ fontSize:10 }}>🤖 Use Vol Forecast for realised σ</button>
        {fcNote && <span style={{ fontSize:10, color:'var(--text-muted)' }}>{fcNote}</span>}
      </div>
    </div>
  )
}

const fmt = (v, dp = 2) => (v == null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: dp, minimumFractionDigits: dp }))

function Kpis({ d }) {
  const p = d.pnl, b = d.benchmarks
  const se = p.std / Math.sqrt(d.inputs.n_paths)
  const items = [
    { label:'Premium (at implied)', value: fmt(d.premium) },
    { label:'Mean P&L', value: fmt(p.mean), sub:`± ${fmt(se)} (1 se)`, color: p.mean >= 0 ? 'var(--green)' : 'var(--red)' },
    { label:'Theoretical edge', value: fmt(b.theoretical_edge), sub:'continuous hedge at realised' },
    { label:'P&L st. dev.', value: fmt(p.std), sub:`Derman-Kamal (GBM) ${fmt(b.derman_kamal_sd)}` },
    { label:'5% ES', value: fmt(p.es05), color:'var(--red)', sub:`5% VaR ${fmt(p.p05)}` },
    { label:'P(profit)', value: `${(p.prob_profit * 100).toFixed(0)}%` },
    { label:'Hedge costs', value: fmt(-d.attribution.costs), sub:`Leland (GBM) ≈ ${fmt(b.leland_cost)}` },
    { label:'Trades / path', value: d.trades_per_path.toFixed(0), sub:`${d.inputs.n_steps} steps${d.inputs.weekend_gaps ? ` · ${d.inputs.weekend_gaps} weekend gaps` : ''}` },
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

function Card({ title, children }) {
  return (
    <div className="glass" style={{ borderRadius:8, padding:8 }}>
      <div className="section-title" style={{ fontSize:10, margin:'2px 0 4px 6px' }}>{title}</div>
      {children}
    </div>
  )
}

function Histogram({ d }) {
  const h = d.histogram
  const vline = (x, color, dash) => ({ type:'line', x0:x, x1:x, yref:'paper', y0:0, y1:1, line:{ color, width:1.5, dash } })
  return (
    <Card title={`P&L distribution · ${d.inputs.n_paths} paths`}>
      <Plot data={[{ x:h.centers, y:h.counts, type:'bar', name:'Paths',
          marker:{ color:h.centers.map(c => c >= 0 ? 'rgba(0,255,136,0.55)' : 'rgba(255,61,90,0.55)') } }]}
        layout={{ ...LAYOUT, showlegend:false, bargap:0.05, xaxis:axis('P&L at expiry'), yaxis:axis('Paths'),
          shapes:[vline(0, 'rgba(255,255,255,0.35)', 'dot'), vline(d.pnl.mean, '#00d4ff', 'solid'),
            vline(d.benchmarks.theoretical_edge, '#ffd700', 'dash')],
          annotations:[{ x:d.pnl.mean, yref:'paper', y:1, text:'mean', showarrow:false, font:{ color:'#00d4ff', size:9 } },
            { x:d.benchmarks.theoretical_edge, yref:'paper', y:0.92, text:'edge', showarrow:false, font:{ color:'#ffd700', size:9 } }] }}
        config={{ responsive:true, displayModeBar:false }} style={{ width:'100%', height:280 }} />
    </Card>
  )
}

function Sweep({ d }) {
  const s = d.frequency_sweep ?? []
  if (!s.length) return null
  const x = s.map(r => r.steps_per_day)
  return (
    <Card title="Hedge frequency: risk vs cost (time-based rule)">
      <Plot data={[
          { x, y:s.map(r => r.std), type:'scatter', mode:'lines+markers', name:'P&L st. dev.', line:{ color:'#00d4ff', width:2 } },
          { x, y:s.map(r => r.derman_kamal_sd), type:'scatter', mode:'lines', name:'Derman-Kamal (GBM)', line:{ color:'#00d4ff', dash:'dot', width:1 } },
          { x, y:s.map(r => r.cost), type:'scatter', mode:'lines+markers', name:'Mean hedge cost', yaxis:'y2', line:{ color:'#ff3d5a', width:2 } },
          { x, y:s.map(r => -r.es05), type:'scatter', mode:'lines', name:'−5% ES', line:{ color:'#ffd700', width:1.2 } },
        ]}
        layout={{ ...LAYOUT, xaxis:axis('Hedges per day', { type:'log', tickvals:x, ticktext:x.map(String) }),
          yaxis:axis('Risk'), yaxis2:{ ...axis('Cost'), overlaying:'y', side:'right', showgrid:false },
          margin:{ ...LAYOUT.margin, r:52 } }}
        config={{ responsive:true, displayModeBar:false }} style={{ width:'100%', height:280 }} />
    </Card>
  )
}

function Attribution({ d }) {
  const a = d.attribution
  const items = [['Options (payoff − premium)', a.option], ['Delta hedge (incl. financing)', a.hedge - a.carry],
    ['Carry on hedge (r_f / lease)', a.carry], ['Transaction costs', a.costs]]
  return (
    <Card title="Mean P&L attribution">
      <Plot data={[{ type:'bar', orientation:'h', y:items.map(i => i[0]), x:items.map(i => i[1]),
          marker:{ color:items.map(i => i[1] >= 0 ? 'rgba(0,255,136,0.6)' : 'rgba(255,61,90,0.6)') },
          text:items.map(i => fmt(i[1])), textposition:'auto' }]}
        layout={{ ...LAYOUT, showlegend:false, margin:{ ...LAYOUT.margin, l:190 }, xaxis:axis(''), yaxis:axis('', { automargin:true }) }}
        config={{ responsive:true, displayModeBar:false }} style={{ width:'100%', height:240 }} />
    </Card>
  )
}

function Paths({ d }) {
  const paths = d.sample_paths ?? []
  if (!paths.length) return null
  return (
    <Card title="Sample simulated spot paths">
      <Plot data={paths.map((p, i) => ({ y:p, type:'scatter', mode:'lines', name:`path ${i + 1}`,
          line:{ width:1, color:`hsla(${190 + i * 18}, 90%, 60%, 0.8)` } }))}
        layout={{ ...LAYOUT, showlegend:false, xaxis:axis('Time →', { showticklabels:false }), yaxis:axis('Spot') }}
        config={{ responsive:true, displayModeBar:false }} style={{ width:'100%', height:240 }} />
    </Card>
  )
}
