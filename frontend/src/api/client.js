import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api'
const api = axios.create({ baseURL: BASE })

// Market
export const fetchMarket     = (ticker)         => api.get(`/market/${ticker}`).then(r=>r.data)
export const fetchIVSurface  = (ticker)         => api.get(`/market/iv-surface/${ticker}`).then(r=>r.data)

// Forex
export const fetchForexRates = ()               => api.get('/forex/rates').then(r=>r.data)
export const fetchForexRate  = (pair)           => api.get(`/forex/rate/${pair}`).then(r=>r.data)
export const fetchOHLC       = (pair,iv,period) => api.get(`/forex/ohlc/${pair}`,{params:{interval:iv,period}}).then(r=>r.data)
export const fetchSignals    = (pair)           => api.get(`/forex/signals/${pair}`).then(r=>r.data)
export const fetchPairs      = ()               => api.get('/forex/pairs').then(r=>r.data)

// Options analytics
export const fetchStrategies = ()               => api.get('/strategies').then(r=>r.data)
export const computeGreeks   = (p)             => api.post('/greeks', p).then(r=>r.data)
export const computeSurface  = (p)             => api.post('/surface', p).then(r=>r.data)
export const computeMonteCarlo = (p)           => api.post('/montecarlo', p).then(r=>r.data)
export const computeScenarios  = (p)           => api.post('/scenarios', p).then(r=>r.data)
export const exportCSV         = (p)           => api.post('/export/csv', p, {responseType:'blob'}).then(r=>r.data)

// Institutional flow
export const fetchInstitutional = (pair, weeks) =>
  api.get(`/institutional/${pair}`, { params: { weeks } }).then(r => r.data)

// Economic calendar (Forex Factory)
export const fetchCalendar = () =>
  api.get('/news/calendar').then(r => r.data)
