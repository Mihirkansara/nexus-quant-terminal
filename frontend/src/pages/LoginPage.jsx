import { useState, useEffect, useRef } from 'react'
import { NexusIcon } from '../components/NexusLogo'

const USER = 'mihir.kansara'
const PASS = 'nexus@2026'

const PAIRS = [
  { pair:'EUR/USD', price:'1.08542', chg:'+0.23%', up:true,  spark:[40,38,42,39,44,41,46,43,45,48] },
  { pair:'GBP/USD', price:'1.26381', chg:'-0.14%', up:false, spark:[55,52,54,50,53,49,51,48,50,47] },
  { pair:'USD/JPY', price:'157.234', chg:'+0.41%', up:true,  spark:[30,33,31,35,34,37,36,39,38,42] },
  { pair:'XAU/USD', price:'2341.50', chg:'+0.67%', up:true,  spark:[20,24,22,28,25,30,27,32,29,35] },
  { pair:'USD/CHF', price:'0.90124', chg:'-0.08%', up:false, spark:[60,58,59,56,57,54,56,53,54,51] },
  { pair:'AUD/USD', price:'0.65432', chg:'+0.19%', up:true,  spark:[25,27,26,29,28,31,30,33,32,35] },
  { pair:'EUR/JPY', price:'170.341', chg:'+0.55%', up:true,  spark:[15,18,16,20,19,22,21,24,23,27] },
  { pair:'GBP/JPY', price:'198.712', chg:'-0.22%', up:false, spark:[70,67,68,64,65,61,62,58,59,55] },
  { pair:'NZD/USD', price:'0.61234', chg:'+0.11%', up:true,  spark:[35,37,36,39,38,41,40,43,42,45] },
  { pair:'USD/CAD', price:'1.36542', chg:'-0.17%', up:false, spark:[50,48,49,46,47,44,45,42,43,40] },
  { pair:'EUR/GBP', price:'0.85621', chg:'+0.09%', up:true,  spark:[28,30,29,32,31,34,33,36,35,38] },
  { pair:'BTC/USD', price:'67,420',  chg:'+1.23%', up:true,  spark:[10,15,12,18,14,20,16,22,18,25] },
]

function FloatingBg() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let raf

    const resize = () => {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // Create floating card objects
    const cards = Array.from({ length: 14 }, (_, i) => {
      const p = PAIRS[i % PAIRS.length]
      return {
        ...p,
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.35,
        vy: -(Math.random() * 0.4 + 0.15),
        opacity: Math.random() * 0.28 + 0.08,
        scale: Math.random() * 0.35 + 0.65,
        rot: (Math.random() - 0.5) * 0.08,
        phase: Math.random() * Math.PI * 2,
      }
    })

    // Floating data particles
    const particles = Array.from({ length: 30 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vy: -(Math.random() * 0.5 + 0.2),
      text: ['▲ 0.' + Math.floor(Math.random()*99).toString().padStart(2,'0') + '%',
             '▼ 0.' + Math.floor(Math.random()*99).toString().padStart(2,'0') + '%',
             (Math.random() > 0.5 ? '+' : '-') + (Math.random()*2).toFixed(4),
             Math.floor(Math.random()*9999).toString()][Math.floor(Math.random()*4)],
      color: Math.random() > 0.5 ? '#00c8f0' : Math.random() > 0.5 ? '#3ddc84' : '#ef4444',
      opacity: Math.random() * 0.18 + 0.05,
      size: Math.random() * 4 + 8,
    }))

    let t = 0

    function drawSparkline(ctx, spark, x, y, w, h, color) {
      const min = Math.min(...spark), max = Math.max(...spark)
      const range = max - min || 1
      ctx.beginPath()
      spark.forEach((v, i) => {
        const px = x + (i / (spark.length - 1)) * w
        const py = y + h - ((v - min) / range) * h
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
      })
      ctx.strokeStyle = color
      ctx.lineWidth = 1.2
      ctx.stroke()
      // Last dot
      const lx = x + w, ly = y + h - ((spark[spark.length-1] - min) / range) * h
      ctx.beginPath()
      ctx.arc(lx, ly, 2, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
    }

    function drawCard(ctx, card, t) {
      const W = 148, H = 68
      const cx = card.x, cy = card.y + Math.sin(t * 0.0008 + card.phase) * 6

      ctx.save()
      ctx.globalAlpha = card.opacity
      ctx.translate(cx, cy)
      ctx.scale(card.scale, card.scale)
      ctx.rotate(card.rot + Math.sin(t * 0.0004 + card.phase) * 0.015)

      // Card bg
      ctx.fillStyle = 'rgba(2,8,23,0.72)'
      ctx.strokeStyle = card.up ? 'rgba(0,200,240,0.25)' : 'rgba(239,68,68,0.2)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(-W/2, -H/2, W, H, 6)
      ctx.fill()
      ctx.stroke()

      // Pair label
      ctx.fillStyle = '#e2e8f0'
      ctx.font = `600 11px "JetBrains Mono", monospace`
      ctx.fillText(card.pair, -W/2 + 10, -H/2 + 16)

      // Price
      ctx.fillStyle = '#00c8f0'
      ctx.font = `700 13px "JetBrains Mono", monospace`
      ctx.fillText(card.price, -W/2 + 10, -H/2 + 32)

      // Change
      ctx.fillStyle = card.up ? '#3ddc84' : '#ef4444'
      ctx.font = `600 9px "JetBrains Mono", monospace`
      ctx.fillText((card.up ? '▲ ' : '▼ ') + card.chg, -W/2 + 10, -H/2 + 46)

      // Sparkline
      drawSparkline(ctx, card.spark, W/2 - 55, -H/2 + 12, 44, 36,
        card.up ? 'rgba(61,220,132,0.7)' : 'rgba(239,68,68,0.7)')

      ctx.restore()
    }

    function draw() {
      t++
      const W = canvas.width, H = canvas.height
      ctx.clearRect(0, 0, W, H)

      // Deep dark bg
      ctx.fillStyle = '#020817'
      ctx.fillRect(0, 0, W, H)

      // Grid
      ctx.strokeStyle = 'rgba(0,200,240,0.025)'
      ctx.lineWidth = 1
      for (let x = 0; x < W; x += 44) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
      }
      for (let y = 0; y < H; y += 44) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
      }

      // Center glow
      const g = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, W * 0.45)
      g.addColorStop(0, 'rgba(0,200,240,0.06)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)

      // Particles
      particles.forEach(p => {
        p.y += p.vy
        if (p.y < -20) { p.y = H + 10; p.x = Math.random() * W }
        ctx.globalAlpha = p.opacity
        ctx.fillStyle = p.color
        ctx.font = `${p.size}px "JetBrains Mono", monospace`
        ctx.fillText(p.text, p.x, p.y)
      })
      ctx.globalAlpha = 1

      // Cards
      cards.forEach(card => {
        card.x += card.vx
        card.y += card.vy
        if (card.y < -100) {
          card.y = H + 80
          card.x = Math.random() * W
        }
        if (card.x < -180) card.x = W + 80
        if (card.x > W + 180) card.x = -80
        drawCard(ctx, card, t)
      })

      raf = requestAnimationFrame(draw)
    }

    draw()
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas ref={canvasRef} style={{
      position: 'fixed', inset: 0, zIndex: 0,
      pointerEvents: 'none',
    }}/>
  )
}

export default function LoginPage({ onLogin }) {
  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const [err, setErr] = useState('')
  const [shake, setShake] = useState(false)
  const [loading, setLoading] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setTimeout(() => {
      if (u === USER && p === PASS) {
        onLogin()
      } else {
        setErr('Invalid credentials. DM for access.')
        setShake(true)
        setTimeout(() => setShake(false), 600)
      }
      setLoading(false)
    }, 800)
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#020817',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-mono)',
      position: 'relative', overflow: 'hidden',
    }}>
      <style>{`
        @keyframes login-glow {
          0%,100% { box-shadow: 0 0 0 1px rgba(0,200,240,0.2), 0 0 40px rgba(0,200,240,0.06); }
          50%      { box-shadow: 0 0 0 1px rgba(0,200,240,0.5), 0 0 60px rgba(0,200,240,0.15); }
        }
        @keyframes shake {
          0%,100%{ transform:translateX(0) }
          20%    { transform:translateX(-8px) }
          40%    { transform:translateX(8px) }
          60%    { transform:translateX(-5px) }
          80%    { transform:translateX(5px) }
        }
        .login-input {
          width: 100%;
          background: rgba(0,200,240,0.04);
          border: 1px solid rgba(0,200,240,0.2);
          border-radius: 4px;
          color: var(--cyan);
          font-family: var(--font-mono);
          font-size: 13px;
          padding: 11px 14px;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
          letter-spacing: 0.05em;
          box-sizing: border-box;
        }
        .login-input:focus {
          border-color: rgba(0,200,240,0.6);
          box-shadow: 0 0 0 2px rgba(0,200,240,0.1);
        }
        .login-input::placeholder { color: rgba(0,200,240,0.25); }
        .login-btn {
          width: 100%;
          padding: 12px;
          background: rgba(0,200,240,0.1);
          border: 1px solid rgba(0,200,240,0.4);
          border-radius: 4px;
          color: var(--cyan);
          font-family: var(--font-mono);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.18em;
          cursor: pointer;
          transition: all 0.2s;
        }
        .login-btn:hover {
          background: rgba(0,200,240,0.18);
          border-color: rgba(0,200,240,0.7);
          box-shadow: 0 0 24px rgba(0,200,240,0.18);
        }
        .login-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .dm-btn:hover { background: rgba(0,200,240,0.14) !important; }
      `}</style>

      <FloatingBg />

      {/* Blur overlay behind card */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1,
        backdropFilter: 'blur(1.5px)',
        pointerEvents: 'none',
      }}/>

      {/* Login card */}
      <div style={{
        position: 'relative', zIndex: 2,
        width: 390, padding: '40px 36px',
        background: 'rgba(2,8,23,0.88)',
        border: '1px solid rgba(0,200,240,0.18)',
        borderRadius: 10,
        backdropFilter: 'blur(20px)',
        animation: shake ? 'shake 0.5s ease' : 'login-glow 3s ease-in-out infinite',
      }}>

        {/* Logo */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', marginBottom:32, gap:12 }}>
          <NexusIcon size={56} />
          <div style={{ textAlign:'center' }}>
            <div style={{
              fontSize:22, fontWeight:800, letterSpacing:'0.25em',
              color:'var(--cyan)', lineHeight:1,
              textShadow:'0 0 24px rgba(0,200,240,0.65)',
              animation:'nx-flicker 9s ease-in-out infinite',
            }}>NEXUS</div>
            <div style={{ fontSize:9, letterSpacing:'0.22em', color:'var(--text-muted)', marginTop:5 }}>
              TERMINAL · RESTRICTED ACCESS
            </div>
          </div>
        </div>

        <div style={{ borderTop:'1px solid rgba(0,200,240,0.1)', marginBottom:28 }}/>

        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <div style={{ fontSize:9, color:'var(--text-muted)', letterSpacing:'0.15em', marginBottom:6 }}>USER ID</div>
            <input className="login-input" placeholder="enter username"
              value={u} onChange={e => { setU(e.target.value); setErr('') }}
              autoComplete="off" spellCheck={false}/>
          </div>
          <div>
            <div style={{ fontSize:9, color:'var(--text-muted)', letterSpacing:'0.15em', marginBottom:6 }}>ACCESS KEY</div>
            <input className="login-input" type="password" placeholder="enter password"
              value={p} onChange={e => { setP(e.target.value); setErr('') }}/>
          </div>

          {err && (
            <div style={{
              fontSize:11, color:'var(--red)', textAlign:'center',
              background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)',
              borderRadius:4, padding:'8px 12px', letterSpacing:'0.05em',
            }}>⚠ {err}</div>
          )}

          <button className="login-btn" type="submit" disabled={loading} style={{ marginTop:4 }}>
            {loading ? '· · ·' : 'AUTHENTICATE →'}
          </button>
        </form>

        <div style={{ marginTop:28, paddingTop:20, borderTop:'1px solid rgba(0,200,240,0.08)', textAlign:'center' }}>
          <div style={{ fontSize:10, color:'var(--text-muted)', marginBottom:8, letterSpacing:'0.05em' }}>
            Don't have credentials?
          </div>
          <a href="https://www.linkedin.com/in/mihir-kansara-043275187/"
            target="_blank" rel="noopener noreferrer" className="dm-btn"
            style={{
              display:'inline-flex', alignItems:'center', gap:6,
              fontSize:11, color:'var(--cyan)', textDecoration:'none',
              background:'rgba(0,200,240,0.06)',
              border:'1px solid rgba(0,200,240,0.2)',
              borderRadius:4, padding:'8px 16px',
              letterSpacing:'0.05em', fontWeight:600,
              transition:'all 0.2s',
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#0A66C2">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
            DM me on LinkedIn
          </a>
          <div style={{ fontSize:9, color:'var(--text-ghost)', marginTop:10, letterSpacing:'0.04em' }}>
            © 2026 Mihir Kansara · NEXUS TERMINAL
          </div>
        </div>
      </div>
    </div>
  )
}
