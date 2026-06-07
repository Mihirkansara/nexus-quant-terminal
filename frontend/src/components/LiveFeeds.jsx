import { useState, useEffect, useCallback } from 'react'

const CITIES = [
  { name:'New York',   sub:'NYSE · Wall St',         lat:40.71, lon:-74.00 },
  { name:'London',     sub:'LSE · Canary Wharf',     lat:51.51, lon:-0.09  },
  { name:'Tokyo',      sub:'TSE · Marunouchi',       lat:35.68, lon:139.76 },
  { name:'Frankfurt',  sub:'XETRA · ECB',            lat:50.11, lon:8.68   },
  { name:'Singapore',  sub:'SGX · Marina Bay',       lat:1.28,  lon:103.85 },
  { name:'Dubai',      sub:'DFM · DIFC',             lat:25.21, lon:55.28  },
]

function windyUrl(lat, lon) {
  return `https://embed.windy.com/embed2.html?type=map&location=coordinates&zoom=12&overlay=webcams&product=ecmwf&level=surface&lat=${lat}&lon=${lon}&menu=&message=&marker=&pressure=&metricWind=kt&metricTemp=%C2%B0C&radarRange=-1`
}

function CryptoCard({ coin }) {
  const up = coin.price_change_percentage_24h >= 0
  const color = up ? 'var(--green)' : 'var(--red)'
  const fmt = (n, d=2) => n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: d })

  return (
    <div style={{
      background:'var(--surface)', border:'1px solid var(--border)',
      borderLeft:`3px solid ${color}`,
      borderRadius:'var(--r-md)', padding:'10px 14px',
      display:'flex', flexDirection:'column', gap:6,
      transition:'var(--t-fast)',
      cursor:'default',
    }}
      onMouseEnter={e => e.currentTarget.style.background='var(--surface-2)'}
      onMouseLeave={e => e.currentTarget.style.background='var(--surface)'}
    >
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:7 }}>
          <img src={coin.image} alt={coin.symbol} width={20} height={20} style={{ borderRadius:'50%' }}/>
          <div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:10, fontWeight:700, color:'var(--text)', textTransform:'uppercase' }}>
              {coin.symbol}
            </div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)' }}>{coin.name}</div>
          </div>
        </div>
        <span style={{
          fontFamily:'var(--font-mono)', fontSize:8, fontWeight:700, padding:'1px 6px',
          borderRadius:3, color, background:`color-mix(in srgb, ${color} 12%, transparent)`,
        }}>
          {up ? '▲' : '▼'} {Math.abs(coin.price_change_percentage_24h).toFixed(2)}%
        </span>
      </div>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:16, fontWeight:800, color:'var(--text)', fontVariantNumeric:'tabular-nums' }}>
        ${fmt(coin.current_price)}
      </div>
      <div style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)', display:'flex', gap:10 }}>
        <span>MCap ${coin.market_cap > 1e9 ? (coin.market_cap/1e9).toFixed(1)+'B' : (coin.market_cap/1e6).toFixed(0)+'M'}</span>
        <span>Vol ${coin.total_volume > 1e9 ? (coin.total_volume/1e9).toFixed(1)+'B' : (coin.total_volume/1e6).toFixed(0)+'M'}</span>
      </div>
    </div>
  )
}

export default function LiveFeeds() {
  const [crypto,    setCrypto]    = useState([])
  const [cryptoErr, setCryptoErr] = useState(null)
  const [loadCrypto, setLoadCrypto] = useState(false)
  const [activeCity, setActiveCity] = useState(0)
  const [lastCrypto, setLastCrypto] = useState(null)

  const fetchCrypto = useCallback(async () => {
    setLoadCrypto(true); setCryptoErr(null)
    try {
      const r = await fetch(
        'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=12&page=1&sparkline=false&price_change_percentage=24h'
      )
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      setCrypto(d)
      setLastCrypto(new Date().toLocaleTimeString())
    } catch (e) {
      setCryptoErr('CoinGecko rate limited — retrying in 60s')
    } finally { setLoadCrypto(false) }
  }, [])

  useEffect(() => {
    fetchCrypto()
    const iv = setInterval(fetchCrypto, 60000)
    return () => clearInterval(iv)
  }, [fetchCrypto])

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflowY:'auto' }} className="term-scroll">

      {/* ── Crypto section ───────────────── */}
      <div className="term-header" style={{ padding:'6px 14px', borderRadius:0, flexShrink:0 }}>
        <span className="live-dot-blink"/>
        <span className="term-header-cyan">CRYPTO MARKETS</span>
        <span style={{ opacity:0.4 }}>·</span>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-muted)' }}>CoinGecko · top 12 by market cap</span>
        {lastCrypto && <>
          <span style={{ opacity:0.4 }}>·</span>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-muted)' }}>{lastCrypto}</span>
        </>}
        <div style={{ flex:1 }}/>
        {loadCrypto && <span style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--cyan)' }}>⟳ loading…</span>}
        <button className="btn-ghost" onClick={fetchCrypto} style={{ fontSize:10, padding:'3px 9px' }}>↻</button>
      </div>

      <div style={{ padding:'10px 14px', background:'var(--bg)', borderBottom:'1px solid var(--border)' }}>
        {cryptoErr ? (
          <div style={{
            padding:'10px 14px', borderRadius:'var(--r-md)',
            background:'var(--amber-bg)', border:'1px solid var(--amber)',
            fontFamily:'var(--font-mono)', fontSize:10, color:'var(--amber)',
            display:'flex', alignItems:'center', justifyContent:'space-between',
          }}>
            {cryptoErr}
            <button className="btn-ghost" onClick={fetchCrypto} style={{ fontSize:9 }}>Retry</button>
          </div>
        ) : crypto.length === 0 ? (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:8 }}>
            {[...Array(12)].map((_,i) => (
              <div key={i} className="skeleton" style={{ height:90, borderRadius:'var(--r-md)' }}/>
            ))}
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:8 }}>
            {crypto.map(c => <CryptoCard key={c.id} coin={c}/>)}
          </div>
        )}
      </div>

      {/* ── Live Webcams section ──────────── */}
      <div className="term-header" style={{ padding:'6px 14px', borderRadius:0, flexShrink:0 }}>
        <span className="live-dot-blink"/>
        <span className="term-header-cyan">LIVE GLOBAL CAMERAS</span>
        <span style={{ opacity:0.4 }}>·</span>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-muted)' }}>
          Windy.com · click camera pins on map for live feeds
        </span>
        <div style={{ flex:1 }}/>
      </div>

      {/* City tabs */}
      <div style={{
        display:'flex', gap:3, padding:'6px 12px',
        background:'var(--bg2)', borderBottom:'1px solid var(--border)',
        overflowX:'auto', flexShrink:0,
      }}>
        {CITIES.map((c, i) => {
          const active = activeCity === i
          return (
            <button key={i} onClick={() => setActiveCity(i)} style={{
              fontFamily:'var(--font-mono)', fontSize:9, fontWeight:700, letterSpacing:'0.06em',
              padding:'4px 12px', borderRadius:'var(--r-sm)', cursor:'pointer', outline:'none',
              whiteSpace:'nowrap',
              border: active ? '1px solid color-mix(in srgb, var(--cyan) 30%, transparent)' : '1px solid var(--border-sub)',
              background: active ? 'color-mix(in srgb, var(--cyan) 10%, transparent)' : 'transparent',
              color: active ? 'var(--cyan)' : 'var(--text-muted)',
              transition:'var(--t-fast)',
            }}>
              {c.name}
            </button>
          )
        })}
      </div>

      {/* Active city info bar */}
      <div style={{
        padding:'5px 14px', background:'var(--surface)',
        borderBottom:'1px solid var(--border)', flexShrink:0,
        display:'flex', alignItems:'center', gap:12,
      }}>
        <div>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:11, fontWeight:700, color:'var(--text)' }}>
            {CITIES[activeCity].name}
          </span>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:9, color:'var(--text-muted)', marginLeft:8 }}>
            {CITIES[activeCity].sub}
          </span>
        </div>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-faint)' }}>
          {CITIES[activeCity].lat.toFixed(2)}°N, {CITIES[activeCity].lon.toFixed(2)}°E
        </span>
        <div style={{ flex:1 }}/>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-muted)' }}>
          Click camera pins on the map to open live feeds
        </span>
      </div>

      {/* Windy webcam embed */}
      <div style={{ flex:1, minHeight:480, position:'relative' }}>
        <iframe
          key={activeCity}
          src={windyUrl(CITIES[activeCity].lat, CITIES[activeCity].lon)}
          style={{ width:'100%', height:'100%', minHeight:480, border:'none', display:'block' }}
          title={`${CITIES[activeCity].name} webcams`}
          loading="lazy"
          allow="geolocation"
        />
      </div>

      {/* Quick city grid for fast switching */}
      <div style={{
        display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:0,
        borderTop:'1px solid var(--border)', flexShrink:0,
      }}>
        {CITIES.map((c, i) => {
          const active = activeCity === i
          return (
            <button key={i} onClick={() => setActiveCity(i)} style={{
              padding:'8px 6px', cursor:'pointer', outline:'none',
              borderRight: i < 5 ? '1px solid var(--border)' : 'none',
              background: active ? 'color-mix(in srgb, var(--cyan) 8%, transparent)' : 'var(--bg2)',
              border:'none', borderRight: i < 5 ? '1px solid var(--border)' : 'none',
              textAlign:'center', transition:'var(--t-fast)',
            }}
              onMouseEnter={e => !active && (e.currentTarget.style.background='var(--bg3)')}
              onMouseLeave={e => !active && (e.currentTarget.style.background='var(--bg2)')}
            >
              <div style={{ fontFamily:'var(--font-mono)', fontSize:9, fontWeight:700, color: active ? 'var(--cyan)' : 'var(--text-secondary)' }}>
                {c.name}
              </div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:7.5, color:'var(--text-muted)', marginTop:2 }}>
                {c.sub.split(' · ')[0]}
              </div>
            </button>
          )
        })}
      </div>

      {/* Attribution footer */}
      <div style={{
        padding:'4px 14px', borderTop:'1px solid var(--border)',
        background:'var(--bg2)', display:'flex', gap:12, flexShrink:0,
      }}>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-ghost)' }}>
          Crypto: CoinGecko free API · 60s refresh · no API key required
        </span>
        <span style={{ fontFamily:'var(--font-mono)', fontSize:8, color:'var(--text-ghost)' }}>
          Webcams: Windy.com · click camera pins for live streams
        </span>
      </div>
    </div>
  )
}
