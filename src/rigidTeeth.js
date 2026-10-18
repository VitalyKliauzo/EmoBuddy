import * as THREE from "three";
import { fitRigid } from "./rigidFit.js";
import { STABLE_POINTS } from "./stablePoints.js";

// Жёсткие 3D-зубы для гладкого рендера (аналог глазных яблок): две неизменяемые дуги зубов + тёмная полость рта.
// Форма зубов не зависит от текущего раскрытия/растяжения рта - по кадрам меняется только положение и поворот дуг:
//   верхняя дуга жёстко привязана к черепу (совмещение неподвижных точек), нижняя - к нижней челюсти (совмещение точек подбородка и
//   линии челюсти); масштаб обеих берётся от черепа.
// Меш лица в режиме "rigid" без треугольников внутри рта; зубы существуют всегда и видны только там, где губы открыты.
// Координаты сцены: x вправо, y вниз, z к камере (z MediaPipe инвертирован).

// Внутренний контур губ по кругу: верхняя дуга слева направо, затем нижняя справа налево
const MOUTH_LOOP = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
export const MOUTH_HOLE = new Set(MOUTH_LOOP);

const MW = 0.36;                                   // ширина рта в нейтральном положении, в долях ширины лица
// Ширины и высоты зубов от середины к краю (доли MW): резцы, клык, премоляры, моляры. 8 зубов на сторону = 16 на челюсть.
// Обе челюсти целиком наклонены вокруг поперечной оси (шарнир - передние зубы): задние зубы поднимаются сильно, передние чуть-чуть
// (одинаково у верхней и нижней, чтобы прикус сохранял общую плоскость смыкания)
const TILT_PITCH = 12 * Math.PI / 180, TILT_FRONT_LIFT = 0.03; // угол наклона; подъём передних зубов (доли MW)
const WIDEN = 1.4; // зубы в 1.4 раза шире исходных
const WIDTHS = [0.105, 0.085, 0.09, 0.08, 0.08, 0.1, 0.1, 0.1].map(w => w * WIDEN);
const TEETH = {
  up: { w: WIDTHS, h: [0.17, 0.14, 0.15, 0.12, 0.11, 0.1, 0.1, 0.1] },
  low: { w: WIDTHS, h: [0.12, 0.12, 0.13, 0.11, 0.1, 0.1, 0.1, 0.1] }
};
const ARCH_R = 0.35;                               // радиус дуги, вдоль которой стоят зубы (доли MW); меньше - круче загиб к краям
const SETBACK = 0.2;                               // отступ зубов вглубь от плоскости губ
const CLOSED = 0.05, CALIB_FRAMES = 45, REF_FRAMES = 30; // рот закрыт при раскрытии < CLOSED ширины рта; кадров усреднения привязки и эталона
const LOWER_DROP = 0.12;                           // нижняя дуга опущена вниз примерно на длину зуба относительно линии губ (доли MW)
const EDGE_UP = 0.04, EDGE_LOW = 0.03 - LOWER_DROP;             // на сколько режущий край заходит за линию губ (при закрытом рте зубы смыкаются внахлёст на сумму, а не по всей длине)
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

// Дуга зубов в системе рта (единица = MW, y вниз): режущий край верхних на EDGE_UP ниже точки (0,0,0), нижних на EDGE_LOW выше неё (отрицательное - ниже)
function archGeo(up) {
  const parts = [], { w: widths, h: heights } = up ? TEETH.up : TEETH.low;
  const quarter = ARCH_R * Math.PI / 2;
  // Путь по длине дуги s: четверть окружности радиуса ARCH_R спереди, дальше ряд идёт прямо назад (U-образная дуга)
  const path = (s) => s <= quarter
    ? { x: ARCH_R * Math.sin(s / ARCH_R), z: -ARCH_R * (1 - Math.cos(s / ARCH_R)), th: s / ARCH_R }
    : { x: ARCH_R, z: -ARCH_R - (s - quarter), th: Math.PI / 2 };
  // Наклон всей челюсти (отрицательный угол вокруг X: чем глубже зуб по -z, тем выше он по -y) + подъём вперёд
  const tilt = new THREE.Matrix4();
  tilt.makeTranslation(0, -TILT_FRONT_LIFT, 0).multiply(new THREE.Matrix4().makeTranslation(0, 0, -SETBACK))
    .multiply(new THREE.Matrix4().makeRotationX(-TILT_PITCH)).multiply(new THREE.Matrix4().makeTranslation(0, 0, SETBACK));
  for (const side of [1, -1]) {
    let arc = 0; // длина дуги от середины
    widths.forEach((w, i) => {
      const h = heights[i];
      const { x, z, th } = path(arc + w / 2); // зубы стоят вплотную вдоль дуги, касательная задаёт поворот
      const y = up ? EDGE_UP - h / 2 : -EDGE_LOW + h / 2;
      const g = toothGeo(w, h);
      g.applyMatrix4(new THREE.Matrix4().makeRotationY(side * th).setPosition(side * x, y, -SETBACK + z));
      g.applyMatrix4(tilt);
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

  // --- Привязка к жёстким телам: жёсткое совмещение набора точек с эталонной конфигурацией (rigidFit.js) ---
  // Череп - неподвижные точки (stablePoints.js), нижняя челюсть - точки подбородка и линии челюсти. Эталон тела (центрирован,
  // RMS = 1) усредняется по первым REF_FRAMES кадрам; дальше каждый кадр даёт поворот q, масштаб s и сдвиг c тела.
  const SKULL_IDS = STABLE_POINTS.flatMap(g => g.ids);
  // только нижняя часть подбородка (низ челюсти под нижней губой), без линии челюсти у ушей
  const JAW_IDS = [152, 175, 199, 200, 18, 83, 313, 148, 377, 176, 400, 171, 396, 140, 369, 149, 378];
  const qInv = new THREE.Quaternion(), tmp = new THREE.Vector3();
  function createBody(ids) {
    const cur = ids.map(() => new THREE.Vector3());
    let ref = null, n = 0;
    const normalize = () => {
      const c = new THREE.Vector3();
      ref.forEach(v => c.add(v));
      c.divideScalar(ref.length);
      let sq = 0;
      ref.forEach(v => { v.sub(c); sq += v.lengthSq(); });
      ref.forEach(v => v.multiplyScalar(1 / Math.sqrt(sq / ref.length || 1)));
    };
    return {
      ids,
      get ready() { return n >= REF_FRAMES; },
      refDist: (a, b) => ref[ids.indexOf(a)].distanceTo(ref[ids.indexOf(b)]), // расстояние в единицах эталона
      fit(pts) {
        ids.forEach((id, i) => cur[i].set(pts[id].x, pts[id].y, -pts[id].z));
        if (!ref) { ref = cur.map(v => v.clone()); normalize(); n = 1; }
        const f = fitRigid(ref, cur);
        if (n < REF_FRAMES) { // прогрев: уточняем эталон, выровняв текущий кадр на него
          qInv.copy(f.q).invert();
          cur.forEach((v, i) => ref[i].multiplyScalar(n).add(tmp.copy(v).sub(f.c).applyQuaternion(qInv).divideScalar(f.s)).divideScalar(n + 1));
          normalize();
          n++;
        }
        return f;
      }
    };
  }
  const skull = createBody(SKULL_IDS), jaw = createBody(JAW_IDS);
  let faceRef = 1;

  // Привязка дуги к телу: положение (в эталонных единицах тела) и поворот относительно тела. Усредняется по первым CALIB_FRAMES
  // кадров с закрытым ртом (губы лежат на зубах); до первого закрытого кадра берётся текущий; потом дуга неподвижна относительно тела.
  function createAnchor() {
    let p = null, q = null, closedN = 0;
    return {
      pose(f, point, lipQ, closed, out) {
        qInv.copy(f.q).invert();
        if (closedN < CALIB_FRAMES && (closed || !p)) {
          const w = closed && p && closedN > 0 ? 1 / (closedN + 1) : 1;
          const np = tmp.copy(point).sub(f.c).applyQuaternion(qInv).divideScalar(f.s), nq = qInv.clone().multiply(lipQ);
          if (!p) { p = np.clone(); q = nq; } else { p.lerp(np, w); q.slerp(nq, w); }
          if (closed) closedN++;
        }
        out.q.copy(f.q).multiply(q);
        out.p.copy(p).multiplyScalar(f.s).applyQuaternion(f.q).add(f.c);
        return out;
      }
    };
  }
  const upperAnchor = createAnchor(), lowerAnchor = createAnchor();
  const upPose = { p: new THREE.Vector3(), q: new THREE.Quaternion() }, lowPose = { p: new THREE.Vector3(), q: new THREE.Quaternion() };

  const mouthOpen = (pts) => Math.hypot(pts[13].x - pts[14].x, pts[13].y - pts[14].y) / (Math.hypot(pts[78].x - pts[308].x, pts[78].y - pts[308].y) || 1);
  const sub = (a, b) => new THREE.Vector3(a.x - b.x, a.y - b.y, -(a.z - b.z));
  const lipQ = new THREE.Quaternion(), lipM = new THREE.Matrix4();
  const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3();

  function update(pts, visible) {
    const show = visible && pts.length > 454; // зубы есть всегда; закрытый рот прячет их за губами (depth-тест)
    arches.forEach(m => { m.visible = show; });
    cavity.visible = show;
    if (!show) return;

    const skullFit = skull.fit(pts), jawFit = jaw.fit(pts);
    const ready = skull.ready && jaw.ready;
    if (ready && faceRef === 1) faceRef = skull.refDist(234, 454);

    // Система губ (нужна только для ориентации и привязки в закрытом рте): X - щека->щека, Y - лоб->подбородок, Z = X x Y
    X.copy(sub(pts[454], pts[234])).normalize();
    Y.copy(sub(pts[152], pts[10]));
    Y.addScaledVector(X, -Y.dot(X)).normalize();
    Z.crossVectors(X, Y);
    lipQ.setFromRotationMatrix(lipM.makeBasis(X, Y, Z));
    const p13 = new THREE.Vector3(pts[13].x, pts[13].y, -pts[13].z), p14 = new THREE.Vector3(pts[14].x, pts[14].y, -pts[14].z);

    const S = ready ? skullFit.s * faceRef : Math.hypot(pts[454].x - pts[234].x, pts[454].y - pts[234].y, pts[454].z - pts[234].z) || 1;
    const sc = new THREE.Vector3().setScalar(S * MW);

    if (!ready) { // пока эталоны не готовы - дуги едут за губами
      arches[0].matrix.compose(p13, lipQ, sc);
      arches[1].matrix.compose(p14, lipQ, sc);
    } else {
      const closed = mouthOpen(pts) < CLOSED;
      upperAnchor.pose(skullFit, p13, lipQ, closed, upPose);
      lowerAnchor.pose(jawFit, p14, lipQ, closed, lowPose);
      arches[0].matrix.compose(upPose.p, upPose.q, sc);
      arches[1].matrix.compose(lowPose.p, lowPose.q, sc);
    }
    arches.forEach(m => { m.matrixWorldNeedsUpdate = true; });

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
