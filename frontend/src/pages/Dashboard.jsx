import { useState, Suspense, lazy, Component } from 'react'
import GreeksDashboard from '../components/GreeksDashboard'
import SurfacePlot from '../components/SurfacePlot'
import MonteCarloChart from '../components/MonteCarloChart'
import ScenarioTable from '../components/ScenarioTable'
import BreakevenChart from '../components/BreakevenChart'
import CandlestickChart from '../components/CandlestickChart'
import QuantSignals from '../components/QuantSignals'
import InstitutionalFlow from '../components/InstitutionalFlow'
import EconomicCalendar from '../components/EconomicCalendar'

const IVSurface  = lazy(() => import('../components/IVSurface'))
const WorldMap   = lazy(() => import('../components/WorldMap'))
const LiveFeeds  = lazy(() => import('../components/LiveFeeds'))

class TabErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 24 }}>
        <div style={{ padding: 14, borderRadius: 8, background: 'rgba(255,61,90,0.1)',
          border: '1px solid #ff3d5a', color: '#ff3d5a', fontSize: 12, marginBottom: 10 }}>
          Render error: {this.state.error.message}
        </div>
        <button onClick={() => this.setState({ error: null })}
          style={{ padding: '6px 14px', borderRadius: 6, background: 'rgba(0,212,255,0.1)',
            border: '1px solid #00d4ff', color: '#00d4ff', fontSize: 11, cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    )
    return this.props.children
  }
}

const TABS = [
  { id:'greeks',     icon:'Δ',  label:'Greeks',       component: GreeksDashboard },
  { id:'chart',      icon:'📈', label:'Chart',        component: CandlestickChart },
  { id:'signals',    icon:'⚡', label:'AI Signals',   component: QuantSignals },
  { id:'surfaces',   icon:'🗻', label:'3D Surfaces',  component: SurfacePlot },
  { id:'breakeven',  icon:'🎯', label:'Breakeven',    component: BreakevenChart },
  { id:'scenarios',  icon:'⚠', label:'Scenarios',    component: ScenarioTable },
  { id:'montecarlo',    icon:'🎲', label:'Monte Carlo',  component: MonteCarloChart },
  { id:'institutional', icon:'🏦', label:'Institutional', component: InstitutionalFlow },
  { id:'calendar',      icon:'📅', label:'Calendar',      component: EconomicCalendar },
  { id:'worldmap',      icon:'🌍', label:'Live Map',       component: WorldMap  },
  { id:'livefeeds',     icon:'📡', label:'Live Feeds',     component: LiveFeeds },
]

const LoadingFallback = () => (
  <div style={{ padding:20 }}>
    {[...Array(4)].map((_,i) => (
      <div key={i} className="skeleton" style={{ height:48, marginBottom:8, borderRadius:8 }}/>
    ))}
  </div>
)

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('greeks')
  const ActiveTab = TABS.find(t => t.id === activeTab) ?? TABS[0]
  const ActiveComponent = ActiveTab.component

  return (
    <div className="dash-content" style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      {/* Tab bar — worldmonitor variant-switcher style */}
      <div style={{
        display:'flex', alignItems:'center', gap:2, padding:'6px 10px',
        borderBottom:'1px solid var(--border)',
        background:'var(--bg2)',
        overflowX:'auto', flexShrink:0,
      }}>
        {TABS.map(tab => {
          const active = activeTab === tab.id
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{
                display:'flex', alignItems:'center', gap:5,
                padding:'5px 11px', borderRadius:'var(--r-sm)',
                border: active
                  ? '1px solid color-mix(in srgb, var(--cyan) 30%, transparent)'
                  : '1px solid transparent',
                cursor:'pointer', whiteSpace:'nowrap',
                fontFamily:'var(--font-mono)',
                fontSize:10, fontWeight:700, letterSpacing:'0.06em',
                textTransform:'uppercase',
                background: active
                  ? 'color-mix(in srgb, var(--cyan) 10%, transparent)'
                  : 'transparent',
                color: active ? 'var(--cyan)' : 'var(--text-muted)',
                transition:'var(--t-fast)',
                outline:'none',
                minHeight:32,
              }}>
              <span style={{ fontSize:11, opacity: active ? 1 : 0.7 }}>{tab.icon}</span>
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Content area */}
      <div style={{ flex:1, overflowY:'auto' }} className="term-scroll">
        <TabErrorBoundary key={activeTab}>
          <Suspense fallback={<LoadingFallback />}>
            <div style={{ animation:'lp-reveal 0.2s ease both' }}>
              <ActiveComponent />
            </div>
          </Suspense>
        </TabErrorBoundary>
      </div>
    </div>
  )
}
