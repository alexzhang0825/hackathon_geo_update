import { useState, useEffect, useRef } from 'react'
import MapView from './components/MapView'
import ControlPanel from './components/ControlPanel'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

const DEFAULT_START = [-123.1380, 49.2520]
const DEFAULT_END   = [-123.1050, 49.2750]

const FALLBACK_ROUTES = [
  {
    id: 'route-1', label: 'ALPHA ROUTE',
    geometry: { type: 'LineString', coordinates: [
      [-123.1380, 49.2520], [-123.1360, 49.2540], [-123.1350, 49.2600],
      [-123.1240, 49.2680], [-123.1130, 49.2720], [-123.1050, 49.2750],
    ]},
    length_m: 2750,
  },
  {
    id: 'route-2', label: 'BRAVO ROUTE',
    geometry: { type: 'LineString', coordinates: [
      [-123.1380, 49.2520], [-123.1400, 49.2580], [-123.1350, 49.2650],
      [-123.1200, 49.2700], [-123.1050, 49.2750],
    ]},
    length_m: 3050,
  },
]

async function fetchRoutesFromAPI(start, end, threats, setRoutes, setLoading) {
  if (!start || !end) return
  setLoading(true)
  const obstacles = threats.filter(t => t.visible).map(t => t.geojson)
  try {
    const res = await fetch('http://localhost:8000/api/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start_lng: start[0], start_lat: start[1],
        end_lng:   end[0],   end_lat:   end[1],
        obstacles,
      }),
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json()
    setRoutes(data.routes)
  } catch {
    setRoutes(FALLBACK_ROUTES)
  } finally {
    setLoading(false)
  }
}

export default function App() {
  const [startPoint,    setStartPoint]    = useState(DEFAULT_START)
  const [endPoint,      setEndPoint]      = useState(DEFAULT_END)
  const [placingMarker, setPlacingMarker] = useState(null)
  const [threats,       setThreats]       = useState([])
  const [routes,        setRoutes]        = useState([])
  const [loading,       setLoading]       = useState(false)
  const [analyzing,     setAnalyzing]     = useState(false)
  const [simulating,    setSimulating]    = useState(false)

  const placingRef = useRef(null)

  const setPlacing = (mode) => {
    setPlacingMarker(mode)
    placingRef.current = mode
  }

  const doFetch = (start, end, threatList) =>
    fetchRoutesFromAPI(start, end, threatList, setRoutes, setLoading)

  useEffect(() => { doFetch(DEFAULT_START, DEFAULT_END, []) }, [])

  // ── map click ─────────────────────────────────────────────────────────────
  const handleMapClick = ([lng, lat]) => {
    const mode = placingRef.current
    if (!mode) return
    if (mode === 'start') {
      setStartPoint([lng, lat])
      doFetch([lng, lat], endPoint, threats)
    } else {
      setEndPoint([lng, lat])
      doFetch(startPoint, [lng, lat], threats)
    }
    setPlacing(null)
  }

  // ── threats ───────────────────────────────────────────────────────────────
  const handleToggleThreat = (id) => {
    const updated = threats.map(t => t.id === id ? { ...t, visible: !t.visible } : t)
    setThreats(updated)
    doFetch(startPoint, endPoint, updated)
  }

  const handleRemoveThreat = (id) => {
    const updated = threats.filter(t => t.id !== id)
    setThreats(updated)
    doFetch(startPoint, endPoint, updated)
  }

  // ── image upload ──────────────────────────────────────────────────────────
  const handleImageUpload = async (file, gpsCenter) => {
    if (analyzing) return
    setAnalyzing(true)
    try {
      const formData = new FormData()
      formData.append('image', file)
      if (gpsCenter) {
        formData.append('gps_lat', gpsCenter.lat)
        formData.append('gps_lng', gpsCenter.lng)
      }
      const res = await fetch('http://localhost:8000/api/analyze-image', {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(30000),
      })
      const data = await res.json()

      if (data.threat_detected && data.obstacle_geojson) {
        const newThreat = {
          id:          Date.now().toString(),
          label:       data.threat_type || 'DETECTED THREAT',
          description: data.threat_description,
          riskLevel:   data.risk_level,
          geojson:     data.obstacle_geojson,
          visible:     true,
          analysis:    data,
        }
        const updated = [...threats, newThreat]
        setThreats(updated)
        doFetch(startPoint, endPoint, updated)
      }
      return data
    } catch (e) {
      console.warn('Image analysis failed', e)
      return null
    } finally {
      setAnalyzing(false)
    }
  }

  // ── simulation ────────────────────────────────────────────────────────────
  const handleSimulationEnd = () => setSimulating(false)

  // ── derived ───────────────────────────────────────────────────────────────
  const threatCollection = {
    type: 'FeatureCollection',
    features: threats.filter(t => t.visible).map(t => t.geojson),
  }

  const hasObstacles = threats.some(t => t.visible)

  return (
    <div className="app">
      <header className="top-bar">
        <span className="top-bar-title">TACTICAL ROUTE PLANNER</span>
        <span className="top-bar-coords">49.2628°N 123.1300°W — VANCOUVER</span>
        <span className={`top-bar-status ${analyzing ? 'analyzing' : hasObstacles ? 'danger' : 'safe'}`}>
          {analyzing ? '⬤ AI ANALYZING…' : simulating ? '⬤ UNIT IN TRANSIT' : hasObstacles ? '⬤ THREATS ACTIVE' : '⬤ ALL CLEAR'}
        </span>
      </header>

      <div className="main">
        <MapView
          startPoint={startPoint}
          endPoint={endPoint}
          placingMarker={placingMarker}
          onMapClick={handleMapClick}
          threats={threatCollection}
          routes={routes}
          simulating={simulating}
          onSimulationEnd={handleSimulationEnd}
          mapboxToken={MAPBOX_TOKEN}
        />
        <ControlPanel
          startPoint={startPoint}
          endPoint={endPoint}
          placingMarker={placingMarker}
          onSetPlacing={setPlacing}
          threats={threats}
          onToggleThreat={handleToggleThreat}
          onRemoveThreat={handleRemoveThreat}
          onImageUpload={handleImageUpload}
          analyzing={analyzing}
          loading={loading}
          routes={routes}
          simulating={simulating}
          onStartSim={() => setSimulating(true)}
          onStopSim={() => setSimulating(false)}
        />
      </div>
    </div>
  )
}
