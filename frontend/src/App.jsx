import { useState } from 'react'
import MapView from './components/MapView'
import ControlPanel from './components/ControlPanel'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

// Obstacle polygon placed on Market St corridor — blocks the direct route
const OBSTACLE = {
  type: 'Feature',
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [-122.4168, 37.7772],
      [-122.4112, 37.7772],
      [-122.4112, 37.7795],
      [-122.4168, 37.7795],
      [-122.4168, 37.7772]
    ]]
  },
  properties: { kind: 'obstacle' }
}

const FALLBACK_ROUTES = [
  {
    id: 'route-1', label: 'ALPHA ROUTE',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-122.4194, 37.7749], [-122.4210, 37.7762], [-122.4200, 37.7805],
        [-122.4155, 37.7840], [-122.4110, 37.7858], [-122.4089, 37.7858]
      ]
    },
    length_m: 1520
  },
  {
    id: 'route-2', label: 'BRAVO ROUTE',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-122.4194, 37.7749], [-122.4172, 37.7740], [-122.4128, 37.7748],
        [-122.4097, 37.7790], [-122.4089, 37.7858]
      ]
    },
    length_m: 1820
  }
]

function scoreRoute(route, troopSize, threatLevel) {
  const maxLength = 3000
  const lengthScore = (1 - route.length_m / maxLength) * 50
  const isAlpha = route.id === 'route-1'
  // Alpha: benefits from large troops (wider roads), suffers at high threat
  // Bravo: longer but more covered, preferred at high threat
  const troopBonus = isAlpha ? troopSize * 0.25 : -troopSize * 0.1
  const threatBonus = isAlpha ? -threatLevel * 4 : threatLevel * 4
  return Math.max(0, Math.round(lengthScore + troopBonus + threatBonus))
}

export default function App() {
  const [obstacleVisible, setObstacleVisible] = useState(false)
  const [routes, setRoutes] = useState([])
  const [loading, setLoading] = useState(false)
  const [troopSize, setTroopSize] = useState(50)
  const [threatLevel, setThreatLevel] = useState(3)

  const triggerDrone = async () => {
    if (obstacleVisible || loading) return
    setObstacleVisible(true)
    setLoading(true)
    try {
      const res = await fetch('http://localhost:8000/api/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ obstacle: OBSTACLE }),
        signal: AbortSignal.timeout(8000)
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

  const scoredRoutes = routes.map(r => {
    const score = scoreRoute(r, troopSize, threatLevel)
    return { ...r, score, visible: score >= 20 }
  })

  return (
    <div className="app">
      <header className="top-bar">
        <span className="top-bar-title">TACTICAL ROUTE PLANNER</span>
        <span className="top-bar-coords">37.7749°N 122.4194°W — SAN FRANCISCO</span>
        <span className={`top-bar-status ${obstacleVisible ? 'danger' : 'safe'}`}>
          {obstacleVisible ? '⬤ OBSTACLE DETECTED' : '⬤ ALL CLEAR'}
        </span>
      </header>

      <div className="main">
        <MapView
          obstacleVisible={obstacleVisible}
          obstacle={OBSTACLE}
          routes={scoredRoutes}
          mapboxToken={MAPBOX_TOKEN}
        />
        <ControlPanel
          onDroneTrigger={triggerDrone}
          loading={loading}
          obstacleVisible={obstacleVisible}
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
