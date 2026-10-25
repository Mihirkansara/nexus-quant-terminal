import { useState, useEffect, useRef } from 'react'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { EngravedSeal, NexusMark } from '../components/BookSeal'
import { DESKS, DESK_GROUPS } from '../desks'
import { PAIR_META } from '../store/portfolio'

const MICRO = 'NEXUS · DELTA · GAMMA · VEGA · THETA · RHO · VANNA · VOLGA · CHARM · SPEED · '
const INSTRUMENTS = Object.keys(PAIR_META).length

const METHODS = [
  ['Garman & Kohlhagen', 1983, 'FX option pricing and Greeks'],
  ['Merton', 1976, 'Jump-diffusion'],
  ['Leland', 1985, 'Hedging with transaction costs'],
  ['Burghardt & Lane', 1990, 'Realised-volatility cone'],
  ['Glosten, Jagannathan & Runkle', 1993, 'GJR-GARCH'],
  ['Kupiec', 1995, 'VaR backtest, proportion of failures'],
  ['Bates', 1996, 'Stochastic vol with jumps'],
  ['Broadie, Glasserman & Kou', 1997, 'Discrete barrier correction'],
  ['Whalley & Wilmott', 1997, 'Optimal no-trade band'],
  ['Christoffersen', 1998, 'Conditional coverage test'],
  ['Barone-Adesi, Giannopoulos & Vosper', 1999, 'Filtered historical simulation'],
  ['Hagan, Kumar, Lesniewski & Woodward', 2002, 'SABR'],
  ['Gatheral', 2004, 'Raw SVI parameterisation'],
  ['Castagna & Mercurio', 2007, 'Vanna-volga smile'],
  ['Corsi', 2009, 'HAR-RV forecasting'],
  ['Buehler, Gonon, Teichmann & Wood', 2019, 'Deep hedging'],
  ['Imaki, Imajo, Ito, Minami & Nakagawa', 2021, 'No-transaction band network'],
]
const SOURCES = ['Deribit', 'Yahoo Finance', 'CFTC Commitments of Traders', 'Forex Factory', 'OpenSky Network', 'USGS', 'RainViewer']

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function Slider({ id, label, sym, value, min, max, step, onChange, fmt }) {
  return (
    <label className="lp-slider" htmlFor={id}>
      <span className="lp-slider-sym">{sym}</span>
      <span className="lp-slider-name">{label}</span>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)} />
      <span className="lp-slider-val">{fmt(value)}</span>
    </label>
  )
}

export default function LandingPage({ onEnter }) {
  const [greeks, setGreeks] = useState({ delta: -0.12, gamma: 0.018, vega: 0.32 })
  const touched = useRef(false)
  const set = (k) => (v) => { touched.current = true; setGreeks(g => ({ ...g, [k]: v })) }

  // Until the visitor takes the controls, the seal drifts through a few books.
  useEffect(() => {
    if (reduceMotion()) return
    const books = [{ delta: 0.55, gamma: 0.006, vega: 0.8 }, { delta: -0.3, gamma: -0.03, vega: -0.6 }, { delta: 0.02, gamma: 0.035, vega: 0.15 }, { delta: -0.12, gamma: 0.018, vega: 0.32 }]
    let i = 0
    const id = setInterval(() => { if (!touched.current) setGreeks(books[i++ % books.length]) }, 3600)
    return () => clearInterval(id)
  }, [])

  const groups = DESK_GROUPS.map(g => ({ ...g, desks: DESKS.filter(d => d.group === g.id) }))

  return (
    <div className="lp">
      <nav className="lp-nav" aria-label="Site">
        <a className="lp-brand" href="#top" aria-label="Nexus Terminal home"><NexusMark size={26} /><span>NEXUS</span></a>
        <div className="lp-nav-links">
          <a href="#desks">Desks</a>
          <a href="#proof">In the terminal</a>
          <a href="#methods">Methods</a>
        </div>
        <button className="btn-primary lp-nav-cta" onClick={onEnter}>Open the terminal<ArrowRight size={14} aria-hidden="true" /></button>
      </nav>

      <header className="lp-hero" id="top">
        <div className="lp-note">
          <div className="lp-note-micro lp-note-micro-top" aria-hidden="true">{MICRO.repeat(10)}</div>
          <span className="lp-corner lp-corner-tl" aria-hidden="true">Δ</span>
          <span className="lp-corner lp-corner-tr" aria-hidden="true">Γ</span>
          <span className="lp-corner lp-corner-bl" aria-hidden="true">ν</span>
          <span className="lp-corner lp-corner-br" aria-hidden="true">Θ</span>

          <div className="lp-note-face">
            <div className="lp-note-seal">
              <EngravedSeal greeks={greeks} size={340} />
              <fieldset className="lp-controls">
                <legend>Engrave a book</legend>
                <Slider id="s-d" label="Delta" sym="Δ" value={greeks.delta} min={-1} max={1} step={0.01} onChange={set('delta')} fmt={v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2)} />
                <Slider id="s-g" label="Gamma" sym="Γ" value={greeks.gamma} min={-0.08} max={0.08} step={0.001} onChange={set('gamma')} fmt={v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(3)} />
                <Slider id="s-v" label="Vega" sym="ν" value={greeks.vega} min={-1} max={1} step={0.01} onChange={set('vega')} fmt={v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2)} />
              </fieldset>
            </div>

            <div className="lp-note-copy">
              <h1 className="lp-h1">Desk-grade options analytics, with the working shown.</h1>
              <p className="lp-lede">
                Price, hedge and risk-manage FX, crypto and metals option books in one terminal: SABR and SVI fits on live
                Deribit smiles, full-revaluation VaR and ES, SPAN-style margin, dealer gamma and deep hedging. Every desk cites its method.
              </p>
              <div className="lp-ctas">
                <button className="btn-primary lp-cta" onClick={onEnter}>Open the terminal<ArrowRight size={16} aria-hidden="true" /></button>
                <a className="btn-ghost lp-cta-ghost" href="#desks">See all {DESKS.length} desks<ChevronDown size={15} aria-hidden="true" /></a>
              </div>
              <div className="lp-serial" aria-label={`${DESKS.length} desks, ${INSTRUMENTS} instruments, ${METHODS.length} cited methods`}>
                <span>Nº</span> {String(DESKS.length).padStart(3, '0')} DESKS <i /> {String(INSTRUMENTS).padStart(3, '0')} INSTRUMENTS <i /> {String(METHODS.length).padStart(3, '0')} CITED METHODS
              </div>
            </div>
          </div>
          <div className="lp-note-micro lp-note-micro-bottom" aria-hidden="true">{MICRO.repeat(10)}</div>
        </div>
        <p className="lp-hero-note">The seal is the terminal's Book Seal: in the app it is drawn from your portfolio's live Greeks and re-engraves whenever a leg changes.</p>
      </header>

      <section className="lp-section" id="desks" aria-labelledby="desks-h">
        <div className="lp-section-head">
          <h2 id="desks-h" className="lp-h2">One book, {DESKS.length} lenses.</h2>
          <p>Every desk reads the same portfolio from the book panel: change a strike once and pricing, vol, risk and margin all follow.</p>
        </div>
        <div className="lp-catalog">
          {groups.map(g => (
            <div className="lp-cat-group" key={g.id}>
              <h3>{g.label}<span>{g.desks.length}</span></h3>
              <ul>
                {g.desks.map(d => {
                  const Icon = d.icon
                  return (
                    <li key={d.id}>
                      <Icon size={16} strokeWidth={1.6} aria-hidden="true" />
                      <div><b>{d.label}</b><span>{d.meta}</span></div>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-section lp-proof" id="proof" aria-labelledby="proof-h">
        <div className="lp-section-head">
          <h2 id="proof-h" className="lp-h2">Numbers first, method underneath.</h2>
          <p>Captured from the terminal on a short BTC strangle with live Deribit data.</p>
        </div>
        <figure className="lp-plate lp-plate-main">
          <img src="/landing/terminal-risk.png" width="2880" height="1800" loading="lazy"
            alt="Nexus Risk Desk: VaR and ES by five methods, a filtered-historical P&L distribution and a green-zone backtest for a short BTC strangle." />
          <figcaption><b>Risk Desk.</b> VaR and ES by historical, filtered-historical, delta-gamma Cornish-Fisher, Student-t Monte Carlo and delta-normal methods, with a Kupiec and Christoffersen backtest.</figcaption>
        </figure>
        <div className="lp-plate-row">
          <figure className="lp-plate">
            <img src="/landing/terminal-vollab.png" width="2880" height="1800" loading="lazy"
              alt="Nexus Vol Lab: live Deribit BTC surface with raw-SVI fits per expiry and the ATM, risk-reversal and butterfly term structure." />
            <figcaption><b>Vol Lab.</b> Live Deribit surface, raw-SVI per expiry with a butterfly-arbitrage check.</figcaption>
          </figure>
          <figure className="lp-plate">
            <img src="/landing/terminal-positioning.png" width="2880" height="1800" loading="lazy"
              alt="Nexus Positioning desk: dealer gamma exposure profile across spot with the gamma flip, call wall and put wall." />
            <figcaption><b>Positioning.</b> Dealer gamma from open interest, the gamma flip, walls and max pain.</figcaption>
          </figure>
        </div>
      </section>

      <section className="lp-section" id="methods" aria-labelledby="methods-h">
        <div className="lp-methods">
          <div>
            <h2 id="methods-h" className="lp-h2">Methods you can cite.</h2>
            <p className="lp-methods-lede">The models behind the desks, as referenced in the terminal itself. When a number matters, you can trace it to the paper.</p>
            <div className="lp-sources">
              <h3>Data</h3>
              <p>{SOURCES.join(' · ')}</p>
            </div>
          </div>
          <ol className="lp-biblio">
            {METHODS.map(([who, year, what]) => (
              <li key={who + year}><span className="lp-biblio-year">{year}</span><span className="lp-biblio-who">{who}</span><span className="lp-biblio-what">{what}</span></li>
            ))}
          </ol>
        </div>
      </section>

      <section className="lp-close" aria-labelledby="close-h">
        <div className="lp-note-micro" aria-hidden="true">{MICRO.repeat(10)}</div>
        <div className="lp-close-inner">
          <EngravedSeal greeks={{ delta: 0.25, gamma: 0.02, vega: 0.3 }} size={132} />
          <div>
            <h2 id="close-h" className="lp-h2">Your book, engraved.</h2>
            <p>Load a structure, set the market, and read it through every desk.</p>
          </div>
          <button className="btn-primary lp-cta" onClick={onEnter}>Open the terminal<ArrowRight size={16} aria-hidden="true" /></button>
        </div>
      </section>

      <footer className="lp-footer">
        <span>NEXUS Terminal</span>
        <span>© 2026 Mihir Kansara</span>
        <a href="https://www.linkedin.com/in/mihir-kansara-043275187/" target="_blank" rel="noopener noreferrer">LinkedIn</a>
      </footer>
    </div>
  )
}
