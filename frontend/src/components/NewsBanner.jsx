import { useState, useEffect } from 'react'
import { fetchCalendar } from '../api/client'

const FLAGS = {
  USD:'🇺🇸', EUR:'🇪🇺', GBP:'🇬🇧', JPY:'🇯🇵',
  AUD:'🇦🇺', CAD:'🇨🇦', CHF:'🇨🇭', NZD:'🇳🇿',
}

const IMP_COLOR = { High:'#ff3d5a', Medium:'#f59e0b', Low:'#475569' }

function fmtUtcTime(dtStr) {
  if (!dtStr) return '--:--'
  try {
    return new Date(dtStr).toLocaleTimeString('en-GB',
      { hour:'2-digit', minute:'2-digit', timeZone:'UTC' })
  } catch { return '--:--' }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function EventChip({ ev }) {
  const color  = IMP_COLOR[ev.impact] || '#475569'
  const flag   = FLAGS[ev.country] || '🏳️'
  const actual = ev.actual?.trim()
  const isPast = ev.datetime_utc ? new Date(ev.datetime_utc) < Date.now() : false

  return (
    <div style={{
      display:'inline-flex', alignItems:'center', gap:5,
      padding:'0 14px', height:22,
      borderRight:'1px solid rgba(255,255,255,0.03)',
      flexShrink:0, opacity: isPast && !actual ? 0.45 : 1,
    }}>
      <span style={{ fontSize:6, color, lineHeight:1 }}>●</span>
      <span className="font-mono" style={{ fontSize:9, color:'#334155' }}>
        {fmtUtcTime(ev.datetime_utc)}
      </span>
      <span style={{ fontSize:10 }}>{flag}</span>
      <span style={{ fontSize:9, fontWeight:700, color, letterSpacing:'0.04em' }}>{ev.country}</span>
      <span style={{ fontSize:9, color:'#64748b', whiteSpace:'nowrap', maxWidth:170,
        overflow:'hidden', textOverflow:'ellipsis' }}>{ev.title}</span>
      {actual ? (
        <span className="font-mono" style={{ fontSize:8, color:'#00ff88', fontWeight:700 }}>
          ✓ {actual}
        </span>
      ) : ev.forecast?.trim() ? (
        <span className="font-mono" style={{ fontSize:8, color:'#334155' }}>
          Exp <span style={{ color:'#475569' }}>{ev.forecast}</span>
        </span>
      ) : null}
    </div>
  )
}

export default function NewsBanner() {
  const [events, setEvents] = useState([])

  useEffect(() => {
    fetchCalendar()
      .then(d => {
        const today = todayStr()
        // Only show today's HIGH + MEDIUM events in the strip
        const filtered = (d.events || []).filter(ev =>
          (ev.impact === 'High' || ev.impact === 'Medium') &&
          ev.datetime_utc?.startsWith(today)
        )
        // If today has no events, fall back to next available day's high/medium
        if (filtered.length === 0) {
          const upcoming = (d.events || []).filter(ev =>
            (ev.impact === 'High' || ev.impact === 'Medium') &&
            (ev.datetime_utc || '') > new Date().toISOString()
          ).slice(0, 12)
          setEvents(upcoming)
        } else {
          setEvents(filtered)
        }
      })
      .catch(() => {})
  }, [])

  if (!events.length) return null

  const doubled = [...events, ...events]

  return (
    <div className="news-wrap" style={{ height:22 }}>
      {/* Label */}
      <div style={{
        position:'absolute', left:0, top:0, height:'100%', zIndex:3,
        display:'flex', alignItems:'center', gap:6, padding:'0 10px',
        background:'linear-gradient(90deg, rgba(2,4,12,1) 65%, transparent)',
        pointerEvents:'none',
      }}>
        <span style={{ fontSize:7, color:'#ff3d5a', fontWeight:800,
          textTransform:'uppercase', letterSpacing:'0.14em', whiteSpace:'nowrap' }}>
          📅 Today
        </span>
        <div style={{ width:1, height:10, background:'rgba(255,61,90,0.2)' }}/>
      </div>

      <div className="news-inner" style={{ paddingLeft:68 }}>
        {doubled.map((ev, i) => <EventChip key={i} ev={ev} />)}
      </div>
    </div>
  )
}
