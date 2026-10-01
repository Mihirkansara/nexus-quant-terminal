import { useEffect, useState } from 'react'
import _Plot from 'react-plotly.js'
const Plot = _Plot?.default ?? _Plot
import { usePortfolioStore, isCrypto } from '../store/portfolio'
import { fetchVolForecast } from '../api/client'

const pct = (v, d = 1) => (v == null ? '—' : (v * 100).toFixed(d) + '%')
const MODEL_COLORS = {
  'Ensemble': '#00ff88', 'HAR-RV': '#00d4ff', 'GJR-GARCH': '#ffd700',
  'Gradient Boosting': '#c084fc', 'EWMA': '#94a3b8',
}
const HORIZONS = ['1D', '1W', '1M']
const VIEW_COLOR = { 'IMPLIED RICH': 'var(--amber)', 'IMPLIED CHEAP': 'var(--green)', 'FAIR': 'var(--cyan)' }

const LAYOUT = {
  paper_bgcolor:'transparent', plot_bgcolor:'#080d18',
  font:{ color:'#94a3b8', size:11 },
  margin:{ l:52, r:16, t:12, b:44 },
  legend:{ bgcolor:'transparent', font:{ size:9 }, orientation:'h', x:0, y:-0.22 },
  hoverlabel:{ bgcolor:'#0f172a', font:{ color:'#e2e8f0' }, bordercolor:'rgba(0,212,255,0.15)' },
}
const axis = (title, extra = {}) => ({ title:{ text:title }, gridcolor:'#1e293b', color:'#475569', zeroline:false, ...extra })

export default function VolForecast() {
  const { pair } = usePortfolioStore()
  const [nonce, setNonce] = useState(0)
  const [response, setResponse] = useState({ key:null, data:null, error:null })
  const [horizon, setHorizon] = useState('1M')
  const requestKey = `${pair}:${nonce}`

  useEffect(() => {
    let stale = false
    fetchVolForecast(pair)
      .then(data => { if (!stale) setResponse({ key:requestKey, data, error:null }) })
      .catch(e => { if (!stale) setResponse({ key:requestKey, data:null,
        error: e?.response?.data?.detail ?? e?.message ?? 'Forecast unavailable' }) })
    return () => { stale = true }
  }, [pair, requestKey])

  const loading = response.key !== requestKey
  const d = response.key?.startsWith(`${pair}:`) ? response.data : null
  const error = response.key === requestKey ? response.error : null

  return (
    <div style={{ padding:16 }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, marginBottom:12, flexWrap:'wrap' }}>
        <div>
          <div className="section-title">Vol Forecast &amp; Regime — {pair}</div>
          <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:2 }}>
            HAR-RV · GJR-GARCH · Gradient Boosting (ML) · HMM regimes · out-of-sample QLIKE backtest
            {d && <> · {d.periods_per_year}-day vol · data to {d.last_date}</>}
          </div>
        </div>
        <button className="btn-ghost" onClick={() => setNonce(n => n + 1)} disabled={loading} style={{ fontSize:10 }}>
          {loading ? '⟳ Fitting models' : '↻ Refresh'}
        </button>
      </div>

      {error && (
        <div style={{ padding:8, borderRadius:6, marginBottom:8, fontSize:11,
          background:'rgba(255,61,90,0.1)', border:'1px solid #ff3d5a', color:'#ff3d5a' }}>{error}</div>
      )}
      {!d && loading && (
        <div>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:8 }}>
            Fitting 4 models across 3 horizons and running a rolling out-of-sample backtest (first load can take ~10–20s)…
          </div>
          <div className="skeleton" style={{ height:360, borderRadius:8 }}/>
        </div>
      )}

      {d && (
        <div style={{ opacity: loading ? 0.6 : 1 }}>
          <Kpis d={d} pair={pair} />
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(380px, 1fr))', gap:12, marginBottom:12 }}>
            <TermChart d={d} />
            <RegimeChart d={d} />
          </div>
          <BacktestChart d={d} />
          <Leaderboard d={d} horizon={horizon} setHorizon={setHorizon} />
          <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:10, lineHeight:1.5 }}>
            Forecast target: average variance over the next h days, proxy = Garman-Klass range + overnight gap scaled to
            close-to-close (calibrated before the backtest window). HAR-RV (Corsi 2009){isCrypto(pair) ? ' with a weekend dummy for 24/7 crypto' : ''};
            GJR-GARCH(1,1) Gaussian QMLE (Glosten-Jagannathan-Runkle 1993); gradient boosting on HAR, return and calendar features.
            Models refit every 21 days on data available at each origin; scored with QLIKE, robust to proxy noise (Patton 2011);
            ensemble weights ∝ 1/QLIKE. Regimes: 2-state Gaussian HMM (Hamilton 1989).
          </div>
        </div>
      )}
    </div>
  )
}

function Kpis({ d, pair }) {
  const sig = d.implied_signals?.['1M']
  const reg = d.regime
  const items = [
    { label:'Forecast 1M (ensemble)', value: pct(d.current['1M'].Ensemble) },
    { label:'Realised 1M', value: pct(d.realised_now['1M']) },
    ...(isCrypto(pair) ? [
      { label:'Implied 1M (Deribit)', value: pct(sig?.implied) },
      { label:'Implied − forecast', value: sig ? `${sig.spread >= 0 ? '+' : ''}${(sig.spread * 100).toFixed(1)} vol` : '—',
        sub: sig?.view, color: sig ? VIEW_COLOR[sig.view] : undefined },
    ] : []),
    { label:'Regime (HMM)', value: reg.current, sub:`P(turbulent) ${pct(reg.p_turbulent_now, 0)}`,
      color: reg.current === 'TURBULENT' ? 'var(--red)' : 'var(--green)' },
    // Persistence ≳ 0.995 is effectively IGARCH: shocks barely decay and the "long-run vol" is not meaningful.
    d.garch?.persistence >= 0.995
      ? { label:'GARCH persistence', value: d.garch.persistence.toFixed(3), sub:'near-integrated (IGARCH-like)', color:'var(--amber)' }
      : { label:'GARCH half-life', value: d.garch?.half_life_days ? `${d.garch.half_life_days.toFixed(0)}d` : '—',
          sub:`long-run σ ${pct(d.garch?.long_run_vol)}` },
  ]
  return (
    <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' }}>
      {items.map(k => (
        <div key={k.label} className="glass" style={{ padding:'6px 12px', borderRadius:6, fontSize:11 }}>
          <div style={{ color:'var(--text-muted)', fontSize:9, letterSpacing:'0.05em' }}>{k.label}</div>
          <div className="font-mono" style={{ color: k.color ?? 'var(--cyan)', fontWeight:700, fontSize:14 }}>{k.value}</div>
          {k.sub && <div className="font-mono" style={{ fontSize:9, color: k.color ?? 'var(--text-muted)' }}>{k.sub}</div>}
        </div>
      ))}
    </div>
  )
}

function Card({ title, children }) {
  return (
    <div className="glass" style={{ borderRadius:8, padding:8 }}>
      <div className="section-title" style={{ fontSize:10, margin:'2px 0 4px 6px' }}>{title}</div>
      {children}
    </div>
  )
}

function TermChart({ d }) {
  const models = Object.keys(d.current['1M'])
  const x = HORIZONS.map(h => d.horizons[h])
  const traces = models.map(m => ({
    x, y:HORIZONS.map(h => d.current[h][m] * 100), type:'scatter', mode:'lines+markers', name:m,
    line:{ color:MODEL_COLORS[m], width: m === 'Ensemble' ? 3 : 1.5, dash: m === 'EWMA' ? 'dot' : 'solid' },
    marker:{ size: m === 'Ensemble' ? 8 : 5 },
  }))
  traces.push({ x, y:HORIZONS.map(h => d.realised_now[h] * 100), type:'scatter', mode:'markers',
    name:'Trailing realised', marker:{ color:'#ffffff', size:7, symbol:'x' } })
  const iv = HORIZONS.filter(h => d.implied_signals?.[h])
  if (iv.length) traces.push({ x:iv.map(h => d.horizons[h]), y:iv.map(h => d.implied_signals[h].implied * 100),
    type:'scatter', mode:'markers', name:'Deribit implied ATM', marker:{ color:'#ff3d5a', size:11, symbol:'diamond' } })
  return (
    <Card title="Forecast term structure (annualised)">
      <Plot data={traces}
        layout={{ ...LAYOUT, xaxis:axis('', { tickvals:x, ticktext:HORIZONS }), yaxis:axis('Vol (%)') }}
        config={{ responsive:true, displayModeBar:false }} style={{ width:'100%', height:280 }} />
    </Card>
  )
}

function RegimeChart({ d }) {
  const r = d.regime
  const x = r.history_dates ?? r.history_p_turbulent.map((_, i) => i)
  return (
    <Card title={`HMM regime · calm σ ${pct(r.state_vol[0], 0)} (~${r.expected_duration_days[0].toFixed(0)}d) · turbulent σ ${pct(r.state_vol[1], 0)} (~${r.expected_duration_days[1].toFixed(0)}d)`}>
      <Plot data={[{ x, y:r.history_p_turbulent.map(p => p * 100), type:'scatter', mode:'lines', fill:'tozeroy',
          name:'P(turbulent)', line:{ color:'#ff3d5a', width:1.5 }, fillcolor:'rgba(255,61,90,0.15)' }]}
        layout={{ ...LAYOUT, showlegend:false, xaxis:axis(''), yaxis:axis('P(turbulent) %', { range:[0, 100] }),
          shapes:[{ type:'line', xref:'paper', x0:0, x1:1, y0:50, y1:50, line:{ color:'rgba(255,255,255,0.2)', dash:'dot', width:1 } }] }}
        config={{ responsive:true, displayModeBar:false }} style={{ width:'100%', height:280 }} />
    </Card>
  )
}

function BacktestChart({ d }) {
  const b = d.backtest
  if (!b?.realised?.length) return null
  const x = b.dates ?? b.origin_index
  const traces = [
    { x, y:b.realised.map(v => v * 100), type:'scatter', mode:'lines', name:'Realised next 1M',
      line:{ color:'#ffffff', width:2 } },
    { x, y:b.ensemble.map(v => v * 100), type:'scatter', mode:'lines', name:'Ensemble forecast',
      line:{ color:MODEL_COLORS.Ensemble, width:2 } },
    ...Object.entries(b.forecasts).map(([m, ys]) => ({
      x, y:ys.map(v => v * 100), type:'scatter', mode:'lines', name:m, visible:'legendonly',
      line:{ color:MODEL_COLORS[m], width:1.2 } })),
  ]
  if (d.dvol?.series?.length) traces.push({
    x:d.dvol.series.map(p => new Date(p[0]).toISOString().slice(0, 10)), y:d.dvol.series.map(p => p[1] * 100),
    type:'scatter', mode:'lines', name:'DVOL (implied 30d)', line:{ color:'#ff3d5a', width:1.5, dash:'dot' } })
  return (
    <div style={{ marginBottom:12 }}>
      <Card title="Out-of-sample backtest — 1M-ahead forecast at each date vs the vol realised over the following month">
        <Plot data={traces}
          layout={{ ...LAYOUT, hovermode:'x unified', xaxis:axis(''), yaxis:axis('Vol (%)') }}
          config={{ responsive:true, displayModeBar:false }} style={{ width:'100%', height:300 }} />
      </Card>
    </div>
  )
}

function Leaderboard({ d, horizon, setHorizon }) {
  const s = d.scores[horizon]
  const rows = Object.entries(s.models).sort((a, b) => a[1].qlike - b[1].qlike)
  const best = rows[0][0]
  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
        <span className="section-title" style={{ fontSize:10 }}>Model leaderboard · {s.n_forecasts} out-of-sample forecasts</span>
        {HORIZONS.map(h => (
          <button key={h} onClick={() => setHorizon(h)} className="font-mono"
            style={{ padding:'2px 8px', borderRadius:4, fontSize:9, cursor:'pointer',
              border:'1px solid ' + (h === horizon ? 'var(--cyan)' : 'var(--border)'),
              background: h === horizon ? 'rgba(0,212,255,0.1)' : 'transparent',
              color: h === horizon ? 'var(--cyan)' : 'var(--text-muted)' }}>{h}</button>
        ))}
      </div>
      <div style={{ overflowX:'auto', borderRadius:8, border:'1px solid var(--border)' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
          <thead>
            <tr style={{ background:'var(--bg3)' }}>
              {['Model', 'QLIKE', 'vs EWMA', 'RMSE (vol pts)', 'Bias (vol pts)', 'Ensemble weight', `Forecast ${horizon}`].map((h, i) => (
                <th key={h} style={{ padding:'7px 10px', fontWeight:600, fontSize:9, color:'var(--text-muted)',
                  textAlign: i === 0 ? 'left' : 'right', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([m, v]) => (
              <tr key={m} style={{ borderTop:'1px solid var(--border)', background: m === best ? 'rgba(0,255,136,0.05)' : undefined }}>
                <td style={{ padding:'6px 10px', color:MODEL_COLORS[m], fontWeight:600 }}>{m}{m === best ? ' ★' : ''}</td>
                <Num v={v.qlike.toFixed(4)} />
                <Num v={m === 'EWMA' ? '—' : `${v.qlike_vs_ewma_pct >= 0 ? '+' : ''}${v.qlike_vs_ewma_pct.toFixed(1)}%`}
                  color={m === 'EWMA' ? undefined : v.qlike_vs_ewma_pct >= 0 ? 'var(--green)' : 'var(--red)'} />
                <Num v={(v.rmse_vol * 100).toFixed(2)} />
                <Num v={`${v.bias_vol >= 0 ? '+' : ''}${(v.bias_vol * 100).toFixed(2)}`} />
                <Num v={s.weights[m] != null ? pct(s.weights[m], 0) : '—'} />
                <Num v={pct(d.current[horizon][m])} color="var(--cyan)" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:6 }}>
        Lower QLIKE is better. &quot;vs EWMA&quot; = QLIKE reduction against the RiskMetrics benchmark. Positive bias = over-forecasting.
        {!d.ml_available && ' Gradient boosting unavailable (scikit-learn not installed on the server).'}
      </div>
    </div>
  )
}

const Num = ({ v, color }) => (
  <td className="font-mono" style={{ padding:'6px 10px', textAlign:'right', whiteSpace:'nowrap', color }}>{v}</td>
)
