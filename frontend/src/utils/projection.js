/**
 * Ray–ground plane intersection for oblique drone imagery.
 *
 * Camera model (ENU = East-North-Up world frame):
 *   yawDeg   – CW bearing from North of the image top edge (0 = North up)
 *   pitchDeg – tilt from nadir (0 = straight down, 45 = 45° forward)
 *
 * This is the exact JS mirror of pixel_to_ground() in backend/main.py so the
 * frontend can reproject live when the user moves the pitch/yaw sliders
 * without an extra network round-trip.
 */

const DEG = Math.PI / 180

/**
 * Back-project one pixel to [lng, lat].
 * Returns null if the ray points upward and misses the ground.
 */
export function pixelToGround(u, v, imgW, imgH, fovDeg, lat, lng, altM, yawDeg, pitchDeg) {
  const f = (imgW / 2) / Math.tan((fovDeg / 2) * DEG)

  const psi   = yawDeg   * DEG
  const theta = pitchDeg * DEG

  // Camera basis vectors in ENU
  const camX = [Math.cos(psi), -Math.sin(psi), 0]
  const camZ = [
    Math.sin(psi) * Math.sin(theta),
    Math.cos(psi) * Math.sin(theta),
    -Math.cos(theta),
  ]
  // image-down = cross(camZ, camX)
  const camY = [
    camZ[1] * camX[2] - camZ[2] * camX[1],
    camZ[2] * camX[0] - camZ[0] * camX[2],
    camZ[0] * camX[1] - camZ[1] * camX[0],
  ]

  const dx = (u - imgW / 2) / f
  const dy = (v - imgH / 2) / f

  const ray = [
    camZ[0] + dx * camX[0] + dy * camY[0],
    camZ[1] + dx * camX[1] + dy * camY[1],
    camZ[2] + dx * camX[2] + dy * camY[2],
  ]

  if (ray[2] >= 0) return null   // ray misses the ground

  const t      = -altM / ray[2]
  const eastM  = t * ray[0]
  const northM = t * ray[1]

  return [
    lng + eastM  / (111111 * Math.cos(lat * DEG)),
    lat + northM / 111111,
  ]
}

/**
 * Compute the 4-corner footprint in Mapbox order: TL, TR, BR, BL.
 * Falls back to an axis-aligned nadir rectangle if any corner misses.
 */
export function computeCorners(imgW, imgH, fovDeg, lat, lng, altM, yawDeg, pitchDeg) {
  const corners = [
    pixelToGround(0,    0,    imgW, imgH, fovDeg, lat, lng, altM, yawDeg, pitchDeg),
    pixelToGround(imgW, 0,    imgW, imgH, fovDeg, lat, lng, altM, yawDeg, pitchDeg),
    pixelToGround(imgW, imgH, imgW, imgH, fovDeg, lat, lng, altM, yawDeg, pitchDeg),
    pixelToGround(0,    imgH, imgW, imgH, fovDeg, lat, lng, altM, yawDeg, pitchDeg),
  ]
  if (corners.some(c => c === null)) return nadirCorners(imgW, imgH, fovDeg, lat, lng, altM)
  return corners
}

/** Axis-aligned nadir fallback (used when oblique corners miss the ground). */
export function nadirCorners(imgW, imgH, fovDeg, lat, lng, altM) {
  const gndW = 2 * altM * Math.tan((fovDeg / 2) * DEG)
  const gndH = gndW * imgH / imgW
  const hw   = gndW / 2 / (111111 * Math.cos(lat * DEG))
  const hh   = gndH / 2 / 111111
  return [
    [lng - hw, lat + hh],
    [lng + hw, lat + hh],
    [lng + hw, lat - hh],
    [lng - hw, lat - hh],
  ]
}

/**
 * Convert an array of pixel bounding-boxes to GeoJSON Polygon Features.
 * Boxes that miss the ground (extreme pitch) are silently dropped.
 */
export function bboxesToThreats(boxes, imgW, imgH, fovDeg, lat, lng, altM, yawDeg, pitchDeg) {
  const features = []
  for (const { x1, y1, x2, y2 } of boxes) {
    const tl = pixelToGround(x1, y1, imgW, imgH, fovDeg, lat, lng, altM, yawDeg, pitchDeg)
    const tr = pixelToGround(x2, y1, imgW, imgH, fovDeg, lat, lng, altM, yawDeg, pitchDeg)
    const br = pixelToGround(x2, y2, imgW, imgH, fovDeg, lat, lng, altM, yawDeg, pitchDeg)
    const bl = pixelToGround(x1, y2, imgW, imgH, fovDeg, lat, lng, altM, yawDeg, pitchDeg)
    if (!tl || !tr || !br || !bl) continue
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[tl, tr, br, bl, tl]] },
      properties: {},
    })
  }
  return features
}

/**
 * Union all threat polygons into a single bounding-box obstacle for route planning.
 */
export function mergeThreats(threats) {
  if (!threats || !threats.length) return null
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
  for (const f of threats) {
    for (const [lng, lat] of f.geometry.coordinates[0]) {
      if (lng < minLng) minLng = lng
      if (lat < minLat) minLat = lat
      if (lng > maxLng) maxLng = lng
      if (lat > maxLat) maxLat = lat
    }
  }
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [minLng, minLat], [maxLng, minLat], [maxLng, maxLat],
        [minLng, maxLat], [minLng, minLat],
      ]],
    },
    properties: { kind: 'obstacle' },
  }
}
