import { useState } from 'react'
import Plot from 'react-plotly.js'
import { fetchIVSurface } from '../api/client'
import { usePortfolioStore } from '../store/portfolio'

export default function IVSurface() {
  const { ticker } = usePortfolioStore()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [optType, setOptType] = useState('call')

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const result = await fetchIVSurface(ticker)
      setData(result)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to fetch option chain.')
    } finally {
      setLoading(false)
    }
  }

  const filtered = data?.data.filter(d => d.type === optType) ?? []
  const expiries = [...new Set(filtered.map(d => d.expiry))].sort()
  const strikes  = [...new Set(filtered.map(d => d.strike))].sort((a, b) => a - b)

  // Build IV matrix: rows=strikes, cols=expiries
  const Z = strikes.map(k =>
    expiries.map(exp => {
      const pt = filtered.find(d => d.strike === k && d.expiry === exp)
      return pt ? pt.iv * 100 : null
    })
  )

  const plotData = data ? [{
    type: 'surface',
    x: expiries,
    y: strikes,
    z: Z,
    colorscale: 'RdYlGn_r',
    colorbar: { title: 'IV (%)', tickfont: { color: '#e2e8f0' } },
    contours: { z: { show: true, usecolormap: true, project: { z: true } } },
  }] : []

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-bold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>
          Live IV Surface — {ticker}
        </h2>
        <div className="flex gap-1">
          {['call', 'put'].map(t => (
            <button key={t} onClick={() => setOptType(t)}
              className="text-xs px-2 py-1 rounded capitalize"
              style={{ background: optType === t ? 'var(--accent2)' : 'var(--border)', color: optType === t ? '#fff' : 'var(--text)' }}>
              {t}s
            </button>
          ))}
        </div>
        <button onClick={load} disabled={loading}
          className="px-4 py-1.5 text-sm rounded font-medium"
          style={{ background: 'var(--accent)', color: '#0a0e1a' }}>
          {loading ? 'Loading...' : '📡 Fetch Live Data'}
        </button>
        {data && (
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            Spot: <span className="font-mono" style={{ color: 'var(--text)' }}>${data.spot?.toFixed(2)}</span>
          </span>
        )}
      </div>

      {error && (
        <div className="text-xs p-3 rounded" style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--red)', border: '1px solid var(--red)' }}>
          {error}
        </div>
      )}

      {data ? (
        <Plot data={plotData}
          layout={{
            paper_bgcolor: 'transparent', plot_bgcolor: '#111827',
            scene: {
              xaxis: { title: 'Expiry', color: '#64748b', gridcolor: '#1f2937' },
              yaxis: { title: 'Strike', color: '#64748b', gridcolor: '#1f2937' },
              zaxis: { title: 'IV (%)', color: '#64748b', gridcolor: '#1f2937' },
              bgcolor: '#0a0e1a',
            },
            font: { color: '#e2e8f0' },
            margin: { l: 0, r: 0, t: 20, b: 0 },
          }}
          config={{ responsive: true, displayModeBar: true, displaylogo: false }}
          style={{ width: '100%', height: 440 }} />
      ) : (
        <div className="flex flex-col items-center justify-center h-48 rounded gap-2"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <span className="text-2xl">📡</span>
          <span className="text-sm" style={{ color: 'var(--muted)' }}>
            Fetch live option chain data from Yahoo Finance
          </span>
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            Works with any US equity ticker (SPY, AAPL, TSLA, QQQ...)
          </span>
        </div>
      )}
    </div>
  )
}
