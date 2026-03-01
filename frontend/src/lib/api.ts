import axios from 'axios'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1'

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT to every request
api.interceptors.request.use(config => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token')
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Auto-refresh on 401
api.interceptors.response.use(
  r => r,
  async error => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      const refreshToken = localStorage.getItem('refresh_token')
      if (refreshToken) {
        try {
          const res = await axios.post(`${BASE_URL}/auth/refresh`, { refresh_token: refreshToken })
          localStorage.setItem('access_token', res.data.tokens.access_token)
          localStorage.setItem('refresh_token', res.data.tokens.refresh_token)
          error.config.headers.Authorization = `Bearer ${res.data.tokens.access_token}`
          return api.request(error.config)
        } catch {
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(error)
  }
)

// ── AUTH ────────────────────────────────────────────────

export const authAPI = {
  register: (email: string, password: string, fullName: string) =>
    api.post('/auth/register', { email, password, full_name: fullName }),
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  refresh: (refreshToken: string) =>
    api.post('/auth/refresh', { refresh_token: refreshToken }),
  logout: (refreshToken: string) =>
    api.post('/auth/logout', { refresh_token: refreshToken }),
}

// ── USER ────────────────────────────────────────────────

export const userAPI = {
  me: () => api.get('/users/me'),
  update: (data: {
    full_name?: string
    phone_number?: string
    trading_experience?: string
    trading_style?: string
    avatar_color?: string
    onboarding_done?: boolean
  }) => api.patch('/users/me', data),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/users/change-password', { current_password: currentPassword, new_password: newPassword }),
}

// ── BROKERS ─────────────────────────────────────────────

export const brokerAPI = {
  list: () => api.get('/users/me/brokers'),
  connect: (brokerName: string) =>
    api.post('/users/me/brokers/connect', { broker_name: brokerName }),
  /** For token-based brokers (Dhan). Passes access_token directly — no OAuth redirect. */
  connectWithToken: (brokerName: string, accessToken: string) =>
    api.post('/users/me/brokers/connect', { broker_name: brokerName, access_token: accessToken }),
  callback: (brokerName: string, code: string, state: string) =>
    api.post('/users/me/brokers/callback', { broker_name: brokerName, code, state }),
  /** Callback with optional feed_token (AngelOne Publisher login returns this alongside auth_token). */
  callbackWithFeed: (brokerName: string, code: string, state: string, feedToken: string) =>
    api.post('/users/me/brokers/callback', { broker_name: brokerName, code, state, feed_token: feedToken }),
  disconnect: (id: string) => api.delete(`/users/me/brokers/${id}`),
  sync: (id: string) => api.post(`/users/me/brokers/${id}/sync`),
  syncAll: () => api.post('/users/me/brokers/sync-all'),
}

// ── TRADES ──────────────────────────────────────────────

export const tradesAPI = {
  ingestCSV: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/trades/ingest/csv', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  list: (params?: {
    start_date?: string
    end_date?: string
    segment?: string
    page?: number
    limit?: number
  }) => api.get('/trades', { params }),
  get: (id: string) => api.get(`/trades/${id}`),
}

// ── ANALYTICS ───────────────────────────────────────────

export const analyticsAPI = {
  insights: (range: string, forceRefresh = false) =>
    api.get('/analytics/insights', { params: { range, force_refresh: forceRefresh } }),
  equityCurve: (range: string) =>
    api.get('/analytics/equity-curve', { params: { range } }),
  heatmap: (range: string, dimension: 'hour' | 'day' | 'instrument' = 'hour') =>
    api.get('/analytics/heatmap', { params: { range, dimension } }),
  demo: () => api.get('/demo/analytics'),
}

// ── JOURNAL ─────────────────────────────────────────────

export const journalAPI = {
  list: (params?: {
    start_date?: string
    end_date?: string
    emotion?: string
    setup_rating?: string
    page?: number
  }) => api.get('/journal', { params }),
  create: (entry: object) => api.post('/journal', entry),
  update: (id: string, entry: object) => api.patch(`/journal/${id}`, entry),
  delete: (id: string) => api.delete(`/journal/${id}`),
}

// ── NOTIFICATIONS ────────────────────────────────────────

export const notificationsAPI = {
  list: (unreadOnly = false) =>
    api.get('/notifications', { params: { unread_only: unreadOnly } }),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/mark-all-read'),
  delete: (id: string) => api.delete(`/notifications/${id}`),
}

// ── REPORTS ─────────────────────────────────────────────

export const reportsAPI = {
  weekly: (weekStart?: string) =>
    api.get('/reports/weekly', { params: { week_start: weekStart } }),
  list: () => api.get('/reports/weekly/list'),
  generate: (weekStart: string) =>
    api.post('/reports/weekly/generate', { week_start: weekStart }),
}

// ── MARKET ──────────────────────────────────────────────
// Market endpoints are public (no auth required)
const MARKET_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1').replace('/api/v1', '')
const marketApi = axios.create({ baseURL: MARKET_BASE + '/api/v1/market' })

export const marketAPI = {
  indices: () => marketApi.get('/indices'),
  vix: () => marketApi.get('/vix'),
  optionChain: (symbol = 'NIFTY', expiry?: string) =>
    marketApi.get('/option-chain', { params: { symbol, expiry } }),
  fiiDii: () => marketApi.get('/fii-dii'),
  gainersLosers: (index?: string) =>
    marketApi.get('/gainers-losers', { params: { index } }),
  maxPain: (symbol: string, expiry: string) =>
    marketApi.get('/max-pain', { params: { symbol, expiry } }),
}

export default api
