'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import type { Location, SummaryResponse, DailyData } from '@/lib/types'
import { weatherApi } from '@/lib/api'
import {
  YearlyTempChart, YearlyRainChart, YearlyWindChart,
  MonthlyChart,
  CompareDualLine, CompareDualBar,
  DailyTempChart, DailyBarChart,
} from '@/components/charts/ClimateCharts'

interface Props { location: Location | null; open?: boolean }

const PERIODS = [
  { label: '1995–2000', from: '1995-01-01', to: '2000-12-31' },
  { label: '2001–2010', from: '2001-01-01', to: '2010-12-31' },
  { label: '2011–2020', from: '2011-01-01', to: '2020-12-31' },
  { label: '2021–2025', from: '2021-01-01', to: '2025-12-31' },
  { label: '⚡ 30yr All', from: '1995-01-01', to: '2025-12-31' },
]

const TABS = ['Climate', 'Yearly', 'Monthly', 'Compare', 'Explorer', 'Export']
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── CountUp ──────────────────────────────────────────────────
function CountUp({ to, decimals = 1, suffix = '', duration = 650 }: {
  to: number; decimals?: number; suffix?: string; duration?: number
}) {
  const [val, setVal] = useState(0)
  const rafRef = useRef<number>(0)
  useEffect(() => {
    let start: number | null = null
    const animate = (ts: number) => {
      if (!start) start = ts
      const p = Math.min((ts - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(to * eased)
      if (p < 1) rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [to, duration])
  return <>{val.toFixed(decimals)}{suffix}</>
}

// ── TrendBadge ────────────────────────────────────────────────
function TrendBadge({ delta, decimals = 1 }: { delta: number; decimals?: number }) {
  if (Math.abs(delta) < 0.05) return null
  const up = delta > 0
  return (
    <span style={{
      fontSize: '.52rem', fontWeight: 700, lineHeight: 1,
      color: up ? '#f87171' : '#60a5fa',
      display: 'inline-flex', alignItems: 'center', marginLeft: 2,
    }}>
      {up ? '↑' : '↓'}{Math.abs(delta).toFixed(decimals)}
    </span>
  )
}

// ── TempHeatmap ───────────────────────────────────────────────
function TempHeatmap({ daily, year }: { daily: DailyData; year: number }) {
  const [hovered, setHovered] = useState<string | null>(null)
  const yearData = useMemo(() => {
    const jan1dow = new Date(year, 0, 1).getDay()
    return daily.dates.reduce<Array<{ date: string; dow: number; week: number; temp: number }>>((acc, d, i) => {
      if (d.slice(0, 4) !== String(year)) return acc
      const m  = parseInt(d.slice(4, 6)) - 1
      const dy = parseInt(d.slice(6, 8))
      const dt = new Date(year, m, dy)
      const doy = Math.round((dt.getTime() - new Date(year, 0, 0).getTime()) / 86400000)
      acc.push({ date: d, dow: dt.getDay(), week: Math.floor((doy + jan1dow - 1) / 7), temp: daily.T2M[i] })
      return acc
    }, [])
  }, [daily, year])

  if (!yearData.length) return null
  const temps = yearData.map(d => d.temp)
  const minT = Math.min(...temps), maxT = Math.max(...temps)
  const weeks = Math.max(...yearData.map(d => d.week)) + 1
  const CELL = 5, GAP = 1

  function color(t: number) {
    const n = (t - minT) / (maxT - minT || 1)
    if (n < 0.5) {
      const f = n * 2
      return `rgb(${Math.round(60 + f * 195)},${Math.round(130 + f * 125)},${Math.round(246 + f * 9)})`
    }
    const f = (n - 0.5) * 2
    return `rgb(${Math.round(255 - f * 16)},${Math.round(255 - f * 187)},${Math.round(255 - f * 187)})`
  }

  const hov = hovered ? yearData.find(d => d.date === hovered) : null

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <svg width={weeks * (CELL + GAP)} height={7 * (CELL + GAP)} style={{ display: 'block' }}>
          {yearData.map(({ date, dow, week, temp }) => (
            <rect key={date}
              x={week * (CELL + GAP)} y={dow * (CELL + GAP)}
              width={CELL} height={CELL} rx={1}
              fill={color(temp)}
              onMouseEnter={() => setHovered(date)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
        </svg>
      </div>
      <div style={{ minHeight: 14, fontSize: '.6rem', color: 'var(--txt2)', marginTop: 3 }}>
        {hov ? `${hov.date.slice(0,4)}-${hov.date.slice(4,6)}-${hov.date.slice(6,8)}: ${hov.temp.toFixed(1)}°C` : ' '}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
        <span style={{ fontSize: '.58rem', color: 'var(--txt3)' }}>{minT.toFixed(0)}°</span>
        <div style={{ flex: 1, height: 3, background: 'linear-gradient(to right, #3c82f6, #fff, #ef4444)', borderRadius: 2 }} />
        <span style={{ fontSize: '.58rem', color: 'var(--txt3)' }}>{maxT.toFixed(0)}°</span>
      </div>
    </div>
  )
}

// ── SkeletonKpi ───────────────────────────────────────────────
function SkeletonKpiRow() {
  return (
    <div className="kpi-row">
      {[1,2,3,4,5].map(i => (
        <div key={i} className="kpi">
          <div className="skel" style={{ height: 20, width: '65%', marginBottom: 6 }} />
          <div className="skel" style={{ height: 9, width: '80%' }} />
        </div>
      ))}
    </div>
  )
}

function SkeletonCharts() {
  return (
    <>
      {[0,1,2].map(i => (
        <div key={i} className="ysec" style={{ animationDelay: `${i * 80}ms` }}>
          <div className="skel" style={{ height: 11, width: '38%', marginBottom: 10 }} />
          <div className="skel" style={{ height: 140, width: '100%' }} />
        </div>
      ))}
    </>
  )
}

// ── Data helpers ─────────────────────────────────────────────

function getIndices(dates: string[], year?: number, month?: number): number[] {
  return dates.reduce<number[]>((acc, d, i) => {
    if (year  !== undefined && parseInt(d.slice(0, 4)) !== year)  return acc
    if (month !== undefined && parseInt(d.slice(4, 6)) !== month) return acc
    acc.push(i)
    return acc
  }, [])
}

function avgOf(arr: number[], idx: number[]): number {
  if (!idx.length) return 0
  return idx.reduce((s, i) => s + arr[i], 0) / idx.length
}

function sumOf(arr: number[], idx: number[]): number {
  return idx.reduce((s, i) => s + arr[i], 0)
}

interface MonthlyRow { month: number; T2M: number; T2M_MAX: number; T2M_MIN: number; PREC: number; WS2M: number }

function monthlyForYear(daily: DailyData, year: number): MonthlyRow[] {
  return [1,2,3,4,5,6,7,8,9,10,11,12].map(month => {
    const idx = getIndices(daily.dates, year, month)
    return {
      month,
      T2M:     parseFloat(avgOf(daily.T2M,     idx).toFixed(1)),
      T2M_MAX: parseFloat(avgOf(daily.T2M_MAX, idx).toFixed(1)),
      T2M_MIN: parseFloat(avgOf(daily.T2M_MIN, idx).toFixed(1)),
      PREC:    parseFloat(sumOf(daily.PREC,    idx).toFixed(1)),
      WS2M:    parseFloat(avgOf(daily.WS2M,    idx).toFixed(1)),
    }
  })
}

// ── Export helpers ───────────────────────────────────────────

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}

function exportDailyCSV(daily: DailyData, slug: string) {
  const hdr  = 'date,T2M,T2M_MAX,T2M_MIN,PREC,WS2M,RH2M,SOLAR,EVAP,PRES,SPHU,SNOW,WMAX,WDIR'
  const rows = daily.dates.map((d, i) =>
    [d, daily.T2M[i], daily.T2M_MAX[i], daily.T2M_MIN[i], daily.PREC[i],
     daily.WS2M[i], daily.RH2M[i], daily.SOLAR[i], daily.EVAP[i],
     daily.PRES[i], daily.SPHU[i], daily.SNOW[i], daily.WMAX[i], daily.WDIR[i]].join(',')
  )
  downloadBlob(`${slug}_daily.csv`, [hdr, ...rows].join('\n'), 'text/csv')
}

function exportYearlyCSV(s: SummaryResponse, slug: string) {
  const hdr  = 'year,T2M,T2M_MAX,T2M_MIN,T2M_MAX_PEAK,T2M_MIN_PEAK,PREC,WS2M,RH2M,SOLAR'
  const rows = s.yearly.years.map((y, i) =>
    [y, s.yearly.T2M[i], s.yearly.T2M_MAX[i], s.yearly.T2M_MIN[i],
     s.yearly.T2M_MAX_PEAK[i], s.yearly.T2M_MIN_PEAK[i],
     s.yearly.PREC[i], s.yearly.WS2M[i], s.yearly.RH2M[i], s.yearly.SOLAR[i]].join(',')
  )
  downloadBlob(`${slug}_yearly.csv`, [hdr, ...rows].join('\n'), 'text/csv')
}

function exportNormalsCSV(s: SummaryResponse, slug: string) {
  const hdr  = 'month,T2M,T2M_MAX,T2M_MIN,PREC,WS2M,RH2M,SOLAR'
  const rows = s.normals.months.map((m, i) =>
    [m, s.normals.T2M[i], s.normals.T2M_MAX[i], s.normals.T2M_MIN[i],
     s.normals.PREC[i], s.normals.WS2M[i], s.normals.RH2M[i], s.normals.SOLAR[i]].join(',')
  )
  downloadBlob(`${slug}_normals.csv`, [hdr, ...rows].join('\n'), 'text/csv')
}

// ── Cache helpers ────────────────────────────────────────────

interface CacheEntry { name: string; lat: number; lon: number; ts: number }

function readCache(): CacheEntry[] {
  try { return JSON.parse(localStorage.getItem('pakclim_cache') || '[]') } catch { return [] }
}

function pushCache(entry: CacheEntry) {
  const list = [entry, ...readCache().filter(e => e.name !== entry.name)].slice(0, 10)
  localStorage.setItem('pakclim_cache', JSON.stringify(list))
}

// ── Component ────────────────────────────────────────────────

export default function SidePanel({ location, open = true }: Props) {
  const [tab, setTab]               = useState('Climate')
  const [from, setFrom]             = useState('1995-01-01')
  const [to, setTo]                 = useState('2025-12-31')
  const [summary, setSummary]       = useState<SummaryResponse | null>(null)
  const [daily, setDaily]           = useState<DailyData | null>(null)
  const [loading, setLoading]       = useState(false)
  const [loadingDaily, setLoadingDaily] = useState(false)
  const [error, setError]           = useState('')
  const [dailyError, setDailyError] = useState('')
  const [progress, setProgress]     = useState(0)

  // Reset to Climate tab whenever a new district is selected
  useEffect(() => { if (location) setTab('Climate') }, [location])

  // Yearly tab state
  const [selYear, setSelYear] = useState<number | null>(null)

  // Chart control state (reset keys force re-mount → replay animation; band/avg toggles)
  const [tempKey,  setTempKey]  = useState(0)
  const [rainKey,  setRainKey]  = useState(0)
  const [windKey,  setWindKey]  = useState(0)
  const [showBand, setShowBand] = useState(false)
  const [showAvg,  setShowAvg]  = useState(false)

  // Compare state
  const [cmpYearA, setCmpYearA] = useState(1995)
  const [cmpYearB, setCmpYearB] = useState(2024)
  const [cmpMonth, setCmpMonth] = useState<number | null>(null)
  const [showCmp, setShowCmp]   = useState(false)

  // Explorer state
  const [exYear,  setExYear]  = useState<number | null>(null)
  const [exMonth, setExMonth] = useState<number | null>(null)

  // Export tab cache
  const [cacheList, setCacheList] = useState<CacheEntry[]>([])

  useEffect(() => {
    if (tab === 'Export') setCacheList(readCache())
  }, [tab])

  async function fetchData() {
    if (!location) return
    setLoading(true)
    setError('')
    setDailyError('')
    setDaily(null)
    setProgress(20)

    // ── Phase 1: summary (fast, pre-aggregated) ───────────────
    const summaryOk = await (async () => {
      try {
        setProgress(40)
        const sumData = await weatherApi.summary(location.lat, location.lon, from, to)
        setSummary(sumData)
        if (sumData.yearly.years.length >= 2) {
          const yrs = sumData.yearly.years
          setCmpYearA(yrs[0])
          setCmpYearB(yrs[yrs.length - 1])
        }
        setSelYear(null); setExYear(null); setExMonth(null)
        setCmpMonth(null); setShowCmp(false)
        setProgress(80)
        setTab('Yearly')
        pushCache({ name: location.name, lat: location.lat, lon: location.lon, ts: Date.now() })
        return true
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load summary data')
        return false
      }
    })()

    setProgress(100)
    setLoading(false)
    setTimeout(() => setProgress(0), 600)
    if (!summaryOk) return

    // ── Phase 2: daily data (large, background) ───────────────
    setLoadingDaily(true)
    try {
      const climData = await weatherApi.climate(location.lat, location.lon, from, to)
      setDaily(climData.data)
    } catch (e) {
      setDailyError(e instanceof Error ? e.message : 'Failed to load daily data')
    } finally {
      setLoadingDaily(false)
    }
  }

  // ── Derived data ─────────────────────────────────────────

  const cmpDataA = useMemo(() => daily ? monthlyForYear(daily, cmpYearA) : null, [daily, cmpYearA])
  const cmpDataB = useMemo(() => daily ? monthlyForYear(daily, cmpYearB) : null, [daily, cmpYearB])

  const cmpDailyA = useMemo(() => {
    if (!daily || !cmpMonth) return null
    const idx = getIndices(daily.dates, cmpYearA, cmpMonth)
    return { dates: idx.map(i => daily.dates[i]), T2M: idx.map(i => daily.T2M[i]), PREC: idx.map(i => daily.PREC[i]) }
  }, [daily, cmpYearA, cmpMonth])

  const cmpDailyB = useMemo(() => {
    if (!daily || !cmpMonth) return null
    const idx = getIndices(daily.dates, cmpYearB, cmpMonth)
    return { dates: idx.map(i => daily.dates[i]), T2M: idx.map(i => daily.T2M[i]), PREC: idx.map(i => daily.PREC[i]) }
  }, [daily, cmpYearB, cmpMonth])

  const exMonthly = useMemo(() => daily && exYear ? monthlyForYear(daily, exYear) : null, [daily, exYear])

  const exDaily = useMemo(() => {
    if (!daily || !exYear || !exMonth) return null
    const idx = getIndices(daily.dates, exYear, exMonth)
    return {
      dates:   idx.map(i => daily.dates[i]),
      T2M:     idx.map(i => daily.T2M[i]),
      T2M_MAX: idx.map(i => daily.T2M_MAX[i]),
      T2M_MIN: idx.map(i => daily.T2M_MIN[i]),
      PREC:    idx.map(i => daily.PREC[i]),
      WS2M:    idx.map(i => daily.WS2M[i]),
      RH2M:    idx.map(i => daily.RH2M[i]),
    }
  }, [daily, exYear, exMonth])

  const locSlug = location ? location.name.replace(/\s+/g, '_') : 'location'

  // Trend: last-5yr avg vs prev-5yr avg for each KPI
  const kpiTrends = useMemo(() => {
    if (!summary || summary.yearly.years.length < 6) return null
    const n = summary.yearly.years.length
    const avg = (arr: number[], s: number, e: number) =>
      arr.slice(s, e).reduce((a, b) => a + b, 0) / (e - s)
    const l5s = n - 5, p5s = Math.max(0, n - 10), p5e = n - 5
    return {
      max:  avg(summary.yearly.T2M_MAX, l5s, n) - avg(summary.yearly.T2M_MAX, p5s, p5e),
      min:  avg(summary.yearly.T2M_MIN, l5s, n) - avg(summary.yearly.T2M_MIN, p5s, p5e),
      temp: avg(summary.yearly.T2M,     l5s, n) - avg(summary.yearly.T2M,     p5s, p5e),
      rain: avg(summary.yearly.PREC,    l5s, n) - avg(summary.yearly.PREC,    p5s, p5e),
      wind: avg(summary.yearly.WS2M,    l5s, n) - avg(summary.yearly.WS2M,    p5s, p5e),
    }
  }, [summary])

  // Yearly KPI strip data — uses selYear or defaults to last year
  const ykIdx = summary
    ? (selYear != null ? summary.yearly.years.indexOf(selYear) : summary.yearly.years.length - 1)
    : -1
  const ykData = summary && ykIdx >= 0 ? {
    year: summary.yearly.years[ykIdx],
    max:  summary.yearly.T2M_MAX[ykIdx],
    min:  summary.yearly.T2M_MIN[ykIdx],
    avg:  summary.yearly.T2M[ykIdx],
    rain: summary.yearly.PREC[ykIdx],
    wind: summary.yearly.WS2M[ykIdx],
  } : null

  // ── Render ───────────────────────────────────────────────

  return (
    <div className={`side-panel${!open ? ' hidden' : ''}`}>

      {/* Tab bar — 2 rows × 3 */}
      <div className="stabs">
        <div className="stab-row">
          {TABS.slice(0, 3).map(t => (
            <button key={t} className={`stab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
        <div className="stab-row">
          {TABS.slice(3).map(t => (
            <button key={t} className={`stab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
      </div>

      {/* ────────── CLIMATE TAB ────────── */}
      {tab === 'Climate' && (
        <div className="tab-content active">
          {!location ? (
            <div className="welcome">
              <div className="welcome-icon">🗺️</div>
              <div className="welcome-title">Select a location on the map</div>
              <div className="welcome-sub">Click any district or settlement to load climate data for that location.</div>
              <div style={{ width: '100%', marginTop: 12 }}>
                <div className="step"><div className="sn">1</div><div className="st">Click a district or settlement dot on the map</div></div>
                <div className="step"><div className="sn">2</div><div className="st">Choose a date range or quick preset</div></div>
                <div className="step"><div className="sn">3</div><div className="st">Fetch 30 years of NASA climate data</div></div>
              </div>
            </div>
          ) : (
            <>
              <div className="loc-header">
                <div className="loc-name">{location.name}</div>
                <div className="loc-meta">
                  <span>{location.province.replace(/_/g, ' ')}</span>
                  {location.district && <span>· {location.district}</span>}
                </div>
                <div className="loc-coords">{location.lat.toFixed(4)}°N · {location.lon.toFixed(4)}°E</div>
              </div>

              <div className="period-section">
                <div className="sec-label">Select Period</div>
                <div className="period-row">
                  {PERIODS.map(p => (
                    <button key={p.label}
                      className={`pb${p.label.includes('30yr') ? ' highlight' : ''}${from === p.from && to === p.to ? ' active' : ''}`}
                      onClick={() => { setFrom(p.from); setTo(p.to) }}>{p.label}</button>
                  ))}
                </div>
                <div className="date-row"><label>From</label><input className="date-input" type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
                <div className="date-row"><label>To</label><input className="date-input" type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
                <button className="fetch-btn" onClick={fetchData} disabled={loading || loadingDaily}>
                  {loading
                    ? <span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}><span className="lwc-ring" style={{ width:14, height:14, borderWidth:2 }} />Fetching…</span>
                    : loadingDaily
                    ? <span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}><span className="lwc-ring" style={{ width:14, height:14, borderWidth:2 }} />Loading daily…</span>
                    : '⬇ Fetch Climate Data'}
                </button>
              </div>

              {loading && progress > 0 && (
                <div className="progress-wrap">
                  <div className="progress-label"><span>Loading summary…</span><span>{progress}%</span></div>
                  <div className="progress-bar"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
                </div>
              )}
              {loadingDaily && (
                <div className="progress-wrap">
                  <div className="progress-label" style={{ color: 'var(--txt3)', fontSize: '.7rem' }}>
                    <span>⏳ Loading 30yr daily data…</span>
                  </div>
                  <div className="progress-bar"><div className="progress-fill" style={{ width: '100%', animation: 'progress-pulse 1.5s ease-in-out infinite' }} /></div>
                </div>
              )}
              {error && <div className="auth-error" style={{ margin: '10px 14px' }}>{error}</div>}
              {dailyError && !loadingDaily && (
                <div className="auth-error" style={{ margin: '10px 14px', fontSize: '.75rem' }}>
                  ⚠ Daily data: {dailyError}
                </div>
              )}

              {loading ? <SkeletonKpiRow /> : summary && (
                <div className="kpi-row slide-in">
                  {[
                    { num: summary.yearly.T2M_MAX.at(-1) ?? 0, dec: 1, sfx: '°', lbl: 'Max Temp',  cls: 'hot',  trend: kpiTrends?.max  },
                    { num: summary.yearly.T2M_MIN.at(-1) ?? 0, dec: 1, sfx: '°', lbl: 'Min Temp',  cls: 'cold', trend: kpiTrends?.min  },
                    { num: summary.yearly.T2M.at(-1)     ?? 0, dec: 1, sfx: '°', lbl: 'Avg Temp',  cls: '',     trend: kpiTrends?.temp },
                    { num: summary.yearly.PREC.at(-1)    ?? 0, dec: 0, sfx: '',  lbl: 'Rain mm',   cls: 'rain', trend: kpiTrends?.rain },
                    { num: summary.yearly.WS2M.at(-1)    ?? 0, dec: 1, sfx: '',  lbl: 'Wind m/s',  cls: 'wind', trend: kpiTrends?.wind },
                  ].map(k => (
                    <div key={k.lbl} className={`kpi${k.cls ? ' ' + k.cls : ''}`}>
                      <div className="kpi-val">
                        <CountUp to={k.num} decimals={k.dec} suffix={k.sfx} />
                        {k.trend != null && <TrendBadge delta={k.trend} />}
                      </div>
                      <div className="kpi-lbl">{k.lbl}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ────────── YEARLY TAB ────────── */}
      {tab === 'Yearly' && (
        <div className="tab-content active" style={{ overflowY: 'auto' }}>
          {loading ? <SkeletonCharts /> : !summary ? (
            <div className="welcome">
              <div className="welcome-icon">📈</div>
              <div className="welcome-title">No data loaded</div>
              <div className="welcome-sub">Go to Climate tab and fetch data first.</div>
            </div>
          ) : (
            <>
              {/* Daily-data loading banner */}
              {loadingDaily && (
                <div style={{ padding: '6px 14px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', fontSize: '.7rem', color: 'var(--txt3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ animation: 'progress-pulse 1.2s ease-in-out infinite' }}>⏳</span>
                  <span>Loading 30yr daily data for Compare &amp; Explorer…</span>
                </div>
              )}

              {/* KPI strip */}
              <div className="yk-strip slide-in">
                <div className={`ykpi${!ykData || selYear == null ? ' active-yr' : ''}`}
                  onClick={() => setSelYear(null)}>
                  <div className="ykpi-val">{ykData?.year ?? '—'}</div>
                  <div className="ykpi-lbl">Year</div>
                </div>
                <div className="ykpi hot">
                  <div className="ykpi-val">{ykData ? <CountUp to={ykData.max} decimals={1} suffix="°" duration={500} /> : '—'}</div>
                  <div className="ykpi-lbl">Max</div>
                </div>
                <div className="ykpi cold">
                  <div className="ykpi-val">{ykData ? <CountUp to={ykData.min} decimals={1} suffix="°" duration={500} /> : '—'}</div>
                  <div className="ykpi-lbl">Min</div>
                </div>
                <div className="ykpi">
                  <div className="ykpi-val">{ykData ? <CountUp to={ykData.avg} decimals={1} suffix="°" duration={500} /> : '—'}</div>
                  <div className="ykpi-lbl">Avg °C</div>
                </div>
                <div className="ykpi rain">
                  <div className="ykpi-val">{ykData ? <CountUp to={ykData.rain} decimals={0} duration={500} /> : '—'}</div>
                  <div className="ykpi-lbl">Rain</div>
                </div>
                <div className="ykpi wind">
                  <div className="ykpi-val">{ykData ? <CountUp to={ykData.wind} decimals={1} duration={500} /> : '—'}</div>
                  <div className="ykpi-lbl">Wind</div>
                </div>
              </div>

              {/* Temperature chart */}
              <div className="ysec slide-in-1">
                <div className="ysec-hd">
                  <div className="ysec-hd-t">
                    <span className="ysec-dot" style={{ background: '#c0392b' }} />
                    <span className="sec-label" style={{ margin: 0, color: 'var(--txt2)' }}>Temperature (°C)</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <label style={{ fontSize: '.63rem', color: 'var(--txt3)', display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                      <input type="checkbox" checked={showBand} onChange={e => setShowBand(e.target.checked)} style={{ width: 11, height: 11 }} />
                      Range
                    </label>
                    <button className="yctrl" title="Replay animation" onClick={() => setTempKey(k => k + 1)}>↺</button>
                  </div>
                </div>
                <div className="chart-wrap">
                  <YearlyTempChart key={tempKey} years={summary.yearly.years} T2M={summary.yearly.T2M} T2M_MAX={summary.yearly.T2M_MAX} T2M_MIN={summary.yearly.T2M_MIN} showBand={showBand} />
                </div>
              </div>

              {/* Rainfall chart */}
              <div className="ysec slide-in-2">
                <div className="ysec-hd">
                  <div className="ysec-hd-t">
                    <span className="ysec-dot" style={{ background: '#06b6d4' }} />
                    <span className="sec-label" style={{ margin: 0, color: 'var(--txt2)' }}>Rainfall (mm)</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <label style={{ fontSize: '.63rem', color: 'var(--txt3)', display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                      <input type="checkbox" checked={showAvg} onChange={e => setShowAvg(e.target.checked)} style={{ width: 11, height: 11 }} />
                      Avg
                    </label>
                    <button className="yctrl" title="Replay animation" onClick={() => setRainKey(k => k + 1)}>↺</button>
                  </div>
                </div>
                <div className="chart-wrap">
                  <YearlyRainChart key={rainKey} years={summary.yearly.years} PREC={summary.yearly.PREC} showAvg={showAvg} />
                </div>
              </div>

              {/* Wind chart */}
              <div className="ysec slide-in-3">
                <div className="ysec-hd">
                  <div className="ysec-hd-t">
                    <span className="ysec-dot" style={{ background: '#8b1a1a' }} />
                    <span className="sec-label" style={{ margin: 0, color: 'var(--txt2)' }}>Wind Speed (m/s)</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="yctrl" title="Replay animation" onClick={() => setWindKey(k => k + 1)}>↺</button>
                  </div>
                </div>
                <div className="chart-wrap">
                  <YearlyWindChart key={windKey} years={summary.yearly.years} WS2M={summary.yearly.WS2M} />
                </div>
              </div>

              {/* Year click grid */}
              <div className="ysec slide-in-4">
                <div className="ysec-hd">
                  <div className="ysec-hd-t">
                    <span className="ysec-dot" style={{ background: '#f59e0b' }} />
                    <span className="sec-label" style={{ margin: 0, color: 'var(--txt2)' }}>Click a Year</span>
                  </div>
                </div>
                <div className="year-grid">
                  {summary.yearly.years.map(y => (
                    <button key={y}
                      className={`yg-btn${selYear === y ? ' active' : ''}`}
                      onClick={() => setSelYear(selYear === y ? null : y)}
                    >{y}</button>
                  ))}
                </div>
              </div>

              {/* Year-by-year table */}
              <div className="ysec" style={{ paddingBottom: 12 }}>
                <div className="ysec-hd">
                  <div className="ysec-hd-t">
                    <span className="ysec-dot" style={{ background: '#a78bfa' }} />
                    <span className="sec-label" style={{ margin: 0, color: 'var(--txt2)' }}>Year-by-Year Summary</span>
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.67rem' }}>
                    <thead>
                      <tr>{['Year','Avg °C','Max','Min','Rain','Wind'].map(h => (
                        <th key={h} style={{ padding: '4px 6px', color: 'var(--txt3)', borderBottom: '1px solid var(--border)', textAlign: h === 'Year' ? 'left' : 'right', letterSpacing: '.03em' }}>{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {summary.yearly.years.map((y, i) => (
                        <tr key={y}
                          style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: selYear === y ? 'var(--blue-light)' : undefined }}
                          onClick={() => setSelYear(selYear === y ? null : y)}
                        >
                          <td style={{ padding: '3px 6px', color: 'var(--blue)', fontWeight: 600 }}>{y}</td>
                          <td style={{ padding: '3px 6px', color: 'var(--txt2)',  textAlign: 'right' }}>{summary.yearly.T2M[i]?.toFixed(1)}</td>
                          <td style={{ padding: '3px 6px', color: '#f87171',      textAlign: 'right' }}>{summary.yearly.T2M_MAX[i]?.toFixed(1)}</td>
                          <td style={{ padding: '3px 6px', color: '#60a5fa',      textAlign: 'right' }}>{summary.yearly.T2M_MIN[i]?.toFixed(1)}</td>
                          <td style={{ padding: '3px 6px', color: '#34d399',      textAlign: 'right' }}>{summary.yearly.PREC[i]?.toFixed(0)}</td>
                          <td style={{ padding: '3px 6px', color: '#a78bfa',      textAlign: 'right' }}>{summary.yearly.WS2M[i]?.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ────────── MONTHLY TAB ────────── */}
      {tab === 'Monthly' && (
        <div className="tab-content active" style={{ overflowY: 'auto' }}>
          {!summary ? (
            <div className="welcome">
              <div className="welcome-icon">📅</div>
              <div className="welcome-title">No data loaded</div>
              <div className="welcome-sub">Go to Climate tab and fetch data first.</div>
            </div>
          ) : (
            <>
              {[
                { title: 'Mean Monthly Temperature', dot: '#f87171', el: <MonthlyChart months={summary.normals.months} values={summary.normals.T2M}  label="Temp °C"  color="#f87171" /> },
                { title: 'Mean Monthly Rainfall',    dot: '#38bdf8', el: <MonthlyChart months={summary.normals.months} values={summary.normals.PREC} label="Rain mm"  color="#38bdf8" type="bar" /> },
                { title: 'Mean Monthly Wind Speed',  dot: '#a78bfa', el: <MonthlyChart months={summary.normals.months} values={summary.normals.WS2M} label="Wind m/s" color="#a78bfa" /> },
              ].map((s, i) => (
                <div key={s.title} className={`msec slide-in-${i + 1}`}>
                  <div className="chart-title"><span className="chart-dot" style={{ background: s.dot }} />{s.title}</div>
                  <div className="chart-wrap">{s.el}</div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ────────── COMPARE TAB ────────── */}
      {tab === 'Compare' && (
        <div className="tab-content active" style={{ overflowY: 'auto' }}>
          {!summary ? (
            <div className="welcome">
              <div className="welcome-icon">⚖️</div>
              <div className="welcome-title">No data loaded</div>
              <div className="welcome-sub">Fetch climate data first to compare years.</div>
            </div>
          ) : loadingDaily ? (
            <div className="welcome">
              <div className="welcome-icon">⏳</div>
              <div className="welcome-title">Loading daily data…</div>
              <div className="welcome-sub">30-year daily records are loading. This tab will be ready shortly.</div>
            </div>
          ) : !daily ? (
            <div className="welcome">
              <div className="welcome-icon">⚠️</div>
              <div className="welcome-title">Daily data unavailable</div>
              <div className="welcome-sub">{dailyError || 'Could not load daily climate records.'}</div>
            </div>
          ) : (
            <>
              {/* Year selectors + go button */}
              <div className="cmp-header">
                <div className="sec-label">Select Two Years to Compare</div>
                <div className="cmp-picks">
                  <div className="cmp-pick">
                    <div className="cmp-pick-label">Year A</div>
                    <select className="csel" value={cmpYearA} onChange={e => { setCmpYearA(+e.target.value); setCmpMonth(null); setShowCmp(false) }}>
                      {summary.yearly.years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div className="cmp-vs">vs</div>
                  <div className="cmp-pick">
                    <div className="cmp-pick-label">Year B</div>
                    <select className="csel" value={cmpYearB} onChange={e => { setCmpYearB(+e.target.value); setCmpMonth(null); setShowCmp(false) }}>
                      {summary.yearly.years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>
                <button className="cmp-go-btn" onClick={() => setShowCmp(true)}>Compare Years</button>
              </div>

              {/* Comparison charts */}
              {showCmp && cmpDataA && cmpDataB && (
                <>
                  {[
                    { title: '🌡 Temperature by Month (°C)', dot: '#f87171', el: <CompareDualLine labels={MONTH_NAMES} dataA={cmpDataA.map(m => m.T2M)} dataB={cmpDataB.map(m => m.T2M)} yearA={cmpYearA} yearB={cmpYearB} colorA="#f87171" colorB="#a78bfa" /> },
                    { title: '🌧 Rainfall by Month (mm)',    dot: '#38bdf8', el: <CompareDualBar  labels={MONTH_NAMES} dataA={cmpDataA.map(m => m.PREC)} dataB={cmpDataB.map(m => m.PREC)} yearA={cmpYearA} yearB={cmpYearB} /> },
                    { title: '💨 Wind by Month (m/s)',       dot: '#a78bfa', el: <CompareDualLine labels={MONTH_NAMES} dataA={cmpDataA.map(m => m.WS2M)} dataB={cmpDataB.map(m => m.WS2M)} yearA={cmpYearA} yearB={cmpYearB} colorA="#f59e0b" colorB="#22d3ee" /> },
                  ].map(s => (
                    <div key={s.title} className="chart-section">
                      <div className="chart-title"><span className="chart-dot" style={{ background: s.dot }} />{s.title}</div>
                      <div className="chart-wrap">{s.el}</div>
                    </div>
                  ))}

                  {/* Month picker for daily drill-down */}
                  <div style={{ padding: '10px 14px 0', borderTop: '1px solid var(--border)' }}>
                    <div className="sec-label" style={{ marginBottom: 6 }}>Day-by-Day Detail — pick a month</div>
                    <div className="month-btns">
                      {MONTH_NAMES.map((mn, i) => (
                        <button key={i} className={`mb${cmpMonth === i + 1 ? ' active' : ''}`}
                          onClick={() => setCmpMonth(cmpMonth === i + 1 ? null : i + 1)}>{mn}</button>
                      ))}
                    </div>
                  </div>

                  {/* Daily drill-down */}
                  {cmpMonth && cmpDailyA && cmpDailyB && (
                    <>
                      <div className="chart-section">
                        <div className="chart-title">🌡 Daily Temp — {MONTH_NAMES[cmpMonth - 1]}</div>
                        <div className="chart-wrap">
                          <CompareDualLine labels={cmpDailyA.dates.map(d => d.slice(6, 8))} dataA={cmpDailyA.T2M} dataB={cmpDailyB.T2M} yearA={cmpYearA} yearB={cmpYearB} colorA="#f87171" colorB="#a78bfa" />
                        </div>
                      </div>
                      <div className="chart-section">
                        <div className="chart-title">🌧 Daily Rain — {MONTH_NAMES[cmpMonth - 1]}</div>
                        <div className="chart-wrap">
                          <CompareDualBar labels={cmpDailyA.dates.map(d => d.slice(6, 8))} dataA={cmpDailyA.PREC} dataB={cmpDailyB.PREC} yearA={cmpYearA} yearB={cmpYearB} />
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ────────── EXPLORER TAB ────────── */}
      {tab === 'Explorer' && (
        <div className="tab-content active" style={{ overflowY: 'auto' }}>
          {!summary ? (
            <div className="welcome">
              <div className="welcome-icon">🔍</div>
              <div className="welcome-title">No data loaded</div>
              <div className="welcome-sub">Fetch climate data first, then explore day by day.</div>
            </div>
          ) : loadingDaily ? (
            <div className="welcome">
              <div className="welcome-icon">⏳</div>
              <div className="welcome-title">Loading daily data…</div>
              <div className="welcome-sub">30-year daily records are loading. The year grid will appear shortly.</div>
            </div>
          ) : !daily ? (
            <div className="welcome">
              <div className="welcome-icon">⚠️</div>
              <div className="welcome-title">Daily data unavailable</div>
              <div className="welcome-sub">{dailyError || 'Could not load daily climate records.'}</div>
            </div>
          ) : (
            <>
              {/* Breadcrumb */}
              <div className="ex-bread">
                <button className="ex-bread-btn" onClick={() => { setExYear(null); setExMonth(null) }}>Years</button>
                {exYear && <><span className="ex-bread-sep">›</span><button className="ex-bread-btn" onClick={() => setExMonth(null)}>{exYear}</button></>}
                {exMonth && <><span className="ex-bread-sep">›</span><span style={{ color: 'var(--txt2)' }}>{MONTH_NAMES[exMonth - 1]}</span></>}
              </div>

              {/* Year grid */}
              {!exYear && (
                <div style={{ padding: '12px 14px' }}>
                  <div className="sec-label" style={{ marginBottom: 8 }}>Select a Year</div>
                  <div className="year-grid">
                    {summary.yearly.years.map(y => (
                      <button key={y} className="yg-btn" onClick={() => { setExYear(y); setExMonth(null) }}>{y}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* Month grid + year charts */}
              {exYear && !exMonth && exMonthly && (
                <div style={{ padding: '12px 14px' }}>
                  <div className="sec-label" style={{ marginBottom: 8 }}>Select a Month — {exYear}</div>
                  {daily && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: '.63rem', color: 'var(--txt3)', marginBottom: 5, letterSpacing: '.03em' }}>Daily Temperature Heatmap</div>
                      <TempHeatmap daily={daily} year={exYear} />
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 14 }}>
                    {exMonthly.map(m => (
                      <button key={m.month} className="yg-btn" style={{ textAlign: 'left', padding: '7px 8px' }}
                        onClick={() => setExMonth(m.month)}>
                        <div style={{ fontWeight: 600 }}>{MONTH_NAMES[m.month - 1]}</div>
                        <div style={{ fontSize: '.62rem', color: 'var(--txt3)', marginTop: 2 }}>{m.T2M}°C · {m.PREC}mm</div>
                      </button>
                    ))}
                  </div>
                  {[
                    { title: 'Temperature (°C)', dot: '#f87171', el: <MonthlyChart months={exMonthly.map(m => m.month)} values={exMonthly.map(m => m.T2M)}  label="Temp °C"  color="#f87171" /> },
                    { title: 'Rainfall (mm)',    dot: '#38bdf8', el: <MonthlyChart months={exMonthly.map(m => m.month)} values={exMonthly.map(m => m.PREC)} label="Rain mm"  color="#38bdf8" type="bar" /> },
                  ].map(s => (
                    <div key={s.title} className="chart-section" style={{ paddingLeft: 0, paddingRight: 0 }}>
                      <div className="chart-title"><span className="chart-dot" style={{ background: s.dot }} />{s.title}</div>
                      <div className="chart-wrap">{s.el}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Daily view */}
              {exYear && exMonth && exDaily && (
                <div style={{ padding: '12px 14px' }}>
                  <div className="sec-label" style={{ marginBottom: 10 }}>{MONTH_NAMES[exMonth - 1]} {exYear}</div>
                  <div className="chart-wrap" style={{ height: 150, marginBottom: 12 }}>
                    <DailyTempChart dates={exDaily.dates} T2M={exDaily.T2M} T2M_MAX={exDaily.T2M_MAX} T2M_MIN={exDaily.T2M_MIN} />
                  </div>
                  <div className="chart-wrap" style={{ height: 90, marginBottom: 14 }}>
                    <DailyBarChart dates={exDaily.dates} values={exDaily.PREC} label="Rain mm" color="#38bdf8" />
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.66rem' }}>
                      <thead>
                        <tr>{['Day','°C','Max','Min','Rain','Wind','RH%'].map(h => (
                          <th key={h} style={{ padding: '4px 5px', color: 'var(--txt3)', borderBottom: '1px solid var(--border)', textAlign: h === 'Day' ? 'left' : 'right' }}>{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {exDaily.dates.map((d, i) => (
                          <tr key={d} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '3px 5px', color: 'var(--txt2)' }}>{d.slice(6, 8)}</td>
                            <td style={{ padding: '3px 5px', color: '#f87171', textAlign: 'right' }}>{exDaily.T2M[i]?.toFixed(1)}</td>
                            <td style={{ padding: '3px 5px', color: '#fb923c', textAlign: 'right' }}>{exDaily.T2M_MAX[i]?.toFixed(1)}</td>
                            <td style={{ padding: '3px 5px', color: '#60a5fa', textAlign: 'right' }}>{exDaily.T2M_MIN[i]?.toFixed(1)}</td>
                            <td style={{ padding: '3px 5px', color: '#34d399', textAlign: 'right' }}>{exDaily.PREC[i]?.toFixed(1)}</td>
                            <td style={{ padding: '3px 5px', color: '#a78bfa', textAlign: 'right' }}>{exDaily.WS2M[i]?.toFixed(1)}</td>
                            <td style={{ padding: '3px 5px', color: 'var(--txt3)', textAlign: 'right' }}>{exDaily.RH2M[i]?.toFixed(0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ────────── EXPORT TAB ────────── */}
      {tab === 'Export' && (
        <div className="tab-content active" style={{ overflowY: 'auto' }}>
          <div style={{ padding: '16px 14px' }}>
            <div className="sec-label" style={{ marginBottom: 12 }}>Export Current Data</div>
            {!summary ? (
              <p style={{ fontSize: '.75rem', color: 'var(--txt3)', lineHeight: 1.6, marginBottom: 14 }}>
                No data loaded yet. Fetch climate data first.
              </p>
            ) : (
              <>
                <button className="export-btn" disabled={!daily} onClick={() => daily && exportDailyCSV(daily, locSlug)}>📄 Day-by-Day CSV</button>
                <button className="export-btn" onClick={() => exportYearlyCSV(summary, locSlug)}>📊 Yearly Summary CSV</button>
                <button className="export-btn" onClick={() => exportNormalsCSV(summary, locSlug)}>📅 Monthly Climatology CSV</button>
                <button className="export-btn" disabled={!daily} onClick={() => daily && downloadBlob(`${locSlug}_raw.json`, JSON.stringify({ location, summary, data: daily }, null, 2), 'application/json')}>
                  {'{ }'} Raw JSON
                </button>
                <div style={{ marginTop: 14, padding: '12px 14px', background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div className="sec-label" style={{ marginBottom: 8 }}>Parameters included</div>
                  <div style={{ fontSize: '.72rem', color: 'var(--txt2)', lineHeight: 2, fontFamily: "'JetBrains Mono', monospace" }}>
                    T2M · T2M_MAX · T2M_MIN<br />PRECTOTCORR · WS2M · RH2M<br />ALLSKY_SFC_SW_DWN
                  </div>
                </div>
                {daily && (
                  <div style={{ marginTop: 8, fontSize: '.7rem', color: 'var(--txt3)', fontFamily: "'JetBrains Mono', monospace" }}>
                    {daily.dates.length.toLocaleString()} daily records loaded
                  </div>
                )}
              </>
            )}

            {/* Cache manager */}
            <div style={{ marginTop: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div className="sec-label" style={{ margin: 0 }}>💾 Cached Locations</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="export-btn" style={{ margin: 0, padding: '5px 10px', fontSize: '.68rem', width: 'auto', display: 'inline-flex' }}
                    onClick={() => setCacheList(readCache())}>↺ Refresh</button>
                  <button className="export-btn" style={{ margin: 0, padding: '5px 10px', fontSize: '.68rem', width: 'auto', display: 'inline-flex', color: 'var(--red)', borderColor: 'rgba(220,38,38,.3)' }}
                    onClick={() => { localStorage.removeItem('pakclim_cache'); setCacheList([]) }}>🗑 Clear All</button>
                </div>
              </div>
              {cacheList.length === 0 ? (
                <div style={{ fontSize: '.72rem', color: 'var(--txt3)' }}>No cached locations.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {cacheList.map((c, i) => (
                    <div key={i} style={{ padding: '7px 10px', background: 'var(--surface2)', borderRadius: 7, border: '1px solid var(--border)', fontSize: '.75rem' }}>
                      <div style={{ color: 'var(--txt)', fontWeight: 600 }}>{c.name}</div>
                      <div style={{ fontSize: '.65rem', color: 'var(--txt3)', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
                        {c.lat.toFixed(3)}°N · {c.lon.toFixed(3)}°E · {new Date(c.ts).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
