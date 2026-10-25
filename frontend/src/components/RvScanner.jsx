import { useEffect, useState } from 'react'
import _Plot from 'react-plotly.js'
const Plot = _Plot?.default ?? _Plot
import { usePortfolioStore, isCrypto } from '../store/portfolio'
import { fetchRvScan } from '../api/client'

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
const usd = (v, d = 0) => (v == null ? '—' : `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits:d })}`)
const px = (v) => (v == null ? '—' : Number(v).toLocaleString(undefined, { maximumFractionDigits: v > 1000 ? 0 : 2 }))

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

const th = (h, i) => <th key={h} style={{ padding:'4px 8px', textAlign: i ? 'right' : 'left' }}>{h}</th>
const td = (v, extra = {}) => <td style={{ padding:'5px 8px', ...extra }}>{v}</td>

export default function RvScanner() {
  const { pair } = usePortfolioStore()
  return <Desk key={pair} pair={pair} />
}

function Desk({ pair }) {
  const [ccy, setCcy] = useState(isCrypto(pair) ? pair.slice(0, 3) : 'BTC')
  const [nonce, setNonce] = useState(0)
  const key = `${ccy}|${nonce}`
  const [res, setRes] = useState({ key:null, data:null, error:null })
  useEffect(() => {
    let stale = false
    fetchRvScan(ccy)
      .then(data => { if (!stale) setRes({ key, data, error:null }) })
      .catch(e => { if (!stale) setRes({ key, data:null, error: e?.response?.data?.detail?.toString() ?? 'Deribit data unavailable' }) })
    return () => { stale = true }
  }, [key, ccy])
  const d = res.data
  return (
    <div style={{ padding:16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, marginBottom:12, flexWrap:'wrap' }}>
        <div>
          <div className="section-title">Carry &amp; RV Scanner — basis, funding, smile mispricings, parity ({ccy}, Deribit)</div>
          <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:2 }}>
            Where the carry is, which options are rich or cheap after the bid/ask, and whether the book is arbitrage-free
          </div>
        </div>
        <div style={{ display:'flex', gap:4 }}>
          {['BTC', 'ETH'].map(c => <Chip key={c} active={ccy === c} onClick={() => setCcy(c)}>{c}</Chip>)}
          <Chip onClick={() => setNonce(n => n + 1)}>↻ Rescan</Chip>
        </div>
      </div>
      {!isCrypto(pair) && <div style={{ fontSize:9, color:'var(--text-muted)', marginBottom:8 }}>Free listed option and futures books exist for crypto (Deribit); showing {ccy}.</div>}
      {res.error && <div style={{ padding:8, borderRadius:6, fontSize:11, marginBottom:10, background:'rgba(255,61,90,0.1)', border:'1px solid #ff3d5a', color:'#ff3d5a' }}>{res.error}</div>}
      {!d && !res.error && <div style={{ fontSize:11, color:'var(--text-muted)', padding:12 }}>Scanning Deribit…</div>}
      {d && <Body d={d} loading={res.key !== key} />}
    </div>
  )
}

function Body({ d, loading }) {
  const [sel, setSel] = useState(d.expiries.find(e => e.days > 20)?.expiry ?? d.expiries[0].expiry)
  const e = d.expiries.find(x => x.expiry === sel) ?? d.expiries[0]
  const c = d.carry
  const front = c.futures[0]
  const back = c.futures.at(-1)
  const best = d.ideas[0]
  const near = d.expiries.find(x => x.days > 20) ?? d.expiries[0]
  return (
    <div style={{ opacity: loading ? 0.6 : 1, transition:'opacity .2s' }}>
      <Kpis items={[
        { label:'Index', value:px(c.index) },
        ...(c.perpetual ? [{ label:'Perp funding (ann.)', value:pct(c.perpetual.funding_annual, 2),
          sub:`premium ${c.perpetual.premium_pct.toFixed(3)}%`, color: c.perpetual.funding_annual > 0 ? 'var(--green)' : 'var(--red)' }] : []),
        ...(front ? [{ label:'Basis curve (ann.)', value:`${pct(front.basis_annual, 1)} → ${pct(back.basis_annual, 1)}`,
          sub:`${front.days.toFixed(0)}d → ${back.days.toFixed(0)}d`, hint:'Cash-and-carry yield: long spot, short future' }] : []),
        { label:`VRP ${near.expiry.slice(5)}`, value: near.vrp == null ? '—' : `${(near.vrp * 100).toFixed(1)} vol`,
          sub:`ATM ${pct(near.atm_iv)} vs RV30 ${pct(d.realised_30d)}`, color: (near.vrp ?? 0) > 0 ? 'var(--green)' : 'var(--red)' },
        { label:'Smile signals', value:String(d.ideas.length), sub: best ? `best ${best.side.split(' ')[0]} ${best.instrument}` : 'none beyond bid/ask', color:'#ffd700' },
        ...(best ? [{ label:'Best edge', value:usd(best.edge_usd), sub:`${(best.edge_vol * 100).toFixed(2)} vol net of ½ spread · per coin` }] : []),
        { label:'Parity: best executable', value: d.parity_max_executable == null ? '—' : usd(d.parity_max_executable),
          color: (d.parity_max_executable ?? -1) > 0 ? 'var(--red)' : 'var(--green)', sub:(d.parity_max_executable ?? -1) > 0 ? 'arb before fees' : 'no arb after spreads' },
        { label:'Static arbitrage', value:`${d.static_arbitrage_executable ?? 0} / ${d.static_arbitrage.length}`,
          color: d.static_arbitrage_executable ? 'var(--red)' : d.static_arbitrage.length ? '#ffd700' : 'var(--green)', sub:'executable at touch / on marks' },
      ]} />
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(440px, 1fr))', gap:12 }}>
        <Card title="Carry — futures basis, options-implied forwards, perp funding (annualised)">
          <Plot data={[
              { x:c.futures.map(f => f.days), y:c.futures.map(f => f.basis_annual * 100), type:'scatter', mode:'lines+markers', name:'Dated futures',
                line:{ color:'#00d4ff', width:2 }, text:c.futures.map(f => f.instrument), hovertemplate:'%{text}: %{y:.2f}%<extra></extra>' },
              { x:d.expiries.map(x => x.days), y:d.expiries.map(x => x.forward_basis_annual * 100), type:'scatter', mode:'markers', name:'Options-implied forward',
                marker:{ color:'#ffd700', size:8, symbol:'diamond' } },
              ...(c.perpetual?.funding_annual != null ? [{ x:[0], y:[c.perpetual.funding_annual * 100], type:'scatter', mode:'markers', name:'Perp funding',
                marker:{ color:'#c084fc', size:11, symbol:'star' } }] : []),
            ]}
            layout={{ ...LAYOUT, hovermode:'closest', xaxis:axis('Days to expiry'), yaxis:axis('% per year') }}
            config={CFG} style={{ width:'100%', height:300 }} />
        </Card>
        <Card title={`Smile residuals vs SVI · ${e.expiry} (${e.days.toFixed(0)}d)`}
          right={<div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>{d.expiries.map(x =>
            <Chip key={x.expiry} active={x.expiry === e.expiry} onClick={() => setSel(x.expiry)}>{x.expiry.slice(5)}</Chip>)}</div>}>
          <Plot data={[
              { x:e.residuals.map(r => r.strike), y:e.residuals.map(r => r.residual * 100), type:'scatter', mode:'markers', name:'Mark − SVI',
                marker:{ size:e.residuals.map(r => 6 + Math.min(14, Math.sqrt(r.oi) / 3)),
                  color:e.residuals.map(r => (r.edge_vol > 0 ? (r.residual > 0 ? '#ff3d5a' : '#00ff88') : '#475569')) },
                error_y:{ type:'data', array:e.residuals.map(r => (r.half_spread ?? 0) * 100), color:'rgba(148,163,184,0.5)', thickness:1 },
                text:e.residuals.map(r => r.instrument), hovertemplate:'%{text}<br>%{y:.2f} vol<extra></extra>' },
            ]}
            layout={{ ...LAYOUT, showlegend:false, xaxis:axis('Strike'), yaxis:axis('Vol points', { zeroline:true, zerolinecolor:'#334155' }),
              shapes:[{ type:'line', x0:e.forward, x1:e.forward, yref:'paper', y0:0, y1:1, line:{ color:'rgba(255,255,255,0.3)', dash:'dot' } }] }}
            config={CFG} style={{ width:'100%', height:300 }} />
          <div style={{ fontSize:9, color:'var(--text-muted)', padding:'0 8px 4px' }}>
            Bars = ½ bid/ask in vol. Red = rich beyond the spread (sell), green = cheap (buy), grey = inside the spread. Bubble size = open interest.
          </div>
        </Card>
      </div>
      <div style={{ marginTop:12 }}>
        <Card title="Trade ideas — mispricings net of bid/ask, ranked by USD edge per coin">
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
              <thead><tr style={{ color:'var(--text-muted)', fontSize:9, textAlign:'right' }}>
                {['Instrument', 'Side', 'Days', 'Mark IV', 'SVI fit', 'Residual', '½ spread', 'Net edge', 'Edge $', 'Vega $/pt', 'OI'].map(th)}</tr></thead>
              <tbody>{d.ideas.slice(0, 15).map(r => (
                <tr key={r.instrument} className="font-mono" style={{ borderTop:'1px solid var(--border)', textAlign:'right' }}>
                  {td(r.instrument, { textAlign:'left' })}
                  {td(r.side, { color: r.side.startsWith('sell') ? 'var(--red)' : 'var(--green)' })}
                  {td(r.days.toFixed(0))}{td(pct(r.mark_iv, 2))}{td(pct(r.fit_iv, 2))}
                  {td(`${r.residual >= 0 ? '+' : ''}${(r.residual * 100).toFixed(2)}`, { color:'#ffd700' })}
                  {td(r.half_spread == null ? '—' : (r.half_spread * 100).toFixed(2))}
                  {td((r.edge_vol * 100).toFixed(2), { color:'var(--cyan)' })}{td(usd(r.edge_usd))}{td(usd(r.vega_usd_per_pt, 1))}{td(px(r.oi))}
                </tr>))}
                {!d.ideas.length && <tr><td colSpan={11} style={{ padding:8, color:'var(--text-muted)' }}>No residual exceeds its half bid/ask — the smile is fairly priced.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(440px, 1fr))', gap:12, marginTop:12 }}>
        <Card title="Expiry ladder — vol carry and forward consistency">
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
              <thead><tr style={{ color:'var(--text-muted)', fontSize:9, textAlign:'right' }}>
                {['Expiry', 'Days', 'ATM IV', 'VRP', 'Fwd basis', 'Fwd − future', 'SVI RMSE'].map(th)}</tr></thead>
              <tbody>{d.expiries.map(x => (
                <tr key={x.expiry} className="font-mono" style={{ borderTop:'1px solid var(--border)', textAlign:'right' }}>
                  {td(x.expiry, { textAlign:'left' })}{td(x.days.toFixed(0))}{td(pct(x.atm_iv))}
                  {td(x.vrp == null ? '—' : `${(x.vrp * 100).toFixed(1)}`, { color:(x.vrp ?? 0) > 0 ? 'var(--green)' : 'var(--red)' })}
                  {td(pct(x.forward_basis_annual, 2))}{td(x.fwd_vs_future_bp == null ? '—' : `${x.fwd_vs_future_bp.toFixed(1)} bp`)}
                  {td(`${(x.svi_rmse * 100).toFixed(2)} vol`)}
                </tr>))}</tbody>
            </table>
          </div>
        </Card>
        <Card title="Put-call parity & static arbitrage">
          <div style={{ overflowX:'auto', maxHeight:260 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
              <thead><tr style={{ color:'var(--text-muted)', fontSize:9, textAlign:'right' }}>
                {['Expiry', 'Strike', 'Mark deviation', 'bp', 'Executable edge'].map(th)}</tr></thead>
              <tbody>{d.parity.slice(0, 8).map(p => (
                <tr key={`${p.expiry}-${p.strike}`} className="font-mono" style={{ borderTop:'1px solid var(--border)', textAlign:'right' }}>
                  {td(p.expiry, { textAlign:'left' })}{td(px(p.strike))}{td(usd(p.mark_dev_usd, 2))}{td(p.mark_dev_bp.toFixed(2))}
                  {td(p.executable_edge_usd == null ? '—' : usd(p.executable_edge_usd, 2), { color:(p.executable_edge_usd ?? -1) > 0 ? 'var(--red)' : 'var(--text-muted)' })}
                </tr>))}</tbody>
            </table>
            <div style={{ fontSize:10, padding:'6px 8px', color: d.static_arbitrage_executable ? 'var(--red)' : d.static_arbitrage.length ? 'var(--text-muted)' : 'var(--green)' }}>
              {d.static_arbitrage.length ? d.static_arbitrage.slice(0, 6).map(a => `${a.executable ? '⚠ EXECUTABLE ' : ''}${a.expiry} ${a.type} ${a.strikes.join('/')} (marks ${usd(a.violation_usd, 2)}${a.executable_usd == null ? '' : `, touch ${usd(a.executable_usd, 2)}`})`).join(' · ')
                : 'No vertical-spread or butterfly violations on mark prices.'}
            </div>
          </div>
        </Card>
      </div>
      <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:10, lineHeight:1.5 }}>
        {d.source}. Basis: (F/S − 1)·365/days; funding: funding_8h × 3 × 365. Residuals vs a raw-SVI fit per expiry (Gatheral 2004) on OTM mark IVs;
        bid/ask coin premiums inverted with Black-76 on the forward. Parity in coin terms C − P = (F − K)/F; executable edge uses ask for the leg bought,
        bid for the leg sold, before fees. Static checks: Carr &amp; Madan (2005). Signals are screens, not trade advice — check depth, fees and margin.
      </div>
    </div>
  )
}
