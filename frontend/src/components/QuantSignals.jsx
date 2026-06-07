import { useState, useEffect } from 'react'
import { usePortfolioStore } from '../store/portfolio'
import { fetchSignals } from '../api/client'

const SIGNAL_COLOR = {
  BULLISH:'var(--green)', BEARISH:'var(--red)', NEUTRAL:'var(--amber)',
  BUY:'var(--green)', SELL:'var(--red)',
  'BUY BASE':'var(--green)', 'SELL BASE':'var(--red)',
  'MEAN-REVERTING':'var(--purple)', TRENDING:'var(--cyan)', 'RANDOM WALK':'var(--text-muted)',
  HIGH:'var(--red)', NORMAL:'var(--cyan)', LOW:'var(--green)', MIXED:'var(--amber)',
}
const color = (v) => SIGNAL_COLOR[v] || 'var(--text-secondary)'

/* Terminal signal panel — worldmonitor style */
const SPanel = ({ title, accentColor, lbClass, badge, badgeClass, children }) => (
  <div className="signal-panel" style={{ borderLeft:`3px solid ${accentColor}` }}>
    <div className="signal-panel-header">
      <span className="signal-panel-title" style={{ color: accentColor }}>{title}</span>
      {badge && (
        <span className={`tbadge ${badgeClass || 'tbadge-cyan'}`} style={{ animation:'none' }}>
          {badge}
        </span>
      )}
    </div>
    {children}
  </div>
)

const Row = ({ label, value, desc, method, bar, barColor, barMax = 100 }) => (
  <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)',
    display:'flex', flexDirection:'column', gap:5 }}>
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
      <div style={{ flex:1, minWidth:0 }}>
        <span style={{ fontSize:12, color:'var(--text-dim)', fontWeight:500 }}>{label}</span>
        {desc && <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:1 }}>{desc}</div>}
      </div>
      <span className="font-mono" style={{ fontSize:13, fontWeight:700, color: color(value), flexShrink:0 }}>
        {value}
      </span>
    </div>
    {bar !== undefined && (
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <div className="conf-bar-bg">
          <div className="conf-bar-fill" style={{ width:`${Math.min(100,(bar/barMax)*100)}%`,
            background: barColor || 'linear-gradient(90deg, var(--cyan), var(--purple))' }}/>
        </div>
        <span className="font-mono" style={{ fontSize:10, color:'var(--text-muted)', minWidth:32 }}>
          {typeof bar === 'number' ? bar.toFixed(2) : bar}
        </span>
      </div>
    )}
    {method && (
      <span style={{ fontSize:10, color:'var(--text-muted)', fontStyle:'italic' }}>
        {method}
      </span>
    )}
  </div>
)

export default function QuantSignals() {
  const { pair, r_d, r_f } = usePortfolioStore()
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState(null)

  const load = async () => {
    setLoading(true); setError(null)
    try { setData(await fetchSignals(pair)) }
    catch (e) { setError(e?.response?.data?.detail || 'Signal computation failed.') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [pair])

  if (loading) return (
    <div style={{ padding:16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
        <div className="live-dot"/>
        <span style={{ color:'var(--text-muted)', fontSize:12 }}>
          Fetching 90 days of data & computing signals…
        </span>
      </div>
      {[...Array(6)].map((_, i) => (
        <div key={i} className="skeleton" style={{ height:52, marginBottom:4, borderRadius:4 }}/>
      ))}
    </div>
  )

  if (error) return (
    <div style={{ padding:16 }}>
      <div style={{ padding:12, borderRadius:6, background:'var(--red-dim)',
        border:'1px solid var(--red)', color:'var(--red)', fontSize:12, marginBottom:12 }}>{error}</div>
      <button className="btn-primary" onClick={load}>Retry</button>
    </div>
  )

  if (!data) return null

  const { volatility: vol, risk, hurst, mean_reversion: mr,
          rsi, macd, bollinger: bb, momentum, carry } = data

  return (
    <div style={{ padding:16 }}>
      {/* Terminal header */}
      <div className="term-header" style={{ margin:'-16px -16px 14px', padding:'8px 16px' }}>
        <span className="live-dot-blink"/>
        <span className="term-header-cyan">AI QUANT SIGNALS</span>
        <span style={{ opacity:0.4 }}>·</span>
        <span className="term-header-title">{pair}</span>
        <span style={{ opacity:0.4 }}>·</span>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:9.5, color:'var(--text-muted)' }}>
          {data.n_observations} obs · gs-quant · Garman-Kohlhagen
        </span>
        <div style={{ flex:1 }}/>
        <button className="btn-ghost" onClick={load} style={{ fontSize:10, padding:'3px 9px' }}>↻ Refresh</button>
      </div>

      {/* Composite signal — bloomberg bar style */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'12px 16px', marginBottom:12,
        background:'var(--surface)', border:'1px solid var(--border)',
        borderLeft:`4px solid ${data.composite==='BULLISH'?'var(--green)':data.composite==='BEARISH'?'var(--red)':'var(--amber)'}`,
        borderRadius:'var(--r-md)',
      }}>
        <div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-muted)',
            textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:6 }}>Composite Signal</div>
          <div className={`signal-badge ${data.composite.toLowerCase()}`}>
            {data.composite === 'BULLISH' ? '▲' : data.composite === 'BEARISH' ? '▼' : '◆'}{' '}
            {data.composite}
          </div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-muted)',
            textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:4 }}>Confidence</div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:32, fontWeight:800,
            color:'var(--cyan)', lineHeight:1, fontVariantNumeric:'tabular-nums' }}>
            {data.confidence}%
          </div>
          <div style={{ width:130, marginTop:6 }}>
            <div className="conf-bar-bg">
              <div className="conf-bar-fill" style={{ width:`${data.confidence}%` }}/>
            </div>
          </div>
        </div>
      </div>

      {/* Signal grid — worldmonitor terminal panels */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>

        <SPanel title="Volatility" accentColor="var(--cyan)"
          badge={vol.regime}
          badgeClass={vol.regime==='HIGH'?'tbadge-high':vol.regime==='LOW'?'tbadge-green':'tbadge-medium'}>
          <Row label="20-day HV (GS)"  value={`${vol.hv_20_pct}%`}  bar={vol.hv_20_pct} barMax={50} />
          <Row label="60-day HV (GS)"  value={`${vol.hv_60_pct}%`}  bar={vol.hv_60_pct} barMax={50} />
          <Row label="EWMA Forecast"   value={`${vol.ewma_forecast_pct}%`}
            bar={vol.ewma_forecast_pct} barMax={50}
            barColor="linear-gradient(90deg,var(--purple),var(--cyan))" />
          <Row label="Max Drawdown"    value={`${vol.max_drawdown_pct}%`} method={vol.method}
            bar={Math.abs(vol.max_drawdown_pct)} barMax={5}
            barColor="linear-gradient(90deg,var(--red),#c00)" />
        </SPanel>

        <SPanel title="Risk — 1-Day VaR" accentColor="var(--red)">
          <Row label="VaR 95%" value={`${risk.var_95_pct}%`} desc="Max loss · 95% conf."
            bar={risk.var_95_pct} barMax={3}
            barColor="linear-gradient(90deg,var(--amber),var(--red))" />
          <Row label="VaR 99%" value={`${risk.var_99_pct}%`} desc="Max loss · 99% conf."
            bar={risk.var_99_pct} barMax={3}
            barColor="linear-gradient(90deg,var(--red),#c00)" />
          <Row label="CVaR 95%" value={`${risk.cvar_95_pct}%`} desc="Expected shortfall"
            method={risk.method}
            bar={risk.cvar_95_pct} barMax={3}
            barColor="linear-gradient(90deg,#c00,var(--purple))" />
        </SPanel>

        <SPanel title="Hurst Exponent" accentColor="var(--purple)">
          <Row label="H value" value={hurst.exponent} desc="<0.45 = MR · >0.55 = trend"
            bar={hurst.exponent} barMax={1}
            barColor={hurst.exponent < 0.45 ? 'linear-gradient(90deg,var(--purple),#a78bfa)' :
              hurst.exponent > 0.55 ? 'linear-gradient(90deg,var(--cyan),var(--green))' :
              'linear-gradient(90deg,var(--amber),var(--text-muted))'} />
          <Row label="Regime" value={hurst.regime} />
          <Row label="Action" value={hurst.action} method={hurst.method} />
        </SPanel>

        <SPanel title="Mean Reversion (OU)" accentColor="var(--green)"
          badge={mr.signal}
          badgeClass={mr.signal==='BUY'?'tbadge-green':mr.signal==='SELL'?'tbadge-high':'tbadge-medium'}>
          <Row label="κ Speed"    value={mr.kappa}               desc="Mean-reversion speed (ann.)" />
          <Row label="θ Mean"     value={mr.theta}               desc="Long-run equilibrium" />
          <Row label="Half-life"  value={`${mr.half_life_days}d`} desc="Days to revert 50%" />
          <Row label="Z-score"    value={mr.zscore}
            bar={Math.min(Math.abs(mr.zscore), 4)} barMax={4}
            barColor={mr.zscore > 0 ? 'linear-gradient(90deg,var(--amber),var(--red))' :
              'linear-gradient(90deg,var(--amber),var(--green))'}
            method={mr.method} />
        </SPanel>

        <SPanel title="Momentum" accentColor="var(--cyan)"
          badge={momentum.signal}
          badgeClass={momentum.signal==='BULLISH'?'tbadge-green':momentum.signal==='BEARISH'?'tbadge-high':'tbadge-medium'}>
          <Row label="5d Return"  value={`${momentum.return_5d_pct>0?'+':''}${momentum.return_5d_pct}%`}
            bar={Math.abs(momentum.return_5d_pct)} barMax={3}
            barColor={momentum.return_5d_pct>=0?'linear-gradient(90deg,var(--green),var(--cyan))':
              'linear-gradient(90deg,var(--red),#c00)'} />
          <Row label="20d Return" value={`${momentum.return_20d_pct>0?'+':''}${momentum.return_20d_pct}%`}
            bar={Math.abs(momentum.return_20d_pct)} barMax={5}
            barColor={momentum.return_20d_pct>=0?'linear-gradient(90deg,var(--green),var(--cyan))':
              'linear-gradient(90deg,var(--red),#c00)'}
            method={momentum.method} />
        </SPanel>

        <SPanel title="Carry Trade" accentColor="var(--amber)"
          badge={carry.signal}
          badgeClass={carry.signal==='BUY BASE'?'tbadge-green':carry.signal==='SELL BASE'?'tbadge-high':'tbadge-medium'}>
          <Row label="r_d (domestic)" value={`${carry.r_d}%`} />
          <Row label="r_f (foreign)"  value={`${carry.r_f}%`} />
          <Row label="Differential"   value={`${carry.differential_pct>0?'+':''}${carry.differential_pct}%`}
            bar={Math.abs(carry.differential_pct)} barMax={5}
            barColor="linear-gradient(90deg,var(--amber),var(--cyan))"
            method={carry.method} />
        </SPanel>

        {rsi && (
          <SPanel title="RSI · gs-quant" accentColor="var(--cyan)"
            badge={rsi.signal}
            badgeClass={rsi.bias==='BULLISH'?'tbadge-green':rsi.bias==='BEARISH'?'tbadge-high':'tbadge-medium'}>
            <Row label="RSI(14)" value={rsi.value}
              bar={rsi.value} barMax={100}
              barColor={rsi.value>70?'linear-gradient(90deg,var(--red),#c00)':
                rsi.value<30?'linear-gradient(90deg,var(--green),var(--cyan))':
                'linear-gradient(90deg,var(--cyan),var(--purple))'} />
            <Row label="Bias" value={rsi.bias} method={rsi.method} />
          </SPanel>
        )}

        {macd && (
          <SPanel title="MACD · gs-quant" accentColor="var(--purple)"
            badge={macd.signal}
            badgeClass={macd.signal==='BULLISH'?'tbadge-green':'tbadge-high'}>
            <Row label="MACD" value={macd.value}
              bar={Math.min(Math.abs(macd.value)*10000,100)} barMax={100}
              barColor={macd.value>=0?'linear-gradient(90deg,var(--green),var(--cyan))':
                'linear-gradient(90deg,var(--red),#c00)'} />
            <Row label="Signal" value={macd.signal} method={macd.method} />
          </SPanel>
        )}

        {bb && (
          <SPanel title="Bollinger Bands · gs-quant" accentColor="var(--green)"
            badge={bb.bias}
            badgeClass={bb.bias==='BULLISH'?'tbadge-green':bb.bias==='BEARISH'?'tbadge-high':'tbadge-medium'}>
            <Row label="Upper Band"  value={bb.upper} />
            <Row label="Mid (SMA)"   value={bb.sma} />
            <Row label="Lower Band"  value={bb.lower} />
            <Row label="%B Position" value={`${(bb.pct_b*100).toFixed(1)}%`}
              bar={bb.pct_b*100} barMax={100}
              barColor={bb.pct_b>0.8?'linear-gradient(90deg,var(--red),#c00)':
                bb.pct_b<0.2?'linear-gradient(90deg,var(--green),var(--cyan))':
                'linear-gradient(90deg,var(--cyan),var(--purple))'}
              method={bb.method} />
          </SPanel>
        )}

      </div>

      {/* GS-Quant attribution */}
      <div style={{ marginTop:12, padding:'6px 10px', borderRadius:6,
        background:'rgba(0,212,255,0.04)', border:'1px solid rgba(0,212,255,0.1)',
        display:'flex', alignItems:'center', gap:8 }}>
        <span style={{ fontSize:9, color:'var(--cyan)', fontWeight:600 }}>POWERED BY</span>
        <span style={{ fontSize:9, color:'var(--text-muted)' }}>
          gs-quant v2.0.0 (Goldman Sachs) — RSI, MACD, Bollinger, volatility, z-scores, max drawdown
        </span>
      </div>
    </div>
  )
}
