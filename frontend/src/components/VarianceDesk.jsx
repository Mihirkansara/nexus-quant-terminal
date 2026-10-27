import { useEffect, useState } from 'react'
import { Plus, RefreshCw, X } from 'lucide-react'
import _Plot from 'react-plotly.js'
const Plot = _Plot?.default ?? _Plot
import { usePortfolioStore, isCrypto, PAIR_META } from '../store/portfolio'
import { fetchVarianceCrypto, fetchVarianceSmile } from '../api/client'
import KpiStrip from './KpiStrip'

const LAYOUT = {
  paper_bgcolor:'transparent', plot_bgcolor:'#0a1511',
  font:{ family:"'Geist Variable', sans-serif", color:'#9eab9f', size:11 },
  margin:{ l:56, r:16, t:12, b:42 },
  legend:{ bgcolor:'transparent', font:{ size:10.5 }, orientation:'h', x:0, y:-0.22 },
  hoverlabel:{ bgcolor:'#0f1d18', font:{ color:'#ebe5d3' }, bordercolor:'rgba(169,154,255,0.15)' },
}
const CFG = { responsive:true, displayModeBar:false }
const axis = (title, extra = {}) => ({ title:{ text:title }, gridcolor:'#1c2e26', color:'#7e8f84', zeroline:false, ...extra })
const BONE = '#e4dcc3', BLUE = '#86abea', MAUVE = '#d58fc0', AXIS = '#7e8f84', WARN = '#f0914a'
const minus = (s) => s.replace(/^-/, '−')
const pct = (v, d = 1) => (v == null ? '—' : minus((v * 100).toFixed(d)) + '%')
const pts = (v, d = 1) => (v == null ? '—' : minus(`${v >= 0 ? '+' : ''}${(v * 100).toFixed(d)}`) + ' vol')
const prob = (v) => (v == null ? '—' : `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`)
const px = (v) => (v == null ? '—' : Number(v).toLocaleString(undefined, { maximumFractionDigits: v > 1000 ? 0 : v > 10 ? 2 : 4 }))

const Chip = ({ active, onClick, children }) => (
  <button onClick={onClick} className="font-mono" style={{ padding:'3px 9px', borderRadius:4, fontSize:10.5, cursor:'pointer',
    display:'inline-flex', alignItems:'center', gap:4,
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

const inputStyle = { background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:4, color:'var(--cyan)', fontSize:11,
  padding:'4px 6px', fontFamily:'var(--font-mono)', width:'100%' }
const th = (h, i) => <th key={h} style={{ padding:'4px 8px', textAlign: i ? 'right' : 'left', fontWeight:500 }}>{h}</th>
const td = (v, extra = {}) => <td style={{ padding:'5px 8px', ...extra }}>{v}</td>

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

const defaultTenors = (pair, sigma, smileQuotes) => {
  const metal = PAIR_META[pair]?.assetClass === 'metal'
  const atm = smileQuotes?.atm ?? +(sigma * 100).toFixed(2)
  const rr = smileQuotes?.rr25 ?? (metal ? 1.0 : -0.5)
  const bf = smileQuotes?.bf25 ?? 0.3
  return [1 / 12, 0.25, 0.5].map((T, i) => ({ id:i, T:+T.toFixed(4), atm, rr25:rr, bf25:bf }))
}

export default function VarianceDesk() {
  const { pair } = usePortfolioStore()
  return <Desk key={pair} pair={pair} />
}

function Desk({ pair }) {
  const { S, sigma, r_d, r_f, smileQuotes } = usePortfolioStore()
  const crypto = isCrypto(pair)
  const [mode, setMode] = useState(crypto ? 'live' : 'quotes')
  const [nonce, setNonce] = useState(0)
  const [tenors, setTenors] = useState(() => defaultTenors(pair, sigma, smileQuotes))
  const [volvol, setVolvol] = useState('')
  const live = mode === 'live' && crypto
  const liveRes = useLoad(fetchVarianceCrypto, JSON.stringify({ ccy: pair.slice(0, 3), nonce }), live)
  const body = { pair, S, r_d, r_f, tenors: tenors.filter(t => t.T > 0 && t.atm > 0)
    .map(t => ({ T:t.T, atm:t.atm / 100, rr25:t.rr25 / 100, bf25:t.bf25 / 100 })), ...(volvol !== '' ? { volvol:+volvol } : {}) }
  const quoteRes = useLoad(fetchVarianceSmile, JSON.stringify(body), !live && body.tenors.length > 0)
  const res = live ? liveRes : quoteRes
  const d = res.data
  const setT = (id, k, v) => setTenors(ts => ts.map(t => (t.id === id ? { ...t, [k]: v } : t)))

  return (
    <div style={{ padding:16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, marginBottom:12, flexWrap:'wrap' }}>
        <div>
          <div className="section-title" style={{ color:'var(--text-muted)', letterSpacing:'0.08em' }}>{pair}{live ? ' · Deribit' : ' · quotes'}</div>
          <div style={{ fontSize:10.5, color:'var(--text-muted)', marginTop:2 }}>
            What variance costs, what the options say about the tails, and whether selling vol has paid
          </div>
        </div>
        <div style={{ display:'flex', gap:4, alignItems:'center', flexWrap:'wrap' }}>
          {crypto && <Chip active={live} onClick={() => setMode('live')}>Live Deribit chain</Chip>}
          <Chip active={!live} onClick={() => setMode('quotes')}>ATM / RR / BF quotes</Chip>
          {live && <Chip onClick={() => setNonce(n => n + 1)}><RefreshCw size={13} aria-hidden="true" />Refresh</Chip>}
        </div>
      </div>
      {!live && (
        <div className="glass" style={{ borderRadius:8, padding:10, marginBottom:12 }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
            <thead><tr style={{ color:'var(--text-muted)', fontSize:10.5 }}>
              {['Tenor (years)', 'ATM vol (%)', '25Δ RR (vol pts)', '25Δ BF (vol pts)', ''].map((h, i) => <th key={i} style={{ textAlign:'left', padding:'2px 4px', fontWeight:500 }}>{h}</th>)}
            </tr></thead>
            <tbody>{tenors.map(t => (
              <tr key={t.id}>
                {['T', 'atm', 'rr25', 'bf25'].map(k => (
                  <td key={k} style={{ padding:'2px 4px' }}>
                    <input type="number" aria-label={`${k} for tenor ${t.T}`} value={t[k]} step={k === 'T' ? 0.05 : k === 'atm' ? 0.5 : 0.1}
                      onChange={e => setT(t.id, k, +e.target.value)} style={inputStyle} />
                  </td>))}
                <td style={{ width:28 }}>
                  {tenors.length > 1 && <button aria-label="Remove tenor" onClick={() => setTenors(ts => ts.filter(x => x.id !== t.id))}
                    style={{ background:'transparent', border:'none', color:'var(--text-muted)', cursor:'pointer' }}><X size={14} /></button>}
                </td>
              </tr>))}</tbody>
          </table>
          <div style={{ display:'flex', gap:10, alignItems:'center', marginTop:8, flexWrap:'wrap' }}>
            <Chip onClick={() => setTenors(ts => [...ts, { ...ts[ts.length - 1], id: Math.max(...ts.map(x => x.id)) + 1, T: +(ts[ts.length - 1].T * 2).toFixed(4) }])}>
              <Plus size={13} aria-hidden="true" />Tenor</Chip>
            <label style={{ fontSize:10.5, color:'var(--text-muted)', display:'flex', gap:6, alignItems:'center' }}>Vol of vol ν
              <input type="number" step={0.05} placeholder="from index" value={volvol} onChange={e => setVolvol(e.target.value)} style={{ ...inputStyle, width:90 }} />
            </label>
            <span style={{ fontSize:10.5, color:'var(--text-muted)' }}>
              {smileQuotes ? 'Pre-filled from Vol Smile / Vol Lab. ' : 'Enter your desk quotes per tenor. '}Each tenor's vanna-volga smile is smoothed with raw SVI before replication.
            </span>
          </div>
        </div>
      )}
      {res.error && <div style={{ padding:8, borderRadius:6, fontSize:11, marginBottom:10, background:'rgba(238,107,91,0.1)', border:'1px solid #ee6b5b', color:'#ee6b5b' }}>{res.error}</div>}
      {!d && !res.error && <div style={{ fontSize:11, color:'var(--text-muted)', padding:12 }}>Replicating variance…</div>}
      {d && <Body key={d.expiries.map(e => e.expiry).join()} d={d} loading={res.loading} />}
    </div>
  )
}

function Body({ d, loading }) {
  const ref = d.expiries.reduce((a, e) => (Math.abs(e.days - 30) < Math.abs(a.days - 30) ? e : a), d.expiries[0])
  const [sel, setSel] = useState(ref.expiry)
  const e = d.expiries.find(x => x.expiry === sel) ?? ref
  const cm = d.constant_maturity_30d
  const v = d.vrp
  const m = e.moments
  const replicated = cm ? (cm.listed_vol ?? cm.continuous_vol) : null
  const arb = d.forward_vols.filter(f => f.calendar_arbitrage)
  return (
    <div style={{ opacity: loading ? 0.6 : 1, transition:'opacity .2s' }}>
      <KpiStrip items={[
        cm && { label: e.listed ? '30d variance, replicated' : '30d variance strike', value:pct(replicated, 2),
          sub: d.live_index != null ? `${d.live_index_label} ${d.live_index.toFixed(2)} · gap ${pts(replicated - d.live_index / 100, 2)}` : `${cm.from_days.toFixed(0)}d / ${cm.to_days.toFixed(0)}d interpolated`,
          hint:'Cboe VIX method on the listed strikes, interpolated to 30 days' },
        { label:`Var-swap strike · ${e.expiry}`, value:pct(e.var_vol, 2), sub:`ATM ${pct(e.atm_iv, 2)} · skew premium ${pts(e.var_vol - e.atm_iv, 2)}` },
        { label:'Vol-swap strike', value:pct(e.vol_swap, 2), sub:`convexity ${pts(e.vol_swap - e.var_vol, 2)} · ν ${d.volvol?.toFixed(2)}` },
        { label:'Implied skew / kurtosis', value:`${minus(m.skew?.toFixed(2) ?? '—')} / ${m.kurtosis?.toFixed(2) ?? '—'}`,
          sub:'log return, BKM (normal = 0 / 3)', color: m.skew < -0.3 ? WARN : undefined },
        { label:'Expected move to expiry', value:`±${pct(e.expected_move_pct, 2)}`, sub:`±${px(e.expected_move)} · ATM straddle` },
        d.trailing_realised != null && { label:'Realised 30d vs var strike', value:pct(d.trailing_realised, 1),
          sub:`premium ${pts(e.var_vol - d.trailing_realised, 1)}`, color: e.var_vol - d.trailing_realised < 0 ? 'var(--red)' : undefined },
        v && v.hit_rate != null && { label:`Short 30d variance won`, value:prob(v.hit_rate),
          sub:`${v.n} days · avg ${pts(v.mean_vrp, 1)} · worst ${pts(v.worst_short_var_pnl, 1)}`, hint:`${v.index}: implied at t vs realised over the next 30 days` },
      ]} />
      {arb.length > 0 && <div style={{ fontSize:11, margin:'10px 0', padding:'6px 10px', borderRadius:6, border:`1px solid ${WARN}`, color:WARN }}>
        Calendar arbitrage: total variance falls between {arb.map(a => `${a.from_days.toFixed(0)}d → ${a.to_days.toFixed(0)}d`).join(', ')}.</div>}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(440px, 1fr))', gap:12, marginTop:12 }}>
        <Card title="Term structure — ATM, variance, vol swap, forward vol">
          <TermChart d={d} />
        </Card>
        <Card title={`Implied distribution · ${e.expiry} (${e.days.toFixed(0)}d)`}
          right={<div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>{d.expiries.map(x =>
            <Chip key={x.expiry} active={x.expiry === e.expiry} onClick={() => setSel(x.expiry)}>{x.expiry.length > 6 ? x.expiry.slice(5) : x.expiry}</Chip>)}</div>}>
          <DensityChart e={e} />
        </Card>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(440px, 1fr))', gap:12, marginTop:12 }}>
        <Card title={`Probability ladder · ${e.expiry} · F ${px(e.forward)}`}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
              <thead><tr style={{ color:'var(--text-muted)', fontSize:10.5 }}>
                {['Move', 'Level', 'Finish beyond', 'Touch (≈2×)', 'History, same horizon', 'Options vs history'].map(th)}</tr></thead>
              <tbody>{e.ladder.map(r => {
                const ratio = r.p_physical_beyond >= 0.01 ? r.p_terminal_beyond / r.p_physical_beyond : null   // too few samples below 1%
                return (
                  <tr key={r.move} className="font-mono" style={{ borderTop:'1px solid var(--border)', textAlign:'right' }}>
                    {td(minus(`${r.move > 0 ? '+' : ''}${(r.move * 100).toFixed(0)}%`), { textAlign:'left' })}
                    {td(px(r.level))}{td(prob(r.p_terminal_beyond))}{td(prob(r.p_touch))}
                    {td(prob(r.p_physical_beyond))}
                    {td(ratio == null || !isFinite(ratio) ? '—' : `${ratio.toFixed(2)}×`, { color: ratio > 1.5 ? WARN : undefined })}
                  </tr>)
              })}</tbody>
            </table>
          </div>
          <div style={{ fontSize:10.5, color:'var(--text-muted)', padding:'6px 8px', lineHeight:1.5 }}>
            Finish beyond = P(S<sub>T</sub> past the level) from the Breeden-Litzenberger density. Touch uses the driftless reflection rule.
            History counts demeaned overlapping returns of the same length; a ratio above 1 means the options pay more for that tail than history delivered (shown when history has at least 1%).
          </div>
        </Card>
        {v && v.series?.length ? (
          <Card title={`Variance risk premium · ${v.index} vs the 30 days that followed`}>
            <VrpChart v={v} />
          </Card>
        ) : (
          <Card title="Variance risk premium">
            <div style={{ fontSize:11, color:'var(--text-muted)', padding:12 }}>No implied-vol index history for {d.pair} (DVOL covers BTC/ETH; GVZ/VXSLV cover gold/silver), or the history source is offline.</div>
          </Card>
        )}
      </div>
      <div style={{ marginTop:12 }}>
        <Card title="Expiry ladder — variance replication and implied moments">
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
              <thead><tr style={{ color:'var(--text-muted)', fontSize:10.5 }}>
                {['Expiry', 'Days', 'Forward', 'ATM', '√K_var', 'Listed (Cboe)', 'Truncation', 'Vol swap', 'Fwd vol', 'Skew', 'Kurt', '5% / 95%', 'SVI RMSE'].map(th)}</tr></thead>
              <tbody>{d.expiries.map((x, i) => {
                const f = i > 0 ? d.forward_vols[i - 1] : null
                return (
                  <tr key={x.expiry} className="font-mono" onClick={() => setSel(x.expiry)}
                    style={{ borderTop:'1px solid var(--border)', textAlign:'right', cursor:'pointer', background: x.expiry === e.expiry ? 'rgba(169,154,255,0.06)' : undefined }}>
                    {td(x.expiry, { textAlign:'left' })}{td(x.days.toFixed(0))}{td(px(x.forward))}{td(pct(x.atm_iv, 1))}
                    {td(pct(x.var_vol, 2))}{td(x.listed ? `${pct(x.listed.vol, 2)} · ${x.listed.n_strikes}K` : '—')}
                    {td(x.truncation_gap == null ? '—' : pts(x.truncation_gap, 2))}{td(pct(x.vol_swap, 2))}
                    {td(f ? (f.calendar_arbitrage ? 'arb' : pct(f.fwd_vol, 1)) : '—', { color: f?.calendar_arbitrage ? WARN : undefined })}
                    {td(minus(x.moments.skew?.toFixed(2) ?? '—'))}{td(x.moments.kurtosis?.toFixed(2) ?? '—')}
                    {td(`${pct(x.quantiles['0.05'].move, 1)} / ${pct(x.quantiles['0.95'].move, 1)}`)}
                    {td(`${(x.svi_rmse * 100).toFixed(2)}`)}
                  </tr>)
              })}</tbody>
            </table>
          </div>
        </Card>
      </div>
      <div style={{ fontSize:10.5, color:'var(--text-muted)', marginTop:10, lineHeight:1.5 }}>
        {d.source}. Variance swaps: Demeterfi, Derman, Kamal &amp; Zou (1999); discrete index per the Cboe VIX methodology (as Deribit DVOL).
        Vol swap ≈ √K<sub>var</sub>·e<sup>−ν²T/6</sup> (lognormal realised variance, after Brockhaus &amp; Long 2000; understates the adjustment when jumps dominate).
        Moments: Bakshi, Kapadia &amp; Madan (2003). Density: Breeden &amp; Litzenberger (1978) on raw SVI (Gatheral 2004).
        VRP P&amp;L per unit vega notional: (K<sub>var</sub> − RV²)/(2√K<sub>var</sub>), before costs.
      </div>
    </div>
  )
}

function TermChart({ d }) {
  const xs = d.expiries.map(e => e.days)
  const fwdX = d.forward_vols.flatMap(f => [f.from_days, f.to_days, null])
  const fwdY = d.forward_vols.flatMap(f => [f.fwd_vol, f.fwd_vol, null].map(v => (v == null ? null : v * 100)))
  return (
    <Plot data={[
        { x:xs, y:d.expiries.map(e => e.atm_iv * 100), type:'scatter', mode:'lines+markers', name:'ATM', line:{ color:AXIS, width:1.5 } },
        { x:xs, y:d.expiries.map(e => e.var_vol * 100), type:'scatter', mode:'lines+markers', name:'√K_var (wide strikes)', line:{ color:BONE, width:2 } },
        { x:xs, y:d.expiries.map(e => (e.listed ? e.listed.vol * 100 : null)), type:'scatter', mode:'markers', name:'Listed strikes (Cboe)',
          marker:{ color:BONE, symbol:'diamond-open', size:9 } },
        { x:xs, y:d.expiries.map(e => (e.vol_swap ?? 0) * 100), type:'scatter', mode:'lines', name:'Vol swap', line:{ color:MAUVE, width:1.5, dash:'dash' } },
        { x:fwdX, y:fwdY, type:'scatter', mode:'lines', name:'Forward vol', line:{ color:BLUE, width:1.5 } },
        ...(d.live_index != null ? [{ x:[30], y:[d.live_index], type:'scatter', mode:'markers', name:d.live_index_label ?? 'Vol index',
          marker:{ color:BLUE, symbol:'star', size:12 } }] : []),
        ...(d.trailing_realised != null ? [{ x:[Math.min(...xs), Math.max(...xs)], y:[d.trailing_realised * 100, d.trailing_realised * 100], type:'scatter',
          mode:'lines', name:'Realised 30d', line:{ color:AXIS, dash:'dot', width:1 } }] : []),
      ]}
      layout={{ ...LAYOUT, hovermode:'x unified', margin:{ ...LAYOUT.margin, b:36 }, legend:{ ...LAYOUT.legend, y:-0.3 },
        xaxis:axis('Days to expiry', { title:{ text:'Days to expiry', standoff:4 } }), yaxis:axis('Vol (%)') }}
      config={CFG} style={{ width:'100%', height:340 }} />
  )
}

function DensityChart({ e }) {
  const den = e.density
  const q = e.quantiles
  return (
    <Plot data={[
        { x:den.strikes, y:den.rnd, type:'scatter', mode:'lines', name:'Risk-neutral (options)', line:{ color:BONE, width:2 },
          fill:'tozeroy', fillcolor:'rgba(228,220,195,0.07)' },
        { x:den.strikes, y:den.lognormal, type:'scatter', mode:'lines', name:'Lognormal, ATM vol', line:{ color:BLUE, width:1.3, dash:'dash' } },
        ...(den.physical ? [{ x:den.strikes, y:den.physical, type:'scatter', mode:'lines', name:'History (demeaned)', line:{ color:MAUVE, width:1.3 } }] : []),
      ]}
      layout={{ ...LAYOUT, hovermode:'x unified', xaxis:axis('Price at expiry'), yaxis:axis('Density', { showticklabels:false }),
        shapes:[e.forward, q['0.05'].level, q['0.95'].level].map((x, i) => ({ type:'line', x0:x, x1:x, yref:'paper', y0:0, y1:1,
          line:{ color: i ? 'rgba(126,143,132,0.6)' : 'rgba(235,229,211,0.45)', dash: i ? 'dot' : 'dash', width:1 } })),
        annotations:[['5%', q['0.05'].level], ['95%', q['0.95'].level]].map(([t, x]) => ({ x, yref:'paper', y:1, text:t, showarrow:false,
          font:{ size:10, color:AXIS }, yanchor:'bottom' })) }}
      config={CFG} style={{ width:'100%', height:340 }} />
  )
}

function VrpChart({ v }) {
  const s = v.series
  return (
    <Plot data={[
        { x:s.map(r => r.date), y:s.map(r => r.implied * 100), type:'scatter', mode:'lines', name:'Implied 30d (at t)', line:{ color:BLUE, width:1.5 } },
        { x:s.map(r => r.date), y:s.map(r => (r.realised_fwd == null ? null : r.realised_fwd * 100)), type:'scatter', mode:'lines',
          name:'Realised over next 30d', line:{ color:BONE, width:1.3 } },
        { x:s.map(r => r.date), y:s.map(r => (r.vrp == null ? null : r.vrp * 100)), type:'bar', name:'Premium (vol pts)', yaxis:'y2',
          marker:{ color:s.map(r => (r.vrp == null ? 'transparent' : r.vrp >= 0 ? 'rgba(79,198,144,0.35)' : 'rgba(238,107,91,0.45)')) } },
      ]}
      layout={{ ...LAYOUT, hovermode:'x unified', bargap:0, xaxis:axis('', { type:'date' }), yaxis:axis('Vol (%)'),
        yaxis2:{ overlaying:'y', side:'right', showgrid:false, zeroline:true, zerolinecolor:'#2a4137', color:AXIS, title:{ text:'Premium' } } }}
      config={CFG} style={{ width:'100%', height:300 }} />
  )
}
