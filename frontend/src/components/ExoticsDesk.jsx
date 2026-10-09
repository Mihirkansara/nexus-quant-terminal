import { useEffect, useState } from 'react'
import _Plot from 'react-plotly.js'
const Plot = _Plot?.default ?? _Plot
import { usePortfolioStore, isCrypto, PAIR_META } from '../store/portfolio'
import { priceBarriers, priceDci, priceAccumulator } from '../api/client'

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
const dpOf = (pair) => PAIR_META[pair]?.dp ?? (PAIR_META[pair]?.pip === 0.01 ? 3 : 5)
const roundTo = (x, dp) => +Number(x).toFixed(dp)

// Debounced POST keyed by the request body; stale responses are dropped.
function useQuote(fn, body, enabled = true) {
  const key = JSON.stringify(body)
  const [res, setRes] = useState({ key:null, data:null, error:null })
  useEffect(() => {
    if (!enabled) return
    let stale = false
    const t = setTimeout(() => {
      fn(JSON.parse(key))
        .then(data => { if (!stale) setRes({ key, data, error:null }) })
        .catch(e => { if (!stale) setRes({ key, data:null, error: e?.response?.data?.detail?.toString() ?? 'Pricing failed — is the backend up?' }) })
    }, 250)
    return () => { stale = true; clearTimeout(t) }
  }, [fn, key, enabled])
  return { ...res, loading: res.key !== key }
}

export default function ExoticsDesk() {
  const { pair } = usePortfolioStore()
  const [tab, setTab] = useState('barrier')
  return (
    <div style={{ padding:16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, marginBottom:12, flexWrap:'wrap' }}>
        <div>
          <div className="section-title">Exotics Desk — barriers, touches, Dual Investment &amp; accumulators ({pair})</div>
          <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:2 }}>
            Price what clients are actually sold: KO/KI and touch structures, crypto/gold DCI yields, KO accumulators
          </div>
        </div>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
          <Chip active={tab === 'barrier'} onClick={() => setTab('barrier')}>Barriers &amp; touches</Chip>
          <Chip active={tab === 'dci'} onClick={() => setTab('dci')}>Dual Investment (DCI)</Chip>
          <Chip active={tab === 'acc'} onClick={() => setTab('acc')}>Accumulator</Chip>
        </div>
      </div>
      {tab === 'barrier' && <Barriers key={pair} pair={pair} />}
      {tab === 'dci' && <Dci key={pair} pair={pair} />}
      {tab === 'acc' && <Accumulator key={pair} pair={pair} />}
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

function ErrorBox({ msg }) {
  return <div style={{ padding:8, borderRadius:6, fontSize:11, marginBottom:10, background:'rgba(255,61,90,0.1)', border:'1px solid #ff3d5a', color:'#ff3d5a' }}>{msg}</div>
}

const inputStyle = { background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:4, color:'var(--cyan)', fontSize:11,
  padding:'4px 6px', fontFamily:'var(--font-mono)', width:'100%' }

function Field({ label, value, onChange, step, hint }) {
  return (
    <label title={hint} style={{ display:'flex', flexDirection:'column', gap:3, fontSize:9, color:'var(--text-muted)' }}>{label}
      <input type="number" value={value} step={step} onChange={e => onChange(+e.target.value)} style={inputStyle} />
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

const Panel = ({ children, note }) => (
  <div className="glass" style={{ borderRadius:8, padding:10, marginBottom:12 }}>
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(120px, 1fr))', gap:10, alignItems:'end' }}>{children}</div>
    {note && <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:6, lineHeight:1.5 }}>{note}</div>}
  </div>
)

const MONITORING = [['0', 'Continuous'], ['252', 'Daily close (252/y)'], ['365', 'Daily, 24/7 (365/y)'], ['8760', 'Hourly (8760/y)']]

// ─── Barriers, touches & digitals ─────────────────────────────────────────────

function Barriers({ pair }) {
  const { S, sigma, T, r_d, r_f, smileQuotes } = usePortfolioStore()
  const dp = dpOf(pair)
  const [p, setP] = useState(() => {
    const sd = sigma * Math.sqrt(T)
    return { K: roundTo(S, dp), H_down: roundTo(S * Math.exp(-sd), dp), H_up: roundTo(S * Math.exp(sd), dp),
      T: +T, sigma: +(sigma * 100).toFixed(2), rebate: 0, monitoring: isCrypto(pair) ? '365' : '252',
      product: 'call|up|out', useSmile: !!smileQuotes }
  })
  const set = (k) => (v) => setP(q => ({ ...q, [k]: v }))
  const [cp, direction, knock] = p.product.split('|')
  const smile = p.useSmile && smileQuotes
  const body = { pair, S, T: p.T, r_d, r_f, sigma: (smile ? smileQuotes.atm : p.sigma) / 100, K: p.K, H_down: p.H_down, H_up: p.H_up,
    rebate: p.rebate, monitoring_per_year: +p.monitoring || null, is_call: cp === 'call', direction, knock,
    rr25: smile ? smileQuotes.rr25 / 100 : null, bf25: smile ? smileQuotes.bf25 / 100 : null }
  const { data: d, error, loading } = useQuote(priceBarriers, body)
  const sel = d?.rows.find(r => r.type === cp && r.direction === direction && r.knock === knock)
  const [tDown, tUp] = d?.touches ?? []

  return (
    <div>
      <Panel note={<>
        Reiner–Rubinstein closed forms (Haug A–F) with rebates; discrete fixings via the Broadie–Glasserman–Kou shift
        H·e<sup>±0.5826σ√Δt</sup>{d ? ` (${d.bgk_shift_pct.toFixed(2)}% here)` : ''}. Crypto barriers monitor 24/7 — use 365/y.
        {smileQuotes ? ' Digitals use the vanna-volga smile from Vol Smile / Vol Lab when "smile" is on.' : ' Load RR/BF quotes in Vol Smile or Vol Lab to get smile-consistent digitals.'}
      </>}>
        <Select label="Structure" value={p.product} onChange={set('product')} options={[
          ['call|up|out', 'Up-and-out call'], ['call|up|in', 'Up-and-in call'], ['call|down|out', 'Down-and-out call'], ['call|down|in', 'Down-and-in call'],
          ['put|down|out', 'Down-and-out put'], ['put|down|in', 'Down-and-in put'], ['put|up|out', 'Up-and-out put'], ['put|up|in', 'Up-and-in put']]} />
        <Field label="Strike K" value={p.K} onChange={set('K')} step={PAIR_META[pair]?.strikeStep ?? 0.001} />
        <Field label="Lower barrier" value={p.H_down} onChange={set('H_down')} step={PAIR_META[pair]?.strikeStep ?? 0.001} />
        <Field label="Upper barrier" value={p.H_up} onChange={set('H_up')} step={PAIR_META[pair]?.strikeStep ?? 0.001} />
        <Field label="Tenor (years)" value={p.T} onChange={set('T')} step={0.05} />
        <Field label={smile ? 'σ (ATM from smile, %)' : 'σ (%)'} value={smile ? smileQuotes.atm : p.sigma} onChange={set('sigma')} step={0.5} />
        <Field label="Rebate" value={p.rebate} onChange={set('rebate')} step={0.1} hint="Knock-out: paid at hit · knock-in: paid at expiry if never triggered" />
        <Select label="Monitoring" value={p.monitoring} onChange={set('monitoring')} options={MONITORING} />
        {smileQuotes && <Select label="Digital vol" value={p.useSmile ? 'smile' : 'flat'} onChange={v => set('useSmile')(v === 'smile')}
          options={[['smile', `Smile (RR ${smileQuotes.rr25}, BF ${smileQuotes.bf25})`], ['flat', 'Flat σ']]} />}
      </Panel>
      {error && <ErrorBox msg={error} />}
      {d && (
        <div style={{ opacity: loading ? 0.6 : 1, transition:'opacity .2s' }}>
          <Kpis items={[
            { label: sel ? `${knock === 'out' ? 'KO' : 'KI'} price (discrete)` : 'Price', value: sel ? num(sel.discrete, dp) : '—',
              sub: sel ? `continuous ${num(sel.continuous, dp)}` : null },
            { label:'% of vanilla', value: sel?.pct_of_vanilla == null ? '—' : sel.pct_of_vanilla.toFixed(1) + '%', sub: sel ? `vanilla ${num(sel.vanilla, dp)}` : null,
              hint:'Cost saving of the barrier vs the plain option' },
            { label:`P(touch ${num(tUp.barrier, dp)})`, value:pct(tUp.prob_touch), color:'var(--green)',
              sub:`finish above: ${pct(tUp.prob_finish_beyond)}`, hint:'Reflection rule of thumb: touch ≈ 2 × finish-beyond' },
            { label:`P(touch ${num(tDown.barrier, dp)})`, value:pct(tDown.prob_touch), color:'var(--red)', sub:`finish below: ${pct(tDown.prob_finish_beyond)}` },
            { label:'Double no-touch proxy', value:pct(Math.max(0, 1 - tUp.prob_touch - tDown.prob_touch)),
              hint:'Lower bound 1 − P(up) − P(down); a true DNT is slightly richer' },
            { label:`Digital call @ ${num(d.digital.strike, dp)}`, value:pct(d.digital.call_smile),
              sub:`flat ${pct(d.digital.call_flat)} · skew ${(d.digital.smile_adjustment * 100).toFixed(2)}pp`,
              color: d.digital.smile_adjustment >= 0 ? 'var(--green)' : 'var(--red)', hint:'Price per 1 unit paid if S_T > K (−∂C/∂K under the smile)' },
          ]} />
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(420px, 1fr))', gap:12 }}>
            <Card title={`${knock === 'out' ? 'Knock-out' : 'Knock-in'} ${cp} vs vanilla across spot`}>
              <Plot data={[
                  { x:d.selected.spots, y:d.selected.vanilla, type:'scatter', mode:'lines', name:'Vanilla', line:{ color:'rgba(255,255,255,0.35)', dash:'dash', width:1.2 } },
                  { x:d.selected.spots, y:d.selected.price, type:'scatter', mode:'lines', name:'Barrier', line:{ color:'#00d4ff', width:2.5 } },
                  { x:d.selected.spots, y:d.selected.delta, type:'scatter', mode:'lines', name:'Barrier Δ (rhs)', yaxis:'y2', line:{ color:'#c084fc', width:1.3 } },
                ]}
                layout={{ ...LAYOUT, hovermode:'x unified', xaxis:axis('Spot'), yaxis:axis('Price'),
                  yaxis2:{ overlaying:'y', side:'right', color:'#c084fc', showgrid:false, zeroline:false, title:{ text:'Δ' } },
                  shapes:[
                    { type:'line', x0:d.selected.barrier, x1:d.selected.barrier, yref:'paper', y0:0, y1:1, line:{ color:'#ff3d5a', dash:'dot', width:1.5 } },
                    { type:'line', x0:S, x1:S, yref:'paper', y0:0, y1:1, line:{ color:'rgba(255,215,0,0.5)', dash:'dot', width:1 } }] }}
                config={CFG} style={{ width:'100%', height:300 }} />
              <div style={{ fontSize:9, color:'var(--text-muted)', padding:'0 8px 4px' }}>
                Red = barrier, gold = spot. Watch Δ near the barrier: a reverse KO (barrier in the money) has a delta gap — the pin risk dealers hedge with barrier shifts.
              </div>
            </Card>
            <Card title="Touch ladder — hit probability by barrier (daily fixings)">
              <Plot data={[
                  { x:d.touch_ladder.map(r => r.barrier), y:d.touch_ladder.map(r => r.prob_touch * 100), type:'bar', name:'P(touch)',
                    marker:{ color:d.touch_ladder.map(r => r.barrier > S ? 'rgba(0,255,136,0.55)' : 'rgba(255,61,90,0.55)') },
                    customdata:d.touch_ladder.map(r => r.sd.toFixed(2)), hovertemplate:'H %{x}<br>%{customdata} sd<br>P(touch) %{y:.1f}%<extra></extra>' },
                ]}
                layout={{ ...LAYOUT, showlegend:false, xaxis:axis('Barrier'), yaxis:axis('P(touch before expiry) %', { range:[0, 100] }),
                  shapes:[{ type:'line', x0:S, x1:S, yref:'paper', y0:0, y1:1, line:{ color:'rgba(255,215,0,0.5)', dash:'dot', width:1 } }] }}
                config={CFG} style={{ width:'100%', height:300 }} />
              <div style={{ fontSize:9, color:'var(--text-muted)', padding:'0 8px 4px' }}>
                Risk-neutral odds of a level trading before expiry — compare with prediction-market &quot;will gold hit X&quot; contracts.
              </div>
            </Card>
          </div>
          <BarrierTable rows={d.rows} dp={dp} sel={sel} />
        </div>
      )}
    </div>
  )
}

function BarrierTable({ rows, dp, sel }) {
  const name = r => `${r.direction === 'up' ? 'Up' : 'Down'}-and-${r.knock} ${r.type}`
  return (
    <Card title="All eight single barriers (same K, lower/upper barrier)">
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
          <thead><tr style={{ color:'var(--text-muted)', fontSize:9, textAlign:'right' }}>
            <th style={{ textAlign:'left', padding:'4px 8px' }}>Structure</th><th style={{ padding:'4px 8px' }}>Barrier</th>
            <th style={{ padding:'4px 8px' }}>Continuous</th><th style={{ padding:'4px 8px' }}>Discrete (BGK)</th>
            <th style={{ padding:'4px 8px' }}>Vanilla</th><th style={{ padding:'4px 8px' }}>% vanilla</th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={name(r)} style={{ borderTop:'1px solid var(--border)', background: r === sel ? 'rgba(0,212,255,0.06)' : 'transparent' }}>
              <td style={{ padding:'5px 8px' }}>{name(r)}</td>
              {[r.barrier, r.continuous, r.discrete, r.vanilla].map((v, i) => (
                <td key={i} className="font-mono" style={{ padding:'5px 8px', textAlign:'right', color: i === 2 ? 'var(--cyan)' : undefined }}>{num(v, dp)}</td>))}
              <td className="font-mono" style={{ padding:'5px 8px', textAlign:'right' }}>{r.pct_of_vanilla == null ? '—' : r.pct_of_vanilla.toFixed(1) + '%'}</td>
            </tr>))}</tbody>
        </table>
      </div>
    </Card>
  )
}

// ─── Dual Currency Investment ────────────────────────────────────────────────

function Dci({ pair }) {
  const { S, sigma, r_d, r_f } = usePortfolioStore()
  const dp = dpOf(pair)
  const base = pair.slice(0, 3), quote = pair.slice(3)
  const [p, setP] = useState({ side:'sell_high', days:7, sigma:+(sigma * 100).toFixed(2), offered:'', strikeOffer:'' })
  const set = (k) => (v) => setP(q => ({ ...q, [k]: v }))
  const strikes = p.side === 'sell_high' ? [101, 102, 103, 104, 105, 106, 108, 110, 115] : [85, 90, 92, 94, 95, 96, 97, 98, 99]
  const audit = p.offered !== '' && p.strikeOffer !== ''
  const body = { pair, S, T: p.days / 365, r_d, r_f, sigma: p.sigma / 100, side: p.side, strikes_pct: strikes,
    offered_apr: audit ? +p.offered / 100 : null, strike_pct_offer: audit ? +p.strikeOffer : null }
  const { data: d, error, loading } = useQuote(priceDci, body, p.days > 0)
  const a = d?.audit

  return (
    <div>
      <Panel note={<>
        A DCI (&quot;Dual Investment&quot; on Binance/OKX/Bybit/KuCoin, &quot;Dual Currency Deposit&quot; at banks) is a deposit plus a
        short option. Sell-high: deposit {base}, short a {base} call — converts to {quote} at K if spot finishes above. Buy-low: deposit {quote},
        short a put — you buy {base} at K. Fair APR = deposit rate + option premium ÷ tenor. Enter a platform&apos;s APR to see the vol it pays you.
      </>}>
        <Select label="Product" value={p.side} onChange={set('side')} options={[['sell_high', `Sell high (deposit ${base})`], ['buy_low', `Buy low (deposit ${quote})`]]} />
        <Field label="Tenor (days)" value={p.days} onChange={set('days')} step={1} />
        <Field label="σ (%)" value={p.sigma} onChange={set('sigma')} step={1} hint="Use the Deribit ATM vol from Vol Lab for BTC/ETH" />
        <Field label="Offered APR (%)" value={p.offered} onChange={v => set('offered')(Number.isFinite(v) ? v : '')} step={1} />
        <Field label="…at strike (% spot)" value={p.strikeOffer} onChange={v => set('strikeOffer')(Number.isFinite(v) ? v : '')} step={1} />
      </Panel>
      {error && <ErrorBox msg={error} />}
      {d && (
        <div style={{ opacity: loading ? 0.6 : 1, transition:'opacity .2s' }}>
          {a && <Kpis items={[
            { label:`Fair APR @ ${a.strike_pct}%`, value:pct(a.fair_apr, 1) },
            { label:'Offered APR', value:pct(a.offered_apr, 1) },
            { label:'Platform margin', value:`${(a.margin_apr * 100).toFixed(1)}% APR`, color: a.margin_apr > 0 ? 'var(--red)' : 'var(--green)',
              hint:'Fair − offered: the yield the platform keeps' },
            { label:'Vol you are paid', value:pct(a.implied_vol_paid, 1), sub: a.vol_haircut != null ? `${(a.vol_haircut * 100).toFixed(1)} vol below σ` : null,
              color:'var(--gold, #ffd700)', hint:'Implied vol at which the offered APR is fair' },
            { label:'P(conversion)', value:pct(a.prob_conversion, 1), color:'var(--red)' },
            { label:'Breakeven', value:num(a.breakeven, dp) },
          ]} />}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(420px, 1fr))', gap:12 }}>
            <Card title={`Fair APR vs conversion odds · ${p.days}d ${p.side === 'sell_high' ? 'sell-high' : 'buy-low'}`}>
              <Plot data={[
                  { x:d.ladder.map(r => r.strike), y:d.ladder.map(r => r.fair_apr * 100), type:'bar', name:'Fair APR %', marker:{ color:'rgba(0,212,255,0.55)' } },
                  { x:d.ladder.map(r => r.strike), y:d.ladder.map(r => r.prob_conversion * 100), type:'scatter', mode:'lines+markers', name:'P(conversion) %',
                    yaxis:'y2', line:{ color:'#ff3d5a', width:2 } },
                  ...(a ? [{ x:[S * a.strike_pct / 100], y:[a.offered_apr * 100], type:'scatter', mode:'markers', name:'Offered',
                    marker:{ color:'#ffd700', size:12, symbol:'diamond' } }] : []),
                ]}
                layout={{ ...LAYOUT, hovermode:'x unified', xaxis:axis('Target price (strike)'), yaxis:axis('APR %'),
                  yaxis2:{ overlaying:'y', side:'right', color:'#ff3d5a', showgrid:false, zeroline:false, title:{ text:'P(conv) %' } } }}
                config={CFG} style={{ width:'100%', height:300 }} />
            </Card>
            <Card title="Strike ladder">
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                  <thead><tr style={{ color:'var(--text-muted)', fontSize:9, textAlign:'right' }}>
                    <th style={{ padding:'4px 8px' }}>Strike</th><th style={{ padding:'4px 8px' }}>% spot</th><th style={{ padding:'4px 8px' }}>Premium</th>
                    <th style={{ padding:'4px 8px' }}>Fair APR</th><th style={{ padding:'4px 8px' }}>P(conv)</th><th style={{ padding:'4px 8px' }}>Breakeven</th></tr></thead>
                  <tbody>{d.ladder.map(r => (
                    <tr key={r.strike_pct} style={{ borderTop:'1px solid var(--border)', textAlign:'right' }} className="font-mono">
                      <td style={{ padding:'5px 8px' }}>{num(r.strike, dp)}</td><td style={{ padding:'5px 8px' }}>{r.strike_pct}%</td>
                      <td style={{ padding:'5px 8px' }}>{r.premium_pct.toFixed(3)}%</td>
                      <td style={{ padding:'5px 8px', color:'var(--cyan)' }}>{pct(r.fair_apr, 1)}</td>
                      <td style={{ padding:'5px 8px', color:'var(--red)' }}>{pct(r.prob_conversion, 1)}</td>
                      <td style={{ padding:'5px 8px' }}>{num(r.breakeven, dp)}</td>
                    </tr>))}</tbody>
                </table>
              </div>
              <div style={{ fontSize:9, color:'var(--text-muted)', padding:'6px 8px' }}>
                Breakeven: the spot at which converting at K leaves you level with simply holding, after the premium.
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Accumulator ──────────────────────────────────────────────────────────────

function Accumulator({ pair }) {
  const { S, sigma, r_d, r_f, hedgeJump } = usePortfolioStore()
  const dp = dpOf(pair)
  const [p, setP] = useState(() => ({ months:6, sigma:+(sigma * 100).toFixed(2), ko:105, strike:'', gearing:2, qty:1,
    fixings: isCrypto(pair) ? 365 : 252, jumps: !!hedgeJump || isCrypto(pair),
    jump: hedgeJump ?? (isCrypto(pair) ? { intensity:12, mean:-2, sd:6 } : { intensity:2, mean:-5, sd:6 }) }))
  const set = (k) => (v) => setP(q => ({ ...q, [k]: v }))
  const setJ = (k) => (v) => setP(q => ({ ...q, jump:{ ...q.jump, [k]: v } }))
  const body = { pair, S, T: p.months / 12, r_d, r_f, sigma: p.sigma / 100, ko_pct: p.ko, strike_pct: p.strike === '' ? null : +p.strike,
    qty: p.qty, gearing: p.gearing, fixings_per_year: p.fixings, n_paths: 20000,
    jump_intensity: p.jumps ? p.jump.intensity : 0, jump_mean: p.jumps ? p.jump.mean / 100 : 0, jump_sd: p.jumps ? p.jump.sd / 100 : 0 }
  const { data: d, error, loading } = useQuote(priceAccumulator, body, p.months > 0)

  return (
    <div>
      <Panel note={<>
        &quot;I kill you later&quot;: the client buys {p.qty} unit(s) at K every fixing, {p.gearing}× when the fixing is below K, until a fixing
        trades ≥ KO. Leaving the strike blank solves the zero-cost strike by Monte Carlo (20k paths, common random numbers).
        Jumps come from Jump Lab when sent there. P&amp;L marks accumulated units at the KO / final fixing.
      </>}>
        <Field label="Tenor (months)" value={p.months} onChange={set('months')} step={1} />
        <Field label="σ (%)" value={p.sigma} onChange={set('sigma')} step={1} />
        <Field label="Knock-out (% spot)" value={p.ko} onChange={set('ko')} step={0.5} />
        <Field label="Strike (% spot, blank = zero-cost)" value={p.strike} onChange={v => set('strike')(Number.isFinite(v) && v > 0 ? v : '')} step={0.5} />
        <Field label="Gearing" value={p.gearing} onChange={set('gearing')} step={0.5} />
        <Field label="Units / fixing" value={p.qty} onChange={set('qty')} step={1} />
        <Select label="Fixings / year" value={String(p.fixings)} onChange={v => set('fixings')(+v)} options={[['252', '252 (trading days)'], ['365', '365 (24/7 crypto)'], ['52', '52 (weekly)']]} />
        <Select label="Dynamics" value={p.jumps ? 'jump' : 'gbm'} onChange={v => set('jumps')(v === 'jump')} options={[['gbm', 'GBM'], ['jump', 'Merton jumps']]} />
        {p.jumps && <>
          <Field label="Jumps / year" value={p.jump.intensity} onChange={setJ('intensity')} step={1} />
          <Field label="Mean jump (%)" value={p.jump.mean} onChange={setJ('mean')} step={0.5} />
          <Field label="Jump sd (%)" value={p.jump.sd} onChange={setJ('sd')} step={0.5} />
        </>}
      </Panel>
      {error && <ErrorBox msg={error} />}
      {d && (
        <div style={{ opacity: loading ? 0.6 : 1, transition:'opacity .2s' }}>
          <Kpis items={[
            { label:'Zero-cost strike', value:num(d.zero_cost_strike, dp), sub:`${d.zero_cost_strike_pct.toFixed(2)}% of spot` },
            { label:'Strike used', value:num(d.strike, dp), sub:`KO ${num(d.ko_level, dp)}` },
            { label:'PV to client', value:num(d.pv_to_client, dp), sub:`± ${num(d.pv_se, dp)} (MC s.e.)`,
              color: d.pv_to_client >= 0 ? 'var(--green)' : 'var(--red)' },
            { label:'P(knock-out)', value:pct(d.prob_knock_out), sub: d.expected_ko_days ? `avg after ${d.expected_ko_days.toFixed(0)} days` : null },
            { label:'Expected units', value:num(d.expected_units, 1), sub:`max ${num(d.max_units, 0)}` },
            { label:'P(loss)', value:pct(d.pnl.prob_loss), color:'var(--red)' },
            { label:'1% worst P&L', value:num(d.pnl.p01, dp), sub:`ES5% ${num(d.pnl.es05, dp)}`, color:'var(--red)' },
          ]} />
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(420px, 1fr))', gap:12 }}>
            <Card title="Client P&L distribution at the end of the contract">
              <Plot data={[{ x:d.histogram.centers, y:d.histogram.counts, type:'bar', name:'Paths',
                  marker:{ color:d.histogram.centers.map(c => c < 0 ? 'rgba(255,61,90,0.6)' : 'rgba(0,255,136,0.55)') } }]}
                layout={{ ...LAYOUT, showlegend:false, bargap:0.05, xaxis:axis(`P&L (${pair.slice(3)})`), yaxis:axis('Paths'),
                  shapes:[{ type:'line', x0:d.pnl.p01, x1:d.pnl.p01, yref:'paper', y0:0, y1:1, line:{ color:'#ff3d5a', dash:'dot', width:1.5 } }] }}
                config={CFG} style={{ width:'100%', height:300 }} />
              <div style={{ fontSize:9, color:'var(--text-muted)', padding:'0 8px 4px' }}>
                Capped upside (knocked out early), uncapped geared downside — the asymmetry behind the 2008 and 2022 accumulator blow-ups.
              </div>
            </Card>
            <Card title="Sample paths vs strike and knock-out">
              <Plot data={d.sample_paths.map((y, i) => ({ y, type:'scatter', mode:'lines', name:`path ${i + 1}`, line:{ width:1.2 } }))}
                layout={{ ...LAYOUT, showlegend:false, xaxis:axis('Fixing (sampled)'), yaxis:axis('Spot'),
                  shapes:[
                    { type:'line', xref:'paper', x0:0, x1:1, y0:d.ko_level, y1:d.ko_level, line:{ color:'#00ff88', dash:'dash', width:1.5 } },
                    { type:'line', xref:'paper', x0:0, x1:1, y0:d.strike, y1:d.strike, line:{ color:'#ff3d5a', dash:'dash', width:1.5 } }] }}
                config={CFG} style={{ width:'100%', height:300 }} />
              <div style={{ fontSize:9, color:'var(--text-muted)', padding:'0 8px 4px' }}>Green = KO level, red = strike (below it the client buys {p.gearing}×).</div>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
