import { useState, useEffect, useRef } from 'react'
import { NexusLogoLarge, NexusIcon } from '../components/NexusLogo'

/* ── Inline SVG icons ── */
const TriangleIcon = () => (
  <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
    <path d="M13 3L23 21H3L13 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    <line x1="7" y1="15" x2="19" y2="15" stroke="currentColor" strokeWidth="1.2" opacity="0.55"/>
  </svg>
)
const LineChartIcon = () => (
  <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
    <polyline points="2,20 7,13 12,16 17,7 22,11" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
    <circle cx="22" cy="11" r="2" fill="currentColor"/>
  </svg>
)
const CubeIcon = () => (
  <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
    <path d="M13 2L23 8V18L13 24L3 18V8L13 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    <path d="M3 8L13 14L23 8" stroke="currentColor" strokeWidth="1.2" opacity="0.55"/>
    <line x1="13" y1="14" x2="13" y2="24" stroke="currentColor" strokeWidth="1.2" opacity="0.55"/>
  </svg>
)
const BuildingIcon = () => (
  <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
    <rect x="2" y="14" width="5" height="9" rx="1" stroke="currentColor" strokeWidth="1.5"/>
    <rect x="10" y="9" width="5" height="14" rx="1" stroke="currentColor" strokeWidth="1.5"/>
    <rect x="18" y="4" width="5" height="19" rx="1" stroke="currentColor" strokeWidth="1.5"/>
    <polyline points="4.5,12 12.5,7 20.5,2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.45"/>
  </svg>
)
const ScatterIcon = () => (
  <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
    <path d="M2 21C5 16 8 12 11 14C13 16 15 8 18 10C20 12 22 6 24 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.45"/>
    <path d="M2 18C6 14 9 18 12 12C14 7 17 15 20 11C22 9 23 13 24 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M2 23C7 19 10 16 13 18C16 20 19 14 24 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
  </svg>
)
const CalIcon = () => (
  <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
    <rect x="2" y="5" width="22" height="19" rx="2" stroke="currentColor" strokeWidth="1.5"/>
    <line x1="2" y1="11" x2="24" y2="11" stroke="currentColor" strokeWidth="1.5"/>
    <line x1="8" y1="2" x2="8" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="18" y1="2" x2="18" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <rect x="6" y="14" width="4" height="4" rx="0.5" fill="currentColor" opacity="0.65"/>
    <rect x="13" y="14" width="4" height="4" rx="0.5" stroke="currentColor" strokeWidth="1" opacity="0.35"/>
  </svg>
)
const TableIcon = () => (
  <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
    <rect x="2" y="2" width="22" height="22" rx="2" stroke="currentColor" strokeWidth="1.5"/>
    <line x1="2" y1="10" x2="24" y2="10" stroke="currentColor" strokeWidth="1" opacity="0.4"/>
    <line x1="2" y1="18" x2="24" y2="18" stroke="currentColor" strokeWidth="1" opacity="0.4"/>
    <line x1="10" y1="2" x2="10" y2="24" stroke="currentColor" strokeWidth="1" opacity="0.4"/>
    <path d="M6 14L9 11L12 13L16 8L20 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)
const BreakIcon = () => (
  <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
    <line x1="2" y1="13" x2="24" y2="13" stroke="currentColor" strokeWidth="1" opacity="0.4" strokeDasharray="3 2"/>
    <path d="M3 21C5 21 6 13 10 13C14 13 16 5 19 5C21 5 22 13 23 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <circle cx="10" cy="13" r="2.5" fill="currentColor" opacity="0.85"/>
    <circle cx="19" cy="13" r="2.5" fill="currentColor" opacity="0.85"/>
  </svg>
)

const FEATURES = [
  { Icon: TriangleIcon, title: 'Greek Risk Engine',     desc: 'Δ Delta · Γ Gamma · ν Vega · Θ Theta per leg and portfolio via Garman-Kohlhagen (1983) with live spot rates.', color: '#00d4ff', tag: 'Greeks' },
  { Icon: LineChartIcon,title: 'AI Market Signals',     desc: '9 quantitative signals — RSI, MACD, Bollinger Bands, Hurst exponent, volatility regime and carry — via Goldman Sachs gs-quant.', color: '#a78bfa', tag: 'AI Signals' },
  { Icon: CubeIcon,     title: '3D Volatility Surfaces',desc: 'Interactive 3D plots of Delta, Gamma, Vega, Theta, and P&L across the full spot × volatility surface with Plotly.', color: '#00d4ff', tag: '3D Surfaces' },
  { Icon: BuildingIcon, title: 'Institutional Flow',    desc: 'CFTC COT positioning — Asset Managers, Hedge Funds, Dealers — with Volume Profile, POC, VAH, and VAL visualization.', color: '#ffd700', tag: 'Institutional' },
  { Icon: ScatterIcon,  title: 'Monte Carlo Sim',       desc: 'GBM path simulation with up to 5,000 paths. Terminal P&L distribution, percentile bands, and probability of profit.', color: '#a78bfa', tag: 'Monte Carlo' },
  { Icon: CalIcon,      title: 'Economic Calendar',     desc: 'Forex Factory weekly events — 120+ per week — with impact levels, forecasts, previous values and real-time countdowns.', color: '#00d4ff', tag: 'Calendar' },
  { Icon: TableIcon,    title: 'Scenario Analysis',     desc: 'Stress tests across spot ±5%/±10% and vol ±1pp/±2pp shocks with full P&L matrix and per-leg breakdown.', color: '#ff3d5a', tag: 'Scenarios' },
  { Icon: BreakIcon,    title: 'Breakeven Profile',     desc: 'Payoff curve at expiry with breakeven strikes, max profit, max loss, current spot, and net premium marked.', color: '#00ff88', tag: 'Breakeven' },
]

/* Animated counter hook */
function useCounter(target, ms, start) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!start) return
    const t0 = Date.now()
    const tick = () => {
      const p = Math.min((Date.now() - t0) / ms, 1)
      const e = 1 - Math.pow(1 - p, 3)
      setVal(Math.round(e * target))
      if (p < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [target, ms, start])
  return val
}

/* Mini price chart SVG */
function PreviewChart() {
  const d = "M0,55 C8,52 14,47 20,43 C26,39 30,46 36,39 C42,32 48,28 54,24 C60,20 66,27 72,21 C78,15 84,19 90,13 C96,7 102,11 108,7 C114,3 118,6 124,4"
  const area = d + " L124,72 L0,72 Z"
  return (
    <svg viewBox="0 0 124 72" fill="none" style={{ width:'100%', height:68 }}>
      <defs>
        <linearGradient id="cg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.25"/>
          <stop offset="100%" stopColor="#00d4ff" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={area} fill="url(#cg)"/>
      <path d={d} stroke="#00d4ff" strokeWidth="1.5" fill="none"
        strokeDasharray="300" strokeDashoffset="300"
        style={{ animation:'lp-draw-line 2.2s ease-out 0.8s forwards' }}/>
      <circle cx="124" cy="4" r="3" fill="#00d4ff" opacity="0"
        style={{ animation:'lp-fade 0.4s ease 3s forwards' }}/>
    </svg>
  )
}

/* Arrow right icon */
const ArrowRight = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 15 15" fill="none">
    <path d="M3 7.5H12M8.5 3.5L12 7.5L8.5 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

/* Chevron down */
const ChevDown = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
    <path d="M6.5 3V10M3 6.5L6.5 10L10 6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

export default function LandingPage({ onEnter }) {
  const statsRef = useRef(null)
  const [counting, setCounting] = useState(false)

  const pairs   = useCounter(11,   1500, counting)
  const mods    = useCounter(9,    1700, counting)
  const evts    = useCounter(120,  2000, counting)
  const paths   = useCounter(5000, 2400, counting)

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setCounting(true) }, { threshold: 0.4 })
    if (statsRef.current) io.observe(statsRef.current)
    return () => io.disconnect()
  }, [])

  return (
    <div className="lp">
      {/* Floating orbs */}
      <div className="lp-orbs" aria-hidden>
        <div className="lp-orb lp-orb1"/>
        <div className="lp-orb lp-orb2"/>
        <div className="lp-orb lp-orb3"/>
      </div>

      {/* ── Nav ─────────────────────────────────── */}
      <nav className="lp-nav">
        <div className="lp-logo">
          <NexusIcon size={32} />
          <div>
            <div className="lp-logo-name" style={{
              fontFamily:'var(--font-mono)', letterSpacing:'0.2em',
              textShadow:'0 0 18px rgba(0,200,240,0.6)',
              animation:'nx-flicker 9s ease-in-out infinite',
            }}>NEXUS</div>
            <div className="lp-logo-tagline" style={{ letterSpacing:'0.18em' }}>TERMINAL · FX OPTIONS</div>
          </div>
        </div>
        <button className="lp-nav-cta" onClick={onEnter} aria-label="Launch platform">
          Launch Platform <ArrowRight size={14}/>
        </button>
      </nav>

      {/* ── Hero ────────────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-hero-text">
          <div className="lp-eyebrow lp-reveal" style={{'--d':'0s'}}>
            <span className="lp-eyebrow-dot" aria-hidden/>
            Garman-Kohlhagen 1983 · Goldman Sachs gs-quant · CFTC · Forex Factory
          </div>

          <div className="lp-reveal" style={{'--d':'0.05s', display:'flex', alignItems:'center', gap:20, marginBottom:8}}>
            <NexusLogoLarge size={76}/>
            <div>
              <h1 className="lp-h1" style={{ margin:0, fontSize:'clamp(38px,5vw,64px)' }}>
                <span className="lp-grad-text" style={{
                  letterSpacing:'0.12em',
                  textShadow:'0 0 40px rgba(0,200,240,0.35)',
                  animation:'nx-flicker 11s ease-in-out infinite',
                }}>NEXUS</span>
                <br/>
                <span style={{ fontSize:'0.52em', letterSpacing:'0.22em', color:'var(--text-secondary)', fontWeight:500 }}>TERMINAL</span>
              </h1>
            </div>
          </div>

          <p className="lp-hero-sub lp-reveal" style={{'--d':'0.20s'}}>
            Institutional-grade FX options analytics. Greeks, AI signals,
            live world map, real-time crypto, webcams from 6 financial centers.
            Everything. Free. No account.
          </p>

          <div className="lp-ctas lp-reveal" style={{'--d':'0.30s'}}>
            <button className="lp-btn-primary" onClick={onEnter}>
              <ArrowRight size={16}/> Launch Platform
            </button>
            <a href="#features" className="lp-btn-outline">
              Explore Features <ChevDown/>
            </a>
          </div>

          {/* Stats */}
          <div className="lp-stats lp-reveal" ref={statsRef} style={{'--d':'0.42s'}}>
            {[
              { n: pairs,             s: 'Currency Pairs'     },
              { n: mods,              s: 'Analytics Modules'  },
              { n: `${evts}+`,        s: 'Events / Week'      },
              { n: paths.toLocaleString(), s: 'MC Paths'      },
            ].map(({ n, s }, i, arr) => (
              <div key={s} className="lp-stat-group">
                <div className="lp-stat-num">{n}</div>
                <div className="lp-stat-lbl">{s}</div>
                {i < arr.length - 1 && <div className="lp-stat-sep" aria-hidden/>}
              </div>
            ))}
          </div>
        </div>

        {/* Terminal card */}
        <div className="lp-terminal lp-reveal" style={{'--d':'0.50s'}} aria-label="Platform preview">
          <div className="lp-term-bar">
            <span className="lp-dot" style={{background:'#ff5f57'}}/>
            <span className="lp-dot" style={{background:'#febc2e'}}/>
            <span className="lp-dot" style={{background:'#28c840'}}/>
            <span className="lp-term-title">Risk Analytics Terminal</span>
            <span className="lp-live-badge"><span className="live-dot"/>LIVE</span>
          </div>
          <div className="lp-term-body">
            {/* Pair row */}
            <div className="lp-term-pair">
              <span className="lp-tlabel">PAIR</span>
              <span className="lp-tval" style={{color:'#00d4ff'}}>EURUSD</span>
              <span className="lp-tlabel">SPOT</span>
              <span className="lp-tval lp-mono">1.15274</span>
              <span style={{marginLeft:'auto',fontSize:10,color:'#00ff88',fontFamily:'var(--font-mono)'}}>▲ +0.04%</span>
            </div>

            {/* Chart */}
            <div style={{margin:'10px 0 6px'}}>
              <PreviewChart/>
            </div>

            {/* Greeks grid */}
            <div className="lp-greeks">
              {[
                {l:'Δ Delta', v:'+0.8767', c:'#00d4ff'},
                {l:'Γ Gamma', v:'+0.0284', c:'#a78bfa'},
                {l:'ν Vega',  v:'+0.2633', c:'#00ff88'},
                {l:'Θ Theta', v:'−0.0134', c:'#ff3d5a'},
              ].map(g => (
                <div key={g.l} className="lp-greek-card">
                  <div className="lp-tlabel">{g.l}</div>
                  <div className="lp-mono lp-tval" style={{color:g.c,fontSize:13,fontWeight:700}}>{g.v}</div>
                </div>
              ))}
            </div>

            {/* Signal */}
            <div className="lp-signal-row">
              <div className="signal-badge bullish" style={{fontSize:10,padding:'3px 10px',animation:'none'}}>BULLISH</div>
              <span className="lp-tlabel" style={{marginLeft:8}}>Composite · 67% Confidence</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────── */}
      <section className="lp-section" id="features">
        <div className="lp-inner">
          <div className="lp-sec-head">
            <div className="lp-eyebrow lp-eyebrow-c">
              <span className="lp-eyebrow-dot" aria-hidden/> 9 Analytics Modules
            </div>
            <h2 className="lp-h2">
              Everything You Need for<br/>
              <span className="lp-grad-text">Forex Options Risk</span>
            </h2>
            <p className="lp-sec-sub">
              From individual option greeks to institutional positioning data —
              every tool in one professional platform.
            </p>
          </div>

          <div className="lp-feat-grid">
            {FEATURES.map(({ Icon, title, desc, color, tag }) => (
              <div key={title} className="lp-feat-card">
                <div className="lp-feat-top">
                  <div className="lp-feat-icon" style={{color}}>
                    <Icon/>
                  </div>
                  <span className="lp-feat-tag" style={{color, borderColor:`${color}40`}}>{tag}</span>
                </div>
                <h3 className="lp-feat-title">{title}</h3>
                <p className="lp-feat-desc">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ────────────────────────── */}
      <section className="lp-section lp-hiw">
        <div className="lp-inner">
          <div className="lp-sec-head">
            <div className="lp-eyebrow lp-eyebrow-c">
              <span className="lp-eyebrow-dot" aria-hidden/> Simple by Design
            </div>
            <h2 className="lp-h2">How It Works</h2>
          </div>
          <div className="lp-steps">
            {[
              { n:'01', title:'Select your pair', desc:'Choose from 11 forex pairs. Live spot rates and market parameters populate automatically from Yahoo Finance.' },
              { n:'02', title:'Build your portfolio', desc:'Add option legs or pick from 16 pre-built strategies — long straddle, bull spread, iron condor, risk reversal, and more.' },
              { n:'03', title:'Analyze risk instantly', desc:'All 9 modules update in real-time. Greeks, signals, surfaces, scenarios — everything reacts to your portfolio instantly.' },
            ].map((s, i) => (
              <div key={s.n} className="lp-step">
                <div className="lp-step-n">{s.n}</div>
                {i < 2 && <div className="lp-step-conn" aria-hidden/>}
                <h3 className="lp-step-title">{s.title}</h3>
                <p className="lp-step-desc">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Data Sources ────────────────────────── */}
      <section className="lp-section">
        <div className="lp-inner">
          <div className="lp-sources">
            <p className="lp-sources-label">Powered by trusted data sources</p>
            <div className="lp-sources-row">
              {[
                { name:'gs-quant',     sub:'Goldman Sachs Quant Library', c:'#00d4ff' },
                { name:'CFTC',         sub:'US Commodity Futures Trading Commission', c:'#a78bfa' },
                { name:'Forex Factory',sub:'Economic Calendar', c:'#ffd700' },
                { name:'yfinance',     sub:'Yahoo Finance OHLCV Data', c:'#00ff88' },
              ].map(src => (
                <div key={src.name} className="lp-source">
                  <div className="lp-source-name" style={{color:src.c}}>{src.name}</div>
                  <div className="lp-source-sub">{src.sub}</div>
                </div>
              ))}
            </div>
            <p className="lp-sources-note">Free · No API keys · No registration</p>
          </div>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────── */}
      <section className="lp-cta-wrap">
        <div className="lp-cta-glow" aria-hidden/>
        <div className="lp-inner lp-cta-inner">
          <h2 className="lp-h2">
            Start Analyzing<br/>
            <span className="lp-grad-text">Forex Risk Today</span>
          </h2>
          <p className="lp-cta-sub">
            Institutional-grade analytics, completely free.
            No account, no API keys, no credit card.
          </p>
          <button className="lp-btn-primary lp-btn-lg" onClick={onEnter}>
            <ArrowRight size={18}/> Launch Platform Free
          </button>
          <div className="lp-cta-checks">
            <span>✓ Garman-Kohlhagen model</span>
            <span>·</span>
            <span>✓ Goldman Sachs gs-quant</span>
            <span>·</span>
            <span>✓ Live CFTC data</span>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────── */}
      <footer className="lp-footer">
        <span className="lp-grad-text" style={{fontWeight:800,fontSize:12,letterSpacing:'0.06em'}}>NEXUS TERMINAL</span>
        <span className="lp-footer-sep">·</span>
        <span style={{fontSize:11,color:'#334155'}}>© 2026 Mihir Kansara · All Rights Reserved</span>
      </footer>
    </div>
  )
}
