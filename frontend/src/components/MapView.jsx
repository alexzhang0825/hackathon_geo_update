import { useEffect, useRef, useState } from 'react'

const START  = [-123.1380, 49.2520]   // Marpole
const END    = [-123.1050, 49.2750]   // Olympic Village
const CENTER = [-123.1215, 49.2635]   // centered on real photo GPS

const ROUTE_COLORS = { 'route-1': '#00e5ff', 'route-2': '#ff9800' }

export default function MapView({ obstacleVisible, obstacle, routes, mapboxToken }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    if (mapRef.current || !window.mapboxgl) return

    const mapboxgl = window.mapboxgl
    mapboxgl.accessToken = mapboxToken

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: CENTER,
      zoom: 14,
      pitch: 30,
    })
    mapRef.current = map

    const markerEl = (label, color) => {
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

    new mapboxgl.Marker({ element: markerEl('A', '#00e5ff') })
      .setLngLat(START)
      .setPopup(new mapboxgl.Popup({ offset: 20 }).setHTML('<b>POINT ALPHA</b><br>Unit origin'))
      .addTo(map)

    new mapboxgl.Marker({ element: markerEl('B', '#ff9800') })
      .setLngLat(END)
      .setPopup(new mapboxgl.Popup({ offset: 20 }).setHTML('<b>POINT BRAVO</b><br>Objective'))
      .addTo(map)

    map.addControl(new mapboxgl.NavigationControl(), 'top-left')

    map.on('load', async () => {
      let baselineCoords = [
        [-123.1380, 49.2520], [-123.1340, 49.2555], [-123.1300, 49.2628],
        [-123.1220, 49.2670], [-123.1130, 49.2710], [-123.1050, 49.2750]
      ]
      try {
        const res = await fetch('http://localhost:8000/api/baseline',
          { signal: AbortSignal.timeout(6000) })
        const data = await res.json()
        if (data.route?.geometry?.coordinates?.length) {
          baselineCoords = data.route.geometry.coordinates
        }
      } catch { /* use fallback coords */ }

      map.addSource('baseline', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: baselineCoords } }
      })
      map.addLayer({
        id: 'baseline-line', type: 'line', source: 'baseline',
        paint: { 'line-color': '#888888', 'line-width': 3, 'line-dasharray': [3, 2], 'line-opacity': 0.9 }
      })

      map.addSource('obstacle', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'obstacle-fill', type: 'fill', source: 'obstacle',
        paint: { 'fill-color': '#f44336', 'fill-opacity': 0.35 }
      })
      map.addLayer({
        id: 'obstacle-outline', type: 'line', source: 'obstacle',
        paint: { 'line-color': '#f44336', 'line-width': 2.5 }
      })

      for (const id of ['route-1', 'route-2']) {
        map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addLayer({
          id: `${id}-glow`, type: 'line', source: id,
          paint: { 'line-color': ROUTE_COLORS[id], 'line-width': 14, 'line-opacity': 0, 'line-blur': 8 }
        })
        map.addLayer({
          id: `${id}-line`, type: 'line', source: id,
          paint: { 'line-color': ROUTE_COLORS[id], 'line-width': 5, 'line-opacity': 0 }
        })
      }

      setMapReady(true)
    })
  }, [mapboxToken])

  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current
    map.getSource('obstacle')?.setData(
      obstacleVisible ? obstacle : { type: 'FeatureCollection', features: [] }
    )
    if (map.getLayer('baseline-line')) {
      map.setPaintProperty('baseline-line', 'line-opacity', obstacleVisible ? 0.25 : 0.9)
    }
  }, [obstacleVisible, obstacle, mapReady])

  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current
    for (const id of ['route-1', 'route-2']) {
      const route = routes.find(r => r.id === id)
      if (!route) continue
      map.getSource(id)?.setData({ type: 'Feature', geometry: route.geometry, properties: {} })
      map.setPaintProperty(`${id}-line`, 'line-opacity', route.visible ? 0.9 : 0)
      map.setPaintProperty(`${id}-glow`, 'line-opacity', route.visible ? 0.25 : 0)
    }
  }, [routes, mapReady])

  return <div ref={containerRef} className="map-container" />
}
