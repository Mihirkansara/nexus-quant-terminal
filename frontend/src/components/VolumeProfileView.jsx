import { useState, useEffect, useRef, useCallback } from 'react'
import { TriangleAlert } from 'lucide-react'
import { usePortfolioStore } from '../store/portfolio'
import { fetchVolumeProfile, fetchVolumePairs } from '../api/client'

const PROFILE_TYPES = [
  { id: 'session', label: 'SESSION', refresh: 15000 },
  { id: 'daily',   label: 'DAILY',   refresh: 60000 },
  { id: 'weekly',  label: 'WEEKLY',  refresh: 300000 },
]

const fmt = (n) => n == null ? '—'
  : Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(2) + 'M'
  : Math.abs(n) >= 1e3 ? (n / 1e3).toFixed(1) + 'K'
  : Number(n).toFixed(Math.abs(n) < 10 ? 2 : 0)

const Metric = ({ label, value, color }) => (
  <div style={{
    background: 'var(--bg2)', borderRadius: 'var(--r-sm)',
    border: '1px solid var(--border)', padding: '8px 12px',
    borderLeft:`1px solid ${color || 'var(--cyan)'}`, minWidth: 96,
  }}>
    <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em',
      fontFamily: 'var(--font-mono)', marginBottom: 3 }}>{label}</div>
    <div style={{ fontSize: 14, fontWeight: 700, color: color || 'var(--text)',
      fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
  </div>
)

export default function VolumeProfileView() {
  const { pair: storePair } = usePortfolioStore()
  const [pair, setPair] = useState(storePair || 'EURUSD')
  const [pairs, setPairs] = useState([])
  const [profileType, setProfileType] = useState('session')
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(true)
  const timerRef = useRef(null)

  useEffect(() => { fetchVolumePairs().then(setPairs).catch(() => {}) }, [])
  useEffect(() => { if (storePair) setPair(storePair) }, [storePair])

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const d = await fetchVolumeProfile(pair, profileType)
      setData(d)
      setErr(null)
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Volume data unavailable')
    } finally {
      setLoading(false)
    }
  }, [pair, profileType])

  useEffect(() => {
    load()
    const interval = PROFILE_TYPES.find(p => p.id === profileType)?.refresh || 15000
    timerRef.current = setInterval(() => load(true), interval)
    return () => clearInterval(timerRef.current)
  }, [load, profileType])

  const maxVol = data ? Math.max(...data.buckets.map(b => b.vol), 1) : 1
  const buckets = data ? [...data.buckets].reverse() : []   // high price on top
  const deltaPos = data && data.delta_volume >= 0

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Terminal header */}
      <div className="term-header" style={{ display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="live-dot" />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.1em', color: 'var(--text)' }}>
            VOLUME PROFILE · {pair} · {data?.volume_kind === 'tick' ? 'TICK VOLUME' : 'EXCHANGE VOLUME'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select className="input-field" value={pair}
            style={{ width: 100, fontSize: 11, fontWeight: 600, padding: '4px 8px' }}
            onChange={e => setPair(e.target.value)}>
            {(pairs.length ? pairs : [pair]).map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 2 }}>
            {PROFILE_TYPES.map(pt => (
              <button key={pt.id} className="btn-ghost" onClick={() => setProfileType(pt.id)}
                style={{
                  fontSize: 10.5, padding: '4px 10px', letterSpacing: '0.08em',
                  background: profileType === pt.id
                    ? 'color-mix(in srgb, var(--cyan) 12%, transparent)' : 'transparent',
                  color: profileType === pt.id ? 'var(--cyan)' : 'var(--text-muted)',
                  border: profileType === pt.id
                    ? '1px solid color-mix(in srgb, var(--cyan) 30%, transparent)'
                    : '1px solid transparent',
                }}>{pt.label}</button>
            ))}
          </div>
        </div>
      </div>

      {err && (
        <div style={{ padding: 12, borderRadius: 'var(--r-sm)', fontSize: 12,
          background: 'color-mix(in srgb, var(--red) 8%, transparent)',
          border: '1px solid color-mix(in srgb, var(--red) 25%, transparent)',
          color: 'var(--red)', fontFamily: 'var(--font-mono)' }}>
          <TriangleAlert size={14} aria-hidden="true" style={{ verticalAlign:'-2px', marginRight:6 }} />{err}
        </div>
      )}

      {loading && !data && (
        <div>{[...Array(5)].map((_, i) =>
          <div key={i} className="skeleton" style={{ height: 40, marginBottom: 8, borderRadius: 8 }} />)}
        </div>
      )}

      {data && (
        <>
          {/* Metrics strip */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Metric label="POC"          value={data.poc}                      color="var(--amber)" />
            <Metric label="VAH"          value={data.vah}                      color="var(--cyan)" />
            <Metric label="VAL"          value={data.val}                      color="var(--cyan)" />
            <Metric label="LAST"         value={data.last_price}               color="var(--text)" />
            <Metric label="SESSION VOL"  value={fmt(data.session_volume)}      color="var(--purple)" />
            <Metric label="BUY VOL"      value={fmt(data.buy_volume)}          color="var(--green)" />
            <Metric label="SELL VOL"     value={fmt(data.sell_volume)}         color="var(--red)" />
            <Metric label="DELTA"
              value={(deltaPos ? '+' : '') + fmt(data.delta_volume)}
              color={deltaPos ? 'var(--green)' : 'var(--red)'} />
          </div>

          {/* Aggressive buyers vs sellers gauge */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm)', padding: '10px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between',
              fontFamily: 'var(--font-mono)', fontSize: 11, marginBottom: 6 }}>
              <span style={{ color: 'var(--green)' }}>AGGRESSIVE BUYERS {data.aggressive_buy_pct}%</span>
              <span style={{ color: 'var(--red)' }}>{(100 - data.aggressive_buy_pct).toFixed(1)}% AGGRESSIVE SELLERS</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, overflow: 'hidden', display: 'flex',
              background: 'var(--bg3)' }}>
              <div style={{ width: `${data.aggressive_buy_pct}%`,
                background: 'linear-gradient(90deg, var(--green), color-mix(in srgb, var(--green) 60%, transparent))',
                transition: 'width 0.6s ease' }} />
              <div style={{ flex: 1, background:
                'linear-gradient(90deg, color-mix(in srgb, var(--red) 60%, transparent), var(--red))' }} />
            </div>
          </div>

          {/* Profile bars */}
          <div className="signal-panel" style={{ borderLeft:'1px solid var(--cyan)',
            padding: '14px 16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {buckets.map((b) => {
                const isLast = data.last_price >= b.price - (buckets[0]?.price - buckets[1]?.price || 0) / 2
                  && data.last_price < b.price + (buckets[0]?.price - buckets[1]?.price || 0) / 2
                const isHVN = data.hvn.includes(b.price)
                const isLVN = data.lvn.includes(b.price)
                return (
                  <div key={b.price} style={{ display: 'flex', alignItems: 'center', gap: 8,
                    height: 11, fontFamily: 'var(--font-mono)' }}>
                    {/* Price label */}
                    <div style={{
                      width: 74, textAlign: 'right', fontSize: 10,
                      fontVariantNumeric: 'tabular-nums',
                      color: b.is_poc ? 'var(--amber)' : isLast ? 'var(--text)' : 'var(--text-muted)',
                      fontWeight: b.is_poc || isLast ? 700 : 400,
                    }}>{b.price}</div>

                    {/* Bar track */}
                    <div style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'center',
                      background: b.in_va ? 'color-mix(in srgb, var(--cyan) 4%, transparent)' : 'transparent',
                      borderLeft: b.is_poc
                        ? '2px solid var(--amber)'
                        : '2px solid transparent',
                      position: 'relative' }}>
                      <div style={{ display: 'flex', height: 7,
                        width: `${(b.vol / maxVol) * 100}%`,
                        minWidth: b.vol > 0 ? 2 : 0,
                        borderRadius: 1, overflow: 'hidden',
                        boxShadow: b.is_poc ? '0 0 8px color-mix(in srgb, var(--amber) 50%, transparent)' : 'none',
                      }}>
                        <div style={{ width: `${b.vol > 0 ? (b.buy / b.vol) * 100 : 0}%`,
                          background: b.is_poc ? 'var(--amber)' : 'var(--green)', opacity: 0.85 }} />
                        <div style={{ flex: 1,
                          background: b.is_poc ? 'color-mix(in srgb, var(--amber) 70%, transparent)' : 'var(--red)',
                          opacity: 0.7 }} />
                      </div>
                      {(isHVN || isLVN) && (
                        <span style={{ fontSize: 10, marginLeft: 6, letterSpacing: '0.08em',
                          color: isHVN ? 'var(--purple)' : 'var(--text-faint)' }}>
                          {isHVN ? 'HVN' : 'LVN'}
                        </span>
                      )}
                      {isLast && (
                        <div style={{ position: 'absolute', left: 0, right: 0, top: '50%',
                          borderTop: '1px dashed color-mix(in srgb, var(--text) 50%, transparent)' }} />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 16, marginTop: 12, paddingTop: 10,
              borderTop: '1px solid var(--border)', fontFamily: 'var(--font-mono)',
              fontSize: 10, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
              <span><span style={{ color: 'var(--green)' }}>■</span> Buy</span>
              <span><span style={{ color: 'var(--red)' }}>■</span> Sell</span>
              <span><span style={{ color: 'var(--amber)' }}>■</span> POC</span>
              <span><span style={{ color: 'var(--cyan)' }}>▒</span> Value Area 70%</span>
              <span><span style={{ color: 'var(--purple)' }}>HVN</span> High Vol Node</span>
              <span>LVN Low Vol Node</span>
              <span style={{ marginLeft: 'auto' }}>
                {data.bars} bars · {data.interval} · auto-refresh {PROFILE_TYPES.find(p => p.id === profileType).refresh / 1000}s
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
