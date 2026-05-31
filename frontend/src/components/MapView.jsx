import { useEffect, useRef, useState } from 'react'

const CENTER       = [-123.1215, 49.2635]
const ROUTE_COLORS = { 'route-1': '#00e5ff', 'route-2': '#ff9800' }

export default function MapView({
  startPoint, endPoint, placingMarker, onMapClick,
  threats, routes, mapboxToken,
}) {
  const containerRef   = useRef(null)
  const mapRef         = useRef(null)
  const startMarkerRef = useRef(null)
  const endMarkerRef   = useRef(null)
  const onMapClickRef  = useRef(onMapClick)
  const [mapReady, setMapReady] = useState(false)

  // Keep click handler ref current without re-registering the listener
  useEffect(() => { onMapClickRef.current = onMapClick }, [onMapClick])

  // ── initialise map ────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current || !window.mapboxgl) return
    const mapboxgl = window.mapboxgl
    mapboxgl.accessToken = mapboxToken

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: CENTER,
      zoom: 13,
      pitch: 30,
    })
    mapRef.current = map

    map.addControl(new mapboxgl.NavigationControl(), 'top-left')

    // Single stable click handler — reads current callback via ref
    map.on('click', (e) => {
      onMapClickRef.current([e.lngLat.lng, e.lngLat.lat])
    })

    map.on('load', () => {
      // Threat overlay
      map.addSource('threats', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'threats-fill', type: 'fill', source: 'threats',
        paint: { 'fill-color': '#f44336', 'fill-opacity': 0.35 },
      })
      map.addLayer({
        id: 'threats-outline', type: 'line', source: 'threats',
        paint: { 'line-color': '#f44336', 'line-width': 2.5 },
      })

      // Route layers
      for (const id of ['route-1', 'route-2']) {
        map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addLayer({
          id: `${id}-glow`, type: 'line', source: id,
          paint: { 'line-color': ROUTE_COLORS[id], 'line-width': 14, 'line-opacity': 0, 'line-blur': 8 },
        })
        map.addLayer({
          id: `${id}-line`, type: 'line', source: id,
          paint: { 'line-color': ROUTE_COLORS[id], 'line-width': 5, 'line-opacity': 0 },
        })
      }

      setMapReady(true)
    })
  }, [mapboxToken])

  // ── cursor: crosshair while placing ──────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return
    mapRef.current.getCanvas().style.cursor = placingMarker ? 'crosshair' : ''
  }, [placingMarker])

  // ── A marker ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const mapboxgl = window.mapboxgl
    startMarkerRef.current?.remove()
    if (startPoint) {
      const el = markerEl('A', '#00e5ff')
      startMarkerRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat(startPoint)
        .setPopup(new mapboxgl.Popup({ offset: 20 }).setHTML('<b>POINT ALPHA</b><br>Unit origin'))
        .addTo(mapRef.current)
    }
  }, [startPoint, mapReady])

  // ── B marker ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const mapboxgl = window.mapboxgl
    endMarkerRef.current?.remove()
    if (endPoint) {
      const el = markerEl('B', '#ff9800')
      endMarkerRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat(endPoint)
        .setPopup(new mapboxgl.Popup({ offset: 20 }).setHTML('<b>POINT BRAVO</b><br>Objective'))
        .addTo(mapRef.current)
    }
  }, [endPoint, mapReady])

  // ── threat polygons ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    mapRef.current.getSource('threats')?.setData(threats)
  }, [threats, mapReady])

  // ── routes ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current
    for (const id of ['route-1', 'route-2']) {
      const route = routes.find(r => r.id === id)
      const hasRoute = !!route
      map.getSource(id)?.setData(
        hasRoute
          ? { type: 'Feature', geometry: route.geometry, properties: {} }
          : { type: 'FeatureCollection', features: [] }
      )
      map.setPaintProperty(`${id}-line`, 'line-opacity', hasRoute ? 0.9 : 0)
      map.setPaintProperty(`${id}-glow`, 'line-opacity', hasRoute ? 0.25 : 0)
    }
  }, [routes, mapReady])

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
