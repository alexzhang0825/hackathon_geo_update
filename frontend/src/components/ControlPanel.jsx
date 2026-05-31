import { useRef, useState } from 'react'

export default function ControlPanel({
  onDroneTrigger, onImageUpload, onReset,
  loading, analyzing, obstacleVisible, aiAnalysis,
  troopSize, setTroopSize, threatLevel, setThreatLevel,
  routes
}) {
  const fileRef = useRef(null)
  // Pre-filled with real EXIF GPS from drone photo (Samsung SM-A520W)
  const [gpsLat, setGpsLat] = useState('49.2628')
  const [gpsLng, setGpsLng] = useState('-123.1300')
  const [preview, setPreview] = useState(null)

  const threatLabels = ['', 'LOW', 'GUARDED', 'ELEVATED', 'HIGH', 'CRITICAL']
  const threatColors = ['', '#4caf50', '#8bc34a', '#ff9800', '#ff5722', '#f44336']

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setPreview(URL.createObjectURL(file))
    const gpsCenter = gpsLat && gpsLng
      ? { lat: parseFloat(gpsLat), lng: parseFloat(gpsLng) }
      : null
    onImageUpload(file, gpsCenter)
  }

  const busy = loading || analyzing

  return (
    <aside className="control-panel">

      {/* ── AI Image Analysis ── */}
      <div className="panel-section">
        <div className="section-label">DRONE IMAGE ANALYSIS</div>

        <div className="gps-row">
          <div className="gps-field">
            <span className="gps-label">LAT</span>
            <input className="gps-input" value={gpsLat}
              onChange={e => setGpsLat(e.target.value)} placeholder="49.2792" />
          </div>
          <div className="gps-field">
            <span className="gps-label">LNG</span>
            <input className="gps-input" value={gpsLng}
              onChange={e => setGpsLng(e.target.value)} placeholder="-123.1087" />
          </div>
        </div>

        <input ref={fileRef} type="file" accept="image/*"
          style={{ display: 'none' }} onChange={handleFile} />

        <button
          className={`drone-btn ${analyzing ? 'loading' : ''}`}
          onClick={() => fileRef.current?.click()}
          disabled={busy || obstacleVisible}
        >
          {analyzing
            ? <><span className="spinner" /> AI ANALYZING IMAGE…</>
            : '▲ UPLOAD DRONE IMAGE'}
        </button>

        {preview && (
          <div className="image-preview">
            <img src={preview} alt="drone" />
            {aiAnalysis && (
              <div className={`ai-result risk-${aiAnalysis.risk_level || 0}`}>
                <div className="ai-threat-type">{aiAnalysis.threat_type || 'ANALYSIS COMPLETE'}</div>
                <div className="ai-desc">{aiAnalysis.threat_description}</div>
                {aiAnalysis.risk_level && (
                  <div className="ai-risk">RISK LEVEL: {aiAnalysis.risk_level}/5</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Manual trigger ── */}
      <div className="panel-section">
        <div className="section-label">MANUAL TRIGGER</div>
        {!obstacleVisible ? (
          <button className="drone-btn" onClick={onDroneTrigger} disabled={busy}>
            ▶ SIMULATE OBSTACLE
          </button>
        ) : (
          <button className="drone-btn triggered" onClick={onReset}>
            ↺ RESET MISSION
          </button>
        )}
      </div>

      {/* ── Parameters ── */}
      <div className="panel-section">
        <div className="section-label">PARAMETERS</div>

        <div className="param-group">
          <div className="param-header">
            <span>TROOP SIZE</span>
            <span className="param-value">{troopSize}</span>
          </div>
          <input type="range" min="1" max="100" value={troopSize}
            onChange={e => setTroopSize(+e.target.value)} className="tactical-slider" />
          <div className="param-hints"><span>LIGHT</span><span>HEAVY</span></div>
        </div>

        <div className="param-group">
          <div className="param-header">
            <span>THREAT LEVEL</span>
            <span className="param-value" style={{ color: threatColors[threatLevel] }}>
              {threatLabels[threatLevel]}
            </span>
          </div>
          <input type="range" min="1" max="5" value={threatLevel}
            onChange={e => setThreatLevel(+e.target.value)}
            className="tactical-slider threat"
            style={{ '--thumb-color': threatColors[threatLevel] }} />
          <div className="param-hints">
            <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
          </div>
        </div>
      </div>

      {/* ── Routes ── */}
      <div className="panel-section">
        <div className="section-label">ROUTES</div>
        {routes.length === 0
          ? <div className="no-routes">Awaiting obstacle data…</div>
          : routes.map(r => <RouteCard key={r.id} route={r} />)
        }
      </div>

      {/* ── Legend ── */}
      <div className="panel-footer">
        {[['#888', 'Original route'], ['#00e5ff', 'Alpha route'],
          ['#ff9800', 'Bravo route'], ['#f44336', 'Obstacle / threat zone']
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
  const scoreClass = route.score >= 40 ? 'high' : route.score >= 20 ? 'med' : 'low'
  const color = route.id === 'route-1' ? '#00e5ff' : '#ff9800'
  return (
    <div className={`route-card ${route.visible ? 'active' : 'rejected'}`}
      style={{ '--route-color': color }}>
      <div className="route-card-header">
        <span className="route-name" style={{ color }}>{route.label}</span>
        {!route.visible && <span className="rejected-badge">REJECTED</span>}
      </div>
      <div className="route-card-stats">
        <div className="stat">
          <div className="stat-label">DISTANCE</div>
          <div className="stat-value">{(route.length_m / 1000).toFixed(2)} km</div>
        </div>
        <div className="stat">
          <div className="stat-label">SCORE</div>
          <div className={`stat-value score-${scoreClass}`}>
            {route.visible ? route.score : '—'}
          </div>
        </div>
      </div>
      {route.visible && (
        <div className="score-bar-track">
          <div className="score-bar-fill"
            style={{ width: `${Math.min(100, route.score)}%`, background: color }} />
        </div>
      )}
    </div>
  )
}
