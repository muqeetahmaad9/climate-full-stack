import type { AuthTokens, SummaryResponse, ClimateResponse, District } from './types'

// Empty BASE → relative URLs → Next.js rewrite proxy forwards to backend
// Works identically in dev (localhost:3000→:8000) and Docker (frontend→backend)
const BASE = ''

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('access_token')
}

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, { ...options, headers })

  if (res.status === 401) {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? res.statusText)
  }

  return res.json()
}

// ── Auth ─────────────────────────────────────────────────────────
export const authApi = {
  register: (username: string, email: string, password: string) =>
    req<{ message: string; user: AuthTokens['user'] }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    }),

  login: (email: string, password: string) =>
    req<AuthTokens>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: () => req<AuthTokens['user']>('/api/auth/me'),

  logout: () =>
    req<{ message: string }>('/api/auth/logout', { method: 'POST' }),
}

// ── Weather ──────────────────────────────────────────────────────
export const weatherApi = {
  districts: () => req<District[]>('/api/weather/districts'),

  summary: (lat: number, lon: number, from?: string, to?: string) =>
    req<SummaryResponse>(
      `/api/weather/summary?lat=${lat}&lon=${lon}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`
    ),

  climate: (lat: number, lon: number, from: string, to: string) =>
    req<ClimateResponse>(
      `/api/weather/climate?lat=${lat}&lon=${lon}&from=${from}&to=${to}`
    ),

  stats: (lat: number, lon: number, year?: number) =>
    req<object[]>(
      `/api/weather/stats?lat=${lat}&lon=${lon}${year ? `&year=${year}` : ''}`
    ),

  search: (q: string) =>
    req<District[]>(`/api/weather/search?q=${encodeURIComponent(q)}`),
}

// ── Tehsil ───────────────────────────────────────────────────────
export const tehsilApi = {
  list: () => req<object[]>('/api/tehsil/list'),

  summary: (lat: number, lon: number) =>
    req<object>(`/api/tehsil/summary?lat=${lat}&lon=${lon}`),

  climate: (lat: number, lon: number, from: string, to: string) =>
    req<ClimateResponse>(
      `/api/tehsil/climate?lat=${lat}&lon=${lon}&from=${from}&to=${to}`
    ),

  search: (q: string) =>
    req<object[]>(`/api/tehsil/search?q=${encodeURIComponent(q)}`),
}
