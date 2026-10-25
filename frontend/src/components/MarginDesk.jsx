import { useEffect, useState } from 'react'
import _Plot from 'react-plotly.js'
const Plot = _Plot?.default ?? _Plot
import { usePortfolioStore, isCrypto, PAIR_META } from '../store/portfolio'
import { fetchMarginBook } from '../api/client'
import KpiStrip from './KpiStrip'
import { num } from '../lib/format'

const LAYOUT = {
  paper_bgcolor:'transparent', plot_bgcolor:'#0a1511',
  font:{ family:"'Geist Variable', sans-serif", color:'#9eab9f', size:11 },
  margin:{ l:62, r:16, t:12, b:42 },
  legend:{ bgcolor:'transparent', font:{ size:10.5 }, orientation:'h', x:0, y:-0.22 },
  hoverlabel:{ bgcolor:'#0f1d18', font:{ color:'#ebe5d3' }, bordercolor:'rgba(169,154,255,0.15)' },
}
const CFG = { responsive:true, displayModeBar:false }
const axis = (title, extra = {}) => ({ title:{ text:title }, gridcolor:'#1c2e26', color:'#7e8f84', zeroline:false, ...extra })
const pct = (v, d = 1) => (v == null ? '—' : (v * 100).toFixed(d) + '%')

function useLoad(fn, key, enabled = true) {
  const [res, setRes] = useState({ key:null, data:null, error:null })
  useEffect(() => {
    if (!enabled) return
    let stale = false
    const t = setTimeout(() => {
      fn(JSON.parse(key))
        .then(data => { if (!stale) setRes({ key, data, error:null }) })
        .catch(e => { if (!stale) setRes({ key, data:null, error: e?.response?.data?.detail?.toString() ?? 'Request failed — is the backend up?' }) })
    }, 400)
    return () => { stale = true; clearTimeout(t) }
  }, [fn, key, enabled])
  return { ...res, loading: res.key !== key }
}

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

const inputStyle = { background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:4, color:'var(--cyan)', fontSize:11,
  padding:'4px 6px', fontFamily:'var(--font-mono)', width:'100%' }

function Field({ label, value, onChange, step, hint, placeholder }) {
  return (
    <label title={hint} style={{ display:'flex', flexDirection:'column', gap:3, fontSize:10.5, color:'var(--text-muted)' }}>{label}
      <input type="number" value={value} step={step} placeholder={placeholder}
        onChange={e => onChange(e.target.value === '' ? '' : +e.target.value)} style={inputStyle} />
    </label>
  )
}

export default function MarginDesk() {
  const { pair } = usePortfolioStore()
  return <Desk key={pair} pair={pair} />
}

function Desk({ pair }) {
  const { legs, S, sigma, r_d, r_f, hedgeJump } = usePortfolioStore()
  const crypto = isCrypto(pair)
  const dp = PAIR_META[pair]?.dp ?? 2
  const [p, setP] = useState(() => ({ method:'', psr:'', vsr:'', hedge:0, equity:'', hike:50, days:10, beta:-0.5,
    jumps: !!hedgeJump || crypto, jump: hedgeJump ?? (crypto ? { intensity:12, mean:-2, sd:6 } : { intensity:2, mean:-4, sd:5 }) }))
  const set = (k) => (v) => setP(q => ({ ...q, [k]: v }))
  const setJ = (k) => (v) => setP(q => ({ ...q, jump:{ ...q.jump, [k]: v } }))
  const options = legs.map(({ type, K, T, qty }) => ({ type, K:+K, T:+T, qty:+qty }))
  const body = { pair, S, sigma, r_d, r_f, options, hedge_units:p.hedge || 0,
    psr_pct: p.psr === '' ? null : p.psr, vsr_pts: p.vsr === '' ? null : p.vsr, hike_pct:p.hike, equity: p.equity === '' ? null : p.equity,
    method: p.method || null, days:p.days, spot_vol_beta:p.beta,
    jump_intensity: p.jumps ? p.jump.intensity : 0, jump_mean: p.jumps ? p.jump.mean / 100 : 0, jump_sd: p.jumps ? p.jump.sd / 100 : 0 }
  const { data:d, error, loading } = useLoad(fetchMarginBook, JSON.stringify(body), options.length > 0 || p.hedge !== 0)

  return (
    <div style={{ padding:16 }}>
      <div style={{ marginBottom:12 }}>
        <div className="section-title" style={{ color:'var(--text-muted)', letterSpacing:'0.08em' }}>{pair} · {legs.length} legs</div>
        <div style={{ fontSize:10.5, color:'var(--text-muted)', marginTop:2 }}>
          What the exchange will charge for this book, what a margin hike does, and how likely you are to be called or liquidated
        </div>
      </div>
      <div className="glass" style={{ borderRadius:8, padding:10, marginBottom:12 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(112px, 1fr))', gap:10, alignItems:'end' }}>
          <label style={{ display:'flex', flexDirection:'column', gap:3, fontSize:10.5, color:'var(--text-muted)' }}>Margin model
            <select value={p.method} onChange={e => set('method')(e.target.value)} style={inputStyle}>
              <option value="">Auto ({crypto ? 'Deribit PM' : 'CME SPAN'})</option><option value="span">CME SPAN-style</option><option value="pm">Deribit PM-style</option>
            </select>
          </label>
          <Field label="Price scan (% spot)" value={p.psr} onChange={set('psr')} step={0.5} placeholder="auto" hint="CME % margin; auto: gold 5, silver 10, BTC 25, ETH 30" />
          <Field label="Vol scan (vol pts)" value={p.vsr} onChange={set('vsr')} step={1} placeholder="auto" />
          <Field label="Hedge units (spot/perp)" value={p.hedge} onChange={set('hedge')} step={0.1} />
          <Field label="Account equity" value={p.equity} onChange={set('equity')} step={100} placeholder="1.5× initial" />
          <Field label="Margin hike (%)" value={p.hike} onChange={set('hike')} step={10} hint="Jan-2026 COMEX silver: 11 → 15 → 18 % (+64 %)" />
          <Field label="Horizon (days)" value={p.days} onChange={set('days')} step={1} />
          <Field label="Spot-vol beta" value={p.beta} onChange={set('beta')} step={0.1} hint="d ln σ / d ln S for the simulation" />
          <label style={{ display:'flex', flexDirection:'column', gap:3, fontSize:10.5, color:'var(--text-muted)' }}>Paths
            <select value={p.jumps ? 'jump' : 'gbm'} onChange={e => set('jumps')(e.target.value === 'jump')} style={inputStyle}>
              <option value="gbm">GBM</option><option value="jump">Merton jumps</option>
            </select>
          </label>
          {p.jumps && <>
            <Field label="Jumps / yr" value={p.jump.intensity} onChange={setJ('intensity')} step={1} />
            <Field label="Mean jump (%)" value={p.jump.mean} onChange={setJ('mean')} step={0.5} />
            <Field label="Jump sd (%)" value={p.jump.sd} onChange={setJ('sd')} step={0.5} />
          </>}
        </div>
      </div>
      {options.length === 0 && p.hedge === 0 && <div style={{ fontSize:11, color:'var(--text-muted)', padding:12 }}>Add option legs in the portfolio builder.</div>}
      {error && <div style={{ padding:8, borderRadius:6, fontSize:11, marginBottom:10, background:'rgba(238,107,91,0.1)', border:'1px solid #ee6b5b', color:'#ee6b5b' }}>{error}</div>}
      {d && <Body d={d} dp={dp} loading={loading} S={S} />}
    </div>
  )
}

function Body({ d, dp, loading, S }) {
  const sim = d.simulation
  const base = d.ladder[0]
  const stressed = d.ladder[1]
  const span = d.span
  const worst = span.scenarios.find(s => s.scenario === span.worst_scenario)
  return (
    <div style={{ opacity: loading ? 0.6 : 1, transition:'opacity .2s' }}>
      <Kpis items={[
        { label:`Initial margin (${d.method === 'pm' ? 'PM' : 'SPAN'})`, value:num(d.initial, dp),
          sub: d.method === 'span' ? `binding: ${span.binding}` : `MM ${num(d.maintenance, dp)}` },
        { label:'Equity / excess', value:num(d.equity, dp), sub:`excess ${num(d.excess, dp)}`, color: d.excess >= 0 ? 'var(--green)' : 'var(--red)' },
        { label:`After +${d.hike.pct}% margin hike`, value:num(d.hike.requirement, dp), color:'#f0914a',
          sub: d.hike.cash_call > 0 ? `cash call ${num(d.hike.cash_call, dp)}` : `excess ${num(d.hike.excess_after, dp)}` },
        { label:`P(margin call) · ${sim.days}d`, value:pct(sim.p_margin_call), color: sim.p_margin_call > 0.2 ? 'var(--red)' : '#e4dcc3',
          sub: sim.median_days_to_call ? `median day ${sim.median_days_to_call}` : 'no calls in sample' },
        { label:'P(liquidation)', value:pct(sim.p_liquidation), color:'var(--red)', hint:'Equity below 50 % of maintenance or ≤ 0' },
        { label:'Call levels (vol flat)', value: base.in_call_now ? 'IN CALL NOW' : `${num(base.call_below, dp)} / ${num(base.call_above, dp)}`,
          sub: stressed.in_call_now ? 'vol ×1.5: in call at today’s spot' : `vol ×1.5: ${num(stressed.call_below, dp)} / ${num(stressed.call_above, dp)}`,
          color: base.in_call_now ? 'var(--red)' : '#e4dcc3' },
        { label:'SPAN vs PM', value:`${num(d.span.requirement, dp)} / ${num(d.pm.initial, dp)}`, sub:`scan ${d.psr_pct}% · vol ${d.vsr_pts} pts` },
      ]} />
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(440px, 1fr))', gap:12 }}>
        <Card title="Equity vs maintenance requirement across spot">
          <Plot data={[
              { x:base.spot, y:base.equity, type:'scatter', mode:'lines', name:'Equity (vol flat)', line:{ color:'#86abea', width:2 } },
              { x:base.spot, y:base.maintenance, type:'scatter', mode:'lines', name:'Maintenance (vol flat)', line:{ color:'#e4dcc3', width:1.5, dash:'dash' } },
              { x:stressed.spot, y:stressed.equity, type:'scatter', mode:'lines', name:'Equity (vol ×1.5)', line:{ color:'#d58fc0', width:1.3 } },
              { x:stressed.spot, y:stressed.maintenance, type:'scatter', mode:'lines', name:'Maintenance (vol ×1.5)', line:{ color:'#f0914a', width:1.2, dash:'dot' } },
            ]}
            layout={{ ...LAYOUT, hovermode:'x unified', xaxis:axis('Spot'), yaxis:axis('Value'),
              shapes:[S, base.call_below, base.call_above].filter(x => x != null).map((x, i) => ({ type:'line', x0:x, x1:x, yref:'paper', y0:0, y1:1,
                line:{ color: i ? '#ee6b5b' : '#ebe5d3', dash: i ? 'dot' : 'solid', width:1 } })) }}
            config={CFG} style={{ width:'100%', height:300 }} />
          <div style={{ fontSize:10.5, color:'var(--text-muted)', padding:'0 8px 4px' }}>Red lines: spot levels at which the account is called (vol unchanged).</div>
        </Card>
        <Card title={`SPAN — 16 scenarios (worst #${span.worst_scenario}: ${worst.price_pct >= 0 ? '+' : ''}${worst.price_pct.toFixed(1)}%, vol ${worst.vol_move_pts >= 0 ? '+' : ''}${worst.vol_move_pts})`}>
          <Plot data={[{ x:span.scenarios.map(s => `#${s.scenario}`), y:span.scenarios.map(s => s.pnl * s.cover), type:'bar',
              marker:{ color:span.scenarios.map(s => s.scenario === span.worst_scenario ? '#ee6b5b' : s.pnl < 0 ? 'rgba(238,107,91,0.45)' : 'rgba(79,198,144,0.45)') },
              customdata:span.scenarios.map(s => `${s.price_pct >= 0 ? '+' : ''}${s.price_pct.toFixed(1)}% · vol ${s.vol_move_pts >= 0 ? '+' : ''}${s.vol_move_pts}${s.cover < 1 ? ` · ${Math.round(s.cover * 100)}% counted` : ''}`),
              hovertemplate:'%{x}: %{y:.2f}<br>%{customdata}<extra></extra>' }]}
            layout={{ ...LAYOUT, showlegend:false, xaxis:axis('Scenario', { type:'category' }), yaxis:axis('P&L counted') }}
            config={CFG} style={{ width:'100%', height:300 }} />
          <div style={{ fontSize:10.5, color:'var(--text-muted)', padding:'0 8px 4px' }}>
            #1–14: price 0 / ±⅓ / ±⅔ / ±1 scan × vol up/down · #15–16: ±3× scan, 33% of loss counted · short-option minimum {num(span.short_option_minimum, dp)}
          </div>
        </Card>
        <Card title="Portfolio-margin risk matrix (P&L)">
          <Plot data={[{ z:d.pm.matrix.map(r => r.pnl), x:d.pm.moves_pct.map(m => `${m > 0 ? '+' : ''}${m.toFixed(0)}%`), y:d.pm.matrix.map(r => r.vol),
              type:'heatmap', colorscale:[[0, '#ee6b5b'], [0.5, '#0f1d18'], [1, '#4fc690']], zmid:0, showscale:false,
              text:d.pm.matrix.map(r => r.pnl.map(v => num(v, dp))), texttemplate:'%{text}', textfont:{ size:8 } }]}
            layout={{ ...LAYOUT, margin:{ l:62, r:10, t:8, b:36 }, xaxis:axis('Price move', { type:'category' }), yaxis:axis('', { type:'category' }) }}
            config={CFG} style={{ width:'100%', height:220 }} />
          <div className="font-mono" style={{ fontSize:11, color:'var(--text-muted)', padding:'0 8px' }}>
            Extended (vol up, dampened): {d.pm.extended.map(e => `${e.move_pct > 0 ? '+' : ''}${e.move_pct}%: ${num(e.loss_counted, dp)}`).join(' · ')}
          </div>
          <div style={{ fontSize:10.5, color:'var(--text-muted)', padding:'4px 8px' }}>
            IM = worst matrix loss {num(d.pm.worst_matrix, dp)} vs extended {num(d.pm.worst_extended, dp)} + delta contingency {num(d.pm.delta_contingency, dp)}; MM = 0.8 × IM.
          </div>
        </Card>
        <Card title={`Margin calls over ${sim.days} days (${sim.n_paths.toLocaleString()} paths)`}>
          <Plot data={[
              { x:sim.call_by_day.map((_, i) => i + 1), y:sim.call_by_day.map(v => v * 100), type:'bar', name:'First call on day (%)', marker:{ color:'rgba(238,107,91,0.6)' } },
              { x:sim.equity_quantiles.map((_, i) => i + 1), y:sim.equity_quantiles.map(q => q[0]), type:'scatter', mode:'lines', name:'Equity 1%', yaxis:'y2', line:{ color:'#ee6b5b', dash:'dot' } },
              { x:sim.equity_quantiles.map((_, i) => i + 1), y:sim.equity_quantiles.map(q => q[2]), type:'scatter', mode:'lines', name:'Equity median', yaxis:'y2', line:{ color:'#86abea' } },
              { x:sim.equity_quantiles.map((_, i) => i + 1), y:sim.equity_quantiles.map(q => q[3]), type:'scatter', mode:'lines', name:'Equity 95%', yaxis:'y2', line:{ color:'#4fc690', dash:'dot' } },
            ]}
            layout={{ ...LAYOUT, hovermode:'x unified', xaxis:axis('Day', { dtick:1 }), yaxis:axis('% of paths'),
              yaxis2:{ overlaying:'y', side:'right', showgrid:false, zeroline:false, color:'#7e8f84' } }}
            config={CFG} style={{ width:'100%', height:300 }} />
        </Card>
      </div>
      <div style={{ fontSize:10.5, color:'var(--text-muted)', marginTop:10, lineHeight:1.5 }}>
        SPAN: CME methodology (16 scenarios; extreme ±3× scan at 33%; short-option minimum). CME sets COMEX metals margins as a % of notional since 13 Jan 2026
        (gold 5%, silver 10% after the May-2026 cut). Portfolio margin: Deribit-style risk matrix ±16% × vol shocks, extended table −66%…+500% (vol up, dampened),
        0.6% delta contingency, MM = 0.8 × IM — vol-shock sizes and the dampener are approximations of unpublished parameters. Simulation: daily spot (GBM / Merton) with
        vol co-moving via the spot-vol beta; maintenance interpolated on a spot × vol grid. Estimates only — your broker&apos;s house margin may be higher.
      </div>
    </div>
  )
}
