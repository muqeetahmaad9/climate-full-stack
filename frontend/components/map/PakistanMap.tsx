'use client'
import { useRef, useCallback, useState } from 'react'
import Map, { Source, Layer, type MapRef, type MapMouseEvent } from 'react-map-gl'
import type { Location } from '@/lib/types'
import 'mapbox-gl/dist/mapbox-gl.css'

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

const PROV_FILL: Record<string, string> = {
  Punjab: '#c87030', Sindh: '#2860b0',
  Khyber_Pakhtunkhwa: '#2a8848', Balochistan: '#907040',
  Gilgit_Baltistan: '#5a4090', Azad_Kashmir: '#b06030',
  Islamabad: '#a03030',
}

const PROVINCE_COLORS = {
  Punjab: '#f97316', Sindh: '#22d3ee', 'Khyber Pakhtunkhwa': '#4ade80',
  Balochistan: '#c084fc', 'Gilgit Baltistan': '#60a5fa',
  'Azad Kashmir': '#fbbf24', Islamabad: '#f87171',
}

interface Props {
  onSelect: (loc: Location) => void
}

export default function PakistanMap({ onSelect }: Props) {
  const mapRef = useRef<MapRef>(null)
  const [coords, setCoords] = useState('Lat — · Lon —')
  const lastMove = useRef(0)

  const handleMouseMove = useCallback((e: MapMouseEvent) => {
    const now = performance.now()
    if (now - lastMove.current < 100) return
    lastMove.current = now
    setCoords(`Lat ${e.lngLat.lat.toFixed(3)}  ·  Lon ${e.lngLat.lng.toFixed(3)}`)
  }, [])

  const handleClick = useCallback((e: MapMouseEvent) => {
    const map = mapRef.current
    if (!map) return
    const features = map.queryRenderedFeatures(e.point, { layers: ['district-fill'] })
    if (features.length > 0) {
      const f = features[0]
      const props = f.properties as Record<string, string>
      const name = props.District || props.NAME || 'Unknown'
      const province = props.Province || props.PROVINCE || ''
      onSelect({
        name,
        province: province.replace(/ /g, '_'),
        district: name,
        lat: e.lngLat.lat,
        lon: e.lngLat.lng,
      })
    } else {
      onSelect({
        name: `${e.lngLat.lat.toFixed(3)}°N, ${e.lngLat.lng.toFixed(3)}°E`,
        province: '',
        district: '',
        lat: e.lngLat.lat,
        lon: e.lngLat.lng,
      })
    }
  }, [onSelect])

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Map
        ref={mapRef}
        mapboxAccessToken={TOKEN}
        mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
        initialViewState={{
          bounds: [[60.5, 23.0], [78.5, 37.5]],
          fitBoundsOptions: { padding: { top: 80, left: 175, right: 360, bottom: 20 } },
        }}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        attributionControl={false}
        style={{ width: '100%', height: '100%' }}
      />

      {/* Coordinate bar */}
      <div className="coord-bar">{coords}</div>

      {/* Province legend */}
      <div className="map-legend">
        <div className="legend-title">Provinces</div>
        {Object.entries(PROVINCE_COLORS).map(([name, color]) => (
          <div key={name} className="legend-item">
            <div className="legend-dot" style={{ background: color }} />
            <span>{name}</span>
          </div>
        ))}
      </div>

      {/* Zoom controls */}
      <div style={{ position: 'absolute', top: 80, right: 12, display: 'flex', flexDirection: 'column', gap: 4, zIndex: 10 }}>
        {[
          { label: '+', action: () => mapRef.current?.zoomIn() },
          { label: '−', action: () => mapRef.current?.zoomOut() },
          { label: '⊡', action: () => mapRef.current?.fitBounds([[60.5, 23.0], [78.5, 37.5]], { padding: 40 }) },
        ].map(b => (
          <button key={b.label} onClick={b.action} style={{
            width: 32, height: 32,
            background: 'rgba(22,27,34,.9)', border: '1px solid rgba(255,255,255,.1)',
            borderRadius: 6, color: '#e2e8f0', fontSize: '1rem', cursor: 'pointer',
          }}>{b.label}</button>
        ))}
      </div>
    </div>
  )
}
