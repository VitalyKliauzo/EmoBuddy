import * as THREE from "three";

// Жёсткие 3D-зубы для гладкого рендера (аналог глазных яблок): две неизменяемые дуги зубов + тёмная полость рта.
// Форма зубов не зависит от текущего раскрытия/растяжения рта - по кадрам меняется только положение и поворот дуг:
//   верхняя дуга привязана к центру верхней губы (13), нижняя - к центру нижней (14, едет вместе с челюстью);
//   поворот и масштаб берутся из лица целиком (ширина 234-454, оси лоб-подбородок и щека-щека).
// Меш лица в режиме "rigid" без треугольников внутри рта; зубы существуют всегда и видны только там, где губы открыты.
// Координаты сцены: x вправо, y вниз, z к камере (z MediaPipe инвертирован).

// Внутренний контур губ по кругу: верхняя дуга слева направо, затем нижняя справа налево
const MOUTH_LOOP = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
export const MOUTH_HOLE = new Set(MOUTH_LOOP);

const MW = 0.36;                                   // ширина рта в нейтральном положении, в долях ширины лица
const TEETH_W = [0.105, 0.085, 0.09, 0.08];        // ширины зубов от середины к краю (доли MW)
const TEETH_H = { up: [0.17, 0.14, 0.15, 0.12], low: [0.12, 0.12, 0.13, 0.11] };
const ARCH_R = 0.35;                               // радиус дуги, вдоль которой стоят зубы (доли MW); меньше - круче загиб к краям
const SETBACK = 0.2;                               // отступ зубов вглубь от плоскости губ
const EDGE_UP = 0.04, EDGE_LOW = 0.03;             // на сколько режущий край заходит за линию губ (при закрытом рте зубы смыкаются внахлёст на сумму, а не по всей длине)
const CAVITY_DEPTH = 0.16, CAVITY_BACK = 0.22;      // глубина боковых стенок и дна полости (доли ширины лица)

function toothGeo(w, h) {
  const r = Math.min(w, h) * 0.3, x = w / 2, y = h / 2;
  const s = new THREE.Shape();
  s.moveTo(-x + r, -y); s.lineTo(x - r, -y); s.quadraticCurveTo(x, -y, x, -y + r);
  s.lineTo(x, y - r); s.quadraticCurveTo(x, y, x - r, y); s.lineTo(-x + r, y);
  s.quadraticCurveTo(-x, y, -x, y - r); s.lineTo(-x, -y + r); s.quadraticCurveTo(-x, -y, -x + r, -y);
  const depth = w * 0.45, bevel = w * 0.12;
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -depth / 2);
  return g;
}

// Дуга зубов в системе рта (единица = MW, y вниз): режущий край верхних на EDGE_UP ниже точки (0,0,0), нижних на EDGE_LOW выше неё
function archGeo(up) {
  const parts = [];
  for (const side of [1, -1]) {
    let arc = 0; // длина дуги от середины
    TEETH_W.forEach((w, i) => {
      const h = (up ? TEETH_H.up : TEETH_H.low)[i];
      const th = (arc + w / 2) / ARCH_R; // угол центра зуба; зубы стоят вплотную вдоль дуги, касательная задаёт поворот
      const y = up ? EDGE_UP - h / 2 : -EDGE_LOW + h / 2;
      const g = toothGeo(w, h);
      g.applyMatrix4(new THREE.Matrix4().makeRotationY(side * th).setPosition(side * ARCH_R * Math.sin(th), y, -SETBACK - ARCH_R * (1 - Math.cos(th))));
      parts.push(g);
      arc += w;
    });
  }
  const n = parts.reduce((s, g) => s + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) { pos.set(g.attributes.position.array, o); nor.set(g.attributes.normal.array, o); o += g.attributes.position.array.length; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  return geo;
}

/** @returns {{update(pts, visible)}} - добавляет в glScene зубы и полость; update вызывается каждый кадр */
export function createRigidTeeth(glScene, keepNormals) {
  const toothMat = new THREE.MeshLambertMaterial({ color: 0xf6f3ea, side: THREE.DoubleSide });
  keepNormals(toothMat);
  const arches = [true, false].map(up => {
    const mesh = new THREE.Mesh(archGeo(up), toothMat);
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    glScene.add(mesh);
    return mesh;
  });

  // Полость: боковые стенки от контура губ вглубь + дно (веер)
  const n = MOUTH_LOOP.length;
  const cavGeo = new THREE.BufferGeometry();
  cavGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((2 * n + 1) * 3), 3));
  const idx = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    idx.push(i, n + i, n + j, i, n + j, j, n + i, n + j, 2 * n);
  }
  cavGeo.setIndex(idx);
  const cavity = new THREE.Mesh(cavGeo, new THREE.MeshBasicMaterial({ color: 0x3b0d14, side: THREE.DoubleSide }));
  cavity.frustumCulled = false;
  cavity.renderOrder = 4;
  glScene.add(cavity);

  let baseLip = null;
  const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3();
  const sub = (a, b) => new THREE.Vector3(a.x - b.x, a.y - b.y, -(a.z - b.z));

  function update(pts, visible) {
    const show = visible && pts.length > 454; // зубы есть всегда; закрытый рот прячет их за губами (depth-тест)
    arches.forEach(m => { m.visible = show; });
    cavity.visible = show;
    if (!show) return;

    // Система лица: X - щека->щека, Y - лоб->подбородок (ортогонализована), Z = X x Y (к камере)
    const S = Math.hypot(pts[454].x - pts[234].x, pts[454].y - pts[234].y, pts[454].z - pts[234].z) || 1;
    X.copy(sub(pts[454], pts[234])).normalize();
    Y.copy(sub(pts[152], pts[10]));
    Y.addScaledVector(X, -Y.dot(X)).normalize();
    Z.crossVectors(X, Y);

    // Верхняя челюсть неподвижна относительно черепа: высота верхней губы относительно носа (2) запоминается, пока рот закрыт,
    // и верхняя дуга сидит на этой высоте, а не едет за губой. Поднятая губа открывает зубы, опущенная - прячет.
    const open = Math.hypot(pts[13].x - pts[14].x, pts[13].y - pts[14].y);
    const mouthW = Math.hypot(pts[78].x - pts[308].x, pts[78].y - pts[308].y) || 1;
    const lipD = sub(pts[13], pts[2]).dot(Y) / S;
    if (baseLip === null || open < mouthW * 0.05) baseLip = lipD;
    const scale = S * MW;
    [13, 14].forEach((li, k) => {
      const m = arches[k];
      const shift = k === 0 ? (lipD - baseLip) * S : 0; // сдвиг верхней дуги с текущего положения губы на базовое
      m.matrix.makeBasis(X, Y, Z).scale(new THREE.Vector3(scale, scale, scale))
        .setPosition(pts[li].x - Y.x * shift, pts[li].y - Y.y * shift, -pts[li].z - Y.z * shift);
      m.matrixWorldNeedsUpdate = true;
    });

    const a = cavGeo.attributes.position.array;
    let cx = 0, cy = 0, cz = 0;
    MOUTH_LOOP.forEach((li, i) => {
      const p = pts[li], zz = -p.z;
      a.set([p.x, p.y, zz], i * 3);
      a.set([p.x - Z.x * S * CAVITY_DEPTH, p.y - Z.y * S * CAVITY_DEPTH, zz - Z.z * S * CAVITY_DEPTH], (n + i) * 3);
      cx += p.x; cy += p.y; cz += zz;
    });
    const b = S * CAVITY_BACK;
    a.set([cx / n - Z.x * b, cy / n - Z.y * b, cz / n - Z.z * b], 2 * n * 3);
    cavGeo.attributes.position.needsUpdate = true;
  }

  return { update };
}
