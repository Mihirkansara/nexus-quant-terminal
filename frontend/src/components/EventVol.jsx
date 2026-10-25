import { useEffect, useState } from 'react'
import _Plot from 'react-plotly.js'
const Plot = _Plot?.default ?? _Plot
import { usePortfolioStore, isCrypto, PAIR_META } from '../store/portfolio'
import { fetchEventVolCrypto, fetchEventVolRealised, priceEventVol } from '../api/client'
import KpiStrip from './KpiStrip'
import { num } from '../lib/format'

const LAYOUT = {
  paper_bgcolor:'transparent', plot_bgcolor:'#0a1511',
  font:{ family:"'Geist Variable', sans-serif", color:'#9eab9f', size:11 },
  margin:{ l:52, r:16, t:12, b:42 },
  legend:{ bgcolor:'transparent', font:{ size:10.5 }, orientation:'h', x:0, y:-0.22 },
  hoverlabel:{ bgcolor:'#0f1d18', font:{ color:'#ebe5d3' }, bordercolor:'rgba(169,154,255,0.15)' },
}
const CFG = { responsive:true, displayModeBar:false }
const axis = (title, extra = {}) => ({ title:{ text:title }, gridcolor:'#1c2e26', color:'#7e8f84', zeroline:false, ...extra })
const pct = (v, d = 1) => (v == null ? '—' : (v * 100).toFixed(d) + '%')
const EV_COLOR = { FOMC:'#ee6b5b', CPI:'#e4dcc3', NFP:'#d58fc0', OTHER:'#4fc690' }
const fmtTime = (iso) => new Date(iso).toUTCString().slice(5, 22) + ' UTC'

// Starting assumptions per asset class: weekend weight and event 1-sd moves (%).
const DEFAULTS = {
  metal:  { weekend_weight:0.15, moves:{ FOMC:1.3, CPI:1.1, NFP:1.0, OTHER:0.8 } },
  fx:     { weekend_weight:0.15, moves:{ FOMC:0.6, CPI:0.5, NFP:0.5, OTHER:0.5 } },
  crypto: { weekend_weight:0.70, moves:{ FOMC:2.5, CPI:2.0, NFP:1.5, OTHER:1.5 } },
}
const defaultsFor = (pair, sigma) => {
  const cls = PAIR_META[pair]?.assetClass ?? 'fx'
  const d = DEFAULTS[cls] ?? DEFAULTS.fx
  const silver = pair === 'XAGUSD' ? 1.6 : 1
  return { base_vol:+(sigma * 100).toFixed(1), weekend_weight:d.weekend_weight,
    moves:Object.fromEntries(Object.entries(d.moves).map(([k, v]) => [k, +(v * silver).toFixed(2)])),
    quotes:'', fitEvents:false, expiry_days:3, custom:{ name:'', time:'', type:'OTHER' } }
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
    }, 250)
    return () => { stale = true; clearTimeout(t) }
  }, [fn, key, enabled])
  return { ...res, loading: res.key !== key }
}

export default function EventVol() {
  const { pair } = usePortfolioStore()
  const [mode, setMode] = useState(null)
  const live = mode ?? (isCrypto(pair) ? 'live' : 'model')
  return (
    <div style={{ padding:16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, marginBottom:12, flexWrap:'wrap' }}>
        <div>
          <div className="section-title" style={{ color:'var(--text-muted)', letterSpacing:'0.08em' }}>{pair}</div>
          <div style={{ fontSize:10.5, color:'var(--text-muted)', marginTop:2 }}>
            Strip FOMC / CPI / NFP lumps and the weekend weight out of the ATM curve · price short-dated and 0DTE vols on vol time
          </div>
        </div>
        <div style={{ display:'flex', gap:4 }}>
          {isCrypto(pair) && <Chip active={live === 'live'} onClick={() => setMode('live')}>Fit live Deribit curve</Chip>}
          <Chip active={live === 'model'} onClick={() => setMode('model')}>Model / fit quotes</Chip>
        </div>
      </div>
      {live === 'live' && isCrypto(pair) ? <Live pair={pair} /> : <Model key={pair} pair={pair} />}
      <Realised pair={pair} />
      <div style={{ fontSize:10.5, color:'var(--text-muted)', marginTop:10, lineHeight:1.5 }}>
        σ²(T)·T = σ<sub>b</sub>²·τ(T) + Σ v<sub>e</sub>, with τ = hours to expiry weighted 1 (weekday) or w (weekend), ACT/365 (Clark 2011 &quot;volatility
        time&quot;; Castagna 2010). Fit: non-negative least squares on total variance with a grid over w. FX/metal weekend = Fri 21:00 → Sun 21:00 UTC;
        crypto = Sat/Sun UTC. Built-in 2026 FOMC (14:00 ET), CPI/NFP (08:30 ET) dates merged with live Forex Factory high-impact events.
      </div>
    </div>
  )
}

const Chip = ({ active, onClick, children }) => (
  <button onClick={onClick} className="font-mono" style={{ padding:'3px 9px', borderRadius:4, fontSize:10.5, cursor:'pointer',
    border:'1px solid ' + (active ? 'var(--cyan)' : 'var(--border)'), background: active ? 'rgba(169,154,255,0.1)' : 'transparent',
    color: active ? 'var(--cyan)' : 'var(--text-muted)' }}>{children}</button>
)

function Card({ title, right, children }) {
  return (
    <div className="glass" style={{ borderRadius:8, padding:8 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', margin:'2px 6px 4px', gap:8, flexWrap:'wrap' }}>
        <span className="section-title" style={{ fontSize:11 }}>{title}</span>{right}
      </div>
      {children}
    </div>
  )
}

function Kpis({ items }) {
  return (
    <KpiStrip items={items} />
  )
}

function ErrorBox({ msg }) {
  return <div style={{ padding:8, borderRadius:6, fontSize:11, marginBottom:10, background:'rgba(238,107,91,0.1)', border:'1px solid #ee6b5b', color:'#ee6b5b' }}>{msg}</div>
}

const inputStyle = { background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:4, color:'var(--cyan)', fontSize:11,
  padding:'4px 6px', fontFamily:'var(--font-mono)', width:'100%' }

function Field({ label, value, onChange, step, hint, type = 'number', placeholder }) {
  return (
    <label title={hint} style={{ display:'flex', flexDirection:'column', gap:3, fontSize:10.5, color:'var(--text-muted)' }}>{label}
      <input type={type} value={value} step={step} placeholder={placeholder}
        onChange={e => onChange(type === 'number' ? +e.target.value : e.target.value)} style={inputStyle} />
    </label>
  )
}

function moveKpis(moves, spot, dp = 2) {
  return Object.entries(moves ?? {}).filter(([, m]) => m.event_sd_pct > 0).map(([t, m]) => ({
    label:`${t} implied move`, value:`±${m.event_sd_pct.toFixed(2)}%`, color:EV_COLOR[t],
    sub:`day ${m.multiple_of_normal_day?.toFixed(1)}× normal · E|Δ| ${spot ? num(m.expected_abs_move, dp) : m.expected_abs_move_pct.toFixed(2) + '%'}`,
    hint:'1-sd event lump √v; day = base day + lump; E|Δ| = √(2/π)·day sd (straddle breakeven)' }))
}

function eventShapes(events) {
  return (events ?? []).map(e => ({ type:'line', x0:e.time, x1:e.time, yref:'paper', y0:0, y1:1,
    line:{ color:EV_COLOR[e.type] ?? '#9eab9f', dash:'dot', width:1.2 } }))
}

function CurveChart({ d, marketPoints }) {
  const evs = d.events ?? []
  return (
    <Card title="ATM term structure on vol time — daily expiries">
      <Plot data={[
          { x:d.curve.map(c => c.date), y:d.curve.map(c => c.vol * 100), type:'scatter', mode:'lines+markers', name:'Model ATM vol',
            line:{ color:'#86abea', width:2, shape:'hv' }, marker:{ size:4, color:d.curve.map(c => c.weekend ? '#7e8f84' : '#86abea') } },
          { x:d.curve.map(c => c.date), y:d.curve.map(() => d.flat * 100), type:'scatter', mode:'lines', name:'Flat calendar vol (no events)',
            line:{ color:'rgba(255,255,255,0.3)', dash:'dash', width:1 } },
          ...(marketPoints ? [{ x:marketPoints.map(p => p.time), y:marketPoints.map(p => p.vol * 100), type:'scatter', mode:'markers',
            name:'Market (Deribit / quotes)', marker:{ color:'#e4dcc3', size:8, symbol:'diamond' } }] : []),
          ...Object.keys(EV_COLOR).filter(t => evs.some(e => e.type === t)).map(t => ({ x:[null], y:[null], type:'scatter', mode:'lines',
            name:t, line:{ color:EV_COLOR[t], dash:'dot' } })),
        ]}
        layout={{ ...LAYOUT, hovermode:'x unified', xaxis:axis('Expiry', { type:'date' }), yaxis:axis('ATM vol (%)'), shapes:eventShapes(evs) }}
        config={CFG} style={{ width:'100%', height:300 }} />
      <div style={{ fontSize:10.5, color:'var(--text-muted)', padding:'0 8px 4px' }}>
        Steps up at each event (dotted) and flattens over weekends: a 1-day option spanning FOMC can carry 2–3× the vol of one that doesn&apos;t.
      </div>
    </Card>
  )
}

function TenorTable({ rows }) {
  return (
    <Card title="Standard tenors — vol, forward vol and what drives the variance">
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
          <thead><tr style={{ color:'var(--text-muted)', fontSize:10.5, textAlign:'right' }}>
            <th style={{ textAlign:'left', padding:'4px 8px' }}>Tenor</th><th style={{ padding:'4px 8px' }}>Expiry</th><th style={{ padding:'4px 8px' }}>ATM vol</th>
            <th style={{ padding:'4px 8px' }}>Fwd vol</th><th style={{ padding:'4px 8px' }}>Weekday</th><th style={{ padding:'4px 8px' }}>Weekend</th>
            <th style={{ padding:'4px 8px' }}>Events</th><th style={{ textAlign:'left', padding:'4px 8px' }}>Spans</th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.tenor} className="font-mono" style={{ borderTop:'1px solid var(--border)', textAlign:'right' }}>
              <td style={{ textAlign:'left', padding:'5px 8px' }}>{r.tenor}</td>
              <td style={{ padding:'5px 8px', color:'var(--text-muted)' }}>{r.expiry.slice(0, 10)}</td>
              <td style={{ padding:'5px 8px', color:'var(--cyan)' }}>{pct(r.vol, 2)}</td>
              <td style={{ padding:'5px 8px' }}>{pct(r.fwd_vol, 2)}</td>
              <td style={{ padding:'5px 8px' }}>{pct(r.share.weekday, 0)}</td>
              <td style={{ padding:'5px 8px' }}>{pct(r.share.weekend, 0)}</td>
              <td style={{ padding:'5px 8px', color: r.share.events > 0.2 ? 'var(--red)' : undefined }}>{pct(r.share.events, 0)}</td>
              <td style={{ textAlign:'left', padding:'5px 8px', fontSize:10.5 }}>
                {r.events.map((t, i) => <span key={i} style={{ color:EV_COLOR[t], marginRight:4 }}>{t}</span>)}
              </td>
            </tr>))}</tbody>
        </table>
      </div>
    </Card>
  )
}

function FitTable({ fit }) {
  return (
    <Card title={`Fit by expiry · RMSE ${(fit.rmse_vol * 100).toFixed(2)} vol`}>
      <div style={{ overflowX:'auto', maxHeight:300 }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
          <thead><tr style={{ color:'var(--text-muted)', fontSize:10.5, textAlign:'right' }}>
            <th style={{ textAlign:'left', padding:'4px 8px' }}>Expiry</th><th style={{ padding:'4px 8px' }}>Days</th><th style={{ padding:'4px 8px' }}>Market</th>
            <th style={{ padding:'4px 8px' }}>Model</th><th style={{ padding:'4px 8px' }}>Error</th><th style={{ padding:'4px 8px' }}>Mkt fwd vol</th>
            <th style={{ padding:'4px 8px' }}>Event share</th></tr></thead>
          <tbody>{fit.expiries.map(r => (
            <tr key={r.time} className="font-mono" style={{ borderTop:'1px solid var(--border)', textAlign:'right',
              background: r.calendar_arb ? 'rgba(238,107,91,0.12)' : 'transparent' }}>
              <td style={{ textAlign:'left', padding:'5px 8px' }}>{r.label ?? r.time.slice(0, 10)}</td>
              <td style={{ padding:'5px 8px' }}>{r.days.toFixed(1)}</td>
              <td style={{ padding:'5px 8px', color:'#e4dcc3' }}>{pct(r.market_vol, 2)}</td>
              <td style={{ padding:'5px 8px', color:'var(--cyan)' }}>{pct(r.model_vol, 2)}</td>
              <td style={{ padding:'5px 8px', color: Math.abs(r.error_vol) > 0.01 ? 'var(--red)' : undefined }}>{(r.error_vol * 100).toFixed(2)}</td>
              <td style={{ padding:'5px 8px' }}>{r.calendar_arb ? <span style={{ color:'var(--red)' }}>ARB</span> : pct(r.fwd_vol_market, 1)}</td>
              <td style={{ padding:'5px 8px' }}>{pct(r.event_share, 0)}</td>
            </tr>))}</tbody>
        </table>
      </div>
      <div style={{ fontSize:10.5, color:'var(--text-muted)', padding:'6px 8px' }}>
        Red row = negative forward variance between consecutive expiries (calendar arbitrage). Errors &gt; 1 vol flag a mispriced expiry or an unmodelled event.
      </div>
    </Card>
  )
}

function EventList({ events }) {
  if (!events?.length) return null
  return (
    <div className="glass" style={{ borderRadius:8, padding:'6px 10px', marginBottom:12, fontSize:11, display:'flex', gap:12, flexWrap:'wrap' }}>
      <span style={{ color:'var(--text-muted)' }}>Scheduled events:</span>
      {events.slice(0, 10).map((e, i) => (
        <span key={i} className="font-mono" style={{ color:EV_COLOR[e.type] }}>{e.name} · {fmtTime(e.time)}</span>))}
    </div>
  )
}

// ─── Live Deribit fit ────────────────────────────────────────────────────────

function Live({ pair }) {
  const ccy = pair.slice(0, 3)
  const { data:d, error, loading } = useLoad(fetchEventVolCrypto, JSON.stringify(ccy))
  if (error) return <ErrorBox msg={`${error} — switch to "Model / fit quotes" to work offline.`} />
  if (!d) return <div style={{ fontSize:11, color:'var(--text-muted)', padding:12 }}>Fitting the live Deribit ATM curve…</div>
  const f = d.fit
  return (
    <div style={{ opacity: loading ? 0.6 : 1 }}>
      <Kpis items={[
        { label:'Base (ex-event) vol', value:pct(f.base_vol), sub:`flat-calendar ${pct(f.base_vol * Math.sqrt((5 + 2 * f.weekend_weight) / 7))}`,
          hint:'Weekday diffusive vol after removing event lumps' },
        { label:'Weekend weight', value:f.weekend_weight.toFixed(2), sub:'weekend hour ÷ weekday hour', color:'#d58fc0' },
        ...moveKpis(d.moves, d.spot, 0),
      ]} />
      <EventList events={d.events} />
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(420px, 1fr))', gap:12, marginBottom:12 }}>
        <CurveChart d={{ ...d, flat: f.base_vol * Math.sqrt((5 + 2 * f.weekend_weight) / 7) }}
          marketPoints={f.expiries.map(e => ({ time:e.time, vol:e.market_vol }))} />
        <FitTable fit={f} />
      </div>
      <TenorTable rows={d.tenors} />
      <div style={{ fontSize:10.5, color:'var(--text-muted)', marginTop:6 }}>
        {d.source}. Event types whose dates fall between two listed expiries are identified exactly; with daily Deribit expiries that is usually all of them.
      </div>
    </div>
  )
}

// ─── Model / quote fit (any pair) ─────────────────────────────────────────────

function parseQuotes(s) {
  return s.split(/[,;\n]+/).map(x => x.trim()).filter(Boolean).map(x => {
    const [days, vol] = x.split(/[:=\s]+/).map(Number)
    return Number.isFinite(days) && Number.isFinite(vol) && days > 0 && vol > 0 ? { days, vol: vol / 100 } : null
  }).filter(Boolean)
}

function Model({ pair }) {
  const { S, sigma } = usePortfolioStore()
  const dp = PAIR_META[pair]?.dp ?? 4
  const [p, setP] = useState(() => defaultsFor(pair, sigma))
  const set = (k) => (v) => setP(q => ({ ...q, [k]: v }))
  const setMove = (k) => (v) => setP(q => ({ ...q, moves:{ ...q.moves, [k]: v } }))
  const setCustom = (k) => (v) => setP(q => ({ ...q, custom:{ ...q.custom, [k]: v } }))
  const quotes = parseQuotes(p.quotes)
  const custom = p.custom.time ? [{ name:p.custom.name || 'Custom event', type:p.custom.type, time:new Date(p.custom.time + 'Z').toISOString() }] : []
  const body = { pair, S, base_vol:p.base_vol / 100, weekend_weight:p.weekend_weight, event_moves_pct:p.moves,
    quotes, fit_events:p.fitEvents, custom_events:custom, expiry_days:p.expiry_days > 0 ? p.expiry_days : null }
  const { data:d, error, loading } = useLoad(priceEventVol, JSON.stringify(body), p.base_vol > 0)
  const c = d?.calculator

  return (
    <div>
      <div className="glass" style={{ borderRadius:8, padding:10, marginBottom:12 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(110px, 1fr))', gap:10, alignItems:'end' }}>
          <Field label="Base vol σ_b (%)" value={p.base_vol} onChange={set('base_vol')} step={0.5} hint="Weekday, ex-event vol (ACT/365)" />
          <Field label="Weekend weight" value={p.weekend_weight} onChange={set('weekend_weight')} step={0.05} />
          {Object.keys(p.moves).map(k => <Field key={k} label={`${k} move (±%)`} value={p.moves[k]} onChange={setMove(k)} step={0.1} />)}
          <Field label="Calculator expiry (days)" value={p.expiry_days} onChange={set('expiry_days')} step={0.5} />
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'2fr 0.9fr 1fr 1.1fr 0.8fr', gap:10, alignItems:'end', marginTop:10 }}>
          <Field type="text" label="Market ATM quotes to fit — days:vol%, e.g. 7:21, 30:19.5, 91:18.8" value={p.quotes}
            onChange={set('quotes')} placeholder="leave blank to price from the assumptions" />
          <label title="Sparse tenors cannot pin event lumps; free them only with dense quotes around each event"
            style={{ display:'flex', flexDirection:'column', gap:3, fontSize:10.5, color:'var(--text-muted)' }}>Event lumps in fit
            <select value={p.fitEvents ? 'fit' : 'hold'} onChange={e => set('fitEvents')(e.target.value === 'fit')} style={inputStyle}>
              <option value="hold">Hold at my moves</option><option value="fit">Fit from quotes</option>
            </select>
          </label>
          <Field type="text" label="Custom event name" value={p.custom.name} onChange={setCustom('name')} placeholder="ECB / BoJ / election" />
          <Field type="datetime-local" label="Event time (UTC)" value={p.custom.time} onChange={setCustom('time')} />
          <label style={{ display:'flex', flexDirection:'column', gap:3, fontSize:10.5, color:'var(--text-muted)' }}>Event type
            <select value={p.custom.type} onChange={e => setCustom('type')(e.target.value)} style={inputStyle}>
              {['OTHER', 'FOMC', 'CPI', 'NFP'].map(t => <option key={t}>{t}</option>)}
            </select>
          </label>
        </div>
        <div style={{ fontSize:10.5, color:'var(--text-muted)', marginTop:6 }}>
          No free listed-option feed exists for {pair}: price from your own assumptions, or paste broker / OVML ATM quotes and the base vol
          {quotes.length >= 3 ? ' is fitted' : ' will be fitted (≥ 3 quotes)'}.
          Use the realised study below to anchor the weekend weight and FOMC move.
        </div>
      </div>
      {error && <ErrorBox msg={error} />}
      {d && (
        <div style={{ opacity: loading ? 0.6 : 1, transition:'opacity .2s' }}>
          <Kpis items={[
            ...(c ? [{ label:`Fair ATM vol · ${p.expiry_days}d`, value:pct(c.vol, 2), sub:`expiry ${c.expiry.slice(0, 16).replace('T', ' ')} UTC`,
              hint:'Model vol to the calculator expiry' },
              { label:'Variance mix', value:`${pct(c.share.events, 0)} events`, color: c.share.events > 0.25 ? 'var(--red)' : 'var(--cyan)',
                sub:`${pct(c.share.weekday, 0)} weekday · ${pct(c.share.weekend, 0)} weekend` }] : []),
            { label: d.fit ? 'Fitted base vol' : 'Base vol', value:pct(d.base_vol), sub:`flat-calendar ${pct(d.flat_calendar_vol)}` },
            ...(d.fit ? [{ label:'Quote fit RMSE', value:`${(d.fit.rmse_vol * 100).toFixed(2)} vol`, sub: d.fit.events_fixed ? 'events held at inputs' : 'events fitted' }] : []),
            ...moveKpis(d.moves, d.spot, dp),
          ]} />
          <EventList events={d.events} />
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(420px, 1fr))', gap:12, marginBottom:12 }}>
            <CurveChart d={{ ...d, flat:d.flat_calendar_vol }} marketPoints={d.fit ? d.fit.expiries.map(e => ({ time:e.time, vol:e.market_vol })) : null} />
            <TenorTable rows={d.tenors} />
          </div>
          {d.fit && <FitTable fit={d.fit} />}
        </div>
      )}
    </div>
  )
}

// ─── Realised study ───────────────────────────────────────────────────────────

function Realised({ pair }) {
  const { data:d, error } = useLoad(fetchEventVolRealised, JSON.stringify(pair))
  if (error) return <div style={{ fontSize:10.5, color:'var(--text-muted)', marginTop:12 }}>Realised study unavailable ({error}).</div>
  if (!d) return null
  return (
    <div style={{ marginTop:12, display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(420px, 1fr))', gap:12 }}>
      <Card title={`Realised vol by weekday · ${d.start} → ${d.end} (event days excluded)`}>
        <Plot data={[{ x:d.day_of_week.map(r => r.day), y:d.day_of_week.map(r => r.vol_ann * 100), type:'bar',
            marker:{ color:d.day_of_week.map(r => ['Sat', 'Sun', 'Mon'].includes(r.day) ? 'rgba(192,132,252,0.6)' : 'rgba(169,154,255,0.5)') },
            text:d.day_of_week.map(r => `n=${r.n}`), textposition:'outside', hovertemplate:'%{x}: %{y:.1f}%<extra></extra>' }]}
          layout={{ ...LAYOUT, showlegend:false, xaxis:axis(''), yaxis:axis('Close-to-close vol, ann. (%)') }}
          config={CFG} style={{ width:'100%', height:240 }} />
        <div style={{ fontSize:10.5, color:'var(--text-muted)', padding:'0 8px 4px' }}>
          {d.market === 'crypto' ? 'Weekend weight = Sat/Sun variance ÷ weekday variance.' : 'Monday spans the weekend: weight = (var Mon − var Tue–Fri) ÷ (2 · var Tue–Fri).'}
        </div>
      </Card>
      <Card title="What history says">
        <Kpis items={[
          { label:'Realised weekend weight', value: d.weekend_weight == null ? '—' : d.weekend_weight.toFixed(2), color:'#d58fc0' },
          { label:'Weekday vol (ex-FOMC)', value:pct(d.weekday_vol_ann) },
          ...(d.fomc ? [{ label:`FOMC lump (${d.fomc.n} meetings)`, value:`±${d.fomc.event_sd_pct.toFixed(2)}%`, color:EV_COLOR.FOMC,
            sub:`avg |2-day move| ${d.fomc.avg_abs_2d_move_pct.toFixed(2)}% vs ${d.fomc.normal_2d_sd_pct.toFixed(2)}% normal sd` }] : []),
        ]} />
        {d.fomc && (
          <div className="font-mono" style={{ fontSize:11, padding:'0 8px', display:'flex', gap:10, flexWrap:'wrap' }}>
            {d.fomc.recent.map(w => (
              <span key={w.date} style={{ color: w.move_2d_pct >= 0 ? 'var(--green)' : 'var(--red)' }}>{w.date.slice(2)} {w.move_2d_pct >= 0 ? '+' : ''}{w.move_2d_pct.toFixed(2)}%</span>))}
          </div>
        )}
        <div style={{ fontSize:10.5, color:'var(--text-muted)', padding:'8px' }}>
          Compare the implied lumps above with the realised one: implied &gt; realised is event vol risk premium you can sell (e.g. buy the
          weekly calendar, sell the event day); implied &lt; realised says the market is under-pricing the meeting.
        </div>
      </Card>
    </div>
  )
}
