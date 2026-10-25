import { useState } from 'react'
import { RotateCcw, Play } from 'lucide-react'
import _Plot from 'react-plotly.js'
const Plot = _Plot?.default ?? _Plot
import { usePortfolioStore, isCrypto, PAIR_META } from '../store/portfolio'
import { trainDeepHedge } from '../api/client'
import KpiStrip from './KpiStrip'
import { num } from '../lib/format'

const LAYOUT = {
  paper_bgcolor:'transparent', plot_bgcolor:'#0a1511',
  font:{ family:"'Geist Variable', sans-serif", color:'#9eab9f', size:11 },
  margin:{ l:56, r:16, t:12, b:42 },
  legend:{ bgcolor:'transparent', font:{ size:10.5 }, orientation:'h', x:0, y:-0.22 },
  hoverlabel:{ bgcolor:'#0f1d18', font:{ color:'#ebe5d3' }, bordercolor:'rgba(169,154,255,0.15)' },
}
const CFG = { responsive:true, displayModeBar:false }
const axis = (title, extra = {}) => ({ title:{ text:title }, gridcolor:'#1c2e26', color:'#7e8f84', zeroline:false, ...extra })
// Exponential moving average for noisy minibatch losses.
const ema = (xs, a = 0.1) => { let m = xs[0]; return xs.map(x => (m = a * x + (1 - a) * m)) }
const COLOR = { 'No hedge':'#7e8f84', 'BS delta':'#9eab9f', 'Whalley-Wilmott':'#e4dcc3', 'Deep NTB':'#86abea', 'Deep FF':'#d58fc0' }
const NOTE = {
  'No hedge':'Naked short option',
  'BS delta':'Rebalance to Black-Scholes delta every step',
  'Whalley-Wilmott':'Analytic no-trade band, risk aversion tuned on training paths',
  'Deep NTB':'No-Transaction-Band network (Imaki et al. 2021) — learns its own band',
  'Deep FF':'Feed-forward deep hedge (Buehler et al. 2019) — no memory of position',
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

function Field({ label, value, onChange, step, hint }) {
  return (
    <label title={hint} style={{ display:'flex', flexDirection:'column', gap:3, fontSize:10.5, color:'var(--text-muted)' }}>{label}
      <input type="number" value={value} step={step} onChange={e => onChange(+e.target.value)} style={inputStyle} />
    </label>
  )
}

export default function AiHedger() {
  const { pair } = usePortfolioStore()
  return <Hedger key={pair} pair={pair} />
}

function Hedger({ pair }) {
  const { S, sigma, hedgeJump } = usePortfolioStore()
  const crypto = isCrypto(pair)
  const dp = PAIR_META[pair]?.dp ?? 4
  const [p, setP] = useState(() => ({
    strike_pct:100, days:30, sigma:+(sigma * 100).toFixed(1), cost_bps: crypto ? 10 : 5, n_steps:30, alpha:95,
    jumps: !!hedgeJump || crypto,
    jump: hedgeJump ?? (crypto ? { intensity:12, mean:-1, sd:5 } : { intensity:2, mean:-3, sd:4 }), test_regime:'same',
  }))
  const [res, setRes] = useState({ data:null, error:null, busy:false })
  const [bandIdx, setBandIdx] = useState(1)
  const set = (k) => (v) => setP(q => ({ ...q, [k]: v }))
  const setJ = (k) => (v) => setP(q => ({ ...q, jump:{ ...q.jump, [k]: v } }))

  const train = () => {
    setRes(r => ({ ...r, busy:true, error:null }))
    trainDeepHedge({ pair, S, strike_pct:p.strike_pct, days:p.days, sigma:p.sigma / 100, cost_bps:p.cost_bps, n_steps:p.n_steps,
      alpha:p.alpha / 100, test_regime:p.test_regime,
      jump: p.jumps ? { intensity:p.jump.intensity, mean:p.jump.mean / 100, sd:p.jump.sd / 100 } : { intensity:0, mean:0, sd:0 } })
      .then(data => setRes({ data, error:null, busy:false }))
      .catch(e => setRes({ data:null, error: e?.response?.data?.detail?.toString() ?? 'Training failed — is the backend up?', busy:false }))
  }

  const d = res.data
  const s = d?.strategies
  const gain = s ? 1 - s['Deep NTB'].cvar / s['BS delta'].cvar : null
  const turn = s ? 1 - s['Deep NTB'].turnover / s['BS delta'].turnover : null
  const band = d?.bands?.[bandIdx]

  return (
    <div style={{ padding:16 }}>
      <div style={{ marginBottom:12 }}>
        <div className="section-title" style={{ color:'var(--text-muted)', letterSpacing:'0.08em' }}>{pair}</div>
        <div style={{ fontSize:10.5, color:'var(--text-muted)', marginTop:2 }}>
          Trains a neural hedging policy on simulated paths (in-browser request, server-side numpy — no GPU, no API key) and benchmarks it
          against BS delta and the Whalley-Wilmott band on fresh paths
        </div>
      </div>
      <div className="glass" style={{ borderRadius:8, padding:10, marginBottom:12 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(110px, 1fr))', gap:10, alignItems:'end' }}>
          <Field label="Strike (% spot)" value={p.strike_pct} onChange={set('strike_pct')} step={1} />
          <Field label="Days to expiry" value={p.days} onChange={set('days')} step={1} />
          <Field label="Vol (%)" value={p.sigma} onChange={set('sigma')} step={1} />
          <Field label="Cost (bps / trade)" value={p.cost_bps} onChange={set('cost_bps')} step={1}
            hint="Proportional cost: spread + fees + slippage (Deribit perp taker ≈ 5 bp, OTC gold spot ≈ 2-10 bp)" />
          <Field label="Rebalances" value={p.n_steps} onChange={set('n_steps')} step={5} />
          <Field label="CVaR level (%)" value={p.alpha} onChange={set('alpha')} step={1} />
          <label style={{ display:'flex', flexDirection:'column', gap:3, fontSize:10.5, color:'var(--text-muted)' }}>Training market
            <select value={p.jumps ? 'jump' : 'gbm'} onChange={e => set('jumps')(e.target.value === 'jump')} style={inputStyle}>
              <option value="gbm">GBM</option><option value="jump">Merton jumps</option>
            </select>
          </label>
          {p.jumps && <>
            <Field label="Jumps / yr" value={p.jump.intensity} onChange={setJ('intensity')} step={1} />
            <Field label="Mean jump (%)" value={p.jump.mean} onChange={setJ('mean')} step={0.5} />
            <Field label="Jump sd (%)" value={p.jump.sd} onChange={setJ('sd')} step={0.5} />
          </>}
          <label style={{ display:'flex', flexDirection:'column', gap:3, fontSize:10.5, color:'var(--text-muted)' }}>Test market
            <select value={p.test_regime} onChange={e => set('test_regime')(e.target.value)} style={inputStyle}>
              <option value="same">Same as training</option><option value="vol_up">Vol +50% (regime shift)</option>
              <option value="jumps">Crash jumps (12/yr, −5%)</option>
            </select>
          </label>
          <button className="btn-primary" disabled={res.busy} onClick={train} style={{ padding:'6px 10px', fontSize:11 }}>
            {res.busy ? 'Training…' : d ? <><RotateCcw size={13} aria-hidden="true" />Retrain</> : <><Play size={13} aria-hidden="true" />Train AI hedger</>}
          </button>
        </div>
        <div style={{ fontSize:10.5, color:'var(--text-muted)', marginTop:6, lineHeight:1.5 }}>
          The desk is short 1 call (premium = BS price) and minimises CVaR {p.alpha}% of the hedged loss. ≈ 5–10 s: 10k training paths,
          250 Adam steps per network. {hedgeJump ? 'Jump parameters pre-filled from Jump Lab.' : ''}
        </div>
      </div>
      {res.error && <div style={{ padding:8, borderRadius:6, fontSize:11, marginBottom:10, background:'rgba(238,107,91,0.1)', border:'1px solid #ee6b5b', color:'#ee6b5b' }}>{res.error}</div>}
      {!d && !res.busy && !res.error && <div style={{ fontSize:11, color:'var(--text-muted)', padding:12 }}>Set the trade and costs, then train.</div>}
      {d && (
        <div style={{ opacity: res.busy ? 0.5 : 1, transition:'opacity .2s' }}>
          <Kpis items={[
            { label:'Premium (BS)', value:num(d.premium, dp), sub:`K ${num(d.strike, dp)} · ${d.days}d` },
            { label:`CVaR ${Math.round(d.alpha * 100)}% · BS delta`, value:num(s['BS delta'].cvar, dp), color:'#9eab9f' },
            { label:`CVaR ${Math.round(d.alpha * 100)}% · Deep NTB`, value:num(s['Deep NTB'].cvar, dp),
              color: gain > 0 ? 'var(--green)' : 'var(--red)', sub:`${gain >= 0 ? '−' : '+'}${Math.abs(gain * 100).toFixed(1)}% tail risk vs delta` },
            { label:'Turnover vs delta', value:`${turn >= 0 ? '−' : '+'}${Math.abs(turn * 100).toFixed(0)}%`, color:'#e4dcc3',
              sub:`${s['Deep NTB'].turnover.toFixed(2)} vs ${s['BS delta'].turnover.toFixed(2)} units` },
            { label:'Risk-adjusted price (NTB)', value:num(s['Deep NTB'].risk_price, dp),
              sub:`delta hedge needs ${num(s['BS delta'].risk_price, dp)}`, hint:'Premium at which the hedged CVaR is zero — what you must charge' },
            { label:'Test market', value:d.test_regime_label, color: d.test_regime_label.startsWith('Same') ? 'var(--cyan)' : '#f0914a' },
          ]} />
          <StrategyTable s={s} dp={dp} alpha={d.alpha} />
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(420px, 1fr))', gap:12, marginTop:12 }}>
            <Card title="Learned no-trade band vs Whalley-Wilmott"
              right={<select value={bandIdx} onChange={e => setBandIdx(+e.target.value)} style={{ ...inputStyle, width:'auto', fontSize:10.5 }}>
                {d.bands.map((b, i) => <option key={i} value={i}>{Math.round(b.tau_frac * d.days)}d to expiry</option>)}</select>}>
              <Plot data={[
                  { x:band.spot, y:band.ntb_hi, type:'scatter', mode:'lines', line:{ color:'#86abea', width:0 }, showlegend:false, hoverinfo:'skip' },
                  { x:band.spot, y:band.ntb_lo, type:'scatter', mode:'lines', name:'Deep NTB band', fill:'tonexty',
                    fillcolor:'rgba(169,154,255,0.18)', line:{ color:'#86abea', width:1 } },
                  { x:band.spot, y:band.ww_hi, type:'scatter', mode:'lines', name:'Whalley-Wilmott band', line:{ color:'#e4dcc3', dash:'dash', width:1.2 } },
                  { x:band.spot, y:band.ww_lo, type:'scatter', mode:'lines', showlegend:false, line:{ color:'#e4dcc3', dash:'dash', width:1.2 } },
                  { x:band.spot, y:band.delta, type:'scatter', mode:'lines', name:'BS delta', line:{ color:'#ebe5d3', width:1.5 } },
                ]}
                layout={{ ...LAYOUT, hovermode:'x unified', xaxis:axis('Spot'), yaxis:axis('Hedge (units of underlying)', { range:[-0.05, 1.05] }),
                  shapes:[{ type:'line', x0:d.strike, x1:d.strike, yref:'paper', y0:0, y1:1, line:{ color:'rgba(238,107,91,0.5)', dash:'dot' } }] }}
                config={CFG} style={{ width:'100%', height:300 }} />
              <div style={{ fontSize:10.5, color:'var(--text-muted)', padding:'0 8px 4px' }}>
                Inside the band the AI holds its position; it only trades to the nearest edge. Widest where gamma is high and costs bite — what a desk does by feel.
              </div>
            </Card>
            <Card title="Hedged P&L distribution (out of sample)">
              <Plot data={Object.entries(d.pnl_hist.counts).map(([n, c]) => ({ x:d.pnl_hist.centers, y:c, type:'scatter', mode:'lines',
                  name:n, line:{ color:COLOR[n], width: n.startsWith('Deep') ? 2.2 : 1.3, shape:'spline' } }))}
                layout={{ ...LAYOUT, hovermode:'x unified', xaxis:axis(`Hedged P&L (${pair.slice(3)})`), yaxis:axis('Paths') }}
                config={CFG} style={{ width:'100%', height:300 }} />
            </Card>
            <Card title="One test path — hedge positions">
              <Plot data={[
                  ...Object.entries(d.sample.positions).map(([n, y]) => ({ x:d.sample.t, y, type:'scatter', mode:'lines', name:n,
                    line:{ color:COLOR[n], width: n.startsWith('Deep') ? 2 : 1.2, shape:'hv' } })),
                  { x:d.sample.t, y:d.sample.spot, type:'scatter', mode:'lines', name:'Spot (rhs)', yaxis:'y2', line:{ color:'rgba(255,255,255,0.25)', width:1 } },
                ]}
                layout={{ ...LAYOUT, hovermode:'x unified', xaxis:axis('Day'), yaxis:axis('Units'),
                  yaxis2:{ overlaying:'y', side:'right', showgrid:false, zeroline:false, color:'#7e8f84' } }}
                config={CFG} style={{ width:'100%', height:300 }} />
            </Card>
            <Card title={`Training curve · CVaR ${Math.round(d.alpha * 100)}% per minibatch`}>
              <Plot data={[
                  { y:d.training.ntb, type:'scatter', mode:'lines', showlegend:false, hoverinfo:'skip', line:{ color:'rgba(169,154,255,0.15)', width:1 } },
                  { y:d.training.ff, type:'scatter', mode:'lines', showlegend:false, hoverinfo:'skip', line:{ color:'rgba(192,132,252,0.15)', width:1 } },
                  { y:ema(d.training.ntb), type:'scatter', mode:'lines', name:'Deep NTB (EMA)', line:{ color:'#86abea', width:2 } },
                  { y:ema(d.training.ff), type:'scatter', mode:'lines', name:'Deep FF (EMA)', line:{ color:'#d58fc0', width:2 } },
                  { x:[0, d.training.ntb.length - 1], y:[s['BS delta'].cvar, s['BS delta'].cvar], type:'scatter', mode:'lines',
                    name:'BS delta (test)', line:{ color:'#9eab9f', dash:'dash' } },
                ]}
                layout={{ ...LAYOUT, xaxis:axis('Adam step'), yaxis:axis('CVaR') }}
                config={CFG} style={{ width:'100%', height:300 }} />
            </Card>
          </div>
          <div style={{ fontSize:10.5, color:'var(--text-muted)', marginTop:10, lineHeight:1.5 }}>
            Buehler, Gonon, Teichmann &amp; Wood (2019) &quot;Deep hedging&quot;; Imaki et al. (2021) &quot;No-transaction band network&quot;;
            Whalley &amp; Wilmott (1997). CVaR minimised by its tail-average gradient (Rockafellar-Uryasev); NTB trained by back-propagation through time
            (gradient-checked against finite differences). Zero rates; costs on every trade incl. the initial hedge; no unwind at expiry (physical settlement).
          </div>
        </div>
      )}
    </div>
  )
}

function StrategyTable({ s, dp, alpha }) {
  const cols = [['mean', 'Mean P&L'], ['std', 'Std'], ['cvar', `CVaR ${Math.round(alpha * 100)}%`], ['var_99', 'VaR 99%'],
    ['turnover', 'Turnover'], ['cost', 'Cost paid'], ['risk_price', 'Risk-adj. price']]
  const best = Math.min(...Object.values(s).map(v => v.cvar))
  return (
    <Card title="Out-of-sample comparison (fresh paths)">
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
          <thead><tr style={{ color:'var(--text-muted)', fontSize:10.5, textAlign:'right' }}>
            <th style={{ textAlign:'left', padding:'4px 8px' }}>Strategy</th>
            {cols.map(([, l]) => <th key={l} style={{ padding:'4px 8px' }}>{l}</th>)}</tr></thead>
          <tbody>{Object.entries(s).map(([n, v]) => (
            <tr key={n} title={NOTE[n]} style={{ borderTop:'1px solid var(--border)', textAlign:'right',
              background: v.cvar === best ? 'rgba(79,198,144,0.06)' : 'transparent' }}>
              <td style={{ textAlign:'left', padding:'5px 8px', color:COLOR[n] }}>{n}
                <div style={{ fontSize:10, color:'var(--text-muted)' }}>{NOTE[n]}</div></td>
              {cols.map(([k]) => <td key={k} className="font-mono" style={{ padding:'5px 8px',
                color: k === 'cvar' ? (v.cvar === best ? 'var(--green)' : 'var(--red)') : undefined }}>
                {k === 'turnover' ? v[k].toFixed(2) : num(v[k], dp)}</td>)}
            </tr>))}</tbody>
        </table>
      </div>
    </Card>
  )
}
