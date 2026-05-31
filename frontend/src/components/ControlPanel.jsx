import { useRef, useState } from 'react'

export default function ControlPanel({
  startPoint, endPoint, placingMarker, onSetPlacing,
  threats, onToggleThreat, onRemoveThreat,
  onImageUpload, analyzing, loading, routes,
}) {
  const fileRef = useRef(null)
  const [gpsLat,   setGpsLat]   = useState('49.2628')
  const [gpsLng,   setGpsLng]   = useState('-123.1300')
  const [lastAnalysis, setLastAnalysis] = useState(null)

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''
    const gpsCenter = gpsLat && gpsLng
      ? { lat: parseFloat(gpsLat), lng: parseFloat(gpsLng) }
      : null
    const result = await onImageUpload(file, gpsCenter)
    if (result) setLastAnalysis({ ...result, preview: URL.createObjectURL(file) })
  }

  const fmtCoord = (pt) => pt
    ? `${Math.abs(pt[1]).toFixed(4)}°${pt[1] >= 0 ? 'N' : 'S'}  ${Math.abs(pt[0]).toFixed(4)}°${pt[0] >= 0 ? 'E' : 'W'}`
    : 'Not set'

  const busy = loading || analyzing

  return (
    <aside className="control-panel">

      {/* ── Waypoints ── */}
      <div className="panel-section">
        <div className="section-label">WAYPOINTS</div>
        <div className="waypoint-row">
          <div className="waypoint-info">
            <span className="waypoint-dot" style={{ background: '#00e5ff' }}>A</span>
            <span className="waypoint-coord">{fmtCoord(startPoint)}</span>
          </div>
          <button
            className={`waypoint-btn ${placingMarker === 'start' ? 'active' : ''}`}
            onClick={() => onSetPlacing(placingMarker === 'start' ? null : 'start')}
          >
            {placingMarker === 'start' ? 'CLICK MAP…' : 'MOVE'}
          </button>
        </div>
        <div className="waypoint-row">
          <div className="waypoint-info">
            <span className="waypoint-dot" style={{ background: '#ff9800' }}>B</span>
            <span className="waypoint-coord">{fmtCoord(endPoint)}</span>
          </div>
          <button
            className={`waypoint-btn ${placingMarker === 'end' ? 'active' : ''}`}
            onClick={() => onSetPlacing(placingMarker === 'end' ? null : 'end')}
          >
            {placingMarker === 'end' ? 'CLICK MAP…' : 'MOVE'}
          </button>
        </div>
        {placingMarker && (
          <div className="placing-hint">Click anywhere on the map to set {placingMarker === 'start' ? 'Point A' : 'Point B'}</div>
        )}
      </div>

      {/* ── Drone image analysis ── */}
      <div className="panel-section">
        <div className="section-label">DRONE IMAGE ANALYSIS</div>
        <div className="gps-row">
          <div className="gps-field">
            <span className="gps-label">LAT</span>
            <input className="gps-input" value={gpsLat}
              onChange={e => setGpsLat(e.target.value)} placeholder="49.2628" />
          </div>
          <div className="gps-field">
            <span className="gps-label">LNG</span>
            <input className="gps-input" value={gpsLng}
              onChange={e => setGpsLng(e.target.value)} placeholder="-123.1300" />
          </div>
        </div>

        <input ref={fileRef} type="file" accept="image/*"
          style={{ display: 'none' }} onChange={handleFile} />
        <button
          className={`drone-btn ${analyzing ? 'loading' : ''}`}
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          {analyzing
            ? <><span className="spinner" /> AI ANALYZING IMAGE…</>
            : '▲ UPLOAD DRONE IMAGE'}
        </button>

        {lastAnalysis && (
          <div className="image-preview">
            {lastAnalysis.preview && <img src={lastAnalysis.preview} alt="drone" />}
            <div className={`ai-result risk-${lastAnalysis.risk_level || 0}`}>
              <div className="ai-threat-type">{lastAnalysis.threat_type || 'ANALYSIS COMPLETE'}</div>
              <div className="ai-desc">{lastAnalysis.threat_description}</div>
              {lastAnalysis.risk_level && (
                <div className="ai-risk">RISK LEVEL: {lastAnalysis.risk_level}/5</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Threat zones ── */}
      <div className="panel-section">
        <div className="section-label">THREAT ZONES</div>
        {threats.length === 0 ? (
          <div className="no-routes">No threats detected yet</div>
        ) : (
          <div className="threat-list">
            {threats.map(t => (
              <div key={t.id} className={`threat-item ${t.visible ? '' : 'threat-hidden'}`}>
                <div className="threat-item-main">
                  <span className="threat-dot" />
                  <div className="threat-info">
                    <div className="threat-label">{t.label}</div>
                    {t.riskLevel && (
                      <div className="threat-risk">RISK {t.riskLevel}/5</div>
                    )}
                  </div>
                </div>
                <div className="threat-actions">
                  <button
                    className={`threat-toggle ${t.visible ? 'on' : 'off'}`}
                    onClick={() => onToggleThreat(t.id)}
                    title={t.visible ? 'Hide' : 'Show'}
                  >
                    {t.visible ? '◉' : '○'}
                  </button>
                  <button
                    className="threat-remove"
                    onClick={() => onRemoveThreat(t.id)}
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Routes ── */}
      <div className="panel-section">
        <div className="section-label">ROUTES</div>
        {loading ? (
          <div className="no-routes"><span className="spinner" /> Calculating…</div>
        ) : routes.length === 0 ? (
          <div className="no-routes">Set waypoints to generate routes</div>
        ) : (
          routes.map(r => <RouteCard key={r.id} route={r} />)
        )}
      </div>

      <div className="panel-footer">
        {[
          ['#00e5ff', 'Alpha route (shortest)'],
          ['#ff9800', 'Bravo route (alternative)'],
          ['#f44336', 'Threat zone'],
        ].map(([color, label]) => (
          <div key={label} className="legend-row">
            <span className="legend-dot" style={{ background: color }} />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </aside>
  )
}

function RouteCard({ route }) {
  const color = route.id === 'route-1' ? '#00e5ff' : '#ff9800'
  return (
    <div className="route-card active" style={{ '--route-color': color }}>
      <div className="route-card-header">
        <span className="route-name" style={{ color }}>{route.label}</span>
      </div>
      <div className="route-card-stats">
        <div className="stat">
          <div className="stat-label">DISTANCE</div>
          <div className="stat-value">{(route.length_m / 1000).toFixed(2)} km</div>
        </div>
      </div>
    </div>
  )
}
