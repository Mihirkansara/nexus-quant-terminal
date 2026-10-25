// Guilloche geometry for the Book Seal and the entry-surface seals.
const N = 540 // fixed sample count so `d` can interpolate between books
const clamp = (x, a, b) => Math.min(b, Math.max(a, x))

function rose(radius, terms, phase = 0) {
  let d = ''
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI * 2
    let r = radius
    for (const [amp, freq, ph] of terms) r += amp * Math.cos(freq * t + ph + phase)
    const x = r * Math.cos(t), y = r * Math.sin(t)
    d += (i ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2)
  }
  return d + 'Z'
}

// Maps the book's Greeks to guilloche geometry:
//   |Δ| per unit → petal count, Γ (per 1% move) → petal depth and harmonic,
//   vega → strand phase spacing and outer band amplitude.
export function sealGeometry({ delta = 0, gamma = 0, vega = 0, units = 1 }, S = 1, T = 0.25) {
  const u = Math.max(1, units)
  const dn = clamp(delta / u, -1, 1)
  const gn = clamp((gamma * S * 0.01 / u) * 12, -1, 1)
  const vn = clamp(vega / (Math.max(S, 1e-9) * Math.sqrt(Math.max(T, 0.01)) * 0.4 * u), -1, 1)
  const k = 8 + Math.round(Math.abs(dn) * 8)
  const m = gn >= 0 ? 3 * k : 2 * k + 1
  const a = 5.2 + 3.6 * Math.abs(gn)
  const b = 1.8 + 1.6 * Math.abs(vn)
  const spread = (Math.PI / k) * (0.35 + 0.4 * Math.abs(vn))

  const strands = [0, 1, 2, 3].map(i =>
    rose(30, [[a, k, 0], [b * Math.sign(gn || 1), m, -i * spread]], i * spread))
  const band = [0, 1, 2].map(i => rose(42.5, [[1.3 + 0.9 * Math.abs(vn), 4 * k, 0]], i * (Math.PI / (4 * k)) * 0.66))
  const core = [0, 1].map(i => rose(12, [[2.4 + 1.6 * Math.abs(dn), k, 0]], i * Math.PI / k))
  return { strands, band, core }
}
