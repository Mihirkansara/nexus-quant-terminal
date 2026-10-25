import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import _Plot from 'react-plotly.js'
const Plot = _Plot?.default ?? _Plot
import { usePortfolioStore, isCrypto } from '../store/portfolio'
import { fetchPositioning } from '../api/client'
import KpiStrip from './KpiStrip'

const LAYOUT = {
  paper_bgcolor:'transparent', plot_bgcolor:'#0a1511',
  font:{ family:"'Geist Variable', sans-serif", color:'#9eab9f', size:11 },
  margin:{ l:62, r:16, t:12, b:42 },
  legend:{ bgcolor:'transparent', font:{ size:10.5 }, orientation:'h', x:0, y:-0.22 },
  hoverlabel:{ bgcolor:'#0f1d18', font:{ color:'#ebe5d3' }, bordercolor:'rgba(169,154,255,0.15)' },
}
const CFG = { responsive:true, displayModeBar:false }
const axis = (title, extra = {}) => ({ title:{ text:title }, gridcolor:'#1c2e26', color:'#7e8f84', zeroline:false, ...extra })
const usd = (v) => {
  if (v == null) return '—'
  const a = Math.abs(v), s = v < 0 ? '−' : ''
  return a >= 1e9 ? `${s}$${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `${s}$${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${s}$${(a / 1e3).toFixed(0)}K` : `${s}$${a.toFixed(0)}`
}
const px = (v) => (v == null ? '—' : Number(v).toLocaleString(undefined, { maximumFractionDigits: v > 1000 ? 0 : 2 }))

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

export default function Positioning() {
  const { pair } = usePortfolioStore()
  return <Desk key={pair} pair={pair} />
}

function Desk({ pair }) {
  const [ccy, setCcy] = useState(isCrypto(pair) ? pair.slice(0, 3) : 'BTC')
  const [conv, setConv] = useState('classic')
  const [days, setDays] = useState(120)
  const [nonce, setNonce] = useState(0)
  const key = `${ccy}|${conv}|${days}|${nonce}`
  const [res, setRes] = useState({ key:null, data:null, error:null })
  useEffect(() => {
    let stale = false
    fetchPositioning(ccy, conv, days)
      .then(data => { if (!stale) setRes({ key, data, error:null }) })
      .catch(e => { if (!stale) setRes({ key, data:null, error: e?.response?.data?.detail?.toString() ?? 'Deribit data unavailable' }) })
    return () => { stale = true }
  }, [key, ccy, conv, days])
  const d = res.data
  const loading = res.key !== key

  return (
    <div style={{ padding:16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, marginBottom:12, flexWrap:'wrap' }}>
        <div>
          <div className="section-title" style={{ color:'var(--text-muted)', letterSpacing:'0.08em' }}>{ccy} · Deribit</div>
          <div style={{ fontSize:10.5, color:'var(--text-muted)', marginTop:2 }}>
            Where dealer hedging dampens or amplifies moves · live open interest · Black-76 Greeks on each expiry&apos;s forward
          </div>
        </div>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap', alignItems:'center' }}>
          {['BTC', 'ETH'].map(c => <Chip key={c} active={ccy === c} onClick={() => setCcy(c)}>{c}</Chip>)}
          <span style={{ width:8 }} />
          {[[7, '≤7d'], [30, '≤30d'], [120, '≤120d']].map(([v, l]) => <Chip key={v} active={days === v} onClick={() => setDays(v)}>{l}</Chip>)}
          <span style={{ width:8 }} />
          <Chip active={conv === 'classic'} onClick={() => setConv('classic')}>Dealers long calls / short puts</Chip>
          <Chip active={conv === 'short_all'} onClick={() => setConv('short_all')}>Dealers short all</Chip>
          <Chip onClick={() => setNonce(n => n + 1)}><RefreshCw size={13} aria-label="Reload" /></Chip>
        </div>
      </div>
      {!isCrypto(pair) && <div style={{ fontSize:10.5, color:'var(--text-muted)', marginBottom:8 }}>
        Listed-option open interest is only free for crypto (Deribit); showing {ccy}. Gold / FX positioning needs CME data.</div>}
      {res.error && !loading && <div style={{ padding:8, borderRadius:6, fontSize:11, marginBottom:10, background:'rgba(238,107,91,0.1)', border:'1px solid #ee6b5b', color:'#ee6b5b' }}>{res.error}</div>}
      {!d && !res.error && <div style={{ fontSize:11, color:'var(--text-muted)', padding:12 }}>Loading Deribit open interest…</div>}
      {d && <Body d={d} loading={loading} />}
    </div>
  )
}

function Body({ d, loading }) {
  const t = d.totals
  const pos = t.gex > 0
  const flipDist = d.gamma_flip ? (d.spot / d.gamma_flip - 1) * 100 : null
  const near = d.expiries[0]
  return (
    <div style={{ opacity: loading ? 0.6 : 1, transition:'opacity .2s' }}>
      <Kpis items={[
        { label:'Index', value:px(d.spot), sub:`${d.n_options} options · ≤${d.horizon_days}d` },
        { label:'Net dealer GEX', value:`${usd(t.gex)} / 1%`,
          sub: pos ? 'long gamma → dampening' : 'short gamma → amplifying', hint:'USD dealers must trade for each 1% spot move' },
        { label:'Gamma flip', value:px(d.gamma_flip), color:'#e4dcc3',
          sub: flipDist == null ? 'no zero crossing in ±25%' : `spot ${flipDist >= 0 ? '+' : ''}${flipDist.toFixed(1)}% vs flip` },
        { label:'Call wall', value:px(d.walls.call_wall), sub:`max call OI ${px(d.walls.max_call_oi)}` },
        { label:'Put wall', value:px(d.walls.put_wall), sub:`max put OI ${px(d.walls.max_put_oi)}` },
        { label:'Put / call OI', value:t.put_call.toFixed(2), sub:`${usd(t.notional_usd)} notional` },
        { label:'Vanna (per +1 vol)', value:usd(t.vex), sub:'dealer delta change', color:'#d58fc0' },
        { label:'Charm (per day)', value:usd(t.cex), sub:'dealer delta drift' },
        ...(near ? [{ label:`Next expiry ${near.expiry.slice(5)}`, value:`±${near.implied_move_pct.toFixed(1)}%`,
          sub:`max pain ${px(near.max_pain)} (${near.max_pain_vs_spot_pct >= 0 ? '+' : ''}${near.max_pain_vs_spot_pct.toFixed(1)}%)` }] : []),
      ]} />
      <div className="glass" style={{ borderRadius:8, padding:'6px 10px', marginBottom:12, fontSize:11 }}>
        <span style={{ color:'var(--text-muted)' }}>Regime: </span>
        <span style={{ color: pos ? 'var(--blue)' : 'var(--mauve)' }}>{d.regime}</span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(440px, 1fr))', gap:12 }}>
        <Card title="Gamma profile — net dealer GEX if spot moved here">
          <Plot data={[
              { x:d.profile.spot, y:d.profile.gex.map(v => (v > 0 ? v : null)), type:'scatter', mode:'lines', fill:'tozeroy', name:'Long gamma',
                line:{ color:'#86abea', width:1.5 }, fillcolor:'rgba(134,171,234,0.14)' },
              { x:d.profile.spot, y:d.profile.gex.map(v => (v <= 0 ? v : null)), type:'scatter', mode:'lines', fill:'tozeroy', name:'Short gamma',
                line:{ color:'#d58fc0', width:1.5 }, fillcolor:'rgba(213,143,192,0.14)' },
            ]}
            layout={{ ...LAYOUT, hovermode:'x unified', xaxis:axis('Spot'), yaxis:axis('USD per 1% move'),
              shapes:[
                { type:'line', x0:d.spot, x1:d.spot, yref:'paper', y0:0, y1:1, line:{ color:'#ebe5d3', width:1.2 } },
                ...(d.gamma_flip ? [{ type:'line', x0:d.gamma_flip, x1:d.gamma_flip, yref:'paper', y0:0, y1:1, line:{ color:'#e4dcc3', dash:'dot', width:1.5 } }] : []),
              ],
              annotations:[{ x:d.spot, y:1, yref:'paper', text:'spot', showarrow:false, font:{ size:10.5, color:'#ebe5d3' }, yanchor:'bottom' },
                ...(d.gamma_flip ? [{ x:d.gamma_flip, y:0.92, yref:'paper', text:'flip', showarrow:false, font:{ size:10.5, color:'#e4dcc3' } }] : [])] }}
            config={CFG} style={{ width:'100%', height:300 }} />
        </Card>
        <Card title="GEX by strike (calls + / puts −)">
          <Plot data={[
              { x:d.strikes.map(s => s.strike), y:d.strikes.map(s => s.call_gex), type:'bar', name:'Call GEX', marker:{ color:'rgba(79,198,144,0.6)' } },
              { x:d.strikes.map(s => s.strike), y:d.strikes.map(s => s.put_gex), type:'bar', name:'Put GEX', marker:{ color:'rgba(238,107,91,0.6)' } },
              { x:d.strikes.map(s => s.strike), y:d.strikes.map(s => s.net_gex), type:'scatter', mode:'lines', name:'Net', line:{ color:'#86abea', width:1.5 } },
            ]}
            layout={{ ...LAYOUT, barmode:'relative', hovermode:'x unified', xaxis:axis('Strike'), yaxis:axis('USD per 1% move'),
              shapes:[{ type:'line', x0:d.spot, x1:d.spot, yref:'paper', y0:0, y1:1, line:{ color:'#ebe5d3', width:1 } }] }}
            config={CFG} style={{ width:'100%', height:300 }} />
        </Card>
        <Card title="Open interest by strike">
          <Plot data={[
              { x:d.strikes.map(s => s.strike), y:d.strikes.map(s => s.call_oi), type:'bar', name:'Calls', marker:{ color:'rgba(79,198,144,0.55)' } },
              { x:d.strikes.map(s => s.strike), y:d.strikes.map(s => -s.put_oi), type:'bar', name:'Puts (−)', marker:{ color:'rgba(238,107,91,0.55)' } },
            ]}
            layout={{ ...LAYOUT, barmode:'relative', hovermode:'x unified', xaxis:axis('Strike'), yaxis:axis('Contracts (coins)'),
              shapes:[{ type:'line', x0:d.spot, x1:d.spot, yref:'paper', y0:0, y1:1, line:{ color:'#ebe5d3', width:1 } }] }}
            config={CFG} style={{ width:'100%', height:300 }} />
        </Card>
        <Card title="Implied 1σ range and max pain by expiry">
          <Plot data={[
              { x:d.expiries.map(e => e.expiry), y:d.expiries.map(e => e.forward), type:'scatter', mode:'markers', name:'Forward ±1σ',
                marker:{ color:'#86abea', size:7 },
                error_y:{ type:'data', symmetric:true, array:d.expiries.map(e => e.implied_move), color:'rgba(169,154,255,0.5)', thickness:1.5 } },
              { x:d.expiries.map(e => e.expiry), y:d.expiries.map(e => e.max_pain), type:'scatter', mode:'markers', name:'Max pain',
                marker:{ color:'#e4dcc3', size:10.5, symbol:'diamond' } },
            ]}
            layout={{ ...LAYOUT, hovermode:'x unified', xaxis:axis('Expiry', { type:'category' }), yaxis:axis('Price'),
              shapes:[{ type:'line', xref:'paper', x0:0, x1:1, y0:d.spot, y1:d.spot, line:{ color:'rgba(255,255,255,0.3)', dash:'dot' } }] }}
            config={CFG} style={{ width:'100%', height:300 }} />
        </Card>
      </div>
      <div style={{ marginTop:12 }}>
        <Card title="Expiry ladder">
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
              <thead><tr style={{ color:'var(--text-muted)', fontSize:10.5, textAlign:'right' }}>
                {['Expiry', 'Days', 'Call OI', 'Put OI', 'P/C', 'Notional', 'ATM IV', '±1σ move', 'Max pain', 'vs spot', 'Net GEX'].map((h, i) =>
                  <th key={h} style={{ padding:'4px 8px', textAlign: i ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
              <tbody>{d.expiries.map(e => (
                <tr key={e.expiry} className="font-mono" style={{ borderTop:'1px solid var(--border)', textAlign:'right' }}>
                  <td style={{ textAlign:'left', padding:'5px 8px' }}>{e.expiry}</td>
                  <td style={{ padding:'5px 8px' }}>{e.days.toFixed(1)}</td>
                  <td style={{ padding:'5px 8px', color:'var(--blue)' }}>{px(e.call_oi)}</td>
                  <td style={{ padding:'5px 8px', color:'var(--mauve)' }}>{px(e.put_oi)}</td>
                  <td style={{ padding:'5px 8px' }}>{e.put_call.toFixed(2)}</td>
                  <td style={{ padding:'5px 8px' }}>{usd(e.notional_usd)}</td>
                  <td style={{ padding:'5px 8px' }}>{(e.atm_iv * 100).toFixed(1)}%</td>
                  <td style={{ padding:'5px 8px', color:'var(--cyan)' }}>±{e.implied_move_pct.toFixed(1)}%</td>
                  <td style={{ padding:'5px 8px', color:'#e4dcc3' }}>{px(e.max_pain)}</td>
                  <td style={{ padding:'5px 8px' }}>{e.max_pain_vs_spot_pct >= 0 ? '+' : ''}{e.max_pain_vs_spot_pct.toFixed(1)}%</td>
                  <td style={{ padding:'5px 8px', color: e.gex >= 0 ? 'var(--blue)' : 'var(--mauve)' }}>{usd(e.gex)}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </Card>
      </div>
      <div style={{ fontSize:10.5, color:'var(--text-muted)', marginTop:10, lineHeight:1.5 }}>
        {d.source}. GEX = Σ sign·Γ·OI·S²·1% (USD dealers trade per 1% move); flip = zero crossing of GEX re-computed across spot (sticky-strike IV).
        The dealer-side sign is an assumption (SpotGamma &quot;classic&quot;: dealers long calls sold by overwriters / vaults, short puts bought by hedgers) —
        switch conventions to see how much the conclusion depends on it. Max pain is a heuristic; it pins only when dealers are long gamma. Not trading advice.
      </div>
    </div>
  )
}
