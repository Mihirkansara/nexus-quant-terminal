import { Suspense, lazy, Component } from 'react'
import { TriangleAlert, RotateCcw } from 'lucide-react'
import { deskById, groupLabel, DEFAULT_DESK } from '../desks'

// Every desk is code-split; only the open desk's chunk (and Plotly, once) is loaded.
const COMPONENTS = {
  greeks:        lazy(() => import('../components/GreeksDashboard')),
  chart:         lazy(() => import('../components/CandlestickChart')),
  signals:       lazy(() => import('../components/QuantSignals')),
  vollab:        lazy(() => import('../components/VolLab')),
  volforecast:   lazy(() => import('../components/VolForecast')),
  eventvol:      lazy(() => import('../components/EventVol')),
  positioning:   lazy(() => import('../components/Positioning')),
  rvscan:        lazy(() => import('../components/RvScanner')),
  hedgelab:      lazy(() => import('../components/HedgeLab')),
  risk:          lazy(() => import('../components/RiskDesk')),
  margin:        lazy(() => import('../components/MarginDesk')),
  aihedger:      lazy(() => import('../components/AiHedger')),
  jumps:         lazy(() => import('../components/JumpLab')),
  exotics:       lazy(() => import('../components/ExoticsDesk')),
  tarf:          lazy(() => import('../components/TarfDesk')),
  xasset:        lazy(() => import('../components/CrossAsset')),
  smile:         lazy(() => import('../components/VolSmile')),
  smiledyn:      lazy(() => import('../components/SmileDynamics')),
  surfaces:      lazy(() => import('../components/SurfacePlot')),
  breakeven:     lazy(() => import('../components/BreakevenChart')),
  scenarios:     lazy(() => import('../components/ScenarioTable')),
  montecarlo:    lazy(() => import('../components/MonteCarloChart')),
  institutional: lazy(() => import('../components/InstitutionalFlow')),
  calendar:      lazy(() => import('../components/EconomicCalendar')),
  worldmap:      lazy(() => import('../components/WorldMap')),
  livefeeds:     lazy(() => import('../components/LiveFeeds')),
  volume:        lazy(() => import('../components/VolumeProfileView')),
  newscenter:    lazy(() => import('../components/NewsCenter')),
}

class DeskErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ padding: 24 }}>
        <div role="alert" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', maxWidth: 640, padding: 16,
          borderRadius: 'var(--r-lg)', background: 'var(--red-bg)', border: '1px solid color-mix(in srgb, var(--neg) 35%, transparent)' }}>
          <TriangleAlert size={18} color="var(--neg)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>This desk failed to render</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12, fontFamily: 'var(--font-mono)' }}>{this.state.error.message}</div>
            <button className="btn-ghost" onClick={() => this.setState({ error: null })}><RotateCcw size={13} />Reload desk</button>
          </div>
        </div>
      </div>
    )
  }
}

const DeskLoading = () => (
  <div style={{ padding: 24 }} aria-busy="true" aria-label="Loading desk">
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
      {[0, 1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 72, borderRadius: 'var(--r-lg)' }} />)}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
      <div className="skeleton" style={{ height: 320, borderRadius: 'var(--r-lg)' }} />
      <div className="skeleton" style={{ height: 320, borderRadius: 'var(--r-lg)' }} />
    </div>
  </div>
)

export default function Dashboard({ active }) {
  const desk = deskById(active) ?? deskById(DEFAULT_DESK)
  const Desk = COMPONENTS[desk.id]
  return (
    <main className="nx-main dash-content" aria-labelledby="nx-desk-title">
      <div className="nx-desk-head">
        <div style={{ minWidth: 0 }}>
          <h1 id="nx-desk-title" className="nx-desk-title">{desk.label}</h1>
          <div className="nx-desk-meta">{desk.meta}<span className="nx-desk-group"> · {groupLabel(desk.group)}</span></div>
        </div>
      </div>
      <div className="nx-desk-body term-scroll">
        <DeskErrorBoundary key={desk.id}>
          <Suspense fallback={<DeskLoading />}>
            <div className="nx-desk-enter" key={desk.id}><Desk /></div>
          </Suspense>
        </DeskErrorBoundary>
      </div>
    </main>
  )
}
