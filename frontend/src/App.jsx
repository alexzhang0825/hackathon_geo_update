import { useState } from 'react'
import MapView from './components/MapView'
import ControlPanel from './components/ControlPanel'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

// Default obstacle centered on real photo GPS (49.2628, -123.1300)
const DEFAULT_OBSTACLE = {
  type: 'Feature',
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [-123.1340, 49.2610],
      [-123.1260, 49.2610],
      [-123.1260, 49.2648],
      [-123.1340, 49.2648],
      [-123.1340, 49.2610]
    ]]
  },
  properties: { kind: 'obstacle', source: 'manual' }
}

const FALLBACK_ROUTES = [
  {
    id: 'route-1', label: 'ALPHA ROUTE',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-123.1380, 49.2520], [-123.1360, 49.2540], [-123.1350, 49.2600],
        [-123.1240, 49.2680], [-123.1130, 49.2720], [-123.1050, 49.2750]
      ]
    },
    length_m: 2750
  },
  {
    id: 'route-2', label: 'BRAVO ROUTE',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-123.1380, 49.2520], [-123.1400, 49.2580], [-123.1350, 49.2650],
        [-123.1200, 49.2700], [-123.1050, 49.2750]
      ]
    },
    length_m: 3050
  }
]

function scoreRoute(route, troopSize, threatLevel) {
  const maxLength = 4000
  const lengthScore = (1 - route.length_m / maxLength) * 50
  const isAlpha = route.id === 'route-1'
  const troopBonus = isAlpha ? troopSize * 0.25 : -troopSize * 0.1
  const threatBonus = isAlpha ? -threatLevel * 4 : threatLevel * 4
  return Math.max(0, Math.round(lengthScore + troopBonus + threatBonus))
}

export default function App() {
  const [obstacleVisible, setObstacleVisible] = useState(false)
  const [obstacle, setObstacle] = useState(DEFAULT_OBSTACLE)
  const [routes, setRoutes] = useState([])
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [aiAnalysis, setAiAnalysis] = useState(null)
  const [troopSize, setTroopSize] = useState(50)
  const [threatLevel, setThreatLevel] = useState(3)

  // Called after AI analysis OR manual drone trigger
  const activateObstacle = async (obstacleFeature) => {
    setObstacle(obstacleFeature)
    setObstacleVisible(true)
    setLoading(true)
    try {
      const res = await fetch('http://localhost:8000/api/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ obstacle: obstacleFeature }),
        signal: AbortSignal.timeout(10000)
      })
      const data = await res.json()
      setRoutes(data.routes)
    } catch (e) {
      console.warn('Backend unreachable, using fallback routes', e)
      setRoutes(FALLBACK_ROUTES)
    } finally {
      setLoading(false)
    }
  }

  // Manual drone trigger (no image)
  const triggerDrone = () => {
    if (obstacleVisible || loading) return
    activateObstacle(DEFAULT_OBSTACLE)
  }

  // Image upload → Gemini analysis → obstacle + reroute
  const handleImageUpload = async (file, gpsCenter) => {
    if (obstacleVisible || analyzing) return
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
        signal: AbortSignal.timeout(30000)
      })
      const data = await res.json()
      setAiAnalysis(data)

      if (data.threat_detected && data.obstacle_geojson) {
        await activateObstacle(data.obstacle_geojson)
      } else {
        alert(`AI Analysis: ${data.threat_description || 'No threats detected'}`)
      }
    } catch (e) {
      console.warn('Analysis failed, using default obstacle', e)
      setAiAnalysis({ threat_description: 'Analysis failed — using default obstacle zone' })
      await activateObstacle(DEFAULT_OBSTACLE)
    } finally {
      setAnalyzing(false)
    }
  }

  const reset = () => {
    setObstacleVisible(false)
    setObstacle(DEFAULT_OBSTACLE)
    setRoutes([])
    setAiAnalysis(null)
  }

  const scoredRoutes = routes.map(r => {
    const score = scoreRoute(r, troopSize, threatLevel)
    return { ...r, score, visible: score >= 20 }
  })

  return (
    <div className="app">
      <header className="top-bar">
        <span className="top-bar-title">TACTICAL ROUTE PLANNER</span>
        <span className="top-bar-coords">49.2628°N 123.1300°W — VANCOUVER</span>
        <span className={`top-bar-status ${obstacleVisible ? 'danger' : 'safe'}`}>
          {analyzing ? '⬤ AI ANALYZING…' : obstacleVisible ? '⬤ OBSTACLE DETECTED' : '⬤ ALL CLEAR'}
        </span>
      </header>

      <div className="main">
        <MapView
          obstacleVisible={obstacleVisible}
          obstacle={obstacle}
          routes={scoredRoutes}
          mapboxToken={MAPBOX_TOKEN}
        />
        <ControlPanel
          onDroneTrigger={triggerDrone}
          onImageUpload={handleImageUpload}
          onReset={reset}
          loading={loading}
          analyzing={analyzing}
          obstacleVisible={obstacleVisible}
          aiAnalysis={aiAnalysis}
          troopSize={troopSize}
          setTroopSize={setTroopSize}
          threatLevel={threatLevel}
          setThreatLevel={setThreatLevel}
          routes={scoredRoutes}
        />
      </div>
    </div>
  )
}
