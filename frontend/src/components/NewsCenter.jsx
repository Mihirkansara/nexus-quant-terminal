import { useState, useEffect, useRef, useCallback } from 'react'
import { Flame, Sparkles } from 'lucide-react'
import { fetchNewsFeed, fetchHotStory, fetchNewsSignals, fetchBreakingNews } from '../api/client'

const SOURCE_COLORS = {
  'FXStreet': 'var(--cyan)', 'Investing.com': 'var(--amber)',
  'MarketWatch': 'var(--green)', 'CNBC': 'var(--purple)', 'Google News': 'var(--red)',
}

const IMPACT = {
  High:   { cls: 'tbadge-high',   color: 'var(--red)' },
  Medium: { cls: 'tbadge-medium', color: 'var(--amber)' },
  Low:    { cls: 'tbadge-green',  color: 'var(--green)' },
}

const ago = (ts) => {
  const s = Math.max(0, (Date.now() / 1000) - ts)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

const SourceChip = ({ source }) => (
  <span style={{
    fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
    padding: '2px 6px', borderRadius: 3,
    color: SOURCE_COLORS[source] || 'var(--text-muted)',
    background: `color-mix(in srgb, ${SOURCE_COLORS[source] || 'var(--text-muted)'} 10%, transparent)`,
    border: `1px solid color-mix(in srgb, ${SOURCE_COLORS[source] || 'var(--text-muted)'} 25%, transparent)`,
  }}>{source.toUpperCase()}</span>
)

const SentimentChip = ({ ai }) => {
  const bull = ai.sentiment.startsWith('Bullish')
  const bear = ai.sentiment.startsWith('Bearish')
  const color = bull ? 'var(--green)' : bear ? 'var(--red)' : 'var(--text-muted)'
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
      padding: '2px 7px', borderRadius: 3, color,
      background: `color-mix(in srgb, ${color} 10%, transparent)`,
    }}>
      {bull ? '+ ' : bear ? '− ' : ''}{ai.sentiment.toUpperCase()} · {ai.confidence}%
    </span>
  )
}

function StoryRow({ a, onSelect, active }) {
  const imp = IMPACT[a.ai.impact] || IMPACT.Low
  return (
    <div onClick={() => onSelect(a)} style={{
      padding: '10px 12px', cursor: 'pointer',
      borderBottom: '1px solid var(--border)',
      borderLeft: active ? '3px solid var(--cyan)' : '3px solid transparent',
      background: active ? 'color-mix(in srgb, var(--cyan) 5%, transparent)' : 'transparent',
      transition: 'var(--t-fast)',
    }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'color-mix(in srgb, var(--cyan) 3%, transparent)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
        <span className={`tbadge ${imp.cls}`} style={{ fontSize: 10 }}>{a.ai.impact.toUpperCase()}</span>
        <SourceChip source={a.source} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-faint)',
          marginLeft: 'auto' }}>{ago(a.publishedAt)}</span>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', lineHeight: 1.45 }}>
        {a.title}
      </div>
      {a.ai.affectedPairs.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
          {a.ai.affectedPairs.slice(0, 4).map(p => (
            <span key={p} style={{ fontFamily: 'var(--font-mono)', fontSize: 10,
              color: 'var(--cyan)', padding: '1px 5px', borderRadius: 2,
              background: 'color-mix(in srgb, var(--cyan) 7%, transparent)' }}>{p}</span>
          ))}
        </div>
      )}
    </div>
  )
}

function SignalCard({ s }) {
  const buy = s.signal === 'BUY'
  const color = buy ? 'var(--green)' : 'var(--red)'
  return (
    <div className="signal-panel" style={{
      borderLeft:`1px solid ${color}`, padding: '10px 14px', minWidth: 190, flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight:600, color }}>
          {s.signal}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
          color: 'var(--text)' }}>{s.pair}</span>
        <span className={`tbadge ${s.strength === 'Strong' ? 'tbadge-high' : 'tbadge-medium'}`}
          style={{ marginLeft: 'auto', fontSize: 10 }}>{s.strength.toUpperCase()}</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: 6 }}>
        {s.reason}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontFamily: 'var(--font-mono)', fontSize: 10 }}>
        <span style={{ color: 'var(--text-faint)' }}>{s.source} · {ago(s.publishedAt)}</span>
        <span style={{ color, fontWeight: 700 }}>CONF {s.confidence}%</span>
      </div>
    </div>
  )
}

export default function NewsCenter() {
  const [articles, setArticles] = useState([])
  const [total, setTotal] = useState(0)
  const [hot, setHot] = useState(null)
  const [selected, setSelected] = useState(null)
  const [signals, setSignals] = useState([])
  const [breaking, setBreaking] = useState([])
  const [limit, setLimit] = useState(30)
  const [loading, setLoading] = useState(true)
  const listRef = useRef(null)

  const load = useCallback(async (lim) => {
    try {
      const [feed, hotRes, sigRes, brkRes] = await Promise.all([
        fetchNewsFeed(lim, 0), fetchHotStory(), fetchNewsSignals(), fetchBreakingNews(),
      ])
      setArticles(feed.articles)
      setTotal(feed.total)
      setHot(hotRes.story)
      setSignals(sigRes.signals)
      setBreaking(brkRes.breaking)
    } catch { /* keep previous data on transient failures */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load(limit)
    const t = setInterval(() => load(limit), 10000)   // auto-refresh every 10s
    return () => clearInterval(t)
  }, [load, limit])

  // Infinite scroll on the left panel
  const onScroll = () => {
    const el = listRef.current
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 80
      && articles.length < total) {
      setLimit(l => Math.min(l + 20, 100))
    }
  }

  const story = selected || hot

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
      height: '100%', boxSizing: 'border-box' }}>

      {/* Breaking news banner */}
      {breaking.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px',
          borderRadius: 'var(--r-sm)',
          background: 'color-mix(in srgb, var(--red) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--red) 35%, transparent)',
          animation: 'desk-in 0.3s var(--ease-out) both',
        }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight:600,
            letterSpacing: '0.15em', color: 'var(--red)', flexShrink: 0,
            }}>BREAKING</span>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {breaking[0].title}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="term-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div className="live-dot" />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
          letterSpacing: '0.1em', color: 'var(--text)' }}>
          NEWS CENTER · {total} STORIES · AI ANALYSIS · AUTO-REFRESH 10S
        </span>
      </div>

      {/* Signal cards strip */}
      {signals.length > 0 && (
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}
          className="term-scroll">
          {signals.map((s, i) => <SignalCard key={i} s={s} />)}
        </div>
      )}

      {loading && (
        <div>{[...Array(4)].map((_, i) =>
          <div key={i} className="skeleton" style={{ height: 56, marginBottom: 8, borderRadius: 8 }} />)}
        </div>
      )}

      {!loading && (
        <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0,
          flexWrap: 'wrap' }}>

          {/* LEFT: Latest stories */}
          <div style={{ flex: '1 1 340px', minWidth: 300, display: 'flex',
            flexDirection: 'column', background: 'var(--bg2)',
            border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
            overflow: 'hidden', maxHeight: 640 }}>
            <div style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)',
              fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.12em', color: 'var(--text-muted)', background: 'var(--bg3)' }}>
              LATEST STORIES
            </div>
            <div ref={listRef} onScroll={onScroll} className="term-scroll"
              style={{ overflowY: 'auto', flex: 1 }}>
              {articles.map(a => (
                <StoryRow key={a.id} a={a} onSelect={setSelected}
                  active={story && story.id === a.id} />
              ))}
              {articles.length < total && (
                <div style={{ padding: 12, textAlign: 'center', fontSize: 11,
                  fontFamily: 'var(--font-mono)', color: 'var(--text-faint)' }}>
                  scroll for more…
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Hot story */}
          <div style={{ flex: '1.4 1 420px', minWidth: 320, display: 'flex',
            flexDirection: 'column', background: 'var(--bg2)',
            border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
            overflow: 'hidden', maxHeight: 640 }}>
            <div style={{ padding: '9px 12px', borderBottom: '1px solid var(--border)',
              fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.12em', color: 'var(--amber)', background: 'var(--bg3)' }}>
              <Flame size={13} aria-hidden="true" style={{ verticalAlign:'-2px', marginRight:6 }} />HOT STORY
            </div>

            {!story && (
              <div style={{ padding: 24, fontSize: 12, color: 'var(--text-muted)' }}>
                No stories loaded yet.
              </div>
            )}

            {story && (
              <div className="term-scroll" style={{ overflowY: 'auto', flex: 1 }}>
                {/* Image */}
                {story.image ? (
                  <img src={story.image} alt="" loading="lazy"
                    style={{ width: '100%', height: 220, objectFit: 'cover', display: 'block' }}
                    onError={e => { e.currentTarget.style.display = 'none' }} />
                ) : (
                  <div style={{ width: '100%', height: 120,
                    background: 'linear-gradient(135deg, color-mix(in srgb, var(--cyan) 12%, var(--bg3)), color-mix(in srgb, var(--purple) 12%, var(--bg3)))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.2em',
                    color: 'var(--text-muted)' }}>
                    NEXUS NEWS
                  </div>
                )}

                <div style={{ padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8,
                    marginBottom: 10, flexWrap: 'wrap' }}>
                    <span className={`tbadge ${(IMPACT[story.ai.impact] || IMPACT.Low).cls}`}>
                      {story.ai.impact.toUpperCase()} IMPACT
                    </span>
                    <SourceChip source={story.source} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5,
                      color: 'var(--text-faint)' }}>{ago(story.publishedAt)}</span>
                  </div>

                  <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)',
                    lineHeight: 1.4, margin: '0 0 10px' }}>{story.title}</h2>

                  {story.summary && (
                    <p style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.65,
                      margin: '0 0 14px' }}>{story.summary}</p>
                  )}

                  {/* AI Analysis panel */}
                  <div className="signal-panel" style={{ borderLeft:'1px solid var(--purple)',
                    padding: '12px 14px', marginBottom: 14 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700,
                      letterSpacing: '0.12em', color: 'var(--purple)', marginBottom: 8 }}>
                      <Sparkles size={13} aria-hidden="true" style={{ verticalAlign:'-2px', marginRight:6 }} />AI ANALYSIS
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                      <SentimentChip ai={story.ai} />
                      {story.ai.affectedPairs.map(p => (
                        <span key={p} style={{ fontFamily: 'var(--font-mono)', fontSize: 10,
                          color: 'var(--cyan)', padding: '2px 7px', borderRadius: 3,
                          background: 'color-mix(in srgb, var(--cyan) 8%, transparent)',
                          border: '1px solid color-mix(in srgb, var(--cyan) 20%, transparent)' }}>
                          {p}
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5,
                      fontFamily: 'var(--font-mono)' }}>
                      {story.ai.tradingBias}
                    </div>
                  </div>

                  {story.url && (
                    <a href={story.url} target="_blank" rel="noopener noreferrer"
                      className="btn-ghost" style={{ fontSize: 11.5, display: 'inline-flex',
                        alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                      READ FULL STORY ↗
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
