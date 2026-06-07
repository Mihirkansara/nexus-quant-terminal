import { useState, useEffect } from 'react'
import { usePortfolioStore, PAIR_META } from '../store/portfolio'
import { fetchStrategies } from '../api/client'

const LegRow = ({ leg }) => {
  const { updateLeg, removeLeg, S } = usePortfolioStore()
  const moneyness = leg.K < S*0.999 ? 'ITM' : leg.K > S*1.001 ? 'OTM' : 'ATM'
  const mColor = moneyness==='ITM'?'var(--green)':moneyness==='ATM'?'var(--gold)':'var(--text-muted)'
  return (
    <tr>
      <td style={{ padding:'5px 4px' }}>
        <select className="input-field" style={{ width:58, fontSize:10, padding:'3px 4px' }}
          value={leg.type} onChange={e=>updateLeg(leg.id,'type',e.target.value)}>
          <option value="call">CALL</option>
          <option value="put">PUT</option>
        </select>
      </td>
      <td style={{ padding:'5px 4px' }}>
        <input type="number" className="input-field" style={{ width:68, fontSize:10, padding:'3px 4px' }}
          value={leg.K} step={0.0001} onChange={e=>updateLeg(leg.id,'K',parseFloat(e.target.value))} />
      </td>
      <td style={{ padding:'5px 4px' }}>
        <input type="number" className="input-field" style={{ width:46, fontSize:10, padding:'3px 4px' }}
          value={leg.T} step={0.05} min={0.01} onChange={e=>updateLeg(leg.id,'T',parseFloat(e.target.value))} />
      </td>
      <td style={{ padding:'5px 4px' }}>
        <input type="number" className="input-field" style={{ width:40, fontSize:10, padding:'3px 4px' }}
          value={leg.qty} step={1} onChange={e=>updateLeg(leg.id,'qty',parseInt(e.target.value))} />
      </td>
      <td style={{ padding:'5px 4px', textAlign:'center' }}>
        <span style={{ fontSize:9.5, fontWeight:700, color:mColor }}>{moneyness}</span>
      </td>
      <td style={{ padding:'5px 2px' }}>
        <button onClick={()=>removeLeg(leg.id)} style={{ background:'transparent', border:'none',
          color:'var(--text-muted)', cursor:'pointer', fontSize:12, padding:'0 4px' }}>✕</button>
      </td>
    </tr>
  )
}

const ParamRow = ({ label, value, setter, step=0.001, min=0, max, disabled, suffix='' }) => (
  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
    padding:'5px 0', borderBottom:'1px solid rgba(0,212,255,0.05)' }}>
    <span style={{ fontSize:11.5, color:'var(--text-muted)' }}>{label}</span>
    <div style={{ display:'flex', alignItems:'center', gap:4 }}>
      <input type="number" className="input-field"
        style={{ width:72, textAlign:'right', fontSize:11, padding:'3px 6px' }}
        value={value} step={step} min={min} max={max} disabled={disabled}
        onChange={e => setter && setter(e.target.value)} />
      {suffix && <span style={{ fontSize:9, color:'var(--text-muted)', minWidth:12 }}>{suffix}</span>}
    </div>
  </div>
)

export default function PortfolioBuilder() {
  const { legs, addLeg, loadStrategy, S, setS, sigma, setSigma,
    T, setT, r_d, setRd, r_f, setRf, pair } = usePortfolioStore()
  const [strategies, setStrategies] = useState([])
  const [showStrategies, setShowStrategies] = useState(false)
  const meta = PAIR_META[pair] || {}

  useEffect(() => { fetchStrategies().then(setStrategies).catch(()=>{}) }, [])

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      {/* Pair info header */}
      <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)',
        background:'rgba(0,212,255,0.03)' }}>
        <div className="label-upper" style={{ marginBottom:4 }}>Spot Rate</div>
        <div className="font-mono neon-cyan" style={{ fontSize:22, fontWeight:700 }}>
          {S.toFixed(meta.pip === 0.01 ? 3 : 5)}
        </div>
        <div style={{ fontSize:9, color:'var(--text-muted)', marginTop:2 }}>
          {pair.slice(0,3)} / {pair.slice(3)} · pip={meta.pip}
        </div>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'12px 14px' }}>
        {/* Market params */}
        <div className="section-header">
          <span className="section-title">Market Params</span>
        </div>
        <div style={{ marginBottom:14 }}>
          <ParamRow label="Spot (S)"     value={S}     setter={setS}     step={meta.pip||0.0001} />
          <ParamRow label="Vol σ (ann.)" value={sigma} setter={setSigma} step={0.001} min={0.001} max={3} />
          <ParamRow label="Expiry T (yr)"value={T}     setter={setT}     step={0.05}  min={0.01} />
          <ParamRow label="Rate r_d"     value={r_d}   setter={setRd}    step={0.001} suffix="%" />
          <ParamRow label="Rate r_f"     value={r_f}   setter={setRf}    step={0.001} suffix="%" />
        </div>

        {/* Option legs */}
        <div className="section-header">
          <span className="section-title" style={{ flex:1 }}>Option Legs</span>
          <button className="btn-primary" onClick={addLeg} style={{ padding:'4px 10px', fontSize:10 }}>
            + Add
          </button>
        </div>
        <div style={{ overflowX:'auto', marginBottom:14 }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
            <thead>
              <tr style={{ color:'var(--text-muted)' }}>
                <th style={{ textAlign:'left', paddingBottom:5, fontSize:10, color:'var(--text-muted)', letterSpacing:'0.05em' }}>Type</th>
                <th style={{ textAlign:'left', paddingBottom:5, fontSize:10, color:'var(--text-muted)', letterSpacing:'0.05em' }}>Strike</th>
                <th style={{ textAlign:'left', paddingBottom:5, fontSize:10, color:'var(--text-muted)', letterSpacing:'0.05em' }}>T (yr)</th>
                <th style={{ textAlign:'left', paddingBottom:5, fontSize:10, color:'var(--text-muted)', letterSpacing:'0.05em' }}>Qty</th>
                <th style={{ paddingBottom:5, fontSize:10 }}></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {legs.map(leg => <LegRow key={leg.id} leg={leg} />)}
              {legs.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding:'16px 0', textAlign:'center',
                    color:'var(--text-muted)', fontSize:11, fontStyle:'italic' }}>
                    No legs yet — click + Add or pick a strategy below
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Strategy Library */}
        <div className="section-header" style={{ cursor:'pointer' }}
          onClick={() => setShowStrategies(!showStrategies)}>
          <span className="section-title" style={{ flex:1 }}>Strategy Library</span>
          <span style={{ color:'var(--text-muted)', fontSize:10 }}>{showStrategies?'▲':'▼'}</span>
        </div>
        {showStrategies && (
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            {strategies.map(s => (
              <button key={s.name} onClick={() => { loadStrategy(s); setShowStrategies(false) }}
                className="glass-hover"
                style={{ textAlign:'left', padding:'8px 10px', borderRadius:6, border:'1px solid var(--border)',
                  background:'var(--bg3)', cursor:'pointer', transition:'all 0.15s' }}>
                <div style={{ fontSize:11, fontWeight:600, color:'var(--cyan)' }}>{s.name}</div>
                <div style={{ fontSize:10.5, color:'var(--text-muted)', marginTop:3, lineHeight:1.45 }}>
                  {s.description.slice(0,60)}{s.description.length > 60 ? '…' : ''}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
