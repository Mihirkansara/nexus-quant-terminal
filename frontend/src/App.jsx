import { useState, useEffect } from 'react'
import './index.css'
import Navbar from './components/Navbar'
import PortfolioBuilder from './components/PortfolioBuilder'
import Dashboard from './pages/Dashboard'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import { usePortfolioStore } from './store/portfolio'

function useNexusFavicon() {
  useEffect(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')

    let link = document.querySelector("link[rel~='icon']")
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }

    let a1 = 0, a2 = Math.PI / 3, a3 = -Math.PI / 3
    let frame

    function draw() {
      const cx = 32, cy = 32
      ctx.clearRect(0, 0, 64, 64)

      // Background circle
      ctx.fillStyle = '#080e1a'
      ctx.beginPath()
      ctx.arc(cx, cy, 30, 0, Math.PI * 2)
      ctx.fill()

      // Helper: draw one orbit + satellite
      function orbit(angle, color, rx, ry, dotR) {
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(angle)
        ctx.strokeStyle = color
        ctx.lineWidth = 1
        ctx.globalAlpha = 0.65
        ctx.beginPath()
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2)
        ctx.stroke()
        // Satellite
        ctx.globalAlpha = 1
        ctx.shadowBlur = 8
        ctx.shadowColor = color
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(rx, 0, dotR, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.restore()
      }

      orbit(a1, '#00c8f0', 27, 7.5, 3.5)
      orbit(a2, '#8b5cf6', 27, 7.5, 3)
      orbit(a3, '#3ddc84', 27, 7.5, 2.8)

      // Core glow
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 10)
      g.addColorStop(0, 'rgba(0,200,240,0.95)')
      g.addColorStop(0.45, 'rgba(0,200,240,0.35)')
      g.addColorStop(1, 'rgba(0,200,240,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(cx, cy, 10, 0, Math.PI * 2)
      ctx.fill()

      // Core dot
      ctx.shadowBlur = 10
      ctx.shadowColor = '#00c8f0'
      ctx.fillStyle = '#00c8f0'
      ctx.beginPath()
      ctx.arc(cx, cy, 4.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0

      // White center
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(cx, cy, 1.8, 0, Math.PI * 2)
      ctx.fill()

      link.type = 'image/png'
      link.href = canvas.toDataURL('image/png')

      const fps = 60
      a1 += (2 * Math.PI) / (7  * fps)
      a2 += (2 * Math.PI) / (11 * fps)
      a3 -= (2 * Math.PI) / (5  * fps)

      frame = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(frame)
  }, [])
}

export default function App() {
  const { fromURL } = usePortfolioStore()
  const [authed, setAuthed] = useState(() => sessionStorage.getItem('qfx-auth') === '1')
  const [inApp, setInApp] = useState(() => sessionStorage.getItem('qfx-v') === '1')

  useNexusFavicon()

  useEffect(() => { fromURL() }, [])

  function handleLogin() {
    sessionStorage.setItem('qfx-auth', '1')
    setAuthed(true)
  }

  function enterApp() {
    sessionStorage.setItem('qfx-v', '1')
    setInApp(true)
  }

  if (!authed) return <LoginPage onLogin={handleLogin} />
  if (!inApp) return <LandingPage onEnter={enterApp}/>

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden' }}>
      <Navbar />

      {/* Main layout: sidebar + content */}
      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>

        {/* Left sidebar */}
        <div style={{
          width:260, minWidth:260, flexShrink:0,
          display:'flex', flexDirection:'column',
          overflow:'hidden',
          background:'rgba(2,8,23,0.92)',
          borderRight:'1px solid var(--border)',
          backdropFilter:'blur(20px)',
        }}>
          <PortfolioBuilder />
        </div>

        {/* Dashboard pane */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          {/* Subtle inner gradient */}
          <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden',
            background:'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(0,212,255,0.04) 0%, transparent 60%)' }}>
            <Dashboard />
          </div>
        </div>
      </div>
    </div>
  )
}
