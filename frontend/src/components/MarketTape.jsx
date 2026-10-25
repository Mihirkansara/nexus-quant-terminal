import { useState, useEffect } from 'react'
import { fetchCalendar } from '../api/client'

const IMPACT = { High: 'var(--neg)', Medium: 'var(--warn)' }

const utcHM = (s) => {
  try { return new Date(s).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) }
  catch { return '--:--' }
}

const rateDp = (pair, spot) => (pair.includes('JPY') ? 3 : spot >= 1000 ? 0 : spot >= 50 ? 2 : 5)

function RateItem({ r }) {
  const up = (r.change_pct ?? 0) >= 0
  return (
    <div className="ticker-item">
      <span className="ticker-pair">{r.pair}</span>
      <span className="ticker-rate">{r.spot?.toLocaleString('en-US', { minimumFractionDigits: rateDp(r.pair, r.spot), maximumFractionDigits: rateDp(r.pair, r.spot) })}</span>
      {r.change_pct != null && (
        <span style={{ color: up ? 'var(--pos)' : 'var(--neg)' }}>{up ? '+' : '−'}{Math.abs(r.change_pct).toFixed(2)}%</span>
      )}
    </div>
  )
}

function EventItem({ ev }) {
  const actual = ev.actual?.trim()
  const past = ev.past
  return (
    <div className="ticker-item" style={{ opacity: past && !actual ? 0.5 : 1, fontFamily: 'var(--font-ui)' }}>
      <span style={{ width: 6, height: 6, borderRadius: 1, background: IMPACT[ev.impact] ?? 'var(--border-md)' }} />
      <span className="mono" style={{ color: 'var(--text-muted)' }}>{utcHM(ev.datetime_utc)}</span>
      <span style={{ fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.04em' }}>{ev.country}</span>
      <span style={{ color: 'var(--text-dim)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.title}</span>
      {actual
        ? <span className="mono" style={{ color: 'var(--ink)' }}>Act {actual}</span>
        : ev.forecast?.trim() ? <span className="mono" style={{ color: 'var(--text-muted)' }}>Exp {ev.forecast}</span> : null}
    </div>
  )
}

export default function MarketTape({ rates }) {
  const [events, setEvents] = useState([])

  useEffect(() => {
    fetchCalendar().then(d => {
      const now = Date.now()
      const all = (d.events || []).filter(ev => ev.impact === 'High' || ev.impact === 'Medium')
        .map(ev => ({ ...ev, past: ev.datetime_utc ? new Date(ev.datetime_utc).getTime() < now : false }))
      const today = new Date().toISOString().slice(0, 10)
      const todays = all.filter(ev => ev.datetime_utc?.startsWith(today))
      setEvents(todays.length ? todays : all.filter(ev => (ev.datetime_utc || '') > new Date().toISOString()).slice(0, 12))
    }).catch(() => {})
  }, [])

  if (!rates.length && !events.length) return null
  const run = (
    <>
      {rates.map((r, i) => <RateItem key={'r' + i + r.pair} r={r} />)}
      {events.length > 0 && <div className="ticker-item" style={{ fontFamily: 'var(--font-ui)', color: 'var(--text-muted)', fontSize: 10, fontWeight: 600, letterSpacing: '0.14em' }}>EVENTS · UTC</div>}
      {events.map((ev, i) => <EventItem key={'e' + i} ev={ev} />)}
    </>
  )
  return (
    <div className="ticker-wrap" style={{ height: 28 }} aria-label="Market rates and today's economic events">
      <div className="ticker-inner" style={{ height: '100%' }}>
        <div style={{ display: 'flex', height: '100%' }}>{run}</div>
        <div style={{ display: 'flex', height: '100%' }} aria-hidden="true">{run}</div>
      </div>
    </div>
  )
}
