'use client'
import { useState } from 'react'
import type { Location, SummaryResponse, ClimateResponse } from '@/lib/types'
import { weatherApi } from '@/lib/api'
import { YearlyTempChart, YearlyRainChart, MonthlyChart } from '@/components/charts/ClimateCharts'

interface Props { location: Location | null }

const PERIODS: { label: string; from: string; to: string }[] = [
  { label: '1995–2000', from: '1995-01-01', to: '2000-12-31' },
  { label: '2001–2010', from: '2001-01-01', to: '2010-12-31' },
  { label: '2011–2020', from: '2011-01-01', to: '2020-12-31' },
  { label: '2021–2025', from: '2021-01-01', to: '2025-12-31' },
  { label: '⚡ 30yr All', from: '1995-01-01', to: '2025-12-31' },
]

const TABS = ['Climate', 'Yearly', 'Monthly']

export default function SidePanel({ location }: Props) {
  const [tab, setTab] = useState('Climate')
  const [from, setFrom] = useState('1995-01-01')
  const [to, setTo]   = useState('2025-12-31')
  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(0)

  async function fetchData() {
    if (!location) return
    setLoading(true); setError(''); setProgress(10)
    try {
      setProgress(40)
      const data = await weatherApi.summary(location.lat, location.lon)
      setProgress(100)
      setSummary(data)
      setTab('Yearly')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fetch failed')
    } finally {
      setLoading(false)
      setTimeout(() => setProgress(0), 600)
    }
  }

  function applyPeriod(p: typeof PERIODS[0]) {
    setFrom(p.from)
    setTo(p.to)
  }

  return (
    <div className="side-panel">
      {/* Tabs */}
      <div className="stabs">
        <div className="stab-row">
          {TABS.map(t => (
            <button key={t} className={`stab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
      </div>

      {/* Climate tab */}
      {tab === 'Climate' && (
        <div className="tab-content active">
          {!location ? (
            <div className="welcome">
              <div className="welcome-icon">🗺️</div>
              <div className="welcome-title">Select a location on the map</div>
              <div className="welcome-sub">Click any district to load 30 years of climate data.</div>
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
                      onClick={() => applyPeriod(p)}>{p.label}</button>
                  ))}
                </div>
                <div className="date-row">
                  <label>From</label>
                  <input className="date-input" type="date" value={from} onChange={e => setFrom(e.target.value)} />
                </div>
                <div className="date-row">
                  <label>To</label>
                  <input className="date-input" type="date" value={to} onChange={e => setTo(e.target.value)} />
                </div>
                <button className="fetch-btn" onClick={fetchData} disabled={loading}>
                  {loading ? 'Fetching…' : '⬇ Fetch Climate Data'}
                </button>
              </div>

              {loading && progress > 0 && (
                <div className="progress-wrap">
                  <div className="progress-label"><span>Loading…</span><span>{progress}%</span></div>
                  <div className="progress-bar"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
                </div>
              )}

              {error && <div className="auth-error" style={{ margin: '10px 14px' }}>{error}</div>}

              {summary && (
                <div className="kpi-row">
                  <div className="kpi hot">
                    <div className="kpi-val">{summary.yearly.T2M_MAX[summary.yearly.T2M_MAX.length - 1]?.toFixed(1)}°</div>
                    <div className="kpi-lbl">Max Temp</div>
                  </div>
                  <div className="kpi cold">
                    <div className="kpi-val">{summary.yearly.T2M_MIN[summary.yearly.T2M_MIN.length - 1]?.toFixed(1)}°</div>
                    <div className="kpi-lbl">Min Temp</div>
                  </div>
                  <div className="kpi">
                    <div className="kpi-val">{summary.yearly.T2M[summary.yearly.T2M.length - 1]?.toFixed(1)}°</div>
                    <div className="kpi-lbl">Avg Temp</div>
                  </div>
                  <div className="kpi rain">
                    <div className="kpi-val">{summary.yearly.PREC[summary.yearly.PREC.length - 1]?.toFixed(0)}</div>
                    <div className="kpi-lbl">Rain mm</div>
                  </div>
                  <div className="kpi wind">
                    <div className="kpi-val">{summary.yearly.WS2M[summary.yearly.WS2M.length - 1]?.toFixed(1)}</div>
                    <div className="kpi-lbl">Wind m/s</div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Yearly tab */}
      {tab === 'Yearly' && (
        <div className="tab-content active" style={{ overflowY: 'auto' }}>
          {!summary ? (
            <div className="welcome">
              <div className="welcome-icon">📈</div>
              <div className="welcome-title">No data loaded</div>
              <div className="welcome-sub">Go to Climate tab and fetch data first.</div>
            </div>
          ) : (
            <>
              <div className="chart-section">
                <div className="chart-title">
                  <span className="chart-dot" style={{ background: '#f87171' }} />
                  Temperature (°C)
                </div>
                <div className="chart-wrap">
                  <YearlyTempChart years={summary.yearly.years} T2M={summary.yearly.T2M} T2M_MAX={summary.yearly.T2M_MAX} T2M_MIN={summary.yearly.T2M_MIN} />
                </div>
              </div>
              <div className="chart-section">
                <div className="chart-title">
                  <span className="chart-dot" style={{ background: '#38bdf8' }} />
                  Rainfall (mm)
                </div>
                <div className="chart-wrap">
                  <YearlyRainChart years={summary.yearly.years} PREC={summary.yearly.PREC} />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Monthly tab */}
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
              <div className="chart-section">
                <div className="chart-title"><span className="chart-dot" style={{ background: '#f87171' }} />Mean Monthly Temperature</div>
                <div className="chart-wrap">
                  <MonthlyChart months={summary.normals.months} values={summary.normals.T2M} label="Temp °C" color="#f87171" />
                </div>
              </div>
              <div className="chart-section">
                <div className="chart-title"><span className="chart-dot" style={{ background: '#38bdf8' }} />Mean Monthly Rainfall</div>
                <div className="chart-wrap">
                  <MonthlyChart months={summary.normals.months} values={summary.normals.PREC} label="Rain mm" color="#38bdf8" type="bar" />
                </div>
              </div>
              <div className="chart-section">
                <div className="chart-title"><span className="chart-dot" style={{ background: '#a78bfa' }} />Mean Monthly Wind Speed</div>
                <div className="chart-wrap">
                  <MonthlyChart months={summary.normals.months} values={summary.normals.WS2M} label="Wind m/s" color="#a78bfa" />
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
