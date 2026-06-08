import { useState, useEffect, useRef } from 'react'
import { NexusIcon } from '../components/NexusLogo'

const USER = 'nexus.quant'
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
  { pair:'BTC/USD', price:'67,420',  chg:'+1.23%', up:true,  spark:[10,15,12,18,14,20,16,22,18,25] },
  { pair:'NZD/USD', price:'0.61234', chg:'+0.11%', up:true,  spark:[35,37,36,39,38,41,40,43,42,45] },
  { pair:'USD/CAD', price:'1.36542', chg:'-0.17%', up:false, spark:[50,48,49,46,47,44,45,42,43,40] },
  { pair:'ETH/USD', price:'3,524.8', chg:'+2.14%', up:true,  spark:[8,12,10,16,13,19,15,21,18,24]  },
]

function FloatingBg() {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let raf

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
    resize()
    window.addEventListener('resize', resize)

    const cards = Array.from({ length: 16 }, (_, i) => {
      const p = PAIRS[i % PAIRS.length]
      return {
        ...p,
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight * 1.5,
        vx: (Math.random() - 0.5) * 0.5,
        vy: -(Math.random() * 0.6 + 0.25),
        opacity: Math.random() * 0.35 + 0.55,
        scale: Math.random() * 0.3 + 0.85,
        rot: (Math.random() - 0.5) * 0.12,
        phase: Math.random() * Math.PI * 2,
        glowIntensity: Math.random(),
      }
    })

    // Scanline numbers floating up
    const scanLines = Array.from({ length: 18 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vy: -(Math.random() * 0.8 + 0.3),
      text: [
        'DELTA Δ ' + (Math.random()*0.9).toFixed(4),
        'VEGA ν ' + (Math.random()*0.05).toFixed(4),
        'IV ' + (Math.floor(Math.random()*30)+5) + '%',
        '▲ ' + (Math.random()*2).toFixed(3) + '%',
        '▼ ' + (Math.random()*2).toFixed(3) + '%',
        Math.floor(Math.random()*99999).toString(),
        'RSI ' + Math.floor(Math.random()*100),
        'MACD ' + (Math.random()*0.01-0.005).toFixed(5),
      ][Math.floor(Math.random()*8)],
      color: ['#00c8f0','#3ddc84','#ef4444','#8b5cf6','#f59e0b'][Math.floor(Math.random()*5)],
      opacity: Math.random() * 0.5 + 0.3,
      size: Math.random() * 5 + 9,
    }))

    let t = 0

    function drawSparkline(ctx, spark, x, y, w, h, color, glow) {
      const min = Math.min(...spark), max = Math.max(...spark)
      const range = max - min || 1

      // Area fill
      ctx.beginPath()
      spark.forEach((v, i) => {
        const px = x + (i / (spark.length - 1)) * w
        const py = y + h - ((v - min) / range) * h
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
      })
      ctx.lineTo(x + w, y + h)
      ctx.lineTo(x, y + h)
      ctx.closePath()
      const grad = ctx.createLinearGradient(0, y, 0, y + h)
      grad.addColorStop(0, color.replace(')', ',0.3)').replace('rgb', 'rgba'))
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = grad
      ctx.fill()

      // Line
      ctx.beginPath()
      spark.forEach((v, i) => {
        const px = x + (i / (spark.length - 1)) * w
        const py = y + h - ((v - min) / range) * h
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
      })
      ctx.shadowBlur = glow ? 12 : 0
      ctx.shadowColor = color
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.shadowBlur = 0

      // End dot with glow
      const lx = x + w
      const ly = y + h - ((spark[spark.length-1] - min) / range) * h
      ctx.shadowBlur = 14
      ctx.shadowColor = color
      ctx.beginPath()
      ctx.arc(lx, ly, 3.5, 0, Math.PI * 2)
      ctx.fillStyle = '#fff'
      ctx.fill()
      ctx.shadowBlur = 0
    }

    function drawCard(ctx, card, t) {
      const W = 164, H = 78
      const cy = card.y + Math.sin(t * 0.001 + card.phase) * 8

      ctx.save()
      ctx.globalAlpha = card.opacity
      ctx.translate(card.x, cy)
      ctx.scale(card.scale, card.scale)
      ctx.rotate(card.rot + Math.sin(t * 0.0005 + card.phase) * 0.02)

      const glowCol = card.up ? '#00c8f0' : '#ef4444'
      const sparkCol = card.up ? '#3ddc84' : '#ef4444'
      const glow = 0.5 + 0.5 * Math.sin(t * 0.015 + card.glowIntensity * 6)

      // Card glow shadow
      ctx.shadowBlur = 20 + glow * 20
      ctx.shadowColor = glowCol

      // Card bg
      const bgGrad = ctx.createLinearGradient(-W/2, -H/2, W/2, H/2)
      bgGrad.addColorStop(0, 'rgba(2,8,23,0.95)')
      bgGrad.addColorStop(1, card.up ? 'rgba(0,30,40,0.95)' : 'rgba(30,8,8,0.95)')
      ctx.fillStyle = bgGrad
      ctx.beginPath()
      ctx.roundRect(-W/2, -H/2, W, H, 8)
      ctx.fill()
      ctx.shadowBlur = 0

      // Neon border
      ctx.strokeStyle = glowCol
      ctx.lineWidth = 1.5
      ctx.globalAlpha = card.opacity * (0.6 + glow * 0.4)
      ctx.beginPath()
      ctx.roundRect(-W/2, -H/2, W, H, 8)
      ctx.stroke()
      ctx.globalAlpha = card.opacity

      // Left accent bar
      ctx.fillStyle = glowCol
      ctx.shadowBlur = 8
      ctx.shadowColor = glowCol
      ctx.fillRect(-W/2, -H/2 + 8, 3, H - 16)
      ctx.shadowBlur = 0

      // Pair
      ctx.fillStyle = '#94a3b8'
      ctx.font = `500 10px "JetBrains Mono",monospace`
      ctx.fillText(card.pair, -W/2 + 12, -H/2 + 16)

      // Price — big and cyan
      ctx.shadowBlur = 10
      ctx.shadowColor = '#00c8f0'
      ctx.fillStyle = '#00c8f0'
      ctx.font = `700 15px "JetBrains Mono",monospace`
      ctx.fillText(card.price, -W/2 + 12, -H/2 + 34)
      ctx.shadowBlur = 0

      // Change badge
      const badgeColor = card.up ? '#3ddc84' : '#ef4444'
      ctx.fillStyle = card.up ? 'rgba(61,220,132,0.15)' : 'rgba(239,68,68,0.15)'
      ctx.beginPath()
      ctx.roundRect(-W/2 + 10, -H/2 + 40, 60, 16, 3)
      ctx.fill()
      ctx.fillStyle = badgeColor
      ctx.font = `700 9px "JetBrains Mono",monospace`
      ctx.fillText((card.up ? '▲ ' : '▼ ') + card.chg, -W/2 + 15, -H/2 + 51)

      // Sparkline
      drawSparkline(ctx, card.spark, W/2 - 62, -H/2 + 10, 52, 44, sparkCol, true)

      ctx.restore()
    }

    function draw() {
      t++
      const W = canvas.width, H = canvas.height
      ctx.clearRect(0, 0, W, H)

      // Dark bg
      ctx.fillStyle = '#020817'
      ctx.fillRect(0, 0, W, H)

      // Grid lines
      ctx.strokeStyle = 'rgba(0,200,240,0.04)'
      ctx.lineWidth = 1
      for (let x = 0; x < W; x += 48) {
        ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke()
      }
      for (let y = 0; y < H; y += 48) {
        ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke()
      }

      // Center ambient glow
      const g = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, W*0.5)
      g.addColorStop(0, 'rgba(0,200,240,0.05)')
      g.addColorStop(0.5, 'rgba(139,92,246,0.03)')
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)

      // Scan lines (floating text)
      scanLines.forEach(sl => {
        sl.y += sl.vy
        if (sl.y < -30) { sl.y = H + 20; sl.x = Math.random() * W }
        ctx.globalAlpha = sl.opacity
        ctx.shadowBlur = 8
        ctx.shadowColor = sl.color
        ctx.fillStyle = sl.color
        ctx.font = `${sl.size}px "JetBrains Mono",monospace`
        ctx.fillText(sl.text, sl.x, sl.y)
        ctx.shadowBlur = 0
      })
      ctx.globalAlpha = 1

      // Cards
      cards.forEach(card => {
        card.x += card.vx
        card.y += card.vy
        if (card.y < -120) { card.y = H + 100; card.x = Math.random() * W }
        if (card.x < -200) card.x = W + 100
        if (card.x > W + 200) card.x = -100
        drawCard(ctx, card, t)
      })

      raf = requestAnimationFrame(draw)
    }

    draw()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])

  return <canvas ref={canvasRef} style={{ position:'fixed', inset:0, zIndex:0, pointerEvents:'none' }}/>
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
      minHeight:'100vh', background:'#020817',
      display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center',
      fontFamily:'var(--font-mono)',
      position:'relative', overflow:'hidden',
    }}>
      <style>{`
        @keyframes login-glow {
          0%,100% { box-shadow: 0 0 0 1px rgba(0,200,240,0.3), 0 0 50px rgba(0,200,240,0.1), 0 0 100px rgba(0,200,240,0.05); }
          50%      { box-shadow: 0 0 0 1px rgba(0,200,240,0.7), 0 0 70px rgba(0,200,240,0.2), 0 0 140px rgba(0,200,240,0.08); }
        }
        @keyframes shake {
          0%,100%{ transform:translateX(0) }
          20%    { transform:translateX(-10px) }
          40%    { transform:translateX(10px) }
          60%    { transform:translateX(-6px) }
          80%    { transform:translateX(6px) }
        }
        .login-input {
          width:100%; background:rgba(0,200,240,0.05);
          border:1px solid rgba(0,200,240,0.25); border-radius:5px;
          color:#e2e8f0; font-family:var(--font-mono); font-size:13px;
          padding:12px 14px; outline:none;
          transition:border-color 0.2s, box-shadow 0.2s;
          letter-spacing:0.05em; box-sizing:border-box;
        }
        .login-input:focus {
          border-color:rgba(0,200,240,0.7);
          box-shadow:0 0 0 2px rgba(0,200,240,0.12), 0 0 16px rgba(0,200,240,0.1);
        }
        .login-input::placeholder { color:rgba(148,163,184,0.35); }
        .login-btn {
          width:100%; padding:13px;
          background:linear-gradient(135deg, rgba(0,200,240,0.15), rgba(139,92,246,0.1));
          border:1px solid rgba(0,200,240,0.5); border-radius:5px;
          color:#00c8f0; font-family:var(--font-mono); font-size:12px;
          font-weight:800; letter-spacing:0.2em; cursor:pointer;
          transition:all 0.25s;
          text-shadow:0 0 10px rgba(0,200,240,0.5);
        }
        .login-btn:hover {
          background:linear-gradient(135deg, rgba(0,200,240,0.25), rgba(139,92,246,0.15));
          border-color:rgba(0,200,240,0.9);
          box-shadow:0 0 30px rgba(0,200,240,0.25), 0 0 60px rgba(0,200,240,0.1);
          transform:translateY(-1px);
        }
        .login-btn:disabled { opacity:0.4; cursor:not-allowed; transform:none; }
        .dm-link:hover {
          background:rgba(0,200,240,0.15) !important;
          box-shadow:0 0 20px rgba(0,200,240,0.2) !important;
        }
      `}</style>

      <FloatingBg />

      {/* Subtle dark vignette behind card only */}
      <div style={{
        position:'fixed', inset:0, zIndex:1, pointerEvents:'none',
        background:'radial-gradient(ellipse 55% 65% at 50% 50%, rgba(2,8,23,0.5) 0%, transparent 100%)',
      }}/>

      {/* Login card */}
      <div style={{
        position:'relative', zIndex:2,
        width:400, padding:'42px 38px',
        background:'rgba(2,8,23,0.82)',
        border:'1px solid rgba(0,200,240,0.22)',
        borderRadius:12,
        backdropFilter:'blur(24px)',
        WebkitBackdropFilter:'blur(24px)',
        animation: shake ? 'shake 0.5s ease' : 'login-glow 3s ease-in-out infinite',
      }}>

        {/* Logo */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', marginBottom:30, gap:14 }}>
          <NexusIcon size={60} />
          <div style={{ textAlign:'center' }}>
            <div style={{
              fontSize:24, fontWeight:800, letterSpacing:'0.28em',
              color:'#00c8f0', lineHeight:1,
              textShadow:'0 0 30px rgba(0,200,240,0.8), 0 0 60px rgba(0,200,240,0.4)',
              animation:'nx-flicker 9s ease-in-out infinite',
            }}>NEXUS</div>
            <div style={{ fontSize:9, letterSpacing:'0.25em', color:'#475569', marginTop:6 }}>
              TERMINAL · RESTRICTED ACCESS
            </div>
          </div>
        </div>

        <div style={{ borderTop:'1px solid rgba(0,200,240,0.12)', marginBottom:26 }}/>

        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div>
            <div style={{ fontSize:9, color:'#475569', letterSpacing:'0.18em', marginBottom:7 }}>USER ID</div>
            <input className="login-input" placeholder="enter username"
              value={u} onChange={e => { setU(e.target.value); setErr('') }}
              autoComplete="off" spellCheck={false}/>
          </div>
          <div>
            <div style={{ fontSize:9, color:'#475569', letterSpacing:'0.18em', marginBottom:7 }}>ACCESS KEY</div>
            <input className="login-input" type="password" placeholder="enter password"
              value={p} onChange={e => { setP(e.target.value); setErr('') }}/>
          </div>

          {err && (
            <div style={{
              fontSize:11, color:'#ef4444', textAlign:'center',
              background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)',
              borderRadius:5, padding:'9px 12px', letterSpacing:'0.05em',
              boxShadow:'0 0 20px rgba(239,68,68,0.1)',
            }}>⚠ {err}</div>
          )}

          <button className="login-btn" type="submit" disabled={loading} style={{ marginTop:6 }}>
            {loading ? '· · ·' : 'AUTHENTICATE →'}
          </button>
        </form>

        <div style={{ marginTop:26, paddingTop:22, borderTop:'1px solid rgba(0,200,240,0.08)', textAlign:'center' }}>
          <div style={{ fontSize:10, color:'#334155', marginBottom:10, letterSpacing:'0.06em' }}>
            Don't have credentials?
          </div>
          <a href="https://www.linkedin.com/in/mihir-kansara-043275187/"
            target="_blank" rel="noopener noreferrer" className="dm-link"
            style={{
              display:'inline-flex', alignItems:'center', gap:7,
              fontSize:11, color:'#00c8f0', textDecoration:'none',
              background:'rgba(0,200,240,0.07)',
              border:'1px solid rgba(0,200,240,0.25)',
              borderRadius:5, padding:'9px 18px',
              letterSpacing:'0.06em', fontWeight:700,
              transition:'all 0.2s',
              boxShadow:'0 0 10px rgba(0,200,240,0.05)',
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#0A66C2">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
            DM me on LinkedIn
          </a>
          <div style={{ fontSize:9, color:'#1e293b', marginTop:12, letterSpacing:'0.04em' }}>
            © 2026 Mihir Kansara · NEXUS TERMINAL
          </div>
        </div>
      </div>
    </div>
  )
}
