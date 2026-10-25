import { useState, useEffect } from 'react'
import { Download, Layers } from 'lucide-react'
import { usePortfolioStore } from '../store/portfolio'
import { computeGreeks, exportCSV } from '../api/client'

const GREEKS = [
  { key: 'delta', sym: 'Δ', name: 'Delta', unit: 'per unit of spot', tip: 'Change in book value per 1.00 move in spot. 0.80 means the book gains 0.80 for each unit spot rises.' },
  { key: 'gamma', sym: 'Γ', name: 'Gamma', unit: 'Δ change per unit spot', tip: 'How fast delta changes as spot moves. Large gamma means the hedge drifts quickly near the strikes.' },
  { key: 'vega',  sym: 'ν', name: 'Vega',  unit: 'per 1.00 of vol', tip: 'Value change per 1.00 (100 vol points) in implied vol; divide by 100 for per-point. Long options are long vega.' },
  { key: 'theta', sym: 'Θ', name: 'Theta', unit: 'per year', tip: 'Value lost or earned as time passes, annualised. Long options pay theta; short options collect it.' },
  { key: 'rho_d', sym: 'ρ', name: 'Rho',   unit: 'domestic rate', tip: 'Sensitivity to the domestic (quote currency) interest rate.' },
  { key: 'phi',   sym: 'φ', name: 'Phi',   unit: 'foreign rate', tip: 'Sensitivity to the foreign (base currency) rate. Specific to FX options.' },
]

const signed = (v, dp = 4) => (v == null || !Number.isFinite(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(dp))

function Contribution({ legs, field, sym }) {
  const max = Math.max(1e-12, ...legs.map(l => Math.abs(l[field] ?? 0)))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 10, alignItems: 'start' }}>
      <span className="greek" style={{ fontSize: 18, color: 'var(--text-muted)', lineHeight: 1.1 }}>{sym}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {legs.map((l, i) => {
          const v = l[field] ?? 0
          const w = (Math.abs(v) / max) * 50
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 86px', gap: 10, alignItems: 'center' }}>
              <div style={{ position: 'relative', height: 8, background: 'var(--well)', borderRadius: 2 }}>
                <div style={{ position: 'absolute', left: '50%', top: -3, bottom: -3, width: 1, background: 'var(--border-md)' }} />
                <div style={{ position: 'absolute', top: 0, bottom: 0, borderRadius: 2,
                  left: v >= 0 ? '50%' : `${50 - w}%`, width: `${w}%`,
                  background: 'repeating-linear-gradient(135deg, var(--foil) 0 2px, color-mix(in srgb, var(--foil) 55%, transparent) 2px 4px)' }} />
              </div>
              <span className="mono" style={{ fontSize: 11.5, textAlign: 'right', color: 'var(--text-secondary)' }}>{signed(v, field === 'gamma' ? 3 : 4)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function GreeksDashboard() {
  const { legs, S, sigma, T, r_d, r_f, pair } = usePortfolioStore()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const payload = { options: legs.map(({ type, K, T, qty }) => ({ type, K, T, qty })), S, sigma, T, r_d, r_f }

  useEffect(() => {
    if (!legs.length) return
    setLoading(true); setError(null) // eslint-disable-line react-hooks/set-state-in-effect -- refetch when the book changes
    computeGreeks(payload)
      .then(setData)
      .catch(e => setError(e?.response?.data?.detail || 'The Greeks service did not respond. Check the API connection and try again.'))
      .finally(() => setLoading(false))
  }, [S, sigma, T, r_d, r_f, JSON.stringify(legs)]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleExport = async () => {
    const blob = await exportCSV(payload)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `greeks_${pair}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  if (!legs.length) return (
    <div style={{ padding: 24 }}>
      <div className="glass" style={{ padding: '36px 28px', maxWidth: 560, display: 'flex', gap: 18, alignItems: 'flex-start' }}>
        <Layers size={26} strokeWidth={1.4} color="var(--foil)" aria-hidden="true" />
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>The book is empty</div>
          <div style={{ color: 'var(--text-dim)', lineHeight: 1.55 }}>
            Add a leg in the book panel, or open the strategy library there and load a straddle, risk reversal or condor.
            Greeks for every leg and for the whole book appear here as soon as it has a position.
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ padding: '18px 24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
        <span className="section-title" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>{pair} · {legs.length} legs</span>
        <span className="mono" style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
          S {S} · σ {(sigma * 100).toFixed(2)}% · r<sub>d</sub> {(r_d * 100).toFixed(2)}% · r<sub>f</sub> {(r_f * 100).toFixed(2)}%
        </span>
        <div style={{ flex: 1 }} />
        <button className="btn-ghost" onClick={handleExport} disabled={!data}><Download size={13} aria-hidden="true" />Export CSV</button>
      </div>

      {error && (
        <div role="alert" style={{ padding: 12, borderRadius: 'var(--r-md)', background: 'var(--red-bg)', border: '1px solid color-mix(in srgb, var(--neg) 35%, transparent)', color: 'var(--neg)', fontSize: 12, marginBottom: 14 }}>{error}</div>
      )}

      {/* Book Greeks: one engraved strip, figures in foil (they are the book's own) */}
      <section aria-label="Book Greeks" className="nx-greek-strip" style={{ display: 'grid', gap: 1,
        background: 'var(--border)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden', marginBottom: 18 }}>
        {GREEKS.map(g => {
          const v = data?.total?.[g.key]
          return (
            <div key={g.key} title={g.tip} style={{ background: 'var(--panel)', padding: '14px 16px 12px', cursor: 'help', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 550 }}>{g.name}</span>
                <span className="greek" style={{ fontSize: 22, color: 'var(--text-muted)', lineHeight: 1 }}>{g.sym}</span>
              </div>
              {loading && !data
                ? <div className="skeleton" style={{ height: 24, marginTop: 10 }} />
                : <div className="serial" style={{ fontSize: 22, color: 'var(--foil)', marginTop: 8, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{signed(v)}</div>}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', marginTop: 4 }}>{g.unit}</div>
            </div>
          )
        })}
      </section>

      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 22 }}>
          {[
            ['Theta per day', data.total.theta / 365, 'Time decay over one calendar day'],
            ['Vega per vol point', data.total.vega / 100, 'Value change for a 1-point move in implied vol'],
            ['Delta-equivalent notional', data.total.delta * S, 'Spot exposure in quote currency'],
          ].map(([label, v, hint]) => (
            <div key={label} className="glass" style={{ padding: '12px 16px', display: 'flex', alignItems: 'baseline', gap: 12 }} title={hint}>
              <span style={{ color: 'var(--text-dim)', fontSize: 12, flex: 1 }}>{label}</span>
              <span className="serial" style={{ fontSize: 16, color: 'var(--foil)' }}>{signed(v, Math.abs(v) >= 100 ? 2 : 5)}</span>
            </div>
          ))}
        </div>
      )}

      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 16 }}>
          <section className="glass" style={{ overflow: 'hidden' }} aria-label="Greeks by leg">
            <div className="term-header"><span className="term-header-title">Greeks by leg</span></div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>{['Leg', 'Delta', 'Gamma', 'Vega', 'Theta'].map((h, i) => <th key={h} style={{ textAlign: i ? 'right' : 'left' }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {data.legs.map((leg, i) => (
                    <tr key={i}>
                      <td style={{ color: 'var(--foil)', fontFamily: 'var(--font-mono)' }}>{leg.label}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{signed(leg.delta, 5)}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{signed(leg.gamma, 4)}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{signed(leg.vega, 4)}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{signed(leg.theta, 4)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ fontWeight: 600, color: 'var(--ink)' }}>Book</td>
                    {['delta', 'gamma', 'vega', 'theta'].map(k => (
                      <td key={k} className="mono" style={{ textAlign: 'right', color: 'var(--foil)', fontWeight: 500 }}>{signed(data.total[k], k === 'delta' ? 5 : 4)}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="glass" aria-label="Contribution by leg">
            <div className="term-header"><span className="term-header-title">Contribution by leg</span></div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Contribution legs={data.legs} field="delta" sym="Δ" />
              <Contribution legs={data.legs} field="gamma" sym="Γ" />
              <Contribution legs={data.legs} field="vega" sym="ν" />
              <Contribution legs={data.legs} field="theta" sym="Θ" />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Bars share one scale per Greek; left of the rule is negative. Rows follow the leg order in the book.
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
