import { useEffect, useState } from 'react'
import _Plot from 'react-plotly.js'
const Plot = _Plot?.default ?? _Plot
import { usePortfolioStore, isCrypto, PAIR_META } from '../store/portfolio'
import { priceTarf } from '../api/client'

const LAYOUT = {
  paper_bgcolor:'transparent', plot_bgcolor:'#080d18',
  font:{ color:'#94a3b8', size:11 },
  margin:{ l:56, r:16, t:12, b:42 },
  legend:{ bgcolor:'transparent', font:{ size:9 }, orientation:'h', x:0, y:-0.22 },
  hoverlabel:{ bgcolor:'#0f172a', font:{ color:'#e2e8f0' }, bordercolor:'rgba(0,212,255,0.15)' },
}
const CFG = { responsive:true, displayModeBar:false }
const axis = (title, extra = {}) => ({ title:{ text:title }, gridcolor:'#1e293b', color:'#475569', zeroline:false, ...extra })
const pct = (v, d = 1) => (v == null ? '—' : (v * 100).toFixed(d) + '%')
const num = (v, d = 2) => (v == null ? '—' : Number(v).toLocaleString(undefined, { minimumFractionDigits:d, maximumFractionDigits:d }))
const MODEL_NAME = { bs:'Flat vol (Black)', lv:'Local vol (SSVI-Dupire)', jump:'Merton jumps' }
const MODEL_COLOR = { bs:'#94a3b8', lv:'#00d4ff', jump:'#c084fc' }
const FREQ = [['12', 'Monthly'], ['52', 'Weekly'], ['26', 'Bi-weekly']]

function useLoad(fn, key, enabled = true) {
  const [res, setRes] = useState({ key:null, data:null, error:null })
  useEffect(() => {
    if (!enabled) return
    let stale = false
    const t = setTimeout(() => {
      fn(JSON.parse(key))
        .then(data => { if (!stale) setRes({ key, data, error:null }) })
        .catch(e => { if (!stale) setRes({ key, data:null, error: e?.response?.data?.detail?.toString() ?? 'Pricing failed — is the backend up?' }) })
    }, 400)
    return () => { stale = true; clearTimeout(t) }
  }, [fn, key, enabled])
  return { ...res, loading: res.key !== key }
}

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

const inputStyle = { background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:4, color:'var(--cyan)', fontSize:11,
  padding:'4px 6px', fontFamily:'var(--font-mono)', width:'100%' }

function Field({ label, value, onChange, step, hint, placeholder }) {
  return (
    <label title={hint} style={{ display:'flex', flexDirection:'column', gap:3, fontSize:9, color:'var(--text-muted)' }}>{label}
      <input type="number" value={value} step={step} placeholder={placeholder}
        onChange={e => onChange(e.target.value === '' ? '' : +e.target.value)} style={inputStyle} />
    </label>
  )
}

function Select({ label, value, onChange, options }) {
  return (
    <label style={{ display:'flex', flexDirection:'column', gap:3, fontSize:9, color:'var(--text-muted)' }}>{label}
      <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )
}

export default function TarfDesk() {
  const { pair } = usePortfolioStore()
  return <Desk key={pair} pair={pair} />
}

function Desk({ pair }) {
  const { S, sigma, r_d, r_f, smileQuotes, hedgeJump } = usePortfolioStore()
  const dp = PAIR_META[pair]?.dp ?? 4
  const crypto = isCrypto(pair)
  const [p, setP] = useState(() => ({
    side:'buy', n_fix: crypto ? 8 : 12, freq: crypto ? '52' : '12', K:'', target_pct:'', leverage:2, target_type:'exact',
    sigma:+(sigma * 100).toFixed(1),
    rr25: smileQuotes ? smileQuotes.rr25 : '', bf25: smileQuotes ? smileQuotes.bf25 : '',
    jump_intensity: hedgeJump?.intensity ?? (crypto ? 10 : 3), jump_sd: hedgeJump?.sd ?? (crypto ? 6 : 4),
  }))
  const set = (k) => (v) => setP(q => ({ ...q, [k]: v }))
  const body = { pair, S, sigma:p.sigma / 100, r_d, r_f, side:p.side, n_fix:p.n_fix, freq_per_year:+p.freq,
    K: p.K === '' ? null : p.K, target_pct: p.target_pct === '' ? null : p.target_pct, leverage:p.leverage,
    target_type:p.target_type, rr25: p.rr25 === '' ? null : p.rr25 / 100, bf25: p.bf25 === '' ? null : p.bf25 / 100,
    jump_intensity:p.jump_intensity, jump_sd:p.jump_sd / 100, n_paths:15000 }
  const valid = p.sigma > 1 && p.n_fix >= 2 && p.leverage >= 1
  const { data:d, error, loading } = useLoad(priceTarf, JSON.stringify(body), valid)
  const ref = d?.models?.[d?.reference_model]
  const sideWord = p.side === 'buy' ? 'buys' : 'sells'

  return (
    <div style={{ padding:16 }}>
      <div style={{ marginBottom:12 }}>
        <div className="section-title">TARF Desk — target redemption forwards under three smile models ({pair})</div>
        <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:2 }}>
          Zero-cost strike · knock-out timing · capped gain vs geared loss · model risk between flat vol, local vol and jumps
        </div>
      </div>
      <div className="glass" style={{ borderRadius:8, padding:10, marginBottom:12 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(112px, 1fr))', gap:10, alignItems:'end' }}>
          <Select label="Client" value={p.side} onChange={set('side')} options={[['buy', `Buys ${pair.slice(0, 3)} (importer)`], ['sell', `Sells ${pair.slice(0, 3)} (exporter)`]]} />
          <Field label="Fixings" value={p.n_fix} onChange={set('n_fix')} step={1} />
          <Select label="Frequency" value={p.freq} onChange={set('freq')} options={FREQ} />
          <Field label="Strike (blank = zero-cost)" value={p.K} onChange={set('K')} step={PAIR_META[pair]?.strikeStep ?? 0.001} />
          <Field label="Target (% spot, blank = auto)" value={p.target_pct} onChange={set('target_pct')} step={0.5}
            hint="Accrued favourable intrinsic at which the trade knocks out" />
          <Field label="Leverage" value={p.leverage} onChange={set('leverage')} step={0.5} />
          <Select label="KO fixing pays" value={p.target_type} onChange={set('target_type')}
            options={[['full', 'Full gain'], ['exact', 'Exact (capped at target)'], ['none', 'Nothing']]} />
          <Field label="ATM vol (%)" value={p.sigma} onChange={set('sigma')} step={0.5} />
          <Field label="25Δ RR (vol pts)" value={p.rr25} onChange={set('rr25')} step={0.1} placeholder="auto" />
          <Field label="25Δ BF (vol pts)" value={p.bf25} onChange={set('bf25')} step={0.1} placeholder="auto" />
          <Field label="Jumps / year" value={p.jump_intensity} onChange={set('jump_intensity')} step={1} />
          <Field label="Jump sd (%)" value={p.jump_sd} onChange={set('jump_sd')} step={0.5} />
        </div>
        <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:6, lineHeight:1.5 }}>
          Each fixing the client {sideWord} 1 unit at K when it pays, and {p.leverage}× units when it costs; the trade dies once the accrued gain reaches
          the target. RR/BF {smileQuotes ? 'pre-filled from Vol Smile / Vol Lab' : 'blank → typical values for the asset class'}; jumps
          {hedgeJump ? ' from Jump Lab' : ' default to moves against the client'}.
        </div>
      </div>
      {error && <div style={{ padding:8, borderRadius:6, fontSize:11, marginBottom:10, background:'rgba(255,61,90,0.1)', border:'1px solid #ff3d5a', color:'#ff3d5a' }}>{error}</div>}
      {!d && !error && <div style={{ fontSize:11, color:'var(--text-muted)', padding:12 }}>Simulating 3 models × 15,000 paths…</div>}
      {d && ref && (
        <div style={{ opacity: loading ? 0.6 : 1, transition:'opacity .2s' }}>
          <Kpis items={[
            { label:'Zero-cost strike', value:num(d.zero_cost_strike, dp),
              sub:`vs 1st forward ${num(d.forwards[0], dp)} (${(((d.zero_cost_strike / d.forwards[0]) - 1) * 100).toFixed(2)}%)`,
              hint:`Under ${MODEL_NAME[d.reference_model]}` },
            { label:'Target', value:num(d.target, dp), sub:`${d.target_pct.toFixed(2)}% of spot · max client gain` },
            { label:'P(knock-out)', value:pct(ref.prob_ko), sub:`avg ${ref.expected_fixings.toFixed(1)} of ${d.n_fix} fixings` },
            { label:'P(net loss)', value:pct(ref.prob_loss), color:'var(--red)' },
            { label:'Client ES 5%', value:num(-ref.client_es_5, dp), color:'var(--red)',
              sub:`${(ref.client_es_5 / Math.max(d.max_gain, 1e-12)).toFixed(1)}× the max gain`, hint:'Average of the worst 5% outcomes, undiscounted' },
            { label:'Client Δ / vega (1 vol)', value:`${num(d.greeks.delta, 2)} / ${num(d.greeks.vega_1pt, dp)}`,
              color: d.greeks.vega_1pt < 0 ? 'var(--red)' : 'var(--cyan)', hint:'Client is short vol: higher vol costs them' },
            { label:'Smile', value:`RR ${(d.smile.rr25 * 100).toFixed(2)} · BF ${(d.smile.bf25 * 100).toFixed(2)}`,
              sub: d.ssvi ? `SSVI ρ ${d.ssvi.rho.toFixed(2)} η ${d.ssvi.eta.toFixed(2)} · ${d.smile.source}` : d.smile.source },
          ]} />
          <ModelTable d={d} dp={dp} />
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(420px, 1fr))', gap:12, marginTop:12 }}>
            <Card title="When does it knock out? (reference model)">
              <Plot data={[
                  { x:d.detail.ko_by_fixing.map((_, i) => i + 1), y:d.detail.ko_by_fixing.map(v => v * 100), type:'bar', name:'P(KO at fixing) %',
                    marker:{ color:'rgba(0,212,255,0.55)' } },
                  { x:d.detail.survival.map((_, i) => i + 1), y:d.detail.survival.map(v => v * 100), type:'scatter', mode:'lines+markers',
                    name:'Still alive after fixing %', line:{ color:'#ffd700', width:2 } },
                  { x:d.detail.prob_favourable.map((_, i) => i + 1), y:d.detail.prob_favourable.map(v => v * 100), type:'scatter', mode:'lines',
                    name:'P(fixing favourable) %', line:{ color:'#00ff88', width:1.2, dash:'dot' } },
                ]}
                layout={{ ...LAYOUT, hovermode:'x unified', xaxis:axis('Fixing', { dtick:1 }), yaxis:axis('%', { range:[0, 100] }) }}
                config={CFG} style={{ width:'100%', height:290 }} />
              <div style={{ fontSize:9, color:'var(--text-muted)', padding:'0 8px 4px' }}>
                Good outcomes end the hedge early; bad ones keep it alive at {p.leverage}× — the client is left hedged only when they did not need it.
              </div>
            </Card>
            <Card title="Client P&L over the life of the trade">
              <Plot data={[{ x:d.detail.pnl_hist.centers, y:d.detail.pnl_hist.counts, type:'bar',
                  marker:{ color:d.detail.pnl_hist.centers.map(c => c < 0 ? 'rgba(255,61,90,0.6)' : 'rgba(0,255,136,0.55)') } }]}
                layout={{ ...LAYOUT, showlegend:false, bargap:0.04, xaxis:axis(`P&L (${pair.slice(3)}, per unit notional)`), yaxis:axis('Paths'),
                  shapes:[{ type:'line', x0:d.max_gain, x1:d.max_gain, yref:'paper', y0:0, y1:1, line:{ color:'#00ff88', dash:'dot', width:1.5 } }],
                  annotations:[{ x:d.max_gain, y:1, yref:'paper', text:'target cap', showarrow:false, font:{ size:9, color:'#00ff88' }, yanchor:'bottom' }] }}
                config={CFG} style={{ width:'100%', height:290 }} />
              <div className="font-mono" style={{ fontSize:10, color:'var(--text-muted)', padding:'0 8px 4px' }}>
                1%: <span style={{ color:'var(--red)' }}>{num(d.detail.pnl_quantiles['0.01'], dp)}</span> · 5%: {num(d.detail.pnl_quantiles['0.05'], dp)} ·
                median: {num(d.detail.pnl_quantiles['0.5'], dp)} · 95%: <span style={{ color:'var(--green)' }}>{num(d.detail.pnl_quantiles['0.95'], dp)}</span>
              </div>
            </Card>
            <Card title="Sample paths vs strike">
              <Plot data={[
                  ...d.detail.sample_paths.map((y, i) => ({ x:y.map((_, j) => j + 1), y, type:'scatter', mode:'lines+markers', name:`path ${i + 1}`,
                    line:{ width:1 }, marker:{ size:3 }, showlegend:false })),
                  { x:d.forwards.map((_, j) => j + 1), y:d.forwards, type:'scatter', mode:'lines', name:'Forward', line:{ color:'#ffd700', dash:'dash' } },
                ]}
                layout={{ ...LAYOUT, xaxis:axis('Fixing', { dtick:1 }), yaxis:axis('Spot'),
                  shapes:[{ type:'line', xref:'paper', x0:0, x1:1, y0:d.strike, y1:d.strike, line:{ color:'#ff3d5a', width:1.5, dash:'dot' } }] }}
                config={CFG} style={{ width:'100%', height:290 }} />
            </Card>
            <Card title="Expected cash flow per fixing (client)">
              <Plot data={[{ x:d.detail.expected_cf.map((_, i) => i + 1), y:d.detail.expected_cf, type:'bar',
                  marker:{ color:d.detail.expected_cf.map(v => v < 0 ? 'rgba(255,61,90,0.6)' : 'rgba(0,255,136,0.55)') } }]}
                layout={{ ...LAYOUT, showlegend:false, xaxis:axis('Fixing', { dtick:1 }), yaxis:axis('E[cash flow]') }}
                config={CFG} style={{ width:'100%', height:290 }} />
              <div style={{ fontSize:9, color:'var(--text-muted)', padding:'0 8px 4px' }}>
                Early fixings carry the gains, late fixings the geared losses — the zero-cost strike balances them in present value.
              </div>
            </Card>
          </div>
          <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:10, lineHeight:1.5 }}>
            Models are simulated on the forward (vanilla forwards matched exactly). Local vol: Dupire from an SSVI surface (Gatheral &amp; Jacquier 2014)
            calibrated to ATM/RR/BF with a flat ATM term structure; Merton jumps keep the ATM total variance. Greeks by common-random-number bumps.
            Reference: Wystup (2017) §2.7; Clarus FT and ION on TARFs under local vol.
          </div>
        </div>
      )}
    </div>
  )
}

function ModelTable({ d, dp }) {
  const ks = Object.values(d.models).map(m => m.zero_cost_strike).filter(v => v != null)
  const spread = ks.length > 1 ? Math.max(...ks) - Math.min(...ks) : null
  return (
    <Card title={`Model risk at strike ${num(d.strike, dp)}`}
      right={spread != null && <span className="font-mono" style={{ fontSize:10, color:'#ffd700' }}>
        zero-cost strike spread {num(spread, dp)} ({(spread / d.forwards[0] * 1e4).toFixed(0)} bp)</span>}>
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
          <thead><tr style={{ color:'var(--text-muted)', fontSize:9, textAlign:'right' }}>
            <th style={{ textAlign:'left', padding:'4px 8px' }}>Model</th><th style={{ padding:'4px 8px' }}>Client PV</th>
            <th style={{ padding:'4px 8px' }}>Zero-cost K</th><th style={{ padding:'4px 8px' }}>P(KO)</th>
            <th style={{ padding:'4px 8px' }}>E[fixings]</th><th style={{ padding:'4px 8px' }}>P(loss)</th><th style={{ padding:'4px 8px' }}>Client ES 5%</th></tr></thead>
          <tbody>{Object.entries(d.models).map(([m, v]) => (
            <tr key={m} className="font-mono" style={{ borderTop:'1px solid var(--border)', textAlign:'right',
              background: m === d.reference_model ? 'rgba(0,212,255,0.06)' : 'transparent' }}>
              <td style={{ textAlign:'left', padding:'5px 8px', color:MODEL_COLOR[m] }}>{MODEL_NAME[m]}{m === d.reference_model ? ' · ref' : ''}</td>
              <td style={{ padding:'5px 8px', color: v.pv < 0 ? 'var(--red)' : 'var(--green)' }}>{num(v.pv, dp)} <span style={{ color:'var(--text-muted)', fontSize:9 }}>±{num(v.pv_se, dp)}</span></td>
              <td style={{ padding:'5px 8px', color:'var(--cyan)' }}>{num(v.zero_cost_strike, dp)}</td>
              <td style={{ padding:'5px 8px' }}>{pct(v.prob_ko)}</td>
              <td style={{ padding:'5px 8px' }}>{v.expected_fixings.toFixed(2)}</td>
              <td style={{ padding:'5px 8px' }}>{pct(v.prob_loss)}</td>
              <td style={{ padding:'5px 8px', color:'var(--red)' }}>{num(-v.client_es_5, dp)}</td>
            </tr>))}</tbody>
        </table>
      </div>
      <div style={{ fontSize:9, color:'var(--text-muted)', padding:'6px 8px' }}>
        All three match the same vanilla forwards; differences come from the path distribution (forward skew, jumps) that the knock-out and the geared leg are exposed to.
        A dealer quoting off flat vol mis-marks the trade by the PV gap.
      </div>
    </Card>
  )
}
