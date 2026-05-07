'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useAuth } from '@/context/AuthContext'
import Topbar from '@/components/ui/Topbar'
import SidePanel from '@/components/panel/SidePanel'
import type { Location } from '@/lib/types'

const PakistanMap = dynamic(() => import('@/components/map/PakistanMap'), {
  ssr: false,
  loading: () => (
    <div className="map-loader">
      <div className="loader-ring" />
      <div className="loader-label">Loading map…</div>
    </div>
  ),
})

export default function DashboardPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [location, setLocation] = useState<Location | null>(null)
  const [panelOpen, setPanelOpen] = useState(true)
  const [coordMode, setCoordMode] = useState(false)
  const flyToRef = useRef<((lat: number, lon: number) => void) | null>(null)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  if (loading || !user) {
    return (
      <div className="map-loader">
        <div className="loader-ring" />
        <div className="loader-label">Loading…</div>
      </div>
    )
  }

  return (
    <div className={`app-shell${panelOpen ? '' : ' panel-closed'}`}>
      <PakistanMap onSelect={setLocation} flyToRef={flyToRef} />
      <Topbar
        onSelect={setLocation}
        onCoordMode={() => setCoordMode(c => !c)}
        coordMode={coordMode}
        flyToRef={flyToRef}
      />
      <button
        className="side-toggle"
        onClick={() => setPanelOpen(p => !p)}
        title="Toggle panel"
      >
        {panelOpen ? '❯' : '❮'}
      </button>
      <SidePanel location={location} open={panelOpen} />
    </div>
  )
}
