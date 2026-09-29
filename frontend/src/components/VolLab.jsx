import { useEffect, useState } from 'react'
import _Plot from 'react-plotly.js'
const Plot = _Plot?.default ?? _Plot
import { usePortfolioStore, PAIR_META, isCrypto } from '../store/portfolio'
import { fetchVolCone, fetchCryptoVol } from '../api/client'

const pct   = (v, d = 1) => (v == null ? '—' : (v * 100).toFixed(d) + '%')
const pts   = (v, d = 2) => (v == null ? '—' : (v >= 0 ? '+' : '') + (v * 100).toFixed(d))
const money = (v, dp) => (v == null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: dp }))

const LAYOUT = {
  paper_bgcolor:'transparent', plot_bgcolor:'#080d18',
  font:{ color:'#94a3b8', size:11 },
  margin:{ l:52, r:16, t:12, b:44 },
  legend:{ bgcolor:'transparent', font:{ size:9 }, orientation:'h', x:0, y:-0.2 },
  hoverlabel:{ bgcolor:'#0f172a', font:{ color:'#e2e8f0' }, bordercolor:'rgba(0,212,255,0.15)' },
}
const axis = (title, extra = {}) => ({ title:{ text:title }, gridcolor:'#1e293b', color:'#475569', zeroline:false, ...extra })

async function loadVol(pair) {
  const crypto = isCrypto(pair)
  const [cone, surface] = await Promise.allSettled([
    fetchVolCone(pair),
    crypto ? fetchCryptoVol(pair.slice(0, 3)) : Promise.resolve(null),
  ])
  const errMsg = r => r.reason?.response?.data?.detail ?? r.reason?.message ?? 'unavailable'
  return {
    cone:    cone.status === 'fulfilled' ? cone.value : null,
    surface: surface.status === 'fulfilled' ? surface.value : null,
    errors: [
      cone.status === 'rejected' && `Realised vol: ${errMsg(cone)}`,
      surface.status === 'rejected' && `Deribit surface: ${errMsg(surface)}`,
    ].filter(Boolean),
  }
}

export default function VolLab() {
  const { pair, setT, setSigma, setS, setSmileQuotes } = usePortfolioStore()
  const [nonce, setNonce] = useState(0)
  const [response, setResponse] = useState({ key:null, data:null })
  const [expiryIdx, setExpiryIdx] = useState(null)
  const [toast, setToast] = useState(null)
  const requestKey = `${pair}:${nonce}`

  useEffect(() => {
    let stale = false
    loadVol(pair).then(data => { if (!stale) setResponse({ key:requestKey, data }) })
    return () => { stale = true }
  }, [pair, requestKey])

  const loading = response.key !== requestKey
  const data = response.key?.startsWith(`${pair}:`) ? response.data : null
  const cone = data?.cone
  const surface = data?.surface
  const expiries = surface?.expiries ?? []
  // Default smile: the listed expiry closest to 30 days.
  const defaultIdx = expiries.length
    ? expiries.reduce((b, e, i) => Math.abs(e.days - 30) < Math.abs(expiries[b].days - 30) ? i : b, 0) : 0
  const sel = expiries[expiryIdx ?? defaultIdx]
  const dp = PAIR_META[pair]?.dp ?? 4

  const useInPricing = (e) => {
    setT(+e.T.toFixed(4))
    setSigma(+e.atm_vol.toFixed(4))
    if (surface?.index_price) setS(surface.index_price)
    setSmileQuotes({ atm:+(e.atm_vol * 100).toFixed(2), rr25:+((e.rr25 ?? 0) * 100).toFixed(2),
      bf25:+((e.bf25 ?? 0) * 100).toFixed(2) })
    setToast(`${e.label}: T, ATM σ and RR/BF loaded — open the Vol Smile tab to price legs off this smile`)
    setTimeout(() => setToast(null), 4000)
  }

  const tenor1M = cone?.tenors?.find(t => t.tenor === '1M')
  const kpis = surface ? [
    { label:'Index',    value: money(surface.index_price, dp) },
    { label:'DVOL',     value: pct(surface.dvol?.last) },
    { label:'ATM IV 30d', value: pct(surface.iv_30d) },
    { label:'RV 30d',   value: pct(surface.rv_30d) },
    { label:'VRP (IV−RV)', value: pts(surface.vrp_30d, 1) + ' vol',
      color: surface.vrp_30d == null ? undefined : surface.vrp_30d >= 0 ? 'var(--amber)' : 'var(--green)',
      hint: surface.vrp_30d >= 0 ? 'Options rich vs realised' : 'Options cheap vs realised' },
    { label:'RV 1M pctile', value: tenor1M ? `${tenor1M.current_percentile.toFixed(0)}th` : '—' },
  ] : cone ? [
    { label:'Last',         value: money(cone.last_price, dp) },
    { label:'RV 1M',        value: pct(tenor1M?.current) },
    { label:'RV 1M pctile', value: tenor1M ? `${tenor1M.current_percentile.toFixed(0)}th` : '—' },
    { label:'1M median',    value: pct(tenor1M?.median) },
    { label:'EWMA σ',       value: pct(cone.ewma_vol) },
  ] : []

  return (
    <div style={{ padding:16 }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, marginBottom:12, flexWrap:'wrap' }}>
        <div>
          <div className="section-title">Vol Lab — {pair}</div>
          <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:2 }}>
            Realised-vol cone (Burghardt-Lane) · {isCrypto(pair)
              ? 'live Deribit surface, SVI per expiry, 365-day vol'
              : `${cone?.periods_per_year ?? 252}-day annualisation · no free listed-option feed for this pair`}
          </div>
        </div>
        <button className="btn-ghost" onClick={() => setNonce(n => n + 1)} disabled={loading} style={{ fontSize:10 }}>
          {loading ? '⟳ Loading' : '↻ Refresh'}
        </button>
      </div>

      {data?.errors?.map(e => (
        <div key={e} style={{ padding:8, borderRadius:6, marginBottom:8, fontSize:11,
          background:'rgba(255,61,90,0.1)', border:'1px solid #ff3d5a', color:'#ff3d5a' }}>{e}</div>
      ))}
      {toast && (
        <div style={{ padding:8, borderRadius:6, marginBottom:8, fontSize:11,
          background:'rgba(0,255,136,0.08)', border:'1px solid rgba(0,255,136,0.4)', color:'var(--green)' }}>{toast}</div>
      )}

      {!data && loading && <div className="skeleton" style={{ height:360, borderRadius:8 }}/>}

      {kpis.length > 0 && (
        <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap', opacity: loading ? 0.6 : 1 }}>
          {kpis.map(k => (
            <div key={k.label} className="glass" title={k.hint} style={{ padding:'6px 12px', borderRadius:6, fontSize:11 }}>
              <div style={{ color:'var(--text-muted)', fontSize:9, letterSpacing:'0.05em' }}>{k.label}</div>
              <div className="font-mono" style={{ color: k.color ?? 'var(--cyan)', fontWeight:700, fontSize:14 }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {cone?.tenors?.length > 0 && <ConeChart cone={cone} surface={surface} />}

      {sel && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(340px, 1fr))', gap:12, marginTop:12 }}>
          <div>
            <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:6 }}>
              {expiries.map((e, i) => (
                <button key={e.expiry} onClick={() => setExpiryIdx(i)} className="font-mono"
                  style={{ padding:'3px 8px', borderRadius:4, fontSize:9, cursor:'pointer',
                    border:'1px solid ' + (e === sel ? 'var(--cyan)' : 'var(--border)'),
                    background: e === sel ? 'rgba(0,212,255,0.1)' : 'transparent',
                    color: e === sel ? 'var(--cyan)' : 'var(--text-muted)' }}>{e.label}</button>
              ))}
            </div>
            <SmileChart e={sel} pair={pair} />
          </div>
          <TermTable expiries={expiries} sel={sel} onSelect={setExpiryIdx} onUse={useInPricing} dp={dp} />
        </div>
      )}

      <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:10, lineHeight:1.5 }}>
        Cone: percentiles of rolling close-to-close realised vol over 2y (Burghardt &amp; Lane 1990). Implied ATM term structure
        (crypto) is interpolated linearly in total variance. Smiles: raw SVI (Gatheral 2004) fitted to Deribit OTM mark IVs,
        butterfly-arbitrage check via Durrleman&apos;s condition (Gatheral &amp; Jacquier 2014). RR/BF use Black-76 forward 25Δ.
      </div>
    </div>
  )
}

function ConeChart({ cone, surface }) {
  const t = cone.tenors
  const x = t.map(r => r.days)
  const band = (lo, hi, name, color) => ([
    { x, y:t.map(r => r[lo] * 100), type:'scatter', mode:'lines', line:{ width:0 }, hoverinfo:'skip', showlegend:false },
    { x, y:t.map(r => r[hi] * 100), type:'scatter', mode:'lines', line:{ width:0 }, fill:'tonexty',
      fillcolor:color, name, hoverinfo:'skip' },
  ])
  const traces = [
    ...band('p10', 'p90', '10–90th pct', 'rgba(0,212,255,0.08)'),
    ...band('p25', 'p75', '25–75th pct', 'rgba(0,212,255,0.18)'),
    { x, y:t.map(r => r.max * 100), type:'scatter', mode:'lines', name:'Max / Min',
      line:{ color:'rgba(148,163,184,0.5)', width:1, dash:'dot' } },
    { x, y:t.map(r => r.min * 100), type:'scatter', mode:'lines', showlegend:false,
      line:{ color:'rgba(148,163,184,0.5)', width:1, dash:'dot' } },
    { x, y:t.map(r => r.median * 100), type:'scatter', mode:'lines', name:'Median RV',
      line:{ color:'#00d4ff', width:1.5, dash:'dash' } },
    { x, y:t.map(r => r.current * 100), type:'scatter', mode:'lines+markers', name:'Current RV',
      line:{ color:'#ffd700', width:2.5 }, marker:{ size:7 },
      customdata:t.map(r => r.current_percentile),
      hovertemplate:'%{y:.1f}% · %{customdata:.0f}th pct<extra>Current RV</extra>' },
  ]
  const ts = surface?.atm_term_structure?.filter(r => r.atm_vol != null) ?? []
  if (ts.length) traces.push({
    x:ts.map(r => r.days), y:ts.map(r => r.atm_vol * 100), type:'scatter', mode:'lines+markers',
    name:'Implied ATM (Deribit)', line:{ color:'#00ff88', width:2.5 }, marker:{ size:8, symbol:'diamond' },
  })
  return (
    <div className="glass" style={{ borderRadius:8, padding:8 }}>
      <div className="section-title" style={{ fontSize:10, margin:'2px 0 4px 6px' }}>
        Volatility Cone{ts.length ? ' vs Implied Term Structure' : ''}
      </div>
      <Plot data={traces}
        layout={{ ...LAYOUT, hovermode:'x unified',
          xaxis:axis('Horizon', { tickvals:x, ticktext:t.map(r => r.tenor) }),
          yaxis:axis('Annualised vol (%)') }}
        config={{ responsive:true, displayModeBar:false }}
        style={{ width:'100%', height:300 }} />
    </div>
  )
}

function SmileChart({ e, pair }) {
  const traces = [
    { x:e.market.strikes, y:e.market.iv.map(v => v * 100), type:'scatter', mode:'markers', name:'Deribit mark IV',
      marker:{ color:'#ffd700', size:6, line:{ color:'#0a0e1a', width:1 } } },
    { x:e.fit.strikes, y:e.fit.iv.map(v => v * 100), type:'scatter', mode:'lines', name:'SVI fit',
      line:{ color:'#00d4ff', width:2.5 } },
  ]
  if (e.K_25p) traces.push({
    x:[e.K_25p, e.forward, e.K_25c], y:[e.vol_25p, e.atm_vol, e.vol_25c].map(v => v * 100),
    type:'scatter', mode:'markers+text', name:'25Δ P · ATMF · 25Δ C',
    text:['25ΔP', 'ATM', '25ΔC'], textposition:'top center', textfont:{ size:9, color:'#00ff88' },
    marker:{ color:'#00ff88', size:9, symbol:'diamond', line:{ color:'#0a0e1a', width:2 } },
  })
  return (
    <div className="glass" style={{ borderRadius:8, padding:8 }}>
      <div className="section-title" style={{ fontSize:10, margin:'2px 0 4px 6px' }}>
        {pair.slice(0, 3)} smile · {e.label} · {e.days.toFixed(1)}d · fit RMSE {(e.fit_rmse * 100).toFixed(2)} vol
      </div>
      <Plot data={traces}
        layout={{ ...LAYOUT,
          xaxis:axis('Strike (USD)'), yaxis:axis('Implied vol (%)'),
          shapes:[{ type:'line', x0:e.forward, x1:e.forward, yref:'paper', y0:0, y1:1,
            line:{ color:'rgba(255,215,0,0.35)', width:1, dash:'dot' } }] }}
        config={{ responsive:true, displayModeBar:false }}
        style={{ width:'100%', height:300 }} />
    </div>
  )
}

function TermTable({ expiries, sel, onSelect, onUse, dp }) {
  const head = ['Expiry', 'Days', 'Forward', 'ATM', '25Δ RR', '25Δ BF', 'Fit', 'Arb', '']
  return (
    <div>
      <div className="section-title" style={{ fontSize:10, marginBottom:6 }}>Term Structure (SVI-implied)</div>
      <div style={{ overflowX:'auto', borderRadius:8, border:'1px solid var(--border)' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
          <thead>
            <tr style={{ background:'var(--bg3)' }}>
              {head.map((h, i) => (
                <th key={i} style={{ padding:'7px 8px', fontWeight:600, fontSize:9, color:'var(--text-muted)',
                  textAlign: i === 0 ? 'left' : 'right', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {expiries.map((e, i) => (
              <tr key={e.expiry} onClick={() => onSelect(i)} style={{ borderTop:'1px solid var(--border)', cursor:'pointer',
                background: e === sel ? 'rgba(0,212,255,0.06)' : undefined }}>
                <td className="font-mono" style={{ padding:'5px 8px' }}>{e.label}</td>
                <Num v={e.days.toFixed(1)} />
                <Num v={money(e.forward, dp)} />
                <Num v={pct(e.atm_vol, 2)} />
                <Num v={pts(e.rr25)} color={e.rr25 == null ? undefined : e.rr25 < 0 ? 'var(--red)' : 'var(--green)'} />
                <Num v={pts(e.bf25)} />
                <Num v={(e.fit_rmse * 100).toFixed(2)} />
                <Num v={e.butterfly_arb_free ? '✓' : '✗'} color={e.butterfly_arb_free ? 'var(--green)' : 'var(--red)'} />
                <td style={{ padding:'3px 6px', textAlign:'right' }}>
                  <button onClick={ev => { ev.stopPropagation(); onUse(e) }} title="Load T, ATM σ and RR/BF into pricing & Vol Smile"
                    style={{ padding:'2px 6px', borderRadius:4, fontSize:9, cursor:'pointer', whiteSpace:'nowrap',
                      background:'rgba(0,212,255,0.1)', border:'1px solid rgba(0,212,255,0.4)', color:'var(--cyan)' }}>Use →</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:6 }}>
        RR/BF in vol points. Negative RR = puts over calls (downside skew). Fit = RMSE in vol points.
      </div>
    </div>
  )
}

const Num = ({ v, color }) => (
  <td className="font-mono" style={{ padding:'5px 8px', textAlign:'right', whiteSpace:'nowrap', color }}>{v}</td>
)
