import { useEffect, useState } from 'react'
import _Plot from 'react-plotly.js'
const Plot = _Plot?.default ?? _Plot
import { usePortfolioStore, isCrypto, PAIR_META } from '../store/portfolio'
import { fetchSmileDynCrypto, fetchSmileDynQuotes } from '../api/client'

const LAYOUT = {
  paper_bgcolor:'transparent', plot_bgcolor:'#080d18',
  font:{ color:'#94a3b8', size:11 },
  margin:{ l:56, r:16, t:12, b:42 },
  legend:{ bgcolor:'transparent', font:{ size:9 }, orientation:'h', x:0, y:-0.22 },
  hoverlabel:{ bgcolor:'#0f172a', font:{ color:'#e2e8f0' }, bordercolor:'rgba(0,212,255,0.15)' },
}
const CFG = { responsive:true, displayModeBar:false }
const axis = (title, extra = {}) => ({ title:{ text:title }, gridcolor:'#1e293b', color:'#475569', zeroline:false, ...extra })
const RULES = [['bs_sticky_strike', 'Sticky strike (BS)', '#94a3b8'], ['sticky_delta', 'Sticky delta', '#ffd700'],
  ['sabr', 'SABR (α fixed)', '#c084fc'], ['bartlett', 'Bartlett (SABR, ρ-adjusted)', '#00d4ff']]
const REGIME_NAME = { sticky_strike:'Sticky strike', sticky_delta:'Sticky delta', bartlett:'SABR / Bartlett' }

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

const inputStyle = { background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:4, color:'var(--cyan)', fontSize:11,
  padding:'4px 6px', fontFamily:'var(--font-mono)', width:'100%' }

function Field({ label, value, onChange, step }) {
  return (
    <label style={{ display:'flex', flexDirection:'column', gap:3, fontSize:9, color:'var(--text-muted)' }}>{label}
      <input type="number" value={value} step={step} onChange={e => onChange(+e.target.value)} style={inputStyle} />
    </label>
  )
}

export default function SmileDynamics() {
  const { pair } = usePortfolioStore()
  return <Desk key={pair} pair={pair} />
}

function Desk({ pair }) {
  const { S, sigma, T, r_d, r_f, smileQuotes } = usePortfolioStore()
  const crypto = isCrypto(pair)
  const [mode, setMode] = useState(crypto ? 'live' : 'quotes')
  const [beta, setBeta] = useState(1)
  const [q, setQ] = useState(() => ({ T:+T, atm: smileQuotes?.atm ?? +(sigma * 100).toFixed(2),
    rr25: smileQuotes?.rr25 ?? (PAIR_META[pair]?.assetClass === 'metal' ? 1.0 : -0.5), bf25: smileQuotes?.bf25 ?? 0.3 }))
  const setF = (k) => (v) => setQ(o => ({ ...o, [k]: v }))
  const live = mode === 'live' && crypto
  const liveRes = useLoad(fetchSmileDynCrypto, JSON.stringify({ ccy: pair.slice(0, 3), beta }), live)
  const quoteRes = useLoad(fetchSmileDynQuotes, JSON.stringify({ pair, S, T:q.T, r_d, r_f, atm:q.atm / 100, rr25:q.rr25 / 100,
    bf25:q.bf25 / 100, beta }), !live && q.atm > 0 && q.T > 0)
  const res = live ? liveRes : quoteRes
  const d = res.data

  return (
    <div style={{ padding:16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, marginBottom:12, flexWrap:'wrap' }}>
        <div>
          <div className="section-title">Smile Dynamics — SABR, smile-consistent deltas &amp; spot-vol regime ({pair})</div>
          <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:2 }}>
            How the smile moves when spot moves decides your hedge ratio · Bartlett delta is the variance-optimal hedge under SABR
          </div>
        </div>
        <div style={{ display:'flex', gap:4, alignItems:'center', flexWrap:'wrap' }}>
          {crypto && <Chip active={mode === 'live'} onClick={() => setMode('live')}>Live Deribit smiles</Chip>}
          <Chip active={!live} onClick={() => setMode('quotes')}>ATM / RR / BF quotes</Chip>
          <span style={{ width:8 }} />
          <span style={{ fontSize:9, color:'var(--text-muted)' }}>β</span>
          {[1, 0.5, 0].map(b => <Chip key={b} active={beta === b} onClick={() => setBeta(b)}>{b}</Chip>)}
        </div>
      </div>
      {!live && (
        <div className="glass" style={{ borderRadius:8, padding:10, marginBottom:12 }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(120px, 1fr))', gap:10 }}>
            <Field label="Tenor (years)" value={q.T} onChange={setF('T')} step={0.05} />
            <Field label="ATM vol (%)" value={q.atm} onChange={setF('atm')} step={0.5} />
            <Field label="25Δ RR (vol pts)" value={q.rr25} onChange={setF('rr25')} step={0.1} />
            <Field label="25Δ BF (vol pts)" value={q.bf25} onChange={setF('bf25')} step={0.1} />
          </div>
          <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:6 }}>
            {smileQuotes ? 'Pre-filled from Vol Smile / Vol Lab. ' : ''}A vanna-volga smile is built from the quotes, then SABR is fitted to it.
          </div>
        </div>
      )}
      {res.error && <div style={{ padding:8, borderRadius:6, fontSize:11, marginBottom:10, background:'rgba(255,61,90,0.1)', border:'1px solid #ff3d5a', color:'#ff3d5a' }}>{res.error}</div>}
      {!d && !res.error && <div style={{ fontSize:11, color:'var(--text-muted)', padding:12 }}>Fitting SABR…</div>}
      {d && <Body key={d.reference + beta} d={d} loading={res.loading} />}
    </div>
  )
}

function Body({ d, loading }) {
  const [sel, setSel] = useState(d.reference)
  const e = d.expiries.find(x => x.label === sel) ?? d.expiries[0]
  const p = e.params
  const emp = d.empirical
  const bb = e.backbone
  const atmRow = e.deltas.find(r => r.label.startsWith('ATM'))
  return (
    <div style={{ opacity: loading ? 0.6 : 1, transition:'opacity .2s' }}>
      {d.expiries.length > 1 && (
        <div style={{ display:'flex', gap:4, marginBottom:10, flexWrap:'wrap' }}>
          {d.expiries.map(x => <Chip key={x.label} active={x.label === e.label} onClick={() => setSel(x.label)}>{x.label} · {x.days.toFixed(0)}d</Chip>)}
        </div>
      )}
      <Kpis items={[
        { label:'SABR ATM vol', value:`${(bb.atm_vol * 100).toFixed(1)}%`, sub:`α ${p.alpha.toPrecision(3)} · β ${p.beta}` },
        { label:'ρ (spot-vol corr.)', value:p.rho.toFixed(2), color: p.rho < 0 ? 'var(--red)' : 'var(--green)' },
        { label:'ν (vol of vol)', value:p.nu.toFixed(2), color:'#c084fc' },
        { label:'Fit RMSE', value:`${(p.rmse_vol * 100).toFixed(2)} vol`, sub:`max ${(p.max_err_vol * 100).toFixed(2)}` },
        { label:'ATM Δ: Bartlett vs BS', value:`${((atmRow.bartlett - atmRow.bs_sticky_strike) * 100).toFixed(1)}% notional`,
          color:'#00d4ff', hint:'Hedge-ratio correction for the ATM call' },
        ...(emp ? [{ label:`Realised spot-vol β (${emp.window}d)`, value:`${emp.volpts_per_1pct_recent >= 0 ? '+' : ''}${emp.volpts_per_1pct_recent.toFixed(2)} vol / +1%`,
          sub:`corr ${emp.corr_recent.toFixed(2)} · ${emp.index}`, color: emp.volpts_per_1pct_recent < 0 ? 'var(--red)' : 'var(--green)' }] : []),
        ...(d.regime ? [{ label:'Market behaves like', value:REGIME_NAME[d.regime.closest], color:'#ffd700',
          sub:`${d.regime.distance_volpts.toFixed(2)} vol pts from model (${d.reference})` }] : []),
      ]} />
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(420px, 1fr))', gap:12 }}>
        <Card title={`SABR fit · ${e.label}`}>
          <Plot data={[
              { x:e.market.strikes, y:e.market.iv.map(v => v * 100), type:'scatter', mode:'markers', name:'Market', marker:{ color:'#ffd700', size:6 } },
              { x:e.fit.strikes, y:e.fit.iv.map(v => v * 100), type:'scatter', mode:'lines', name:`SABR β=${p.beta}`, line:{ color:'#00d4ff', width:2 } },
            ]}
            layout={{ ...LAYOUT, xaxis:axis('Strike'), yaxis:axis('Implied vol (%)'),
              shapes:[{ type:'line', x0:e.forward, x1:e.forward, yref:'paper', y0:0, y1:1, line:{ color:'rgba(255,255,255,0.3)', dash:'dot' } }] }}
            config={CFG} style={{ width:'100%', height:290 }} />
        </Card>
        <Card title="Hedge ratio by smile rule (forward delta)">
          <Plot data={RULES.map(([k, n, c]) => ({ x:e.deltas.map(r => r.label), y:e.deltas.map(r => Math.abs(r[k])), type:'bar', name:n, marker:{ color:c } }))}
            layout={{ ...LAYOUT, barmode:'group', xaxis:axis('', { type:'category' }), yaxis:axis('|Δ|') }}
            config={CFG} style={{ width:'100%', height:290 }} />
        </Card>
        <Card title="Backbone — ATM vol change per +1% spot move">
          <Plot data={[
              { x:['Sticky strike', 'Sticky delta', 'SABR (α fixed)', 'Bartlett'], y:[bb.sticky_strike, bb.sticky_delta, bb.sabr, bb.bartlett], type:'bar',
                name:'Model', marker:{ color:['#94a3b8', '#ffd700', '#c084fc', '#00d4ff'] } },
              ...(emp ? [{ x:['Sticky strike', 'Sticky delta', 'SABR (α fixed)', 'Bartlett'], y:Array(4).fill(emp.volpts_per_1pct_recent), type:'scatter',
                mode:'lines', name:`Realised (${emp.index}, ${emp.window}d)`, line:{ color:'#ff3d5a', dash:'dash', width:2 } }] : []),
            ]}
            layout={{ ...LAYOUT, xaxis:axis('', { type:'category' }), yaxis:axis('Vol points', { zeroline:true, zerolinecolor:'#334155' }) }}
            config={CFG} style={{ width:'100%', height:290 }} />
          <div style={{ fontSize:9, color:'var(--text-muted)', padding:'0 8px 4px' }}>
            The rule whose backbone matches the realised spot-vol beta is the one your delta should assume.
          </div>
        </Card>
        {emp ? (
          <Card title={`Rolling ${emp.window}-day spot-vol relationship (${emp.index})`}>
            <Plot data={[
                { x:emp.rolling.map(r => r.date), y:emp.rolling.map(r => r.corr), type:'scatter', mode:'lines', name:'Correlation', line:{ color:'#00d4ff', width:1.8 } },
                { x:emp.rolling.map(r => r.date), y:emp.rolling.map(r => r.beta), type:'scatter', mode:'lines', name:'β (d ln IV / d ln S)', yaxis:'y2',
                  line:{ color:'#c084fc', width:1.2 } },
              ]}
              layout={{ ...LAYOUT, hovermode:'x unified', xaxis:axis('', { type:'date' }), yaxis:axis('Correlation', { range:[-1, 1], zeroline:true, zerolinecolor:'#334155' }),
                yaxis2:{ overlaying:'y', side:'right', showgrid:false, zeroline:false, color:'#c084fc' } }}
              config={CFG} style={{ width:'100%', height:290 }} />
          </Card>
        ) : (
          <Card title="Term structure of SABR ρ and ν">
            <TermChart d={d} />
          </Card>
        )}
      </div>
      {emp && d.expiries.length > 1 && <div style={{ marginTop:12 }}><Card title="Term structure of SABR ρ and ν"><TermChart d={d} /></Card></div>}
      <div style={{ marginTop:12 }}>
        <Card title={`Delta table · ${e.label} · F ${e.forward.toLocaleString(undefined, { maximumFractionDigits:2 })}`}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
              <thead><tr style={{ color:'var(--text-muted)', fontSize:9, textAlign:'right' }}>
                {['Option', 'Strike', 'Vol', 'Sticky strike', 'Sticky delta', 'SABR', 'Bartlett', 'Bartlett − BS'].map((h, i) =>
                  <th key={h} style={{ padding:'4px 8px', textAlign: i ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
              <tbody>{e.deltas.map(r => (
                <tr key={r.label} className="font-mono" style={{ borderTop:'1px solid var(--border)', textAlign:'right' }}>
                  <td style={{ textAlign:'left', padding:'5px 8px' }}>{r.label}</td>
                  <td style={{ padding:'5px 8px' }}>{r.strike.toLocaleString(undefined, { maximumFractionDigits: r.strike > 100 ? 0 : 4 })}</td>
                  <td style={{ padding:'5px 8px' }}>{(r.vol * 100).toFixed(2)}%</td>
                  {RULES.map(([k, , c]) => <td key={k} style={{ padding:'5px 8px', color:c }}>{r[k].toFixed(3)}</td>)}
                  <td style={{ padding:'5px 8px', color: Math.abs(r.bartlett_minus_bs) > 0.03 ? '#ffd700' : undefined }}>
                    {r.bartlett_minus_bs >= 0 ? '+' : ''}{(r.bartlett_minus_bs * 100).toFixed(1)}%</td>
                </tr>))}</tbody>
            </table>
          </div>
          <div style={{ fontSize:9, color:'var(--text-muted)', padding:'6px 8px' }}>
            Bartlett − BS is the extra hedge per unit notional: with ρ &lt; 0, spot rallies come with lower vol, so you need less delta on calls and more on puts.
          </div>
        </Card>
      </div>
      <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:10, lineHeight:1.5 }}>
        {d.source}. SABR: Hagan, Kumar, Lesniewski &amp; Woodward (2002) with Obłój (2008) leading term. Bartlett (2006), &quot;Hedging under SABR&quot;;
        variance-optimality: Keller-Ressel (2022). Realised β: OLS of daily d ln IV on d ln S (DVOL / GVZ / VXSLV).
      </div>
    </div>
  )
}

function TermChart({ d }) {
  return (
    <Plot data={[
        { x:d.expiries.map(e => e.days), y:d.expiries.map(e => e.params.rho), type:'scatter', mode:'lines+markers', name:'ρ', line:{ color:'#ff3d5a', width:2 } },
        { x:d.expiries.map(e => e.days), y:d.expiries.map(e => e.params.nu), type:'scatter', mode:'lines+markers', name:'ν', yaxis:'y2', line:{ color:'#c084fc', width:2 } },
      ]}
      layout={{ ...LAYOUT, hovermode:'x unified', xaxis:axis('Days to expiry'), yaxis:axis('ρ', { range:[-1, 1] }),
        yaxis2:{ overlaying:'y', side:'right', showgrid:false, zeroline:false, color:'#c084fc', title:{ text:'ν' } } }}
      config={CFG} style={{ width:'100%', height:260 }} />
  )
}
