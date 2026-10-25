import { useState, useEffect, useMemo } from 'react'
import { Plus, X, ChevronDown, Link2, Check } from 'lucide-react'
import { usePortfolioStore, PAIR_META } from '../store/portfolio'
import { fetchStrategies } from '../api/client'
import { bookGreeks } from '../lib/gk'
import BookSeal from './BookSeal'

const fmt = (x, dp = 2) => (Number.isFinite(x) ? x : 0).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
const sig = (x, dp) => (x > 0 ? '+' : x < 0 ? '−' : '') + fmt(Math.abs(x), dp)

// Number input that shows `value * scale` and writes back `typed / scale`.
function ParamInput({ value, onChange, scale = 1, step, min, dp = 4, label, id }) {
  const shown = Number.isFinite(value) ? +(value * scale).toFixed(dp) : ''
  return (
    <input id={id} type="number" className="input-field" aria-label={label}
      value={shown} step={step} min={min}
      onChange={e => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange(v / scale) }} />
  )
}

function Param({ id, label, greek, suffix, ...rest }) {
  return (
    <div className="nx-param">
      <label htmlFor={id}>{label}{greek && <i>{greek}</i>}</label>
      <div className="nx-param-input">
        <ParamInput id={id} label={label} {...rest} />
        <small>{suffix}</small>
      </div>
    </div>
  )
}

function LegRow({ leg, S, dp, pip }) {
  const { updateLeg, removeLeg } = usePortfolioStore()
  const K = Number(leg.K)
  const itm = leg.type === 'call' ? K < S * 0.999 : K > S * 1.001
  const atm = Math.abs(K / S - 1) <= 0.001
  const money = atm ? 'ATM' : itm ? 'ITM' : 'OTM'
  return (
    <tr>
      <td>
        <select className="input-field" aria-label="Option type"
          value={leg.type} onChange={e => updateLeg(leg.id, 'type', e.target.value)}>
          <option value="call">Call</option>
          <option value="put">Put</option>
        </select>
      </td>
      <td>
        <input type="number" className="input-field" aria-label="Strike"
          value={leg.K} step={pip} onChange={e => updateLeg(leg.id, 'K', parseFloat(e.target.value))} />
      </td>
      <td>
        <input type="number" className="input-field" aria-label="Expiry in years"
          value={leg.T} step={0.05} min={0.01} onChange={e => updateLeg(leg.id, 'T', parseFloat(e.target.value))} />
      </td>
      <td>
        <input type="number" className="input-field" aria-label="Quantity"
          value={leg.qty} step={1} onChange={e => updateLeg(leg.id, 'qty', parseInt(e.target.value))} />
      </td>
      <td style={{ textAlign: 'center' }}>
        <span className="nx-money" style={{ color: atm ? 'var(--ink)' : itm ? 'var(--text-secondary)' : 'var(--text-faint)' }}
          title={`${money}: strike ${fmt(K, dp)} vs spot ${fmt(S, dp)}`}>{money}</span>
      </td>
      <td>
        <button className="nx-leg-del" onClick={() => removeLeg(leg.id)} aria-label="Remove leg"><X size={13} /></button>
      </td>
    </tr>
  )
}

export default function BookPanel({ open }) {
  const { legs, addLeg, loadStrategy, S, setS, sigma, setSigma, T, setT, r_d, setRd, r_f, setRf, pair, toShareURL } = usePortfolioStore()
  const [strategies, setStrategies] = useState([])
  const [showStrats, setShowStrats] = useState(false)
  const [copied, setCopied] = useState(false)
  const meta = PAIR_META[pair] || {}
  const dp = meta.dp ?? (meta.pip === 0.01 ? 3 : 5)

  useEffect(() => { fetchStrategies().then(setStrategies).catch(() => {}) }, [])

  const g = useMemo(() => bookGreeks(legs, S, sigma, r_d, r_f, T), [legs, S, sigma, r_d, r_f, T])

  const share = () => {
    navigator.clipboard?.writeText(toShareURL()).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2200)
    }).catch(() => {})
  }

  return (
    <aside className="nx-book" data-open={open ? 'true' : 'false'} aria-label="Book">
      <div className="nx-book-scroll">
        <div className="nx-seal">
          <BookSeal greeks={g} S={S} T={T} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span className="nx-seal-title" style={{ flex: 1 }}>Book · {pair}</span>
              <button className="nx-icon-btn" style={{ width: 26, height: 26 }} onClick={share}
                aria-label="Copy shareable link to this book" title="Copy shareable link">
                {copied ? <Check size={14} color="var(--pos)" /> : <Link2 size={14} />}
              </button>
            </div>
            <div className="serial" style={{ fontSize: 17, color: 'var(--foil)', marginTop: 4 }} title="Book value (premium), quote currency">
              {sig(g.price, dp > 2 ? 4 : 2)}
            </div>
            <dl className="nx-seal-greeks">
              <dt>Δ</dt><dd>{sig(g.delta, 3)}</dd>
              <dt>Γ <small style={{ fontFamily: 'var(--font-ui)', fontSize: 10 }}>/1%</small></dt><dd>{sig(g.gamma * S * 0.01, 4)}</dd>
              <dt>ν <small style={{ fontFamily: 'var(--font-ui)', fontSize: 10 }}>/pt</small></dt><dd>{sig(g.vega / 100, dp > 2 ? 5 : 2)}</dd>
              <dt>θ <small style={{ fontFamily: 'var(--font-ui)', fontSize: 10 }}>/day</small></dt><dd>{sig(g.theta / 365, dp > 2 ? 5 : 2)}</dd>
            </dl>
          </div>
        </div>

        <div className="nx-sect"><h3>Market</h3></div>
        <div style={{ marginBottom: 18 }}>
          <Param id="p-spot" label="Spot" greek="S" value={S} onChange={setS} step={meta.pip || 0.0001} dp={dp} suffix="" />
          <Param id="p-vol" label="Volatility" greek="σ" value={sigma} onChange={setSigma} scale={100} step={0.1} min={0.1} dp={2} suffix="%" />
          <Param id="p-T" label="Expiry" greek="T" value={T} onChange={setT} step={0.05} min={0.01} dp={3} suffix="y" />
          <Param id="p-rd" label="Domestic rate" greek={<>r<sub>d</sub></>} value={r_d} onChange={setRd} scale={100} step={0.05} dp={3} suffix="%" />
          <Param id="p-rf" label="Foreign rate" greek={<>r<sub>f</sub></>} value={r_f} onChange={setRf} scale={100} step={0.05} dp={3} suffix="%" />
        </div>

        <div className="nx-sect">
          <h3>Legs · {legs.length}</h3>
          <button className="btn-ghost" onClick={addLeg} style={{ padding: '5px 9px' }}><Plus size={13} />Add leg</button>
        </div>
        {legs.length ? (
          <table className="nx-legs" style={{ marginBottom: 18 }}>
            <colgroup><col style={{ width: 62 }} /><col /><col style={{ width: 54 }} /><col style={{ width: 40 }} /><col style={{ width: 32 }} /><col style={{ width: 26 }} /></colgroup>
            <thead><tr><th>Type</th><th>Strike</th><th>T (y)</th><th>Qty</th><th></th><th></th></tr></thead>
            <tbody>{legs.map(l => <LegRow key={l.id} leg={l} S={S} dp={dp} pip={meta.pip || 0.0001} />)}</tbody>
          </table>
        ) : (
          <div className="nx-empty" style={{ marginBottom: 18 }}>
            No legs in the book. Add a leg, or load a structure from the strategy library below.
          </div>
        )}

        <button className="nx-disclose" onClick={() => setShowStrats(s => !s)} aria-expanded={showStrats}>
          <h3>Strategy library</h3>
          <ChevronDown size={14} style={{ transform: showStrats ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
        </button>
        {showStrats && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
            {strategies.length === 0 && <div className="nx-empty">Strategy library unavailable. Check the API connection.</div>}
            {strategies.map(s => (
              <button key={s.name} className="nx-strat" onClick={() => { loadStrategy(s); setShowStrats(false) }}>
                <b>{s.name}</b>
                <span>{s.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
