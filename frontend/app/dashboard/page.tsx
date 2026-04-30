'use client'
import { useEffect, useState } from 'react'
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
    <div className="app-shell">
      <PakistanMap onSelect={setLocation} />
      <Topbar onSelect={setLocation} />
      <SidePanel location={location} />
    </div>
  )
}
