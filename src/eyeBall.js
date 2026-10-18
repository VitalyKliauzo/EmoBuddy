// Геометрия «глазного яблока» для режима глаз "ball" (общая для плоского и гладкого рендера).
// Яблоко - сфера, утопленная за плоскость век (как в GLB-аватаре), зрачок смотрит в сторону, куда сместилась радужка на камере.
// Все координаты в сцене: x вправо, y вниз, z к камере (z MediaPipe инвертирован).

export const IRIS_RATIO = 0.42;  // радиус радужки / радиус яблока
export const PUPIL_RATIO = 0.45; // радиус зрачка / радиус радужки
const SINK = 0.9;                // на сколько радиусов центр яблока утоплен за плоскость век
const MAX_GAZE = 0.8;            // максимальный sin угла взгляда

const norm = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return { x: x / l, y: y / l, z: z / l }; };

/** Индексы вершин всех треугольников, лежащих целиком внутри контура глаза (отверстие под яблоко). */
export function eyeHoleSets(eyes) {
  return eyes.map(e => new Set(e.contour));
}

/** @returns {{center, r, normal, gaze}} центр и радиус сферы, нормаль плоскости век, направление взгляда (единичные векторы) */
export function eyeBall(pts, eye) {
  const ring = eye.contour.map(i => pts[i]);
  const n = ring.length;
  let cx = 0, cy = 0, cz = 0;
  for (const p of ring) { cx += p.x; cy += p.y; cz += -p.z; }
  cx /= n; cy /= n; cz /= n;

  // плоскость z = cz + gx*dx + gy*dy по МНК
  let sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
  for (const p of ring) {
    const dx = p.x - cx, dy = p.y - cy, dz = -p.z - cz;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy; sxz += dx * dz; syz += dy * dz;
  }
  const det = sxx * syy - sxy * sxy || 1;
  const gx = (sxz * syy - syz * sxy) / det, gy = (syz * sxx - sxz * sxy) / det;
  const normal = norm(-gx, -gy, 1);

  const a = ring[0], b = ring[8]; // внешний и внутренний уголки глаза
  const r = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) * 0.5;
  const center = { x: cx - normal.x * r * SINK, y: cy - normal.y * r * SINK, z: cz - normal.z * r * SINK };

  // взгляд: смещение радужки от центра глаза в плоскости век -> наклон сферы
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
