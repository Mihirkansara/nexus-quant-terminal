import { useState, useEffect } from 'react'
import { ArrowRight, TriangleAlert } from 'lucide-react'
import { EngravedSeal } from '../components/BookSeal'

const USER = 'nexus.quant'
const PASS = 'nexus@2026'
const LINKEDIN = 'https://www.linkedin.com/in/mihir-kansara-043275187/'

const BOOKS = [
  { delta: -0.12, gamma: 0.018, vega: 0.32 },
  { delta: 0.48, gamma: 0.004, vega: 0.7 },
  { delta: -0.36, gamma: -0.028, vega: -0.55 },
  { delta: 0.05, gamma: 0.032, vega: 0.12 },
]

function LinkedInGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
    </svg>
  )
}

export default function LoginPage({ onLogin }) {
  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const [err, setErr] = useState('')
  const [shake, setShake] = useState(false)
  const [loading, setLoading] = useState(false)
  const [book, setBook] = useState(0)

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => setBook(b => (b + 1) % BOOKS.length), 3800)
    return () => clearInterval(id)
  }, [])

  function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setTimeout(() => {
      if (u === USER && p === PASS) {
        onLogin()
      } else {
        setErr('Those credentials do not match. Message Mihir on LinkedIn to request access.')
        setShake(true)
        setTimeout(() => setShake(false), 600)
      }
      setLoading(false)
    }, 500)
  }

  return (
    <main className="lg">
      <div className={`lg-note${shake ? ' lg-shake' : ''}`}>
        <section className="lg-face" aria-hidden="true">
          <div className="lp-note-micro lp-note-micro-top">{'NEXUS · DELTA · GAMMA · VEGA · THETA · RHO · VANNA · VOLGA · '.repeat(8)}</div>
          <div className="lg-face-body">
            <EngravedSeal greeks={BOOKS[book]} size={250} />
            <div className="lg-face-title">
              <b>NEXUS</b>
              <span>Options terminal · FX, crypto, metals</span>
            </div>
          </div>
          <div className="lg-serial"><span>Nº 028 DESKS</span><span>ACCESS NOTE</span></div>
          <div className="lp-note-micro lp-note-micro-bottom">{'NEXUS · DELTA · GAMMA · VEGA · THETA · RHO · VANNA · VOLGA · '.repeat(8)}</div>
        </section>

        <form className="lg-form" onSubmit={handleSubmit} noValidate>
          <h1>Sign in</h1>
          <p>Nexus is invite-only while it is in development. Use the credentials you were sent.</p>

          <div className="lg-field">
            <label htmlFor="lg-user">Username</label>
            <input id="lg-user" className="input-field" autoComplete="username" autoFocus
              value={u} onChange={e => { setU(e.target.value); setErr('') }} placeholder="e.g. nexus.desk" />
          </div>
          <div className="lg-field">
            <label htmlFor="lg-pass">Password</label>
            <input id="lg-pass" className="input-field" type="password" autoComplete="current-password"
              value={p} onChange={e => { setP(e.target.value); setErr('') }} />
          </div>

          {err && <div className="lg-error" role="alert"><TriangleAlert size={15} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />{err}</div>}

          <button className="btn-primary lg-submit" type="submit" disabled={loading || !u || !p}>
            {loading ? 'Checking…' : <>Sign in<ArrowRight size={15} aria-hidden="true" /></>}
          </button>

          <div className="lg-access">
            <span>No credentials yet?</span>
            <a className="btn-ghost" href={LINKEDIN} target="_blank" rel="noopener noreferrer"><LinkedInGlyph />Request access on LinkedIn</a>
          </div>
        </form>
      </div>
    </main>
  )
}
