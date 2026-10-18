// Плоский 2D-рендер лица на canvas: треугольники сортируются по глубине (painter's algorithm), глаза - вместе с ними.
//   eyes         - описание контуров глаз (EYES)
//   getTriangles - () => треугольники меша; getFaceTex - () => загруженная текстура лица или null
export function createFlatRenderer({ meshCanvas, controls, eyes: EYES, getTriangles, getFaceTex }) {
  const { toggleTexture, toggleEyes } = controls;
  const c = meshCanvas.getContext("2d");
  const faceRGB = { r: 0, g: 0, b: 0 }; // базовый цвет лица

  /** hex вида "#rrggbb" */
  function setFaceColor(hex) {
    faceRGB.r = parseInt(hex.slice(1, 3), 16); faceRGB.g = parseInt(hex.slice(3, 5), 16); faceRGB.b = parseInt(hex.slice(5, 7), 16);
  }

  // Аффинное отображение треугольника текстуры на экранный треугольник + затемнение по освещённости
  function drawTexturedTri(c, f, tex, light) {
    const { uv, w, h } = tex;
    const u0 = uv[f.ia*2]*w, v0 = uv[f.ia*2+1]*h, u1 = uv[f.ib*2]*w, v1 = uv[f.ib*2+1]*h, u2 = uv[f.ic*2]*w, v2 = uv[f.ic*2+1]*h;
    const det = (u1-u0)*(v2-v0) - (u2-u0)*(v1-v0);
    if (!det) return;
    const { a: A, b: B, c: C } = f;
    const m = (p0, p1, p2) => {
      const k = ((p1-p0)*(v2-v0) - (p2-p0)*(v1-v0)) / det;
      const l = ((p2-p0)*(u1-u0) - (p1-p0)*(u2-u0)) / det;
      return [k, l, p0 - k*u0 - l*v0];
    };
    const [a, c2, e] = m(A.x, B.x, C.x), [b, d, g] = m(A.y, B.y, C.y);
    // клип чуть расширен от центра, чтобы между соседними треугольниками не было щелей
    const cx = (A.x+B.x+C.x)/3, cy = (A.y+B.y+C.y)/3;
    const grow = p => { const dx = p.x-cx, dy = p.y-cy, L = Math.hypot(dx, dy) || 1; return [p.x + dx/L*0.6, p.y + dy/L*0.6]; };
    const path = () => {
      c.beginPath();
      const [x0, y0] = grow(A), [x1, y1] = grow(B), [x2, y2] = grow(C);
      c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineTo(x2, y2); c.closePath();
    };
    c.save();
    path(); c.clip();
    c.setTransform(a, b, c2, d, e, g);
    c.drawImage(tex.img, 0, 0);
    c.restore();
    if (light < 1) {
      c.fillStyle = `rgba(0,0,0,${1 - light})`;
      path(); c.fill();
    }
  }

  function drawEye(c, pts, eye) {
    const iris = pts[eye.iris];
    if (!iris || !pts[eye.contour[0]]) return;
    const [e1, e2] = eye.irisEdge.map(i => pts[i]);
    const irisR = Math.hypot(e1.x - e2.x, e1.y - e2.y) / 2;

    const path = () => {
      c.beginPath();
      eye.contour.forEach((i, k) => k ? c.lineTo(pts[i].x, pts[i].y) : c.moveTo(pts[i].x, pts[i].y));
      c.closePath();
    };

    path();
    c.fillStyle = "#f4f4f4";
    c.fill();

    // радужка и зрачок следуют за реальной позицией радужки с камеры; обрезаем по контуру глаза
    c.save();
    path();
    c.clip();
    c.beginPath();
    c.arc(iris.x, iris.y, irisR, 0, 2 * Math.PI);
    c.fillStyle = "#3a7bd5";
    c.fill();
    c.beginPath();
    c.arc(iris.x, iris.y, irisR * 0.45, 0, 2 * Math.PI);
    c.fillStyle = "#000";
    c.fill();
    c.restore();

    path();
    c.strokeStyle = "#222";
    c.lineWidth = 2;
    c.stroke();
  }

  function draw(zpts) {
    const tex = getFaceTex();
    const faces = [];
    for (const [ia, ib, ic] of getTriangles()) {
      const a = zpts[ia], b = zpts[ib], c = zpts[ic];
      if (!a || !b || !c) continue;

      const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
      const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      const facing = Math.abs(nz) / len;

      faces.push({ a, b, c, ia, ib, ic, avgZ: (a.z + b.z + c.z) / 3, facing });
    }

    if (zpts.length > 477 && toggleEyes.checked) for (const eye of EYES) {
      // глаз сортируется вместе с треугольниками: нос и другие ближние грани рисуются поверх него
      const ring = eye.contour.map(i => zpts[i]);
      const w = Math.hypot(ring[0].x - ring[8].x, ring[0].y - ring[8].y);
      faces.push({ eye, avgZ: ring.reduce((s, p) => s + p.z, 0) / ring.length - w * 0.15 });
    }

    faces.sort((f1, f2) => f2.avgZ - f1.avgZ);

    for (const f of faces) {
      if (f.eye) { drawEye(c, zpts, f.eye); continue; }
      const light = 0.25 + f.facing * 0.75;
      if (toggleTexture.checked && tex && f.ia < 468 && f.ib < 468 && f.ic < 468) { drawTexturedTri(c, f, tex, light); continue; }
      const r = Math.floor(faceRGB.r * light);
      const g = Math.floor(faceRGB.g * light);
      const b = Math.floor(faceRGB.b * light);
      c.fillStyle = `rgb(${r}, ${g}, ${b})`;
      c.strokeStyle = `rgb(${r}, ${g}, ${b})`;
      c.lineWidth = 0.6;
      c.beginPath();
      c.moveTo(f.a.x, f.a.y);
      c.lineTo(f.b.x, f.b.y);
      c.lineTo(f.c.x, f.c.y);
      c.closePath();
      c.fill();
      c.stroke();
    }
  }

  return { draw, setFaceColor };
}
