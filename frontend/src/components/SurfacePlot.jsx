import { useState, useEffect } from 'react'
import _Plot from 'react-plotly.js'
import { usePortfolioStore } from '../store/portfolio'
import { computeSurface } from '../api/client'

// Vite 8 CJS interop: react-plotly.js exports { default: Component }
const Plot = _Plot?.default ?? _Plot

const SURFACE_CONFIGS = {
  delta: { title: 'Delta Surface',  colorscale: 'Plasma'  },
  gamma: { title: 'Gamma Surface',  colorscale: 'Cividis' },
  vega:  { title: 'Vega Surface',   colorscale: 'Viridis' },
  theta: { title: 'Theta Surface',  colorscale: 'Inferno' },
  pnl:   { title: 'P&L Surface',    colorscale: 'RdYlGn'  },
}

export default function SurfacePlot() {
  const { legs, S, sigma, T, r_d, r_f } = usePortfolioStore()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [active, setActive]   = useState('delta')

  useEffect(() => {
    if (!legs.length) return
    setLoading(true)
    computeSurface({
      options: legs.map(({ type, K, T, qty }) => ({ type, K, T, qty })),
      S_low: S * 0.75, S_high: S * 1.25, S_steps: 35,
      vol_low: Math.max(0.01, sigma - 0.12), vol_high: sigma + 0.18, vol_steps: 35,
      T, r_d, r_f,
    })
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [S, sigma, T, r_d, r_f, JSON.stringify(legs)])

  if (loading) return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div className="live-dot" />
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Computing 3D Risk Surfaces...</span>
      </div>
      <div className="skeleton" style={{ height: 460, borderRadius: 8 }} />
    </div>
  )

  if (!data) return (
    <div style={{ padding: 20, height: 460, display: 'flex', alignItems: 'center',
      justifyContent: 'center', color: '#475569', fontSize: 13 }}>
      Add option legs to compute surfaces
    </div>
  )

  const cfg = SURFACE_CONFIGS[active]
  const Z   = data[active]

  const plotData = [{
    type: 'surface',
    x: data.sigma_range,
    y: data.S_range,
    z: Z,
    colorscale: cfg.colorscale,
    opacity: 0.9,
    showscale: true,
  }]

  const layout = {
    title: { text: cfg.title, font: { color: '#00d4ff', size: 13 } },
    paper_bgcolor: 'transparent',
    plot_bgcolor:  'transparent',
    scene: {
      xaxis: { title: 'Implied Vol', color: '#64748b', gridcolor: '#1e293b' },
      yaxis: { title: 'Spot Rate',   color: '#64748b', gridcolor: '#1e293b' },
      zaxis: { title: active,        color: '#64748b', gridcolor: '#1e293b' },
      bgcolor: '#0a0e1a',
      camera: { eye: { x: 1.5, y: 1.5, z: 0.9 } },
    },
    margin: { l: 0, r: 0, t: 40, b: 0 },
    font: { color: '#e2e8f0', size: 11 },
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {Object.entries(SURFACE_CONFIGS).map(([key, { title }]) => (
          <button key={key} onClick={() => setActive(key)}
            style={{
              padding: '4px 12px', borderRadius: 6, border: 'none',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: active === key ? '#00d4ff' : 'rgba(255,255,255,0.05)',
              color: active === key ? '#020817' : '#64748b',
              transition: 'all 0.15s',
            }}>
            {title.split(' ')[0]}
          </button>
        ))}
      </div>

      <div style={{ borderRadius: 8, overflow: 'hidden', background: 'rgba(10,14,26,0.6)',
        border: '1px solid rgba(0,212,255,0.08)' }}>
        <Plot
          data={plotData}
          layout={layout}
          config={{ responsive: true, displayModeBar: true, displaylogo: false }}
          style={{ width: '100%', height: 460 }}
        />
      </div>
    </div>
  )
}
