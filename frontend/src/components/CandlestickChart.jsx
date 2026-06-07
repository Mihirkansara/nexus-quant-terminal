import { useState, useEffect, useCallback, useRef } from 'react'
import _Plot from 'react-plotly.js'
const Plot = _Plot?.default ?? _Plot
import { usePortfolioStore } from '../store/portfolio'
import { fetchOHLC } from '../api/client'

const INTERVALS = [
  { label: '1m',  val: '1m',  period: '1d'  },
  { label: '5m',  val: '5m',  period: '2d'  },
  { label: '15m', val: '15m', period: '5d'  },
  { label: '1h',  val: '1h',  period: '1mo' },
  { label: '1d',  val: '1d',  period: '1mo' },
]

function ema(arr, period) {
  const k = 2 / (period + 1)
  const out = []
  let e = null
  for (let i = 0; i < arr.length; i++) {
    if (i < period - 1) { out.push(null); continue }
    if (i === period - 1) {
      e = arr.slice(0, period).reduce((s, x) => s + x, 0) / period
    } else {
      e = arr[i] * k + e * (1 - k)
    }
    out.push(e)
  }
  return out
}

// Inject SVG linearGradient into Plotly's SVG after render
function injectSvgGradient(container, colorHex, gradId = 'qfx-price-grad') {
  if (!container) return
  const svg = container.querySelector('svg.main-svg')
  if (!svg) return

  svg.getElementById(gradId + '-defs')?.remove()

  const ns = 'http://www.w3.org/2000/svg'
  const defs = document.createElementNS(ns, 'defs')
  defs.id = gradId + '-defs'

  const grad = document.createElementNS(ns, 'linearGradient')
  grad.id = gradId
  grad.setAttribute('x1', '0%'); grad.setAttribute('y1', '0%')
  grad.setAttribute('x2', '0%'); grad.setAttribute('y2', '100%')

  const r = parseInt(colorHex.slice(1,3), 16)
  const g = parseInt(colorHex.slice(3,5), 16)
  const b = parseInt(colorHex.slice(5,7), 16)

  ;[
    { offset: '0%',   opacity: 0.45 },
    { offset: '35%',  opacity: 0.20 },
    { offset: '75%',  opacity: 0.06 },
    { offset: '100%', opacity: 0.0  },
  ].forEach(({ offset, opacity }) => {
    const stop = document.createElementNS(ns, 'stop')
    stop.setAttribute('offset', offset)
    stop.setAttribute('stop-color', `rgb(${r},${g},${b})`)
    stop.setAttribute('stop-opacity', String(opacity))
    grad.appendChild(stop)
  })

  defs.appendChild(grad)
  svg.prepend(defs)

  // Apply gradient to the main price area fill (2nd fill path — index 1)
  const fillPaths = svg.querySelectorAll('.fills path')
  if (fillPaths.length >= 2) {
    fillPaths[1].setAttribute('fill', `url(#${gradId})`)
  }
}

export default function PriceChart() {
  const { pair } = usePortfolioStore()
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(false)
  const [interval, setInterval] = useState('5m')
  const [error, setError]       = useState(null)
  const [fading, setFading]     = useState(false)
  const containerRef = useRef(null)

  const load = useCallback(async (ivl) => {
    setFading(true)
    setLoading(true); setError(null)
    const cfg = INTERVALS.find(x => x.val === ivl) || INTERVALS[1]
    try {
      const d = await fetchOHLC(pair, cfg.val, cfg.period)
      await new Promise(r => setTimeout(r, 200))
      setData(d)
      setFading(false)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Data unavailable.')
      setFading(false)
    } finally { setLoading(false) }
  }, [pair])

  useEffect(() => { load(interval) }, [pair, interval])

  // Derived values — all computed BEFORE any hooks that depend on them
  const closes     = data?.close || []
  const last       = closes.at(-1)
  const first      = closes[0]
  const periodHigh = data ? Math.max(...data.high) : null
  const periodLow  = data ? Math.min(...data.low)  : null
  const change     = (last && first) ? ((last - first) / first * 100) : null
  const isUp       = change !== null ? change >= 0 : true

  const lineColor  = isUp ? '#00ff88' : '#ff3d5a'
  const fillColor  = isUp ? 'rgba(0,255,136,0.18)' : 'rgba(255,61,90,0.18)'
  const glowColor  = isUp ? 'rgba(0,255,136,0.10)' : 'rgba(255,61,90,0.10)'
  const ema20      = closes.length >= 20 ? ema(closes, 20) : []
  const ema9       = closes.length >= 9  ? ema(closes, 9)  : []

  // Gradient injection whenever data or direction changes
  useEffect(() => {
    const t = setTimeout(() => injectSvgGradient(containerRef.current, lineColor), 150)
    return () => clearTimeout(t)
  }, [data, lineColor])

  const handlePlotRender = useCallback(() => {
    setTimeout(() => injectSvgGradient(containerRef.current, lineColor), 80)
  }, [lineColor])

  // Baseline just below data minimum — keeps fill bounded within visible chart area
  const minClose  = data ? Math.min(...closes) * 0.9997 : 0
  const baseDates = data?.dates || []

  // Build traces
  const plotData = data ? [
    // Invisible baseline at bottom — fill target for tonexty
    {
      type: 'scatter', mode: 'lines',
      x: baseDates, y: baseDates.map(() => minClose),
      line: { color: 'rgba(0,0,0,0)', width: 0 },
      showlegend: false, hoverinfo: 'skip',
    },
    // Main price line — fills down to the baseline above
    {
      type: 'scatter', mode: 'lines',
      x: data.dates, y: closes,
      name: pair,
      line: { color: lineColor, width: 2.5, shape: 'spline', smoothing: 0.5 },
      fill: 'tonexty',
      fillcolor: fillColor,
      hovertemplate: '<b>%{x|%H:%M %b %d}</b><br>%{y:.5f}<extra></extra>',
    },
    // Glow layer
    {
      type: 'scatter', mode: 'lines',
      x: data.dates, y: closes,
      line: { color: glowColor, width: 18, shape: 'spline', smoothing: 0.5 },
      showlegend: false, hoverinfo: 'skip',
    },
    ...(ema20.length ? [{
      type: 'scatter', mode: 'lines',
      x: data.dates, y: ema20,
      name: 'EMA 20',
      line: { color: 'rgba(167,139,250,0.85)', width: 1.5, shape: 'spline', smoothing: 0.5 },
      hovertemplate: 'EMA20: %{y:.5f}<extra></extra>',
    }] : []),
    ...(ema9.length ? [{
      type: 'scatter', mode: 'lines',
      x: data.dates, y: ema9,
      name: 'EMA 9',
      line: { color: 'rgba(255,215,0,0.7)', width: 1.2, shape: 'spline', smoothing: 0.5 },
      hovertemplate: 'EMA9: %{y:.5f}<extra></extra>',
    }] : []),
  ] : []

  const layout = {
    paper_bgcolor: 'transparent',
    plot_bgcolor:  'rgba(4,10,28,0.8)',
    font: { color: '#475569', family: 'JetBrains Mono, monospace', size: 10 },
    margin: { l: 12, r: 68, t: 12, b: 44 },
    xaxis: {
      type: 'date',
      gridcolor: 'rgba(0,212,255,0.05)',
      linecolor: 'rgba(0,212,255,0.1)',
      color: '#475569',
      rangeslider: { visible: false },
      showspikes: true, spikecolor: 'rgba(0,212,255,0.35)', spikethickness: 1,
      tickfont: { size: 9 }, zeroline: false,
    },
    yaxis: {
      gridcolor: 'rgba(0,212,255,0.05)',
      linecolor: 'rgba(0,212,255,0.1)',
      color: '#475569',
      side: 'right', tickformat: '.5f',
      showspikes: true, spikecolor: 'rgba(0,212,255,0.35)', spikethickness: 1,
      tickfont: { size: 9 }, zeroline: false,
    },
    legend: {
      bgcolor: 'rgba(4,10,28,0.85)',
      bordercolor: 'rgba(0,212,255,0.12)', borderwidth: 1,
      font: { color: '#64748b', size: 9 },
      orientation: 'h', x: 0.01, y: 0.99, xanchor: 'left', yanchor: 'top',
    },
    dragmode: 'pan',
    hovermode: 'x unified',
    hoverlabel: {
      bgcolor: 'rgba(4,10,28,0.95)',
      bordercolor: isUp ? 'rgba(0,255,136,0.4)' : 'rgba(255,61,90,0.4)',
      font: { color: '#e0f2fe', family: 'JetBrains Mono, monospace', size: 11 },
    },
  }

  return (
    <div style={{ padding: 16 }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14 }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span className="section-title" style={{ fontSize:12 }}>{pair} — LINE CHART</span>
            {loading && <div className="live-dot"/>}
          </div>
          {data && (
            <div style={{ display:'flex', alignItems:'baseline', gap:10, marginTop:3 }}>
              <span className="font-mono" style={{ fontSize:26, fontWeight:800,
                color:'var(--text)', letterSpacing:'-0.5px' }}>
                {last?.toFixed(5)}
              </span>
              {change !== null && (
                <span className="font-mono" style={{ fontSize:13, fontWeight:700,
                  color: lineColor, textShadow:`0 0 14px ${lineColor}88` }}>
                  {isUp ? '▲' : '▼'} {Math.abs(change).toFixed(3)}%
                </span>
              )}
            </div>
          )}
        </div>

        {data && (
          <div style={{ display:'flex', gap:6, marginTop:4 }}>
            {[
              { label:'H', value: periodHigh?.toFixed(5), c:'#00ff88' },
              { label:'L', value: periodLow?.toFixed(5),  c:'#ff3d5a' },
              { label:'N', value: closes.length + ' bars', c:'var(--text-muted)' },
            ].map(({ label, value, c }) => (
              <div key={label} className="glass" style={{ padding:'4px 10px', borderRadius:6 }}>
                <span style={{ fontSize:9, color:'var(--text-muted)' }}>{label} </span>
                <span className="font-mono" style={{ fontSize:10, color:c, fontWeight:600 }}>{value}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display:'flex', gap:3, background:'rgba(0,0,0,0.25)',
          borderRadius:8, padding:3, border:'1px solid rgba(0,212,255,0.08)' }}>
          {INTERVALS.map(iv => {
            const active = interval === iv.val
            return (
              <button key={iv.val}
                onClick={() => { setInterval(iv.val); load(iv.val) }}
                style={{
                  padding:'5px 13px', fontSize:10, cursor:'pointer',
                  borderRadius:6, border:'none',
                  fontFamily:'JetBrains Mono, monospace', fontWeight: active ? 700 : 400,
                  background: active ? (isUp ? 'rgba(0,255,136,0.14)' : 'rgba(255,61,90,0.14)') : 'transparent',
                  color: active ? lineColor : '#475569',
                  boxShadow: active ? `0 0 10px ${lineColor}44` : 'none',
                  transition: 'all 0.22s ease',
                }}>
                {iv.label}
              </button>
            )
          })}
        </div>
      </div>

      {error && (
        <div style={{ padding:10, borderRadius:6, marginBottom:10, fontSize:11,
          background:'rgba(255,61,90,0.08)', border:'1px solid rgba(255,61,90,0.3)', color:'#ff3d5a' }}>
          {error}
        </div>
      )}

      {/* Chart container with fade+slide animation */}
      <div ref={containerRef} style={{
        borderRadius:10, overflow:'hidden',
        border:`1px solid ${isUp ? 'rgba(0,255,136,0.12)' : 'rgba(255,61,90,0.12)'}`,
        boxShadow: isUp
          ? '0 0 40px rgba(0,255,136,0.05), inset 0 1px 0 rgba(0,255,136,0.1)'
          : '0 0 40px rgba(255,61,90,0.05), inset 0 1px 0 rgba(255,61,90,0.1)',
        background: 'rgba(4,10,28,0.8)',
        opacity:   fading ? 0 : 1,
        transform: fading ? 'translateY(8px) scale(0.995)' : 'translateY(0) scale(1)',
        transition: 'opacity 0.25s ease, transform 0.25s ease',
        minHeight: 460, position: 'relative',
      }}>

        {loading && !data && (
          <div style={{ position:'absolute', inset:0, display:'flex',
            flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14 }}>
            <div style={{ display:'flex', gap:5, alignItems:'flex-end' }}>
              {[32,48,28,52,38,44,30,46,36].map((h, i) => (
                <div key={i} className="skeleton" style={{
                  width:4, height:h, borderRadius:2, animationDelay:`${i * 0.08}s`,
                }}/>
              ))}
            </div>
            <span style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'JetBrains Mono' }}>
              Loading {pair} {interval}…
            </span>
          </div>
        )}

        {data && (
          <Plot data={plotData} layout={layout}
            config={{ responsive:true, displayModeBar:true, displaylogo:false,
              scrollZoom:true,
              modeBarButtonsToRemove:['select2d','lasso2d','autoScale2d','toImage'] }}
            style={{ width:'100%', height:460 }}
            onAfterPlot={handlePlotRender}
            onUpdate={handlePlotRender}
          />
        )}

        {!data && !loading && (
          <div style={{ height:460, display:'flex', flexDirection:'column',
            alignItems:'center', justifyContent:'center', gap:10 }}>
            <span style={{ fontSize:34 }}>📈</span>
            <span style={{ color:'var(--text-muted)', fontSize:12 }}>Select a pair to load chart</span>
          </div>
        )}
      </div>

      {/* Legend strip */}
      {data && (
        <div style={{ display:'flex', alignItems:'center', gap:16, marginTop:10, paddingLeft:4 }}>
          {[
            { color: lineColor,               label:`${pair} Close`, dot:true  },
            { color: 'rgba(167,139,250,0.9)',  label:'EMA 20',       dot:false },
            { color: 'rgba(255,215,0,0.8)',    label:'EMA 9',        dot:false },
          ].map(({ color, label, dot }) => (
            <div key={label} style={{ display:'flex', alignItems:'center', gap:5 }}>
              {dot
                ? <div style={{ width:7, height:7, borderRadius:'50%', background:color, boxShadow:`0 0 7px ${color}` }}/>
                : <div style={{ width:18, height:1.5, background:color, borderRadius:1 }}/>
              }
              <span style={{ fontSize:9, color:'var(--text-muted)', fontFamily:'JetBrains Mono' }}>{label}</span>
            </div>
          ))}
          <div style={{ flex:1 }}/>
          <span style={{ fontSize:9, color:'var(--text-muted)', fontStyle:'italic' }}>
            {interval} · {data.dates?.at(-1)?.slice(0, 10)} · Garman-Kohlhagen
          </span>
        </div>
      )}
    </div>
  )
}
