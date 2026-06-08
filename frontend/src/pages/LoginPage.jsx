import { useState } from 'react'
import { NexusIcon } from '../components/NexusLogo'

const USER = 'mihir.kansara'
const PASS = 'nexus@2026'

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
          0%,100% { box-shadow: 0 0 0 1px rgba(0,200,240,0.2), 0 0 24px rgba(0,200,240,0.05); }
          50%      { box-shadow: 0 0 0 1px rgba(0,200,240,0.45), 0 0 40px rgba(0,200,240,0.12); }
        }
        @keyframes shake {
          0%,100%{ transform:translateX(0) }
          20%    { transform:translateX(-8px) }
          40%    { transform:translateX(8px) }
          60%    { transform:translateX(-5px) }
          80%    { transform:translateX(5px) }
        }
        @keyframes scanline {
          0%   { transform: translateY(-100%) }
          100% { transform: translateY(100vh) }
        }
        .login-input {
          width: 100%;
          background: rgba(0,200,240,0.04);
          border: 1px solid rgba(0,200,240,0.2);
          border-radius: 4px;
          color: var(--cyan);
          font-family: var(--font-mono);
          font-size: 13px;
          padding: 10px 14px;
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
          padding: 11px;
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
          box-shadow: 0 0 20px rgba(0,200,240,0.15);
        }
        .login-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>

      {/* Scanline effect */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
      }}/>

      {/* Grid bg */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: 'linear-gradient(rgba(0,200,240,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,200,240,0.03) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }}/>

      {/* Glow orb */}
      <div style={{
        position: 'fixed', top: '20%', left: '50%', transform: 'translateX(-50%)',
        width: 600, height: 600, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0,200,240,0.06) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0,
      }}/>

      {/* Login card */}
      <div style={{
        position: 'relative', zIndex: 1,
        width: 380, padding: '40px 36px',
        background: 'rgba(2,8,23,0.92)',
        border: '1px solid rgba(0,200,240,0.18)',
        borderRadius: 8,
        animation: 'login-glow 3s ease-in-out infinite',
        ...(shake ? { animation: 'shake 0.5s ease' } : {}),
      }}>

        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 32, gap: 12 }}>
          <NexusIcon size={52} />
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: 20, fontWeight: 800, letterSpacing: '0.25em',
              color: 'var(--cyan)', lineHeight: 1,
              textShadow: '0 0 20px rgba(0,200,240,0.6)',
              animation: 'nx-flicker 9s ease-in-out infinite',
            }}>NEXUS</div>
            <div style={{ fontSize: 9, letterSpacing: '0.22em', color: 'var(--text-muted)', marginTop: 4 }}>
              TERMINAL · RESTRICTED ACCESS
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid rgba(0,200,240,0.1)', marginBottom: 28 }}/>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.15em', marginBottom: 6 }}>
              USER ID
            </div>
            <input
              className="login-input"
              placeholder="enter username"
              value={u}
              onChange={e => { setU(e.target.value); setErr('') }}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.15em', marginBottom: 6 }}>
              ACCESS KEY
            </div>
            <input
              className="login-input"
              type="password"
              placeholder="enter password"
              value={p}
              onChange={e => { setP(e.target.value); setErr('') }}
            />
          </div>

          {err && (
            <div style={{
              fontSize: 11, color: 'var(--red)', textAlign: 'center',
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 4, padding: '8px 12px', letterSpacing: '0.05em',
            }}>
              ⚠ {err}
            </div>
          )}

          <button className="login-btn" type="submit" disabled={loading} style={{ marginTop: 4 }}>
            {loading ? '· · ·' : 'AUTHENTICATE →'}
          </button>
        </form>

        {/* DM section */}
        <div style={{
          marginTop: 28, paddingTop: 20,
          borderTop: '1px solid rgba(0,200,240,0.08)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8, letterSpacing: '0.05em' }}>
            Don't have credentials?
          </div>
          <a
            href="https://www.linkedin.com/in/mihir-kansara-043275187/"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 11, color: 'var(--cyan)', textDecoration: 'none',
              background: 'rgba(0,200,240,0.06)',
              border: '1px solid rgba(0,200,240,0.2)',
              borderRadius: 4, padding: '7px 14px',
              letterSpacing: '0.05em', fontWeight: 600,
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,200,240,0.12)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,200,240,0.06)'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#0A66C2">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
            DM me on LinkedIn
          </a>
          <div style={{ fontSize: 9, color: 'var(--text-ghost)', marginTop: 10, letterSpacing: '0.04em' }}>
            © 2026 Mihir Kansara · NEXUS TERMINAL
          </div>
        </div>
      </div>
    </div>
  )
}
