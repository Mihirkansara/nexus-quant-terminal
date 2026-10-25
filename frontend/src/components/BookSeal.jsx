import { useMemo } from 'react'
import { sealGeometry } from '../lib/seal'

const anim = (d) => ({ d: `path("${d}")`, transition: 'd 0.7s cubic-bezier(0.16,1,0.3,1)' })

export default function BookSeal({ greeks, S, T, size = 84, label = 'Book seal' }) {
  const g = useMemo(() => sealGeometry(greeks ?? {}, S, T), [greeks, S, T])
  return (
    <svg width={size} height={size} viewBox="-48 -48 96 96" role="img" aria-label={label}
      fill="none" strokeLinejoin="round" style={{ flexShrink: 0, display: 'block' }}>
      <circle r="46.5" stroke="var(--foil)" strokeWidth="0.6" opacity="0.55" />
      <circle r="38.5" stroke="var(--foil)" strokeWidth="0.35" opacity="0.4" />
      {g.band.map((d, i) => <path key={'b' + i} d={d} style={anim(d)} stroke="var(--foil)" strokeWidth="0.32" opacity={0.55 - i * 0.1} />)}
      {g.strands.map((d, i) => <path key={'s' + i} d={d} style={anim(d)} stroke="var(--foil)" strokeWidth={i ? 0.38 : 0.55} opacity={1 - i * 0.16} />)}
      {g.core.map((d, i) => <path key={'c' + i} d={d} style={anim(d)} stroke="var(--ink)" strokeWidth="0.35" opacity={0.6 - i * 0.2} />)}
      <circle r="3.2" fill="var(--foil)" />
      <circle r="1.2" fill="var(--bg)" />
    </svg>
  )
}

// Static seal used as the NEXUS mark and favicon source.
export function NexusMark({ size = 28 }) {
  const g = useMemo(() => sealGeometry({ delta: 0.25, gamma: 0.02, vega: 0.3, units: 1 }, 1, 0.25), [])
  return (
    <svg width={size} height={size} viewBox="-48 -48 96 96" aria-hidden="true" fill="none" style={{ flexShrink: 0 }}>
      <circle r="46" stroke="var(--foil)" strokeWidth="2.2" />
      {g.strands.slice(0, 2).map((d, i) => <path key={i} d={d} stroke="var(--foil)" strokeWidth={i ? 1.4 : 2} opacity={i ? 0.7 : 1} />)}
      <circle r="6" fill="var(--foil)" />
    </svg>
  )
}

// Large animated seal for the entry surfaces: engraves in on mount, morphs when Greeks change.
export function EngravedSeal({ greeks, size }) {
  const g = useMemo(() => sealGeometry({ ...greeks, units: 1 }, 1, 0.25), [greeks])
  const st = (d) => ({ d: `path("${d}")`, transition: 'd 0.9s cubic-bezier(0.16,1,0.3,1)' })
  return (
    <svg className="lp-seal" width={size} height={size} viewBox="-50 -50 100 100" role="img"
      aria-label={`Guilloche seal engraved from delta ${greeks.delta.toFixed(2)}, gamma ${greeks.gamma.toFixed(3)}, vega ${greeks.vega.toFixed(2)}`} fill="none">
      <circle r="48.5" stroke="var(--foil)" strokeWidth="0.5" opacity="0.6" pathLength="1" className="lp-draw" />
      <circle r="46.8" stroke="var(--foil)" strokeWidth="0.25" opacity="0.5" pathLength="1" className="lp-draw" />
      {g.band.map((d, i) => <path key={'b' + i} d={d} style={st(d)} pathLength="1" className="lp-draw" stroke="var(--foil)" strokeWidth="0.22" opacity={0.6 - i * 0.12} />)}
      {g.strands.map((d, i) => <path key={'s' + i} d={d} style={st(d)} pathLength="1" className="lp-draw" stroke="var(--foil)" strokeWidth={i ? 0.28 : 0.42} opacity={1 - i * 0.15} />)}
      {g.core.map((d, i) => <path key={'c' + i} d={d} style={st(d)} pathLength="1" className="lp-draw" stroke="var(--ink)" strokeWidth="0.25" opacity={0.65 - i * 0.2} />)}
      <circle r="3.4" fill="var(--foil)" />
      <circle r="1.3" fill="var(--bg)" />
    </svg>
  )
}
