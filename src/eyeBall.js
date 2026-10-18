// Geometry of the "eyeball" for the "ball" eye mode (shared by the flat and smooth renderers).
// The eyeball is a sphere sunk behind the eyelid plane (as in the GLB avatar); the pupil looks where the iris shifted on the camera.
// All coordinates in the scene: x right, y down, z toward camera (MediaPipe z is inverted).

export const IRIS_RATIO = 0.42;  // iris radius / eyeball radius
export const PUPIL_RATIO = 0.45; // pupil radius / iris radius
const SINK = 0.9;                // how many radii the eyeball center is sunk behind the eyelid plane
const MAX_GAZE = 0.8;            // maximum sin of the gaze angle

const norm = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return { x: x / l, y: y / l, z: z / l }; };

/** Vertex indices of all triangles lying entirely inside the eye contour (hole for the eyeball). */
export function eyeHoleSets(eyes) {
  return eyes.map(e => new Set(e.contour));
}

/** @returns {{center, r, normal, gaze}} sphere center and radius, eyelid plane normal, gaze direction (unit vectors) */
export function eyeBall(pts, eye) {
  const ring = eye.contour.map(i => pts[i]);
  const n = ring.length;
  let cx = 0, cy = 0, cz = 0;
  for (const p of ring) { cx += p.x; cy += p.y; cz += -p.z; }
  cx /= n; cy /= n; cz /= n;

  // plane z = cz + gx*dx + gy*dy by least squares
  let sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
  for (const p of ring) {
    const dx = p.x - cx, dy = p.y - cy, dz = -p.z - cz;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy; sxz += dx * dz; syz += dy * dz;
  }
  const det = sxx * syy - sxy * sxy || 1;
  const gx = (sxz * syy - syz * sxy) / det, gy = (syz * sxx - sxz * sxy) / det;
  const normal = norm(-gx, -gy, 1);

  const a = ring[0], b = ring[8]; // outer and inner eye corners
  const r = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) * 0.5;
  const center = { x: cx - normal.x * r * SINK, y: cy - normal.y * r * SINK, z: cz - normal.z * r * SINK };

  // gaze: iris offset from the eye center in the eyelid plane -> sphere tilt
  const iris = pts[eye.iris];
  let tx = iris.x - cx, ty = iris.y - cy, tz = -iris.z - cz;
  const along = tx * normal.x + ty * normal.y + tz * normal.z;
  tx -= normal.x * along; ty -= normal.y * along; tz -= normal.z * along;
  const tl = Math.hypot(tx, ty, tz);
  const s = Math.min(tl / r, MAX_GAZE), c = Math.sqrt(1 - s * s);
  const k = tl ? s / tl : 0;
  const gaze = { x: tx * k + normal.x * c, y: ty * k + normal.y * c, z: tz * k + normal.z * c };

  return { center, r, normal, gaze };
}
