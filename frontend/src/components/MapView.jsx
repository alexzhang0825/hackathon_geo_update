import { useEffect, useRef, useState } from 'react'

const CENTER            = [-123.1215, 49.2635]
const ROUTE_COLORS      = { 'route-1': '#00e5ff', 'route-2': '#ff9800' }
const SIMULATION_SECS   = 40   // seconds to traverse full route
const WIGGLE_AMPLITUDE  = 0.00008  // degrees lateral offset
const WIGGLE_FREQUENCY  = 1.8      // oscillations per second

// ── geometry helpers ──────────────────────────────────────────────────────────

function segLen(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  return Math.sqrt(dx * dx + dy * dy)
}

function routeTotalLen(coords) {
  let len = 0
  for (let i = 1; i < coords.length; i++) len += segLen(coords[i - 1], coords[i])
  return len
}

function pointAtDist(coords, dist) {
  let rem = dist
  for (let i = 1; i < coords.length; i++) {
    const sl = segLen(coords[i - 1], coords[i])
    if (rem <= sl) {
      const t = rem / sl
      return [
        coords[i - 1][0] + t * (coords[i][0] - coords[i - 1][0]),
        coords[i - 1][1] + t * (coords[i][1] - coords[i - 1][1]),
      ]
    }
    rem -= sl
  }
  return coords[coords.length - 1]
}

function directionAt(coords, dist) {
  let rem = dist
  for (let i = 1; i < coords.length; i++) {
    const sl = segLen(coords[i - 1], coords[i])
    if (rem <= sl) {
      return [coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]]
    }
    rem -= sl
  }
  const n = coords.length
  return [coords[n - 1][0] - coords[n - 2][0], coords[n - 1][1] - coords[n - 2][1]]
}

function nearestDist(coords, point) {
  let bestD2 = Infinity, bestCumD = 0, cumD = 0
  for (let i = 1; i < coords.length; i++) {
    const ax = coords[i - 1][0], ay = coords[i - 1][1]
    const bx = coords[i][0],     by = coords[i][1]
    const dx = bx - ax,          dy = by - ay
    const sl = Math.sqrt(dx * dx + dy * dy)
    const t  = sl > 0
      ? Math.max(0, Math.min(1, ((point[0] - ax) * dx + (point[1] - ay) * dy) / (sl * sl)))
      : 0
    const px = ax + t * dx, py = ay + t * dy
    const d2 = (point[0] - px) ** 2 + (point[1] - py) ** 2
    if (d2 < bestD2) { bestD2 = d2; bestCumD = cumD + t * sl }
    cumD += sl
  }
  return bestCumD
}

// ── component ─────────────────────────────────────────────────────────────────

export default function MapView({
  startPoint, endPoint, placingMarker, onMapClick,
  threats, routes, simulating, onSimulationEnd, mapboxToken,
}) {
  const containerRef   = useRef(null)
  const mapRef         = useRef(null)
  const startMarkerRef = useRef(null)
  const endMarkerRef   = useRef(null)
  const unitMarkerRef  = useRef(null)
  const onMapClickRef  = useRef(onMapClick)
  const rafRef         = useRef(null)
  const animRef        = useRef(null)   // holds the animate fn so it can self-reference
  const routesRef      = useRef(routes) // stable ref so animation reads latest routes
  const simRef         = useRef({ active: false, dist: 0, totalLen: 0, coords: null, lastTime: null, elapsed: 0 })
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => { onMapClickRef.current = onMapClick }, [onMapClick])
  useEffect(() => { routesRef.current = routes },         [routes])

  // ── init map ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current || !window.mapboxgl) return
    const mapboxgl = window.mapboxgl
    mapboxgl.accessToken = mapboxToken

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: CENTER, zoom: 13, pitch: 30,
    })
    mapRef.current = map
    map.addControl(new mapboxgl.NavigationControl(), 'top-left')
    map.on('click', (e) => onMapClickRef.current([e.lngLat.lng, e.lngLat.lat]))

    map.on('load', () => {
      map.addSource('threats', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({ id: 'threats-fill',    type: 'fill', source: 'threats', paint: { 'fill-color': '#f44336', 'fill-opacity': 0.35 } })
      map.addLayer({ id: 'threats-outline', type: 'line', source: 'threats', paint: { 'line-color': '#f44336', 'line-width': 2.5 } })

      for (const id of ['route-1', 'route-2']) {
        map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addLayer({ id: `${id}-glow`, type: 'line', source: id, paint: { 'line-color': ROUTE_COLORS[id], 'line-width': 14, 'line-opacity': 0, 'line-blur': 8 } })
        map.addLayer({ id: `${id}-line`, type: 'line', source: id, paint: { 'line-color': ROUTE_COLORS[id], 'line-width': 5,  'line-opacity': 0 } })
      }
      setMapReady(true)
    })
  }, [mapboxToken])

  // ── cursor ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return
    mapRef.current.getCanvas().style.cursor = placingMarker ? 'crosshair' : ''
  }, [placingMarker])

  // ── A / B markers ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return
    startMarkerRef.current?.remove()
    if (startPoint) {
      startMarkerRef.current = new window.mapboxgl.Marker({ element: markerEl('A', '#00e5ff') })
        .setLngLat(startPoint)
        .setPopup(new window.mapboxgl.Popup({ offset: 20 }).setHTML('<b>POINT ALPHA</b><br>Unit origin'))
        .addTo(mapRef.current)
    }
  }, [startPoint, mapReady])

  useEffect(() => {
    if (!mapReady) return
    endMarkerRef.current?.remove()
    if (endPoint) {
      endMarkerRef.current = new window.mapboxgl.Marker({ element: markerEl('B', '#ff9800') })
        .setLngLat(endPoint)
        .setPopup(new window.mapboxgl.Popup({ offset: 20 }).setHTML('<b>POINT BRAVO</b><br>Objective'))
        .addTo(mapRef.current)
    }
  }, [endPoint, mapReady])

  // ── threats / routes ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return
    mapRef.current.getSource('threats')?.setData(threats)
  }, [threats, mapReady])

  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    for (const id of ['route-1', 'route-2']) {
      const route = routes.find(r => r.id === id)
      map.getSource(id)?.setData(route
        ? { type: 'Feature', geometry: route.geometry, properties: {} }
        : { type: 'FeatureCollection', features: [] }
      )
      map.setPaintProperty(`${id}-line`, 'line-opacity', route ? 0.9 : 0)
      map.setPaintProperty(`${id}-glow`, 'line-opacity', route ? 0.25 : 0)
    }
  }, [routes, mapReady])

  // ── simulation: reroute when routes change mid-run ────────────────────────
  useEffect(() => {
    if (!simRef.current.active) return
    const route = routesRef.current.find(r => r.id === 'route-1') || routesRef.current[0]
    if (!route) return

    const newCoords  = route.geometry.coordinates
    const currentPos = unitMarkerRef.current?.getLngLat()
    if (!currentPos) return

    const here = [currentPos.lng, currentPos.lat]

    // Find where on the new route the unit should converge to
    const nd = nearestDist(newCoords, here)

    // Build transition path: unit's exact current position + remainder of new route
    // so the unit smoothly drives toward the new road rather than teleporting.
    const transition = [here]
    let cumD = 0
    for (let i = 1; i < newCoords.length; i++) {
      const sl = segLen(newCoords[i - 1], newCoords[i])
      if (cumD + sl >= nd) {
        // Insert the precise join-point on the segment, then the rest of the route
        const t  = (nd - cumD) / sl
        const jx = newCoords[i - 1][0] + t * (newCoords[i][0] - newCoords[i - 1][0])
        const jy = newCoords[i - 1][1] + t * (newCoords[i][1] - newCoords[i - 1][1])
        transition.push([jx, jy], ...newCoords.slice(i))
        break
      }
      cumD += sl
    }
    if (transition.length === 1) transition.push(...newCoords) // fallback

    simRef.current.coords   = transition
    simRef.current.totalLen = routeTotalLen(transition)
    simRef.current.dist     = 0  // unit starts at transition[0] = its current position
  }, [routes])

  // ── simulation: start / stop ───────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return

    if (simulating) {
      const route = routesRef.current.find(r => r.id === 'route-1') || routesRef.current[0]
      if (!route) return
      const coords   = route.geometry.coordinates
      const totalLen = routeTotalLen(coords)

      // Create unit marker
      const el = document.createElement('div')
      el.className = 'unit-marker'
      const mapboxgl = window.mapboxgl
      unitMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat(coords[0])
        .addTo(mapRef.current)

      simRef.current = { active: true, dist: 0, totalLen, coords, lastTime: null, elapsed: 0 }

      const animate = (time) => {
        const sim = simRef.current
        if (!sim.active) return

        if (sim.lastTime === null) sim.lastTime = time
        const dt = Math.min((time - sim.lastTime) / 1000, 0.1)
        sim.lastTime = time
        sim.elapsed += dt

        const speed = sim.totalLen / SIMULATION_SECS
        sim.dist = Math.min(sim.dist + speed * dt, sim.totalLen)

        // Base position
        const pos = pointAtDist(sim.coords, sim.dist)

        // Wiggle: sinusoidal offset perpendicular to direction of travel
        const dir = directionAt(sim.coords, sim.dist)
        const dirLen = Math.sqrt(dir[0] ** 2 + dir[1] ** 2) || 1
        const perp = [-dir[1] / dirLen, dir[0] / dirLen]
        const wiggle = WIGGLE_AMPLITUDE * Math.sin(sim.elapsed * WIGGLE_FREQUENCY * Math.PI * 2)
        const wiggledPos = [pos[0] + perp[0] * wiggle, pos[1] + perp[1] * wiggle]

        unitMarkerRef.current?.setLngLat(wiggledPos)

        if (sim.dist >= sim.totalLen) {
          sim.active = false
          onSimulationEnd?.()
          return
        }
        rafRef.current = requestAnimationFrame(animRef.current)
      }
      animRef.current = animate
      rafRef.current = requestAnimationFrame(animate)

    } else {
      // Stop
      simRef.current.active = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      unitMarkerRef.current?.remove()
      unitMarkerRef.current = null
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [simulating, mapReady])

  return <div ref={containerRef} className="map-container" />
}

function markerEl(label, color) {
  const el = document.createElement('div')
  el.style.cssText = `
    width:32px;height:32px;border-radius:50%;background:${color};
    border:3px solid #fff;display:flex;align-items:center;justify-content:center;
    font-family:'Share Tech Mono',monospace;font-weight:bold;font-size:13px;color:#000;
    box-shadow:0 0 12px ${color};cursor:pointer;
  `
  el.textContent = label
  return el
}
