// Garman-Kohlhagen (1983) — mirrors backend/app/core/garman_kohlhagen.py so the book
// panel and the Book Seal agree with the Greeks desk. Vega is per 1.00 of vol and
// theta per year, as on the backend; callers rescale for display.

const SQRT2PI = Math.sqrt(2 * Math.PI)
const pdf = (x) => Math.exp(-0.5 * x * x) / SQRT2PI

// Abramowitz-Stegun 26.2.17, |error| < 7.5e-8
function cdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  const p = 1 - pdf(x) * poly
  return x >= 0 ? p : 1 - p
}

export function gkLeg({ type, K, T, qty }, S, sigma, r_d, r_f) {
  if (!(S > 0 && K > 0 && T > 0 && sigma > 0)) return null
  const sT = Math.sqrt(T)
  const d1 = (Math.log(S / K) + (r_d - r_f + 0.5 * sigma * sigma) * T) / (sigma * sT)
  const d2 = d1 - sigma * sT
  const df = Math.exp(-r_f * T), dd = Math.exp(-r_d * T)
  const call = type === 'call'
  const price = call ? S * df * cdf(d1) - K * dd * cdf(d2) : K * dd * cdf(-d2) - S * df * cdf(-d1)
  const delta = call ? df * cdf(d1) : -df * cdf(-d1)
  const gamma = df * pdf(d1) / (S * sigma * sT)
  const vega = S * df * pdf(d1) * sT
  const decay = -(S * sigma * df * pdf(d1)) / (2 * sT)
  const theta = call
    ? decay - r_d * K * dd * cdf(d2) + r_f * S * df * cdf(d1)
    : decay + r_d * K * dd * cdf(-d2) - r_f * S * df * cdf(-d1)
  return { price: price * qty, delta: delta * qty, gamma: gamma * qty, vega: vega * qty, theta: theta * qty }
}

export function bookGreeks(legs, S, sigma, r_d, r_f, Tdefault) {
  const tot = { price: 0, delta: 0, gamma: 0, vega: 0, theta: 0, units: 0 }
  for (const leg of legs) {
    const qty = Number(leg.qty) || 0
    const g = gkLeg({ ...leg, qty, K: Number(leg.K), T: Number(leg.T) || Tdefault }, S, sigma, r_d, r_f)
    if (!g) continue
    tot.price += g.price; tot.delta += g.delta; tot.gamma += g.gamma
    tot.vega += g.vega; tot.theta += g.theta; tot.units += Math.abs(qty)
  }
  return tot
}
