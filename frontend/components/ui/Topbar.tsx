'use client'
import { useState, useRef, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { weatherApi } from '@/lib/api'
import type { District, Location } from '@/lib/types'

interface Props {
  onSelect: (loc: Location) => void
}

export default function Topbar({ onSelect }: Props) {
  const { user, logout } = useAuth()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<District[]>([])
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!query.trim()) { setResults([]); setOpen(false); return }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const data = await weatherApi.search(query)
        setResults(data)
        setOpen(data.length > 0)
      } catch { setResults([]); setOpen(false) }
    }, 300)
  }, [query])

  function pick(d: District) {
    onSelect({ name: d.district, province: d.province, district: d.district, lat: d.latitude, lon: d.longitude })
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="topbar">
      <div className="logo">
        <div>
          <div className="logo-text">NDMA <span>WeatherLens</span></div>
        </div>
      </div>

      <div className="search-wrap">
        <span className="search-icon-pos">🔍</span>
        <input
          className="search-input"
          type="text"
          placeholder="Search district or settlement…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          onFocus={() => results.length > 0 && setOpen(true)}
          autoComplete="off"
        />
        {open && (
          <div className="search-results">
            {results.map((d, i) => (
              <div key={i} className="search-item" onMouseDown={() => pick(d)}>
                <div>{d.district}</div>
                <div className="search-item-sub">{d.province}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="user-badge">
        <span className="user-name">{user?.username}</span>
        <button className="logout-btn" onClick={logout}>Sign out</button>
      </div>
    </div>
  )
}
