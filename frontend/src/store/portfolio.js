import { create } from 'zustand'

// Default interest rates per pair (r_d = domestic/quote, r_f = foreign/base).
// Metals: r_f is the bullion lease rate. Crypto: r_f≈0, 24/7 so vols use 365 days.
// sigma = typical ATM vol loaded on pair switch; strikeStep ≈ 1% of spot for templates.
export const PAIR_META = {
  EURUSD: { r_d:0.0525, r_f:0.0400, pip:0.0001, defaultS:1.0850 },
  GBPUSD: { r_d:0.0525, r_f:0.0525, pip:0.0001, defaultS:1.2700 },
  USDJPY: { r_d:0.0010, r_f:0.0525, pip:0.01,   defaultS:155.00 },
  USDCHF: { r_d:0.0175, r_f:0.0525, pip:0.0001, defaultS:0.9050 },
  AUDUSD: { r_d:0.0525, r_f:0.0435, pip:0.0001, defaultS:0.6550 },
  USDCAD: { r_d:0.0500, r_f:0.0525, pip:0.0001, defaultS:1.3650 },
  NZDUSD: { r_d:0.0525, r_f:0.0550, pip:0.0001, defaultS:0.6100 },
  EURJPY: { r_d:0.0010, r_f:0.0400, pip:0.01,   defaultS:168.00 },
  GBPJPY: { r_d:0.0010, r_f:0.0525, pip:0.01,   defaultS:197.00 },
  EURGBP: { r_d:0.0525, r_f:0.0400, pip:0.0001, defaultS:0.8550 },
  XAUUSD: { r_d:0.0525, r_f:0.0000, pip:0.01,   defaultS:4400.0, sigma:0.22, strikeStep:40,  dp:2, assetClass:'metal'  },
  XAGUSD: { r_d:0.0390, r_f:0.0200, pip:0.001,  defaultS:64.50,  sigma:0.40, strikeStep:0.6, dp:3, assetClass:'metal'  },
  BTCUSD: { r_d:0.0390, r_f:0.0000, pip:1,      defaultS:83000,  sigma:0.40, strikeStep:800, dp:0, assetClass:'crypto' },
  ETHUSD: { r_d:0.0390, r_f:0.0000, pip:0.1,    defaultS:2650,   sigma:0.60, strikeStep:25,  dp:1, assetClass:'crypto' },
}

export const isCrypto = (pair) => PAIR_META[pair]?.assetClass === 'crypto'
const strikeStep = (pair) => PAIR_META[pair]?.strikeStep ?? (PAIR_META[pair]?.pip ?? 0.0001) * 100

const DEFAULT_PAIR = 'EURUSD'
const meta = PAIR_META[DEFAULT_PAIR]

const DEFAULT_LEGS = [
  { id:1, type:'call', K:1.09, T:0.25, qty: 1 },
  { id:2, type:'put',  K:1.08, T:0.25, qty:-1 },
]

export const usePortfolioStore = create((set, get) => ({
  pair:   DEFAULT_PAIR,
  S:      meta.defaultS,
  sigma:  0.07,
  T:      0.25,
  r_d:    meta.r_d,
  r_f:    meta.r_f,

  legs:   DEFAULT_LEGS,
  nextId: 3,

  // Vol quotes (ATM / 25Δ RR / 25Δ BF, in vol points) handed from Vol Lab to Vol Smile.
  smileQuotes: null,
  setSmileQuotes: (smileQuotes) => set({ smileQuotes }),
  // Jump parameters (intensity /yr, mean %, sd %) handed from Jump Lab to Hedge Lab.
  hedgeJump: null,
  setHedgeJump: (hedgeJump) => set({ hedgeJump }),

  setPair: (pair) => {
    const m = PAIR_META[pair] || meta
    // Keep each leg's moneyness (K/S) so strikes stay meaningful across very different price levels.
    set(s => ({
      pair, S: m.defaultS, r_d: m.r_d, r_f: m.r_f, sigma: m.sigma ?? s.sigma, smileQuotes: null, hedgeJump: null,
      legs: s.legs.map(l => ({ ...l, K: +(l.K / s.S * m.defaultS).toPrecision(6) })),
    }))
  },
  setS:     (S)     => set({ S: parseFloat(S) }),
  setSigma: (sigma) => set({ sigma: parseFloat(sigma) }),
  setT:     (T)     => set({ T: parseFloat(T) }),
  setRd:    (r_d)   => set({ r_d: parseFloat(r_d) }),
  setRf:    (r_f)   => set({ r_f: parseFloat(r_f) }),

  addLeg: () => set(s => ({
    legs: [...s.legs, { id:s.nextId, type:'call', K:parseFloat(s.S.toFixed(4)), T:s.T, qty:1 }],
    nextId: s.nextId + 1,
  })),
  removeLeg: (id) => set(s => ({ legs: s.legs.filter(l => l.id !== id) })),
  updateLeg: (id, field, value) => set(s => ({
    legs: s.legs.map(l => l.id === id ? { ...l, [field]: value } : l),
  })),

  loadStrategy: (strategy) => set(s => ({
    legs: strategy.legs.map((leg, i) => ({
      id: i+1, type: leg.type,
      K: parseFloat((s.S + (leg.K_offset || 0) * strikeStep(s.pair)).toFixed(5)),
      T: s.T, qty: leg.qty,
    })),
    nextId: strategy.legs.length + 1,
  })),

  toShareURL: () => {
    const s = get()
    const params = new URLSearchParams({
      pair: s.pair, S: s.S, sigma: s.sigma, T: s.T, r_d: s.r_d, r_f: s.r_f,
      legs: JSON.stringify(s.legs.map(({ type,K,T,qty }) => ({ type,K,T,qty }))),
    })
    return `${window.location.origin}?${params}`
  },

  fromURL: () => {
    const p = new URLSearchParams(window.location.search)
    if (!p.has('legs')) return
    try {
      const pair  = p.get('pair') || DEFAULT_PAIR
      const legs  = JSON.parse(p.get('legs')).map((l,i) => ({ ...l, id:i+1 }))
      set({
        pair, S: parseFloat(p.get('S') || PAIR_META[pair]?.defaultS || 1.0850),
        sigma: parseFloat(p.get('sigma') || 0.07),
        T:     parseFloat(p.get('T') || 0.25),
        r_d:   parseFloat(p.get('r_d') || PAIR_META[pair]?.r_d || 0.0525),
        r_f:   parseFloat(p.get('r_f') || PAIR_META[pair]?.r_f || 0.04),
        legs, nextId: legs.length + 1,
      })
    } catch {}
  },
}))
