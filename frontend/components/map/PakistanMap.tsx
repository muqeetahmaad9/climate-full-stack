'use client'
import { useRef, useCallback, useState } from 'react'
import Map, { Source, Layer, type MapRef, type MapMouseEvent } from 'react-map-gl'
import type { Location } from '@/lib/types'
import 'mapbox-gl/dist/mapbox-gl.css'

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

const PROV_COLOR: Record<string, string> = {
  'Punjab':              '#d45510',
  'Sindh':               '#2060e8',
  'Khyber Pakhtunkhwa':  '#1a9e4d',
  'Balochistan':         '#b87210',
  'Gilgit Baltistan':    '#8b45ff',
  'Azad Kashmir':        '#a84f12',
  'Islamabad':           '#e83030',
}

const WMO_LABEL: Record<number, string> = {
  0: 'Clear sky',         1: 'Mainly clear',          2: 'Partly cloudy',      3: 'Overcast',
  45: 'Foggy',            48: 'Rime fog',
  51: 'Light drizzle',    53: 'Drizzle',               55: 'Heavy drizzle',
  61: 'Light rain',       63: 'Moderate rain',          65: 'Heavy rain',
  71: 'Light snow',       73: 'Moderate snow',          75: 'Heavy snow',        77: 'Snow grains',
  80: 'Light showers',    81: 'Showers',                82: 'Heavy showers',
  85: 'Snow showers',     86: 'Heavy snow showers',
  95: 'Thunderstorm',     96: 'Thunderstorm + hail',    99: 'Thunderstorm + heavy hail',
}

const WMO_ICON: Record<number, string> = {
  0: '☀️',  1: '🌤',  2: '⛅',  3: '☁️',
  45: '🌫', 48: '🌫',
  51: '🌦', 53: '🌧', 55: '🌧',
  61: '🌧', 63: '🌧', 65: '🌧',
  71: '🌨', 73: '❄️', 75: '❄️', 77: '❄️',
  80: '🌦', 81: '🌦', 82: '🌧',
  85: '🌨', 86: '🌨',
  95: '⛈', 96: '⛈', 99: '⛈',
}

const PROVINCES = Object.keys(PROV_COLOR)
const LAYER_DEFS = [
  { key: 'national',    label: 'National',    color: '#000000', cls: 'on-b' },
  { key: 'provincial',  label: 'Provincial',  color: '#000000', cls: 'on-b' },
  { key: 'districts',   label: 'Districts',   color: '#000000', cls: 'on-o' },
  { key: 'settlements', label: 'Settlements', color: '#94a3b8', cls: ''     },
  { key: 'labels',      label: 'Labels',      color: '#8b1a1a', cls: 'on-g' },
] as const

interface LiveCard {
  name: string
  tehsil: string
  district: string
  province: string
  lat: number
  lon: number
  loading: boolean
  temp?: number
  feelsLike?: number
  humidity?: number
  wind?: number
  precip?: number
  code?: number
  desc?: string
  icon?: string
  time?: string
  error?: string
}

interface TooltipInfo {
  name: string
  meta: string
  coords: string
  hint: string
  x: number
  y: number
}

interface Props {
  onSelect: (loc: Location) => void
  flyToRef?: { current: ((lat: number, lon: number) => void) | null }
}

export default function PakistanMap({ onSelect, flyToRef }: Props) {
  const mapRef                    = useRef<MapRef>(null)
  const [coords, setCoords]       = useState('Lat — · Lon —')
  const lastMove                  = useRef(0)
  const [showBadge, setShowBadge] = useState(true)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [cursor, setCursor]       = useState('crosshair')
  const [tooltip, setTooltip]     = useState<TooltipInfo | null>(null)
  const [liveCard, setLiveCard]   = useState<LiveCard | null>(null)
  const [layers, setLayers]       = useState({
    national: true, provincial: true, districts: true, settlements: true, labels: true,
  })
  const [provFilter, setProvFilter] = useState('')

  const toggleLayer = (key: keyof typeof layers) =>
    setLayers(l => ({ ...l, [key]: !l[key] }))

  if (flyToRef) {
    flyToRef.current = (lat: number, lon: number) =>
      mapRef.current?.flyTo({ center: [lon, lat], zoom: 9, duration: 1500, essential: true })
  }

  const districtFilter: any = provFilter
    ? ['==', ['get', 'ADM1_EN'], provFilter]
    : ['!=', ['get', 'ADM1_EN'], null]

  const provincialFilter: any = provFilter
    ? ['==', ['get', 'name'], provFilter]
    : ['!=', ['get', 'name'], 'Indian Illegally Occupied Jammu & Kashmir']

  const settlementFilter: any = provFilter
    ? ['==', ['get', 'province'], provFilter]
    : ['has', 'name']

  const interactiveLayers = ['district-fill', 'settlement-dots']

  const handleMouseMove = useCallback((e: MapMouseEvent) => {
    const now = performance.now()
    if (now - lastMove.current < 40) return
    lastMove.current = now
    setCoords(`Lat ${e.lngLat.lat.toFixed(4)}  ·  Lon ${e.lngLat.lng.toFixed(4)}`)

    const map = mapRef.current
    if (!map) return
    const hits = map.queryRenderedFeatures(e.point, { layers: interactiveLayers })

    if (hits.length > 0) {
      setCursor('pointer')
      const f = hits[0]
      if (f.layer?.id === 'settlement-dots') {
        const p = f.properties as { name: string; tehsil: string; district: string; province: string }
        setTooltip({
          name: p.name,
          meta: `${p.district} · ${p.province}`,
          coords: `${e.lngLat.lat.toFixed(4)}°N · ${e.lngLat.lng.toFixed(4)}°E`,
          hint: 'Click for live weather',
          x: e.point.x,
          y: e.point.y,
        })
      } else if (f.layer?.id === 'district-fill') {
        const p = f.properties as { ADM2_EN: string; ADM1_EN: string }
        setTooltip({
          name: p.ADM2_EN || 'District',
          meta: p.ADM1_EN || '',
          coords: `${e.lngLat.lat.toFixed(4)}°N · ${e.lngLat.lng.toFixed(4)}°E`,
          hint: 'Click to load climate data',
          x: e.point.x,
          y: e.point.y,
        })
      }
    } else {
      setCursor('crosshair')
      setTooltip(null)
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    setTooltip(null)
    setCursor('crosshair')
  }, [])

  const handleClick = useCallback((e: MapMouseEvent) => {
    setShowBadge(false)
    setTooltip(null)
    const map = mapRef.current
    if (!map) return

    // Settlement click → live weather popup card
    const settlementHits = map.queryRenderedFeatures(e.point, { layers: ['settlement-dots'] })
    if (settlementHits.length > 0) {
      const p = settlementHits[0].properties as { name: string; tehsil: string; district: string; province: string }
      const lat = e.lngLat.lat
      const lon = e.lngLat.lng
      setLiveCard({
        name: p.name, tehsil: p.tehsil, district: p.district, province: p.province,
        lat, lon, loading: true,
      })
      fetch(`https://wttr.in/${lat.toFixed(4)},${lon.toFixed(4)}?format=j1`)
        .then(r => r.json())
        .then(data => {
          const c = data?.current_condition?.[0]
          if (!c) {
            setLiveCard(prev => prev ? { ...prev, loading: false, error: 'Weather unavailable' } : null)
            return
          }
          const wCode = parseInt(c.weatherCode ?? '0')
          const desc  = c.weatherDesc?.[0]?.value ?? ''
          const icon  = WMO_ICON[wCode] ?? (
            wCode <= 113 ? '☀️' : wCode <= 119 ? '⛅' : wCode <= 122 ? '☁️' :
            wCode <= 260 ? '🌫' : wCode <= 308 ? '🌧' : wCode <= 338 ? '❄️' :
            wCode <= 359 ? '🌦' : wCode <= 377 ? '🌨' : '⛈'
          )
          setLiveCard(prev => prev ? {
            ...prev, loading: false,
            temp:      parseFloat(c.temp_C),
            feelsLike: parseFloat(c.FeelsLikeC),
            humidity:  parseInt(c.humidity),
            wind:      parseFloat(c.windspeedKmph),
            precip:    parseFloat(c.precipMM ?? '0'),
            code:      wCode,
            desc, icon,
            time:      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          } : null)
        })
        .catch(() => setLiveCard(prev => prev ? { ...prev, loading: false, error: 'Failed to fetch weather' } : null))
      return
    }

    // District click → historical data in side panel
    const districtHits = map.queryRenderedFeatures(e.point, { layers: ['district-fill'] })
    if (districtHits.length > 0) {
      const p = districtHits[0].properties as { ADM2_EN: string; ADM1_EN: string }
      const name = p.ADM2_EN || 'Unknown District'
      const prov = p.ADM1_EN || ''
      onSelect({ name, province: prov.replace(/ /g, '_'), district: name, lat: e.lngLat.lat, lon: e.lngLat.lng })
      return
    }

    onSelect({
      name: `${e.lngLat.lat.toFixed(3)}°N, ${e.lngLat.lng.toFixed(3)}°E`,
      province: '', district: '', lat: e.lngLat.lat, lon: e.lngLat.lng,
    })
  }, [onSelect])

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Map
        ref={mapRef}
        mapboxAccessToken={TOKEN}
        mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
        initialViewState={{
          bounds: [[60.5, 23.0], [78.5, 37.5]],
          fitBoundsOptions: { padding: { top: 80, left: 160, right: 360, bottom: 20 } },
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onLoad={() => setMapLoaded(true)}
        cursor={cursor}
        attributionControl={false}
        style={{ width: '100%', height: '100%' }}
        interactiveLayerIds={interactiveLayers}
      >
        {mapLoaded && (
          <>
            {/* National boundary */}
            <Source id="national" type="geojson" data="/geojson/National_Boundary.geojson">
              <Layer id="national-fill" type="fill"
                layout={{ visibility: layers.national ? 'visible' : 'none' }}
                paint={{ 'fill-color': 'rgba(0,0,0,0.04)', 'fill-outline-color': 'transparent' }} />
              <Layer id="national-line" type="line"
                layout={{ visibility: layers.national ? 'visible' : 'none' }}
                paint={{ 'line-color': '#000000', 'line-width': 2, 'line-opacity': 0.9 }} />
            </Source>

            {/* Provincial boundaries */}
            <Source id="provincial" type="geojson" data="/geojson/Provincial_Boundary.geojson">
              <Layer id="provincial-fill" type="fill" filter={provincialFilter}
                layout={{ visibility: layers.provincial ? 'visible' : 'none' }}
                paint={{
                  'fill-color': [
                    'match', ['get', 'name'],
                    'Punjab',             '#d45510',
                    'Sindh',              '#2060e8',
                    'Khyber Pakhtunkhwa', '#1a9e4d',
                    'Balochistan',        '#b87210',
                    'Gilgit Baltistan',   '#8b45ff',
                    'Azad Kashmir',       '#a84f12',
                    'Islamabad',          '#e83030',
                    'rgba(0,0,0,0.06)',
                  ],
                  'fill-opacity': 0.25,
                }} />
              <Layer id="provincial-line" type="line" filter={provincialFilter}
                layout={{ visibility: layers.provincial ? 'visible' : 'none' }}
                paint={{ 'line-color': '#000000', 'line-width': 1.5, 'line-opacity': 0.85 }} />
            </Source>

            {/* District boundaries */}
            <Source id="districts-src" type="geojson" data="/geojson/District_Boundary.geojson">
              <Layer id="district-fill" type="fill" filter={districtFilter}
                layout={{ visibility: layers.districts ? 'visible' : 'none' }}
                paint={{ 'fill-color': 'rgba(0,0,0,0.04)', 'fill-outline-color': 'transparent' }} />
              <Layer id="district-line" type="line" filter={districtFilter}
                layout={{ visibility: layers.districts ? 'visible' : 'none' }}
                paint={{ 'line-color': 'rgba(0,0,0,0.7)', 'line-width': 0.8 }} />
            </Source>

            {/* Settlement points — all dots, white grid style */}
            <Source id="settlements-src" type="geojson" data="/geojson/Scrap_Pts.geojson">
              <Layer id="settlement-dots" type="circle"
                layout={{ visibility: layers.settlements ? 'visible' : 'none' }}
                paint={{
                  'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3, 8, 4, 12, 6],
                  'circle-color': '#ffffff',
                  'circle-stroke-color': 'rgba(0,0,0,0.5)',
                  'circle-stroke-width': 1,
                  'circle-opacity': 0.9,
                }} />
              <Layer id="settlement-label-layer" type="symbol" minzoom={10}
                layout={{
                  visibility: layers.settlements ? 'visible' : 'none',
                  'text-field': ['get', 'name'],
                  'text-size': 10, 'text-offset': [0, 1.2], 'text-anchor': 'top',
                }}
                paint={{ 'text-color': '#e2e8f0', 'text-halo-color': '#0d1117', 'text-halo-width': 1.5 }} />
            </Source>
          </>
        )}
      </Map>

      {/* Live weather popup card */}
      {liveCard && (
        <div className="lwc">
          <div className="lwc-head">
            <div>
              <div className="lwc-name">{liveCard.name}</div>
              <div className="lwc-meta">{liveCard.district} · {liveCard.province}</div>
              <div className="lwc-coords">{liveCard.lat.toFixed(4)}°N · {liveCard.lon.toFixed(4)}°E</div>
            </div>
            <button className="lwc-x" onClick={() => setLiveCard(null)}>✕</button>
          </div>

          {liveCard.loading ? (
            <div className="lwc-spin">
              <div className="lwc-ring" />
              <span>Fetching live weather…</span>
            </div>
          ) : liveCard.error ? (
            <div className="lwc-err">{liveCard.error}</div>
          ) : (
            <div className="lwc-body">
              <div className="lwc-main">
                <span className="lwc-icon">{liveCard.icon ?? '🌡'}</span>
                <span className="lwc-temp">{liveCard.temp?.toFixed(1)}°C</span>
                <span className="lwc-desc">{liveCard.desc ?? '—'}</span>
              </div>
              <div className="lwc-grid">
                <div className="lwc-stat"><span>Feels like</span><b>{liveCard.feelsLike?.toFixed(1)}°C</b></div>
                <div className="lwc-stat"><span>Humidity</span><b>{liveCard.humidity}%</b></div>
                <div className="lwc-stat"><span>Wind</span><b>{liveCard.wind?.toFixed(1)} km/h</b></div>
                <div className="lwc-stat"><span>Rain</span><b>{liveCard.precip?.toFixed(1)} mm</b></div>
              </div>
              {liveCard.time && (
                <div className="lwc-time">Updated: {liveCard.time}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Hover tooltip */}
      {tooltip && (
        <div className="map-tooltip" style={{ left: tooltip.x + 16, top: tooltip.y - 16 }}>
          <div className="tip-name">{tooltip.name}</div>
          {tooltip.meta && <div className="tip-meta">{tooltip.meta}</div>}
          <div className="tip-coords">{tooltip.coords}</div>
          <div className="tip-hint">{tooltip.hint}</div>
        </div>
      )}

      {/* Badge */}
      {showBadge && (
        <div className="cb-badge">
          Click a district for historical data · Click a settlement dot for live weather
        </div>
      )}

      {/* Coordinate bar */}
      <div className="coord-bar">{coords}</div>

      {/* Province legend */}
      <div className="map-legend">
        <div className="legend-title">Provinces</div>
        {Object.entries(PROV_COLOR).map(([name, color]) => (
          <div key={name} className="legend-item">
            <div className="legend-dot" style={{ background: color }} />
            <span>{name === 'Khyber Pakhtunkhwa' ? 'KPK' : name === 'Gilgit Baltistan' ? 'Gilgit-B.' : name}</span>
          </div>
        ))}
        <div className="lsep" />
        <div className="legend-item">
          <div className="legend-dot" style={{ background: '#94a3b8', borderRadius: '50%' }} />
          <span>Settlement</span>
        </div>
      </div>

      {/* Layer controls */}
      <div className="map-controls-panel">
        <div className="legend-title">Layers</div>
        {LAYER_DEFS.map(({ key, label, color, cls }) => (
          <button key={key} className={`tb${layers[key] ? ' ' + cls : ''}`} onClick={() => toggleLayer(key)}>
            <span className="cdot" style={{ background: color }} />
            {label}
          </button>
        ))}
        <div className="lsep" />
        <select className="csel" value={provFilter} onChange={e => setProvFilter(e.target.value)}
          style={{ fontSize: '.67rem', padding: '4px 6px' }}>
          <option value="">All Provinces</option>
          {PROVINCES.map(p => (
            <option key={p} value={p}>{p === 'Khyber Pakhtunkhwa' ? 'KPK' : p}</option>
          ))}
        </select>
      </div>

      {/* Zoom controls */}
      <div className="zoom-group">
        <button className="zb" onClick={() => mapRef.current?.zoomIn()}>+</button>
        <button className="zb" onClick={() => mapRef.current?.zoomOut()}>−</button>
        <button className="zb" onClick={() => mapRef.current?.fitBounds([[60.5, 23.0], [78.5, 37.5]], { padding: 40 })}>⊡</button>
      </div>
    </div>
  )
}
