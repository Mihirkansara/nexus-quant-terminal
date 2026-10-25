import { useState, useEffect, useCallback } from 'react'
import TopBar from './components/TopBar'
import DeskRail from './components/DeskRail'
import DeskIndex from './components/DeskIndex'
import BookPanel from './components/BookPanel'
import Dashboard from './pages/Dashboard'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import { usePortfolioStore } from './store/portfolio'
import { deskById, DEFAULT_DESK } from './desks'

// Desk routing lives in the hash (#/risk) so a desk is linkable and survives reloads,
// while the query string keeps carrying the shared book (?pair=…&legs=…).
const deskFromHash = () => {
  const id = window.location.hash.replace(/^#\/?/, '')
  return deskById(id) ? id : DEFAULT_DESK
}

function Terminal({ onLogout }) {
  const [desk, setDesk] = useState(deskFromHash)
  const [indexOpen, setIndexOpen] = useState(false)
  const [bookOpen, setBookOpen] = useState(false)

  useEffect(() => {
    const onHash = () => setDesk(deskFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setIndexOpen(o => !o) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const select = useCallback((id) => {
    if (window.location.hash !== '#/' + id) window.location.hash = '/' + id
    setDesk(id)
    setBookOpen(false)
  }, [])

  return (
    <div className="nx-app">
      <TopBar onLogout={onLogout} onOpenIndex={() => setIndexOpen(true)} onToggleBook={() => setBookOpen(o => !o)} />
      <div className="nx-body">
        <DeskRail active={desk} onSelect={select} />
        <BookPanel open={bookOpen} />
        <Dashboard active={desk} />
      </div>
      {indexOpen && <DeskIndex onClose={() => setIndexOpen(false)} onSelect={select} active={desk} />}
    </div>
  )
}

export default function App() {
  const { fromURL } = usePortfolioStore()
  const [authed, setAuthed] = useState(() => sessionStorage.getItem('qfx-auth') === '1')
  const [inApp, setInApp] = useState(() => sessionStorage.getItem('qfx-v') === '1')

  useEffect(() => { fromURL() }, [fromURL])

  function handleLogin() {
    sessionStorage.setItem('qfx-auth', '1')
    setAuthed(true)
  }

  function handleLogout() {
    sessionStorage.removeItem('qfx-auth')
    sessionStorage.removeItem('qfx-v')
    setAuthed(false)
    setInApp(false)
  }

  function enterApp() {
    sessionStorage.setItem('qfx-v', '1')
    setInApp(true)
  }

  if (!authed) return <LoginPage onLogin={handleLogin} />
  if (!inApp) return <LandingPage onEnter={enterApp} />
  return <Terminal onLogout={handleLogout} />
}
