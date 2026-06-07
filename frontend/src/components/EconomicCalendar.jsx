import { useState, useEffect, useCallback, Fragment, useMemo } from 'react'
import { fetchCalendar } from '../api/client'

/* ─── constants ────────────────────────────────────────── */

const FLAGS = {
  USD:'🇺🇸', EUR:'🇪🇺', GBP:'🇬🇧', JPY:'🇯🇵',
  AUD:'🇦🇺', CAD:'🇨🇦', CHF:'🇨🇭', NZD:'🇳🇿',
  CNY:'🇨🇳', CNH:'🇨🇳',
}

const IMP = {
  High:   { color:'var(--red)',   bar:'var(--red)',   label:'HIGH', badge:'tbadge-high'   },
  Medium: { color:'var(--amber)', bar:'var(--amber)', label:'MED',  badge:'tbadge-medium' },
  Low:    { color:'var(--text-muted)', bar:'var(--text-faint)', label:'LOW', badge:'' },
}

const ALL_CCY = ['USD','EUR','GBP','JPY','AUD','CAD','CHF','NZD']
const DAY_ABBR = ['SUN','MON','TUE','WED','THU','FRI','SAT']

/* ─── helpers ──────────────────────────────────────────── */

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function toDateStr(d) {
  // local calendar date → "YYYY-MM-DD"
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2,'0')
  const day = String(d.getDate()).padStart(2,'0')
  return `${y}-${m}-${day}`
}

function getMondayOf(d) {
  const copy = new Date(d)
  const dow  = copy.getDay()  // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow
  copy.setDate(copy.getDate() + diff)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function fmtUtcTime(dtStr) {
  if (!dtStr) return 'All Day'
  try {
    return new Date(dtStr).toLocaleTimeString('en-GB',
      { hour:'2-digit', minute:'2-digit', timeZone:'UTC' })
  } catch { return '--:--' }
}

function fmtFullDay(dateStr) {
  if (!dateStr) return ''
  try {
    return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US',
      { weekday:'long', month:'long', day:'numeric', year:'numeric', timeZone:'UTC' })
  } catch { return dateStr }
}

function isPast(dtStr) {
  if (!dtStr) return false
  return new Date(dtStr) < Date.now()
}

function countdown(dtStr) {
  if (!dtStr) return null
  const diff = new Date(dtStr) - Date.now()
  if (diff <= 0 || diff > 24 * 3600000) return null
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

/* ─── sub-components ───────────────────────────────────── */

function ImpactDots({ counts }) {
  return (
    <div style={{ display:'flex', gap:2, marginTop:3, justifyContent:'center' }}>
      {counts.high   > 0 && [...Array(Math.min(counts.high,  3))].map((_,i) =>
        <span key={'h'+i} style={{ width:4, height:4, borderRadius:'50%', background:'#ff3d5a', opacity:0.9 }}/>
      )}
      {counts.medium > 0 && [...Array(Math.min(counts.medium,3))].map((_,i) =>
        <span key={'m'+i} style={{ width:4, height:4, borderRadius:'50%', background:'#f59e0b', opacity:0.7 }}/>
      )}
    </div>
  )
}

function EventRow({ ev }) {
  const imp    = IMP[ev.impact] || IMP.Low
  const flag   = FLAGS[ev.country] || '🏳️'
  const past   = isPast(ev.datetime_utc)
  const cd     = countdown(ev.datetime_utc)
  const actual = ev.actual?.trim()

  // beat/miss
  let bm = null
  if (actual && ev.forecast?.trim()) {
    const a = parseFloat(actual), f = parseFloat(ev.forecast)
    if (!isNaN(a) && !isNaN(f)) bm = a > f ? 'beat' : a < f ? 'miss' : 'inline'
  }
  const actualColor = bm === 'beat' ? 'var(--green)' : bm === 'miss' ? 'var(--red)' : 'var(--text-secondary)'

  return (
    <tr style={{
      opacity: past && !actual ? 0.45 : 1,
      borderBottom: '1px solid var(--border)',
      background: cd ? 'color-mix(in srgb, var(--cyan) 2%, transparent)' : 'transparent',
      transition: 'var(--t-fast)',
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in srgb, var(--cyan) 4%, transparent)'}
      onMouseLeave={e => e.currentTarget.style.background = cd ? 'color-mix(in srgb, var(--cyan) 2%, transparent)' : 'transparent'}
    >
      {/* Impact bar */}
      <td style={{ width:3, padding:0 }}>
        <div style={{ width:3, height:'100%', minHeight:36, background:imp.bar }}/>
      </td>

      {/* Time */}
      <td style={{ padding:'7px 12px', whiteSpace:'nowrap', width:68 }}>
        <div className="font-mono" style={{ fontSize:11, color: past ? 'var(--text-faint)' : 'var(--text-secondary)', fontWeight:600, fontVariantNumeric:'tabular-nums' }}>
          {fmtUtcTime(ev.datetime_utc)}
        </div>
        {cd && (
          <div className="font-mono live-dot-blink" style={{ fontSize:8, color:'var(--cyan)', marginTop:2 }}>
            in {cd}
          </div>
        )}
      </td>

      {/* Currency */}
      <td style={{ padding:'7px 8px', width:72, whiteSpace:'nowrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ fontSize:14 }}>{flag}</span>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:9, fontWeight:800, color:imp.color, letterSpacing:'0.06em' }}>
            {ev.country}
          </span>
        </div>
      </td>

      {/* Impact label */}
      <td style={{ padding:'7px 6px', width:44 }}>
        {imp.badge
          ? <span className={`tbadge ${imp.badge}`}>{imp.label}</span>
          : <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-faint)', letterSpacing:'0.06em' }}>{imp.label}</span>
        }
      </td>

      {/* Event name */}
      <td style={{ padding:'7px 10px' }}>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:11, color: cd ? 'var(--text)' : past ? 'var(--text-muted)' : 'var(--text-secondary)',
          fontWeight: cd ? 600 : 400 }}>
          {ev.title}
        </span>
      </td>

      {/* Actual */}
      <td style={{ padding:'7px 12px', textAlign:'right', width:80 }}>
        {actual ? (
          <span className="font-mono" style={{ fontSize:11, fontWeight:700, color:actualColor, fontVariantNumeric:'tabular-nums' }}>
            {bm === 'beat' ? '▲ ' : bm === 'miss' ? '▼ ' : ''}{actual}
          </span>
        ) : (
          <span style={{ fontSize:10, color:'var(--text-ghost)' }}>—</span>
        )}
      </td>

      {/* Forecast */}
      <td style={{ padding:'7px 12px', textAlign:'right', width:80 }}>
        <span className="font-mono" style={{ fontSize:11, color: ev.forecast?.trim() ? 'var(--text-dim)' : 'var(--text-ghost)', fontVariantNumeric:'tabular-nums' }}>
          {ev.forecast?.trim() || '—'}
        </span>
      </td>

      {/* Previous */}
      <td style={{ padding:'7px 12px', textAlign:'right', width:80 }}>
        <span className="font-mono" style={{ fontSize:11, color: ev.previous?.trim() ? 'var(--text-muted)' : 'var(--text-ghost)', fontVariantNumeric:'tabular-nums' }}>
          {ev.previous?.trim() || '—'}
        </span>
      </td>
    </tr>
  )
}

/* ─── main component ───────────────────────────────────── */

export default function EconomicCalendar() {
  const [data,      setData]      = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [selDate,   setSelDate]   = useState(todayStr())
  const [weekStart, setWeekStart] = useState(() => getMondayOf(new Date()))
  const [impFilter, setImpFilter] = useState('All')
  const [ccyFilter, setCcyFilter] = useState([])

  /* load calendar data */
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setData(await fetchCalendar()) }
    catch { setError('Could not load Forex Factory data.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [])
  useEffect(() => {
    const id = setInterval(load, 10 * 60 * 1000)   // refresh every 10 min
    return () => clearInterval(id)
  }, [])

  /* derived values */
  const allEvents = data?.events || []

  // dates that have at least one event
  const availDates = useMemo(() =>
    new Set(allEvents.map(e => e.datetime_utc?.slice(0, 10)).filter(Boolean)),
    [allEvents]
  )

  // week days: Mon-Sun for current weekStart
  const weekDays = useMemo(() =>
    [...Array(7)].map((_, i) => {
      const d = new Date(weekStart)
      d.setDate(weekStart.getDate() + i)
      return d
    }),
    [weekStart]
  )

  // events for selected day
  const dayEvents = useMemo(() =>
    allEvents.filter(ev => {
      if (!ev.datetime_utc?.startsWith(selDate)) return false
      if (impFilter !== 'All' && ev.impact !== impFilter) return false
      if (ccyFilter.length > 0 && !ccyFilter.includes(ev.country)) return false
      return true
    }),
    [allEvents, selDate, impFilter, ccyFilter]
  )

  // impact counts per day (for dot indicators)
  const impactCounts = useMemo(() => {
    const map = {}
    for (const ev of allEvents) {
      const d = ev.datetime_utc?.slice(0, 10)
      if (!d) continue
      if (!map[d]) map[d] = { high:0, medium:0, low:0, total:0 }
      const k = ev.impact?.toLowerCase()
      if (k === 'high')   map[d].high++
      if (k === 'medium') map[d].medium++
      if (k === 'low')    map[d].low++
      map[d].total++
    }
    return map
  }, [allEvents])

  // day event counts for selected date (unfiltered, for header)
  const selDayAll = allEvents.filter(e => e.datetime_utc?.startsWith(selDate))
  const selImpCounts = impactCounts[selDate] || { high:0, medium:0, low:0 }

  /* week navigation */
  function prevWeek() {
    const next = new Date(weekStart)
    next.setDate(weekStart.getDate() - 7)
    setWeekStart(next)
  }
  function nextWeek() {
    const next = new Date(weekStart)
    next.setDate(weekStart.getDate() + 7)
    setWeekStart(next)
  }

  /* ── render ─────────────────────────────────────────── */

  const today = todayStr()

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>

      {/* ── Terminal header + Week navigation ───────── */}
      <div className="term-header" style={{ padding:'6px 14px', flexShrink:0, borderRadius:0 }}>
        <span className="live-dot-blink"/>
        <span className="term-header-cyan">ECONOMIC CALENDAR</span>
        <span style={{ opacity:0.4 }}>·</span>
        <span className="term-header-title">Forex Factory · UTC</span>
        <div style={{ flex:1 }}/>
        <button className="btn-ghost" onClick={load} style={{ fontSize:10, padding:'3px 9px' }}>
          {loading ? '⟳' : '↻'}
        </button>
      </div>

      {/* ── Week navigation bar ──────────────────────── */}
      <div style={{
        background:'var(--bg2)', borderBottom:'1px solid var(--border)',
        padding:'6px 14px', display:'flex', alignItems:'center', gap:6, flexShrink:0,
      }}>
        <button onClick={prevWeek} className="btn-ghost" style={{ padding:'3px 8px', fontSize:13, lineHeight:1 }}>‹</button>

        <div style={{ display:'flex', gap:3, flex:1, justifyContent:'center' }}>
          {weekDays.map(d => {
            const ds      = toDateStr(d)
            const isToday = ds === today
            const isSel   = ds === selDate
            const hasData = availDates.has(ds)
            const counts  = impactCounts[ds] || { high:0, medium:0, low:0 }

            return (
              <button key={ds} onClick={() => hasData && setSelDate(ds)}
                style={{
                  minWidth:56, padding:'4px 5px', borderRadius:'var(--r-sm)', cursor: hasData ? 'pointer' : 'default',
                  border: isSel
                    ? '1px solid color-mix(in srgb, var(--cyan) 50%, transparent)'
                    : isToday
                      ? '1px solid color-mix(in srgb, var(--cyan) 20%, transparent)'
                      : '1px solid var(--border-sub)',
                  background: isSel
                    ? 'color-mix(in srgb, var(--cyan) 12%, transparent)'
                    : isToday
                      ? 'color-mix(in srgb, var(--cyan) 4%, transparent)'
                      : 'transparent',
                  opacity: hasData ? 1 : 0.2,
                  transition:'var(--t-fast)', textAlign:'center', outline:'none',
                }}>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:7.5, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase',
                  color: isSel ? 'var(--cyan)' : isToday ? 'color-mix(in srgb, var(--cyan) 70%, transparent)' : 'var(--text-muted)' }}>
                  {DAY_ABBR[d.getDay()]}
                </div>
                <div className="font-mono" style={{ fontSize:12, fontWeight:700, marginTop:1, fontVariantNumeric:'tabular-nums',
                  color: isSel ? 'var(--text)' : hasData ? 'var(--text-secondary)' : 'var(--text-faint)' }}>
                  {d.getDate()}
                </div>
                {hasData && <ImpactDots counts={counts} />}
                {!hasData && <div style={{ height:7 }}/>}
              </button>
            )
          })}
        </div>

        <button onClick={nextWeek} className="btn-ghost" style={{ padding:'3px 8px', fontSize:13, lineHeight:1 }}>›</button>
      </div>

      {/* ── Day header ───────────────────────────────── */}
      <div style={{
        padding:'6px 14px', background:'var(--surface)',
        borderBottom:'1px solid var(--border)',
        display:'flex', alignItems:'center', justifyContent:'space-between',
        flexShrink:0, gap:8,
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:11, fontWeight:700, color:'var(--text)' }}>
            {fmtFullDay(selDate)}
          </span>
          <div style={{ display:'flex', gap:4, alignItems:'center' }}>
            {selImpCounts.high > 0 && (
              <span className="tbadge tbadge-high">{selImpCounts.high} High</span>
            )}
            {selImpCounts.medium > 0 && (
              <span className="tbadge tbadge-medium">{selImpCounts.medium} Med</span>
            )}
            {selImpCounts.low > 0 && (
              <span className="tbadge" style={{ fontFamily:'var(--font-mono)', fontSize:8,
                background:'var(--bg3)', color:'var(--text-muted)', borderRadius:3, padding:'1px 5px' }}>
                {selImpCounts.low} Low
              </span>
            )}
          </div>
        </div>

        {/* Filters */}
        <div style={{ display:'flex', gap:3, alignItems:'center', flexWrap:'wrap' }}>
          {['All','High','Medium','Low'].map(v => {
            const active = impFilter === v
            const accentVar = v === 'High' ? 'var(--red)' : v === 'Medium' ? 'var(--amber)' : 'var(--text-muted)'
            return (
              <button key={v} onClick={() => setImpFilter(v)} style={{
                padding:'2px 8px', borderRadius:'var(--r-sm)', fontFamily:'var(--font-mono)', fontSize:8.5, fontWeight:700,
                border: active ? `1px solid color-mix(in srgb, ${v==='All'?'var(--cyan)':accentVar} 40%, transparent)` : '1px solid var(--border-sub)',
                background: active ? `color-mix(in srgb, ${v==='All'?'var(--cyan)':accentVar} 10%, transparent)` : 'transparent',
                color: active ? (v==='All'?'var(--cyan)':accentVar) : 'var(--text-muted)',
                cursor:'pointer', transition:'var(--t-fast)', outline:'none',
              }}>{v}</button>
            )
          })}
          <div style={{ width:1, height:12, background:'var(--border-sub)' }}/>
          {ALL_CCY.map(ccy => {
            const active = ccyFilter.includes(ccy)
            return (
              <button key={ccy} onClick={() =>
                setCcyFilter(p => p.includes(ccy) ? p.filter(c=>c!==ccy) : [...p, ccy])
              } style={{
                padding:'2px 6px', borderRadius:'var(--r-sm)', fontFamily:'var(--font-mono)', fontSize:8, fontWeight:700,
                border: active ? '1px solid color-mix(in srgb, var(--cyan) 35%, transparent)' : '1px solid var(--border-sub)',
                background: active ? 'var(--cyan-bg)' : 'transparent',
                color: active ? 'var(--cyan)' : 'var(--text-muted)',
                cursor:'pointer', transition:'var(--t-fast)', outline:'none',
              }}>{FLAGS[ccy]||''} {ccy}</button>
            )
          })}
          {ccyFilter.length > 0 && (
            <button onClick={() => setCcyFilter([])} style={{
              padding:'2px 5px', borderRadius:3, fontSize:9, border:'none',
              background:'transparent', color:'var(--text-muted)', cursor:'pointer',
            }}>✕</button>
          )}
        </div>
      </div>

      {/* ── Event table ──────────────────────────────── */}
      <div style={{ flex:1, overflowY:'auto' }}>
        {loading && !data ? (
          <div style={{ padding:20 }}>
            {[...Array(6)].map((_,i) => (
              <div key={i} className="skeleton" style={{ height:44, marginBottom:3, borderRadius:4 }}/>
            ))}
          </div>
        ) : error ? (
          <div style={{ padding:16 }}>
            <div style={{ padding:12, borderRadius:6, background:'rgba(255,61,90,0.08)',
              border:'1px solid #ff3d5a', color:'#ff3d5a', fontSize:12 }}>{error}</div>
            <button className="btn-primary" onClick={load} style={{ marginTop:8 }}>Retry</button>
          </div>
        ) : !availDates.has(selDate) ? (
          <div style={{ padding:40, textAlign:'center' }}>
            <div style={{ fontSize:28, marginBottom:10 }}>📭</div>
            <div style={{ fontSize:13, color:'#475569', fontWeight:600 }}>No data for {fmtFullDay(selDate)}</div>
            <div style={{ fontSize:11, color:'#334155', marginTop:6 }}>
              Forex Factory publishes the current week's calendar each Sunday.
              <br/>Navigate to a date within the available range.
            </div>
            <div style={{ marginTop:10, display:'flex', gap:6, justifyContent:'center', flexWrap:'wrap' }}>
              {[...availDates].sort().map(d => (
                <button key={d} onClick={() => setSelDate(d)} style={{
                  padding:'4px 10px', borderRadius:5, fontSize:10, cursor:'pointer',
                  background:'rgba(0,212,255,0.07)', border:'1px solid rgba(0,212,255,0.2)',
                  color:'#00d4ff',
                }}>
                  {new Date(d+'T12:00:00Z').toLocaleDateString('en-US',
                    { weekday:'short', month:'short', day:'numeric', timeZone:'UTC' })}
                </button>
              ))}
            </div>
          </div>
        ) : dayEvents.length === 0 ? (
          <div style={{ padding:30, textAlign:'center', color:'#334155', fontSize:12 }}>
            No events match the current filters.
          </div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
            <colgroup>
              <col style={{ width:3 }}/>
              <col style={{ width:68 }}/>
              <col style={{ width:78 }}/>
              <col style={{ width:44 }}/>
              <col/>
              <col style={{ width:80 }}/>
              <col style={{ width:80 }}/>
              <col style={{ width:80 }}/>
            </colgroup>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border)', position:'sticky', top:0,
                background:'var(--bg2)', zIndex:2 }}>
                <th style={{ padding:0 }}/>
                {['Time (UTC)','Currency','Imp.','Event','Actual','Forecast','Previous'].map((h,i) => (
                  <th key={h} style={{ padding:'5px '+(i===0||i===1?'12px':'8px'),
                    fontFamily:'var(--font-mono)', fontSize:8, fontWeight:700, letterSpacing:'0.1em',
                    textTransform:'uppercase', color:'var(--text-muted)',
                    textAlign: i >= 4 ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dayEvents.map((ev, i) => <EventRow key={i} ev={ev} />)}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Footer ───────────────────────────────────── */}
      <div style={{
        padding:'4px 14px', flexShrink:0,
        borderTop:'1px solid var(--border)',
        background:'var(--bg2)',
        display:'flex', alignItems:'center', gap:12,
      }}>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-ghost)' }}>
          Forex Factory · nfs.faireconomy.media · published weekly · all times UTC
        </span>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-ghost)', marginLeft:'auto' }}>
          {data?.count || 0} events
        </span>
      </div>
    </div>
  )
}
