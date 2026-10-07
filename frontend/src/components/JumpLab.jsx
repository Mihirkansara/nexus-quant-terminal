import { useEffect, useState } from 'react'
import _Plot from 'react-plotly.js'
const Plot = _Plot?.default ?? _Plot
import { usePortfolioStore, isCrypto, PAIR_META } from '../store/portfolio'
import { calibrateJumps, priceMerton } from '../api/client'

const LAYOUT = {
  paper_bgcolor:'transparent', plot_bgcolor:'#080d18',
  font:{ color:'#94a3b8', size:11 },
  margin:{ l:52, r:16, t:12, b:42 },
  legend:{ bgcolor:'transparent', font:{ size:9 }, orientation:'h', x:0, y:-0.22 },
  hoverlabel:{ bgcolor:'#0f172a', font:{ color:'#e2e8f0' }, bordercolor:'rgba(0,212,255,0.15)' },
}
const axis = (title, extra = {}) => ({ title:{ text:title }, gridcolor:'#1e293b', color:'#475569', zeroline:false, ...extra })
const pct = (v, d = 1) => (v == null ? '—' : (v * 100).toFixed(d) + '%')
const fmt = (v, d = 3) => (v == null ? '—' : Number(v).toFixed(d))

// Default event/gap jump assumptions for manual mode (per year, log-jump mean & sd).
const MANUAL_DEFAULTS = {
  metal:  { jump_intensity: 2,  jump_mean: -8, jump_sd: 8 },   // 2026 metals crashes: rare, large down-jumps
  fx:     { jump_intensity: 2,  jump_mean: -0.5, jump_sd: 1 },
  crypto: { jump_intensity: 12, jump_mean: -2, jump_sd: 6 },
}

export default function JumpLab() {
  const { pair } = usePortfolioStore()
  const [mode, setMode] = useState(null)
  const live = mode ?? (isCrypto(pair) ? 'live' : 'manual')
  return (
    <div style={{ padding:16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, marginBottom:12, flexWrap:'wrap' }}>
        <div>
          <div className="section-title">Jump Lab — Merton &amp; Bates jump-diffusion ({pair})</div>
          <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:2 }}>
            How much of the smile is jump risk vs stochastic vol · risk-neutral crash odds · feeds Hedge Lab
          </div>
        </div>
        <div style={{ display:'flex', gap:4 }}>
          {isCrypto(pair) && <Chip active={live === 'live'} onClick={() => setMode('live')}>Calibrate to Deribit</Chip>}
          <Chip active={live === 'manual'} onClick={() => setMode('manual')}>Manual Merton (event / gap risk)</Chip>
        </div>
      </div>
      {live === 'live' && isCrypto(pair) ? <Calibrated pair={pair} /> : <Manual key={pair} pair={pair} />}
      <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:10, lineHeight:1.5 }}>
        Merton (1976) lognormal jumps priced by the Poisson-weighted Black series on the forward. Bates (1996) = Heston
        stochastic variance + Merton jumps, priced with the COS method (Fang &amp; Oosterlee 2008) on the &quot;little Heston
        trap&quot; characteristic function (Albrecher et al. 2007). Calibration: bounded least squares on vega-weighted OTM
        prices across all Deribit expiries (≈ implied-vol errors). Densities from the same COS expansion.
      </div>
    </div>
  )
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

function SendToHedge({ jump }) {
  const setHedgeJump = usePortfolioStore(s => s.setHedgeJump)
  const [done, setDone] = useState(false)
  return (
    <button className="btn-ghost" style={{ fontSize:10 }} onClick={() => {
      setHedgeJump({ intensity:+jump.lambda.toFixed(2), mean:+(jump.mu_j * 100).toFixed(2), sd:+(jump.delta * 100).toFixed(2) })
      setDone(true)
    }}>{done ? '✓ Sent — open Hedge Lab' : '⚖ Use these jumps in Hedge Lab'}</button>
  )
}

function DensityChart({ d, title }) {
  return (
    <Card title={title}>
      <Plot data={[
          { x:d.spot, y:d.density, type:'scatter', mode:'lines', name:'Model (risk-neutral)', fill:'tozeroy',
            line:{ color:'#00d4ff', width:2 }, fillcolor:'rgba(0,212,255,0.08)' },
          { x:d.spot, y:d.lognormal, type:'scatter', mode:'lines', name:'Lognormal, same variance', line:{ color:'#ffd700', width:1.2, dash:'dash' } },
        ]}
        layout={{ ...LAYOUT, hovermode:'x unified', xaxis:axis('Price at horizon'), yaxis:axis('Density', { showticklabels:false }) }}
        config={{ responsive:true, displayModeBar:false }} style={{ width:'100%', height:280 }} />
      <div className="font-mono" style={{ fontSize:10, color:'var(--text-muted)', padding:'0 8px 4px' }}>
        P(−20%): <span style={{ color:'var(--red)' }}>{pct(d.p_down_20)}</span> vs {pct(d.p_down_20_lognormal)} lognormal ·
        P(+20%): <span style={{ color:'var(--green)' }}>{pct(d.p_up_20)}</span> vs {pct(d.p_up_20_lognormal)} lognormal
      </div>
    </Card>
  )
}

function Calibrated({ pair }) {
  const ccy = pair.slice(0, 3)
  const [nonce, setNonce] = useState(0)
  const [res, setRes] = useState({ key:null, data:null, error:null })
  const [idx, setIdx] = useState(null)
  const key = `${ccy}:${nonce}`
  useEffect(() => {
    let stale = false
    calibrateJumps(ccy)
      .then(data => { if (!stale) setRes({ key, data, error:null }) })
      .catch(e => { if (!stale) setRes({ key, data:null, error: e?.response?.data?.detail ?? e?.message ?? 'Calibration failed' }) })
    return () => { stale = true }
  }, [ccy, key])
  const loading = res.key !== key
  const d = res.data?.currency === ccy ? res.data : null
  if (res.error && !loading) return <ErrorBox msg={res.error} />
  if (!d) return (
    <div>
      <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:8 }}>Calibrating Merton and Bates to every Deribit {ccy} expiry…</div>
      <div className="skeleton" style={{ height:360, borderRadius:8 }}/>
    </div>
  )
  const b = d.fits.bates, m = d.fits.merton, sb = d.stats.bates
  const smiles = d.smiles
  const def = smiles.reduce((best, s, i) => Math.abs(s.days - 30) < Math.abs(smiles[best].days - 30) ? i : best, 0)
  const sel = smiles[idx ?? def]
  return (
    <div style={{ opacity: loading ? 0.6 : 1 }}>
      <Kpis items={[
        { label:'Bates fit RMSE', value:`${(b.rmse_vol * 100).toFixed(2)} vol`, sub:`${b.n_quotes} quotes · all expiries` },
        { label:'Merton fit RMSE', value:`${(m.rmse_vol * 100).toFixed(2)} vol`, color: m.rmse_vol > 2 * b.rmse_vol ? 'var(--amber)' : undefined,
          sub: m.rmse_vol > 2 * b.rmse_vol ? 'jumps alone miss the term structure' : 'jumps explain most of the smile' },
        { label:'Jumps / year (Bates)', value:fmt(sb.jumps_per_year, 1), sub:`mean ${sb.mean_jump_pct.toFixed(1)}% · sd ${sb.jump_sd_pct.toFixed(1)}%` },
        { label:'Jump share of variance', value:pct(sb.jump_variance_share, 0) },
        { label:'P(≥1 jump < −10%, 30d)', value:pct(sb.p_crash_jump, 1), color:'var(--red)' },
        { label:'Vol-of-vol ξ · spot-vol ρ', value:`${fmt(b.params.xi, 2)} · ${fmt(b.params.rho, 2)}`,
          sub:`κ ${fmt(b.params.kappa, 2)} · √θ ${pct(Math.sqrt(b.params.theta))}` },
      ]} />
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(420px, 1fr))', gap:12, marginBottom:12 }}>
        <Card title={`${ccy} smile · ${sel.label} · ${sel.days.toFixed(1)}d`} right={
          <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>{smiles.map((s, i) =>
            <Chip key={s.label} active={s === sel} onClick={() => setIdx(i)}>{s.label}</Chip>)}</div>}>
          <Plot data={[
              { x:sel.market.strikes, y:sel.market.iv.map(v => v * 100), type:'scatter', mode:'markers', name:'Deribit mark IV',
                marker:{ color:'#ffd700', size:6, line:{ color:'#0a0e1a', width:1 } } },
              { x:sel.grid, y:sel.bates.map(v => v == null ? null : v * 100), type:'scatter', mode:'lines', name:`Bates (${(sel.rmse_bates * 100).toFixed(2)})`, line:{ color:'#00d4ff', width:2.5 } },
              { x:sel.grid, y:sel.merton.map(v => v == null ? null : v * 100), type:'scatter', mode:'lines', name:`Merton (${(sel.rmse_merton * 100).toFixed(2)})`, line:{ color:'#c084fc', width:1.5, dash:'dash' } },
            ]}
            layout={{ ...LAYOUT, xaxis:axis('Strike'), yaxis:axis('Implied vol (%)'),
              shapes:[{ type:'line', x0:sel.forward, x1:sel.forward, yref:'paper', y0:0, y1:1, line:{ color:'rgba(255,215,0,0.35)', dash:'dot', width:1 } }] }}
            config={{ responsive:true, displayModeBar:false }} style={{ width:'100%', height:300 }} />
        </Card>
        <DensityChart d={d.density_30d} title="30-day risk-neutral density (Bates) vs lognormal" />
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(420px, 1fr))', gap:12 }}>
        <ParamTable b={b} m={m} smiles={smiles} />
        <Card title="Hand off" right={<button className="btn-ghost" style={{ fontSize:10 }} onClick={() => setNonce(n => n + 1)}>↻ Recalibrate</button>}>
          <div style={{ padding:'4px 8px', fontSize:11, color:'var(--text-muted)', lineHeight:1.6 }}>
            Send the calibrated Bates jump component (λ = {fmt(b.params.lambda, 2)}/yr, μ = {(b.params.mu_j * 100).toFixed(1)}%,
            δ = {(b.params.delta * 100).toFixed(1)}%) to Hedge Lab to stress your delta hedge with the jumps the options market is pricing.
            <div style={{ marginTop:8 }}><SendToHedge jump={b.params} /></div>
          </div>
        </Card>
      </div>
    </div>
  )
}

function ParamTable({ b, m, smiles }) {
  const rows = [
    ['σ / √v₀ (diffusion vol)', pct(m.params.sigma), pct(Math.sqrt(b.params.v0))],
    ['√θ (long-run vol)', '—', pct(Math.sqrt(b.params.theta))],
    ['κ (mean reversion)', '—', fmt(b.params.kappa, 2)],
    ['ξ (vol of vol)', '—', fmt(b.params.xi, 2)],
    ['ρ (spot-vol corr)', '—', fmt(b.params.rho, 2)],
    ['λ (jumps / yr)', fmt(m.params.lambda, 2), fmt(b.params.lambda, 2)],
    ['μ_J (mean log jump)', pct(m.params.mu_j), pct(b.params.mu_j)],
    ['δ (jump sd)', pct(m.params.delta), pct(b.params.delta)],
    ['Fit RMSE (vol pts)', (m.rmse_vol * 100).toFixed(2), (b.rmse_vol * 100).toFixed(2)],
  ]
  return (
    <Card title="Calibrated parameters">
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
        <thead><tr style={{ background:'var(--bg3)' }}>
          {['Parameter', 'Merton', 'Bates'].map((h, i) => <th key={h} style={{ padding:'6px 8px', fontSize:9, color:'var(--text-muted)', textAlign: i ? 'right' : 'left' }}>{h}</th>)}
        </tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r[0]} style={{ borderTop:'1px solid var(--border)' }}>
            <td style={{ padding:'5px 8px' }}>{r[0]}</td>
            <td className="font-mono" style={{ padding:'5px 8px', textAlign:'right', color:'#c084fc' }}>{r[1]}</td>
            <td className="font-mono" style={{ padding:'5px 8px', textAlign:'right', color:'var(--cyan)' }}>{r[2]}</td>
          </tr>
        ))}</tbody>
      </table>
      <div style={{ fontSize:9, color:'var(--text-muted)', padding:'6px 8px' }}>
        Per-expiry RMSE (Merton → Bates): {smiles.map(s => `${s.label} ${(s.rmse_merton * 100).toFixed(1)}→${(s.rmse_bates * 100).toFixed(1)}`).join(' · ')}
      </div>
    </Card>
  )
}

function ErrorBox({ msg }) {
  return <div style={{ padding:8, borderRadius:6, fontSize:11, background:'rgba(255,61,90,0.1)', border:'1px solid #ff3d5a', color:'#ff3d5a' }}>{msg}</div>
}

function Manual({ pair }) {
  const { S, sigma, T, r_d, r_f } = usePortfolioStore()
  const cls = PAIR_META[pair]?.assetClass ?? 'fx'
  const [p, setP] = useState(() => ({ sigma: +(sigma * 100 * 0.9).toFixed(2), T: +T, ...MANUAL_DEFAULTS[cls] }))
  const [res, setRes] = useState({ key:null, data:null, error:null })
  const body = { pair, S, r_d, r_f, T:p.T, sigma:p.sigma / 100, jump_intensity:p.jump_intensity,
    jump_mean:p.jump_mean / 100, jump_sd:p.jump_sd / 100 }
  const key = JSON.stringify(body)
  useEffect(() => {
    let stale = false
    priceMerton(JSON.parse(key))
      .then(data => { if (!stale) setRes({ key, data, error:null }) })
      .catch(e => { if (!stale) setRes({ key, data:null, error: e?.response?.data?.detail?.toString() ?? 'Pricing failed' }) })
    return () => { stale = true }
  }, [key])
  const d = res.data
  const field = (label, k, step) => (
    <label key={k} style={{ display:'flex', flexDirection:'column', gap:3, fontSize:9, color:'var(--text-muted)' }}>{label}
      <input type="number" value={p[k]} step={step} onChange={e => setP(q => ({ ...q, [k]: +e.target.value }))}
        style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:4, color:'var(--cyan)', fontSize:11,
          padding:'4px 6px', fontFamily:'var(--font-mono)', width:'100%' }} />
    </label>
  )
  return (
    <div>
      <div className="glass" style={{ borderRadius:8, padding:10, marginBottom:12 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(130px, 1fr))', gap:10, alignItems:'end' }}>
          {field('Diffusion σ (%)', 'sigma', 0.5)}
          {field('Tenor (years)', 'T', 0.05)}
          {field('Jumps / year', 'jump_intensity', 0.5)}
          {field('Mean jump (%)', 'jump_mean', 0.5)}
          {field('Jump sd (%)', 'jump_sd', 0.5)}
          {d && <SendToHedge jump={{ lambda:p.jump_intensity, mu_j:p.jump_mean / 100, delta:p.jump_sd / 100 }} />}
        </div>
        <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:6 }}>
          Model event and gap risk (CPI/FOMC days, weekend gaps, squeezes) that no listed-option feed is available for —
          e.g. silver&apos;s 2026 −25% day. Spot, rates and tenor come from the portfolio.
        </div>
      </div>
      {res.error && <ErrorBox msg={res.error} />}
      {d && (
        <>
          <Kpis items={[
            { label:'ATM vol', value:pct(d.atm_vol, 2), sub:`total vol ${pct(d.total_vol)}` },
            { label:'≈25Δ risk reversal', value:`${(d.rr_approx * 100).toFixed(2)} vol`, color: d.rr_approx < 0 ? 'var(--red)' : 'var(--green)' },
            { label:'≈25Δ butterfly', value:`${(d.bf_approx * 100).toFixed(2)} vol` },
            { label:`P(≥1 jump < −10%, ${d.stats.horizon_days}d)`, value:pct(d.stats.p_crash_jump, 1), color:'var(--red)' },
            { label:'Jump share of variance', value:pct(d.stats.jump_variance_share, 0) },
          ]} />
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(420px, 1fr))', gap:12 }}>
            <Card title={`Merton smile · ${pair} · T = ${p.T}y`}>
              <Plot data={[{ x:d.strikes, y:d.iv.map(v => v == null ? null : v * 100), type:'scatter', mode:'lines',
                  line:{ color:'#00d4ff', width:2.5 }, name:'Merton' },
                { x:[d.strikes[0], d.strikes.at(-1)], y:[p.sigma, p.sigma], type:'scatter', mode:'lines',
                  line:{ color:'rgba(255,255,255,0.25)', dash:'dash', width:1 }, name:'Diffusion σ' }]}
                layout={{ ...LAYOUT, xaxis:axis('Strike'), yaxis:axis('Implied vol (%)'),
                  shapes:[{ type:'line', x0:d.forward, x1:d.forward, yref:'paper', y0:0, y1:1, line:{ color:'rgba(255,215,0,0.35)', dash:'dot', width:1 } }] }}
                config={{ responsive:true, displayModeBar:false }} style={{ width:'100%', height:280 }} />
            </Card>
            <DensityChart d={d.density} title={`Risk-neutral density at T = ${p.T}y vs lognormal`} />
          </div>
        </>
      )}
    </div>
  )
}
