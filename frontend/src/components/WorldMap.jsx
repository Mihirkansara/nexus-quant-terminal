import { useState, useEffect, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const CCY_POS = {
  USD:[38,-97], EUR:[51,10], GBP:[52.5,-1.5], JPY:[36,138],
  AUD:[-25,134], CAD:[56,-106], CHF:[46.8,8.2], NZD:[-41,174],
  CNY:[35,105], CNH:[22.3,114.2], SEK:[60,18], NOK:[60,8],
  DKK:[56,10], SGD:[1.35,103.8], HKD:[22.3,114.2], MXN:[23,-102],
  BRL:[-14,-51], ZAR:[-30,25], INR:[20,77], KRW:[36,128],
}

function planeIcon(heading) {
  const deg = (heading || 0) - 45
  return L.divIcon({
    html: `<svg viewBox="0 0 20 20" width="13" height="13" style="transform:rotate(${deg}deg);overflow:visible;display:block">
      <polygon points="10,0 13,8 20,10 13,12 10,20 7,12 0,10 7,8" fill="#00c8f0" opacity="0.85"/>
    </svg>`,
    iconSize: [13,13], iconAnchor: [6,6], className:'',
  })
}

function eventIcon(impact) {
  const c = impact === 'High' ? '#ff4c5e' : impact === 'Medium' ? '#f5a623' : '#3ddc84'
  return L.divIcon({
    html: `<span style="display:block;width:8px;height:8px;border-radius:50%;background:${c};border:1.5px solid rgba(255,255,255,0.3);box-shadow:0 0 7px ${c}99"></span>`,
    iconSize: [8,8], iconAnchor: [4,4], className:'',
  })
}

function quakeColor(m) {
  if (m >= 7)   return '#ff0040'
  if (m >= 6)   return '#ff4c5e'
  if (m >= 5.5) return '#f5a623'
  return '#f5a62355'
}
function quakeR(m) { return Math.max(5, (m - 4) * 7) }

function RadarLayer({ active }) {
  const map = useMap()
  const ref = useRef(null)
  useEffect(() => {
    if (!active) {
      if (ref.current) { map.removeLayer(ref.current); ref.current = null }
      return
    }
    let cancelled = false
    fetch('https://api.rainviewer.com/public/weather-maps.json')
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        const past = d.radar?.past || []
        if (!past.length) return
        const t = past[past.length - 1].time
        if (ref.current) map.removeLayer(ref.current)
        ref.current = L.tileLayer(
          `${d.host}/v2/radar/${t}/512/{z}/{x}/{y}/4/1_1.png`,
          { opacity: 0.52, zIndex: 5, attribution: 'RainViewer' }
        ).addTo(map)
      }).catch(() => {})
    return () => {
      cancelled = true
      if (ref.current) { map.removeLayer(ref.current); ref.current = null }
    }
  }, [active, map])
  return null
}

const LAYER_CFG = [
  { key:'aircraft',  label:'AIRCRAFT',     color:'var(--cyan)'  },
  { key:'quakes',    label:'EARTHQUAKES',  color:'var(--red)'   },
  { key:'weather',   label:'RADAR',        color:'var(--purple)'},
  { key:'events',    label:'FOREX EVENTS', color:'var(--amber)' },
]

export default function WorldMap() {
  const [layers,  setLayers]  = useState({ aircraft:true, quakes:true, weather:false, events:true })
  const [aircraft,setAircraft]= useState([])
  const [quakes,  setQuakes]  = useState([])
  const [events,  setEvents]  = useState([])
  const [stats,   setStats]   = useState({ planes:0, quakes:0, events:0 })
  const [updated, setUpdated] = useState(null)
  const [loadingAc, setLoadingAc] = useState(false)

  const toggle = k => setLayers(p => ({ ...p, [k]: !p[k] }))

  const loadAircraft = useCallback(async () => {
    setLoadingAc(true)
    try {
      const r = await fetch('http://localhost:8000/api/live/aircraft')
      const d = await r.json()
      const planes = (d.states || [])
        .filter(s => s[5] != null && s[6] != null && !s[8])
        .slice(0, 500)
        .map(s => ({
          id: s[0],
          call: (s[1]||'').trim() || s[0],
          country: s[2],
          lon: s[5], lat: s[6],
          alt: s[7] ? Math.round(s[7] / 0.3048).toLocaleString() : '?',
          spd: s[9] ? Math.round(s[9] * 1.944) : '?',
          hdg: s[10],
        }))
      setAircraft(planes)
      setStats(p => ({ ...p, planes: planes.length }))
      setUpdated(new Date().toLocaleTimeString())
    } catch {}
    finally { setLoadingAc(false) }
  }, [])

  const loadQuakes = useCallback(async () => {
    try {
      const r = await fetch('http://localhost:8000/api/live/earthquakes')
      const d = await r.json()
      const qs = d.features || []
      setQuakes(qs)
      setStats(p => ({ ...p, quakes: qs.length }))
    } catch {}
  }, [])

  const loadEvents = useCallback(async () => {
    try {
      const r = await fetch('http://localhost:8000/api/news/calendar')
      const d = await r.json()
      const evs = (d.events || []).filter(e => CCY_POS[e.country])
      setEvents(evs)
      setStats(p => ({ ...p, events: evs.length }))
    } catch {}
  }, [])

  useEffect(() => {
    loadAircraft(); loadQuakes(); loadEvents()
    const iv = setInterval(loadAircraft, 30000)
    return () => clearInterval(iv)
  }, [loadAircraft, loadQuakes, loadEvents])

  function refresh() { loadAircraft(); loadQuakes(); loadEvents() }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>

      {/* Terminal header */}
      <div className="term-header" style={{ padding:'6px 14px', flexShrink:0, borderRadius:0 }}>
        <span className="live-dot-blink"/>
        <span className="term-header-cyan">LIVE WORLD MAP</span>
        <span style={{ opacity:0.4 }}>·</span>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-muted)' }}>
          OpenSky · USGS · RainViewer · Forex Factory
        </span>
        {updated && <>
          <span style={{ opacity:0.4 }}>·</span>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-muted)' }}>updated {updated}</span>
        </>}
        <div style={{ flex:1 }}/>
        {loadingAc && (
          <span style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--cyan)' }}>⟳ aircraft…</span>
        )}
        <button className="btn-ghost" onClick={refresh} style={{ fontSize:10, padding:'3px 9px' }}>↻ Refresh</button>
      </div>

      {/* Layer toggles */}
      <div style={{
        display:'flex', gap:4, padding:'5px 12px', alignItems:'center',
        background:'var(--bg2)', borderBottom:'1px solid var(--border)', flexShrink:0, flexWrap:'wrap',
      }}>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)', letterSpacing:'0.1em', marginRight:4 }}>LAYERS</span>
        {LAYER_CFG.map(({ key, label, color }) => {
          const on = layers[key]
          const count = key === 'aircraft' ? stats.planes : key === 'quakes' ? stats.quakes : key === 'events' ? stats.events : null
          return (
            <button key={key} onClick={() => toggle(key)} style={{
              fontFamily:'var(--font-mono)', fontSize:8.5, fontWeight:700, letterSpacing:'0.06em',
              padding:'3px 10px', borderRadius:'var(--r-sm)', cursor:'pointer', outline:'none',
              border:`1px solid ${on ? color : 'var(--border-sub)'}`,
              background: on ? `color-mix(in srgb, ${color} 12%, transparent)` : 'transparent',
              color: on ? color : 'var(--text-muted)',
              transition:'var(--t-fast)', display:'flex', alignItems:'center', gap:5,
            }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background: on ? color : 'var(--text-faint)', display:'inline-block', transition:'var(--t-fast)' }}/>
              {label}
              {count != null && on && (
                <span style={{ opacity:0.65, fontSize:8 }}>({count})</span>
              )}
            </button>
          )
        })}
        <div style={{ flex:1 }}/>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-faint)' }}>
          aircraft refresh 30s · data: anonymous free APIs
        </span>
      </div>

      {/* Map container */}
      <div style={{ flex:1, position:'relative', minHeight:'400px' }}>
        <style>{`
          .leaflet-container { background:#080e1a !important; font-family:var(--font-mono) !important; }
          .leaflet-popup-content-wrapper { background:var(--bg3) !important; border:1px solid var(--border-md) !important; color:var(--text) !important; border-radius:var(--r-md) !important; box-shadow:0 8px 32px rgba(0,0,0,0.5) !important; }
          .leaflet-popup-tip { background:var(--bg3) !important; }
          .leaflet-popup-content { margin:10px 14px !important; }
          .leaflet-control-attribution { background:rgba(8,14,26,0.82) !important; color:var(--text-muted) !important; font-size:8px !important; }
          .leaflet-control-zoom a { background:var(--bg3) !important; color:var(--cyan) !important; border-color:var(--border) !important; }
          .leaflet-control-zoom a:hover { background:var(--bg4) !important; }
          .leaflet-bar { border:1px solid var(--border) !important; box-shadow:none !important; }
        `}</style>

        <MapContainer
          center={[25, 10]} zoom={2} minZoom={2} maxZoom={14}
          style={{ width:'100%', height:'calc(100vh - 155px)', minHeight:'400px', background:'#080e1a' }}
          worldCopyJump
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            subdomains="abcd" maxZoom={19}
          />

          <RadarLayer active={layers.weather} />

          {/* Earthquakes */}
          {layers.quakes && quakes.map(q => {
            const [lon, lat] = q.geometry.coordinates
            const mag = q.properties.mag
            if (!lat || !lon) return null
            return (
              <CircleMarker key={q.id} center={[lat, lon]}
                radius={quakeR(mag)} weight={1.5}
                color={quakeColor(mag)} fillColor={quakeColor(mag)} fillOpacity={0.3}
              >
                <Popup>
                  <div>
                    <div style={{ color:quakeColor(mag), fontWeight:700, fontSize:13, marginBottom:4 }}>M {mag?.toFixed(1)}</div>
                    <div style={{ fontSize:11 }}>{q.properties.place}</div>
                    <div style={{ color:'var(--text-muted)', fontSize:9, marginTop:4 }}>
                      {new Date(q.properties.time).toUTCString()}
                    </div>
                    <div style={{ color:'var(--text-muted)', fontSize:9 }}>Depth: {q.geometry.coordinates[2]?.toFixed(1)} km</div>
                    <a href={q.properties.url} target="_blank" rel="noreferrer"
                      style={{ color:'var(--cyan)', fontSize:9, marginTop:5, display:'block' }}>
                      USGS details →
                    </a>
                  </div>
                </Popup>
              </CircleMarker>
            )
          })}

          {/* Forex events */}
          {layers.events && events.map((ev, i) => {
            const pos = CCY_POS[ev.country]
            if (!pos) return null
            return (
              <Marker key={i} position={pos} icon={eventIcon(ev.impact)}>
                <Popup>
                  <div>
                    <div style={{ fontWeight:700, fontSize:12, marginBottom:4 }}>{ev.title}</div>
                    <div style={{ fontSize:10 }}>
                      <span style={{ color: ev.impact === 'High' ? 'var(--red)' : ev.impact === 'Medium' ? 'var(--amber)' : 'var(--green)' }}>
                        {ev.impact} impact
                      </span>
                      {' · '}{ev.country}
                    </div>
                    {ev.actual?.trim() && (
                      <div style={{ color:'var(--green)', fontSize:10, marginTop:4 }}>Actual: {ev.actual}</div>
                    )}
                    {ev.forecast?.trim() && (
                      <div style={{ color:'var(--text-muted)', fontSize:10 }}>Forecast: {ev.forecast}</div>
                    )}
                    {ev.previous?.trim() && (
                      <div style={{ color:'var(--text-muted)', fontSize:10 }}>Previous: {ev.previous}</div>
                    )}
                  </div>
                </Popup>
              </Marker>
            )
          })}

          {/* Aircraft */}
          {layers.aircraft && aircraft.map(ac => (
            <Marker key={ac.id} position={[ac.lat, ac.lon]} icon={planeIcon(ac.hdg)}>
              <Popup>
                <div>
                  <div style={{ color:'var(--cyan)', fontWeight:700, fontSize:13, marginBottom:4 }}>
                    {ac.call}
                  </div>
                  <div style={{ fontSize:10, color:'var(--text-secondary)' }}>{ac.country}</div>
                  <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:4 }}>
                    Alt: {ac.alt} ft
                  </div>
                  <div style={{ fontSize:10, color:'var(--text-muted)' }}>
                    Speed: {ac.spd} kts
                  </div>
                  {ac.hdg != null && (
                    <div style={{ fontSize:10, color:'var(--text-muted)' }}>
                      Heading: {Math.round(ac.hdg)}°
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {/* Legend overlay */}
        <div style={{
          position:'absolute', bottom:24, right:12, zIndex:1000,
          background:'rgba(8,14,26,0.9)', border:'1px solid var(--border)',
          borderRadius:'var(--r-md)', padding:'8px 12px',
          fontFamily:'var(--font-mono)', fontSize:8.5,
        }}>
          {layers.aircraft && (
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
              <span style={{ color:'#00c8f0' }}>◆</span>
              <span style={{ color:'var(--text-muted)' }}>{stats.planes} aircraft · OpenSky</span>
            </div>
          )}
          {layers.quakes && (
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
              <span style={{ color:'var(--red)' }}>●</span>
              <span style={{ color:'var(--text-muted)' }}>{stats.quakes} quakes M4.5+ · USGS 7d</span>
            </div>
          )}
          {layers.weather && (
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
              <span style={{ color:'var(--purple)' }}>▦</span>
              <span style={{ color:'var(--text-muted)' }}>Radar overlay · RainViewer</span>
            </div>
          )}
          {layers.events && (
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ color:'var(--amber)' }}>●</span>
              <span style={{ color:'var(--text-muted)' }}>{stats.events} forex events · Forex Factory</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
