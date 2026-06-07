/* NEXUS — animated orbital logo. Three rings, three colors, three speeds. */

const LOGO_CSS = `
@keyframes nx-o1 { from{transform:rotate(0deg)}   to{transform:rotate(360deg)}  }
@keyframes nx-o2 { from{transform:rotate(60deg)}  to{transform:rotate(420deg)}  }
@keyframes nx-o3 { from{transform:rotate(-60deg)} to{transform:rotate(-420deg)} }
@keyframes nx-core-pulse { 0%,100%{opacity:0.9} 50%{opacity:0.45} }
@keyframes nx-outer-spin { from{transform:rotate(0deg)} to{transform:rotate(-360deg)} }
@keyframes nx-flicker {
  0%,89%,91%,93%,100%{ opacity:1 }
  90%{ opacity:0.6 }
  92%{ opacity:0.85 }
}
@keyframes nx-scan {
  0%   { background-position: 0 -200%; }
  100% { background-position: 0 400%;  }
}
@keyframes nx-letter {
  0%,100%{ text-shadow:0 0 8px var(--cyan),0 0 20px var(--cyan) }
  50%    { text-shadow:0 0 2px var(--cyan),0 0 6px var(--cyan)  }
}
`

let cssInjected = false
function injectCSS() {
  if (cssInjected) return
  const el = document.createElement('style')
  el.textContent = LOGO_CSS
  document.head.appendChild(el)
  cssInjected = true
}

/* ─── Small icon (navbar) ─────────────────────────── */
export function NexusIcon({ size = 36 }) {
  injectCSS()
  return (
    <svg viewBox="0 0 44 44" width={size} height={size}
      style={{ overflow:'visible', display:'block', flexShrink:0 }}>
      <defs>
        <filter id="nx-g1" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="1.2" in="SourceGraphic" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="nx-g2" x="-150%" y="-150%" width="400%" height="400%">
          <feGaussianBlur stdDeviation="3.5" in="SourceGraphic" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* Orbit 1 — cyan — 7s CW */}
      <g style={{ transformOrigin:'22px 22px', animation:'nx-o1 7s linear infinite' }}>
        <ellipse cx="22" cy="22" rx="20" ry="5.5"
          fill="none" stroke="#00c8f0" strokeWidth="0.75" opacity="0.55"/>
        <circle cx="42" cy="22" r="2.4" fill="#00c8f0" filter="url(#nx-g1)"/>
      </g>

      {/* Orbit 2 — purple — 11s CW offset */}
      <g style={{ transformOrigin:'22px 22px', animation:'nx-o2 11s linear infinite' }}>
        <ellipse cx="22" cy="22" rx="20" ry="5.5"
          fill="none" stroke="#8b5cf6" strokeWidth="0.75" opacity="0.5"/>
        <circle cx="42" cy="22" r="2" fill="#8b5cf6" filter="url(#nx-g1)"/>
      </g>

      {/* Orbit 3 — green — 5s CCW */}
      <g style={{ transformOrigin:'22px 22px', animation:'nx-o3 5s linear infinite' }}>
        <ellipse cx="22" cy="22" rx="20" ry="5.5"
          fill="none" stroke="#3ddc84" strokeWidth="0.75" opacity="0.4"/>
        <circle cx="42" cy="22" r="1.8" fill="#3ddc84" filter="url(#nx-g1)"/>
      </g>

      {/* Core glow halo */}
      <circle cx="22" cy="22" r="6" fill="rgba(0,200,240,0.12)"
        filter="url(#nx-g2)"
        style={{ animation:'nx-core-pulse 1.8s ease-in-out infinite' }}/>
      {/* Core */}
      <circle cx="22" cy="22" r="3.2" fill="#00c8f0" filter="url(#nx-g1)" opacity="0.9"/>
      <circle cx="22" cy="22" r="1.3" fill="white"/>
    </svg>
  )
}

/* ─── Large logo (landing page) ───────────────────── */
export function NexusLogoLarge({ size = 90 }) {
  injectCSS()
  const s = size / 44
  return (
    <svg viewBox="0 0 44 44" width={size} height={size}
      style={{ overflow:'visible', display:'block', flexShrink:0 }}>
      <defs>
        <filter id="nxl-g1" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="0.8" in="SourceGraphic" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="nxl-g2" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="4" in="SourceGraphic" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="nxl-g3" x="-300%" y="-300%" width="700%" height="700%">
          <feGaussianBlur stdDeviation="6" in="SourceGraphic" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* Outer decorative tick ring */}
      <g style={{ transformOrigin:'22px 22px', animation:'nx-outer-spin 40s linear infinite' }}>
        {Array.from({length:24}, (_,i) => {
          const a = (i * 15) * Math.PI / 180
          const r1 = 21, r2 = i%4===0 ? 21.8 : i%2===0 ? 21.5 : 21.2
          return (
            <line key={i}
              x1={22 + r1*Math.cos(a)} y1={22 + r1*Math.sin(a)}
              x2={22 + r2*Math.cos(a)} y2={22 + r2*Math.sin(a)}
              stroke="#00c8f0" strokeWidth={i%4===0?0.8:0.4} opacity={i%4===0?0.7:0.35}
            />
          )
        })}
        <circle cx="22" cy="22" r="21.2" fill="none" stroke="#00c8f0" strokeWidth="0.3" opacity="0.25"/>
      </g>

      {/* Orbit 1 — cyan — 7s */}
      <g style={{ transformOrigin:'22px 22px', animation:'nx-o1 7s linear infinite' }}>
        <ellipse cx="22" cy="22" rx="19.5" ry="5.5"
          fill="none" stroke="#00c8f0" strokeWidth="0.8" opacity="0.6"/>
        <circle cx="41.5" cy="22" r="2.5" fill="#00c8f0" filter="url(#nxl-g1)"/>
        <circle cx="41.5" cy="22" r="1" fill="white" opacity="0.8"/>
      </g>

      {/* Orbit 2 — purple — 11s */}
      <g style={{ transformOrigin:'22px 22px', animation:'nx-o2 11s linear infinite' }}>
        <ellipse cx="22" cy="22" rx="19.5" ry="5.5"
          fill="none" stroke="#8b5cf6" strokeWidth="0.8" opacity="0.55"/>
        <circle cx="41.5" cy="22" r="2.2" fill="#8b5cf6" filter="url(#nxl-g1)"/>
        <circle cx="41.5" cy="22" r="0.9" fill="white" opacity="0.7"/>
      </g>

      {/* Orbit 3 — green — 5s CCW */}
      <g style={{ transformOrigin:'22px 22px', animation:'nx-o3 5s linear infinite' }}>
        <ellipse cx="22" cy="22" rx="19.5" ry="5.5"
          fill="none" stroke="#3ddc84" strokeWidth="0.8" opacity="0.45"/>
        <circle cx="41.5" cy="22" r="2" fill="#3ddc84" filter="url(#nxl-g1)"/>
        <circle cx="41.5" cy="22" r="0.8" fill="white" opacity="0.6"/>
      </g>

      {/* Core outer glow */}
      <circle cx="22" cy="22" r="8" fill="rgba(0,200,240,0.08)" filter="url(#nxl-g3)"
        style={{ animation:'nx-core-pulse 2s ease-in-out infinite' }}/>
      <circle cx="22" cy="22" r="5.5" fill="rgba(0,200,240,0.18)" filter="url(#nxl-g2)"
        style={{ animation:'nx-core-pulse 2s ease-in-out 0.3s infinite' }}/>
      {/* Core body */}
      <circle cx="22" cy="22" r="3.5" fill="#00c8f0" filter="url(#nxl-g1)" opacity="0.92"/>
      <circle cx="22" cy="22" r="1.5" fill="white"/>
    </svg>
  )
}

/* ─── Full wordmark (icon + NEXUS text) ───────────── */
export function NexusWordmark({ iconSize = 36, textSize = 16 }) {
  injectCSS()
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
      <NexusIcon size={iconSize} />
      <div>
        <div style={{
          fontFamily:'var(--font-mono)', fontSize:textSize, fontWeight:800,
          letterSpacing:'0.18em', color:'var(--cyan)',
          textTransform:'uppercase', lineHeight:1,
          textShadow:'0 0 20px rgba(0,200,240,0.5)',
          style:'animation:nx-flicker 8s ease-in-out infinite',
        }}>
          NEXUS
        </div>
        <div style={{
          fontFamily:'var(--font-mono)', fontSize:textSize * 0.52,
          fontWeight:500, letterSpacing:'0.25em',
          color:'var(--text-muted)', textTransform:'uppercase',
          lineHeight:1.4, marginTop:1,
        }}>
          TERMINAL
        </div>
      </div>
    </div>
  )
}
