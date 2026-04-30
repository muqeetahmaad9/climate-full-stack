export interface User {
  id: string
  username: string
  email: string
  role: string
  created_at: string
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  token_type: string
  user: User
}

export interface Location {
  name: string
  province: string
  district: string
  lat: number
  lon: number
}

export interface YearlyData {
  years: number[]
  T2M: number[]
  T2M_MAX: number[]
  T2M_MIN: number[]
  T2M_MAX_PEAK: number[]
  T2M_MIN_PEAK: number[]
  PREC: number[]
  WS2M: number[]
  RH2M: number[]
  SOLAR: number[]
}

export interface NormalsData {
  months: number[]
  T2M: number[]
  T2M_MAX: number[]
  T2M_MIN: number[]
  PREC: number[]
  WS2M: number[]
  RH2M: number[]
  SOLAR: number[]
}

export interface DailyData {
  dates: string[]
  T2M: number[]
  T2M_MAX: number[]
  T2M_MIN: number[]
  PREC: number[]
  WS2M: number[]
  RH2M: number[]
  SOLAR: number[]
  EVAP: number[]
  PRES: number[]
  SPHU: number[]
  SNOW: number[]
  WMAX: number[]
  WDIR: number[]
}

export interface SummaryResponse {
  district: string
  province: string
  yearly: YearlyData
  normals: NormalsData
}

export interface ClimateResponse {
  data: DailyData
}

export interface District {
  district: string
  province: string
  latitude: number
  longitude: number
}
