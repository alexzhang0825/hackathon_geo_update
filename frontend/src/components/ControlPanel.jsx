export default function ControlPanel({
  onDroneTrigger, loading, obstacleVisible,
  troopSize, setTroopSize, threatLevel, setThreatLevel,
  routes
}) {
  const threatLabels = ['', 'LOW', 'GUARDED', 'ELEVATED', 'HIGH', 'CRITICAL']
  const threatColors = ['', '#4caf50', '#8bc34a', '#ff9800', '#ff5722', '#f44336']

  return (
    <aside className="control-panel">
      <div className="panel-section">
        <div className="section-label">TRIGGER</div>
        <button
          className={`drone-btn ${loading ? 'loading' : ''} ${obstacleVisible ? 'triggered' : ''}`}
          onClick={onDroneTrigger}
          disabled={loading || obstacleVisible}
        >
          {loading
            ? <><span className="spinner" /> ANALYZING IMAGE…</>
            : obstacleVisible
              ? '⬛ OBSTACLE ACTIVE'
              : '▶ DRONE IMAGE RECEIVED'
          }
        </button>
      </div>

      <div className="panel-section">
        <div className="section-label">PARAMETERS</div>

        <div className="param-group">
          <div className="param-header">
            <span>TROOP SIZE</span>
            <span className="param-value">{troopSize}</span>
          </div>
          <input
            type="range" min="1" max="100" value={troopSize}
            onChange={e => setTroopSize(+e.target.value)}
            className="tactical-slider"
          />
          <div className="param-hints">
            <span>LIGHT</span><span>HEAVY</span>
          </div>
        </div>

        <div className="param-group">
          <div className="param-header">
            <span>THREAT LEVEL</span>
            <span className="param-value" style={{ color: threatColors[threatLevel] }}>
              {threatLabels[threatLevel]}
            </span>
          </div>
          <input
            type="range" min="1" max="5" value={threatLevel}
            onChange={e => setThreatLevel(+e.target.value)}
            className="tactical-slider threat"
            style={{ '--thumb-color': threatColors[threatLevel] }}
          />
          <div className="param-hints">
            <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
          </div>
        </div>
      </div>

      <div className="panel-section">
        <div className="section-label">ROUTES</div>
        {routes.length === 0 ? (
          <div className="no-routes">Awaiting obstacle data…</div>
        ) : (
          routes.map(route => <RouteCard key={route.id} route={route} />)
        )}
      </div>

      <div className="panel-footer">
        <div className="legend-row">
          <span className="legend-dot" style={{ background: '#888' }} />
          <span>Original route</span>
        </div>
        <div className="legend-row">
          <span className="legend-dot" style={{ background: '#00e5ff' }} />
          <span>Alpha route</span>
        </div>
        <div className="legend-row">
          <span className="legend-dot" style={{ background: '#ff9800' }} />
          <span>Bravo route</span>
        </div>
        <div className="legend-row">
          <span className="legend-dot" style={{ background: '#f44336' }} />
          <span>Obstacle zone</span>
        </div>
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
        <span className="route-name" style={{ color }}>
          {route.label}
        </span>
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
          <div
            className="score-bar-fill"
            style={{ width: `${Math.min(100, route.score)}%`, background: color }}
          />
        </div>
      )}
    </div>
  )
}
