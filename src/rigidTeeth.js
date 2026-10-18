import * as THREE from "three";
import { fitRigid } from "./rigidFit.js";
import { STABLE_POINTS } from "./stablePoints.js";

// Rigid 3D teeth for the smooth render (analogous to eyeballs): two immutable tooth arches + a dark mouth cavity.
// Tooth shape doesn't depend on the current mouth opening/stretch - only arch position and rotation change per frame:
//  the upper arch is rigidly bound to the skull (fit of stable points), the lower one to the lower jaw (fit of chin and
//  jaw line points); the scale of both comes from the skull.
// In "rigid" mode the face mesh has no triangles inside the mouth; teeth always exist and are visible only where the lips are open.
// Scene coordinates: x right, y down, z toward camera (MediaPipe z is inverted).

// Inner lip contour in a loop: upper arc left to right, then lower arc right to left
const MOUTH_LOOP = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
export const MOUTH_HOLE = new Set(MOUTH_LOOP);

const MW = 0.36;                                   // mouth width in neutral pose, as a fraction of face width
// Tooth widths and heights from center to edge (fractions of MW): incisors, canine, premolars, molars. 8 teeth per side = 16 per jaw.
// Both jaws are tilted as a whole around the transverse axis (hinge = front teeth): rear teeth rise a lot, front ones slightly
// (same for upper and lower, so the bite keeps a common closing plane)
const TILT_PITCH = 12 * Math.PI / 180, TILT_FRONT_LIFT = 0.03; // tilt angle; front teeth lift (fractions of MW)
const WIDEN = 1.4; // teeth are 1.4 times wider than the original
const WIDTHS = [0.105, 0.085, 0.09, 0.08, 0.08, 0.1, 0.1, 0.1].map(w => w * WIDEN);
const TEETH = {
  up: { w: WIDTHS, h: [0.17, 0.14, 0.15, 0.12, 0.11, 0.1, 0.1, 0.1] },
  low: { w: WIDTHS, h: [0.12, 0.12, 0.13, 0.11, 0.1, 0.1, 0.1, 0.1] }
};
const ARCH_R = 0.35;                               // radius of the arc the teeth stand along (fractions of MW); smaller - sharper bend toward the edges
const SETBACK = 0.2;                               // teeth setback into depth from the lip plane
const CLOSED = 0.05, CALIB_FRAMES = 45, REF_FRAMES = 30; // mouth is closed when opening < CLOSED of mouth width; frames for averaging the binding and the reference
const LOWER_DROP = 0.12;                           // lower arch is dropped down by about a tooth length relative to the lip line (fractions of MW)
const EDGE_UP = 0.04, EDGE_LOW = 0.03 - LOWER_DROP;             // how far the cutting edge goes past the lip line (with a closed mouth the teeth overlap by the sum, not by the full length)
const CAVITY_DEPTH = 0.16, CAVITY_BACK = 0.22;      // depth of the cavity side walls and floor (fractions of face width)

// Winding direction of the restored triangles is arbitrary, and DoubleSide in Three.js flips the normal of "back" faces -
// hence the checkerboard pattern. We orient normals toward the camera ourselves, so we disable this flip.
export function keepNormals(material) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_begin>",
      THREE.ShaderChunk.normal_fragment_begin.replace("normal *= faceDirection;", "")
    );
  };
}

// Scene lighting shared by the smooth render and the teeth over the flat one: ambient 25% + directional light 75% (in Three.js intensity
// is multiplied by PI). Shadow gradient coefficient = directional light share; ambient = 1 - coefficient (face-on brightness stays the same)
export function addLights(scene, shadowGradient) {
  const ambient = new THREE.AmbientLight(0xffffff, Math.PI * 0.25);
  const key = new THREE.DirectionalLight(0xffffff, Math.PI * 0.75);
  key.position.set(0, -150, 1000);
  scene.add(ambient, key);
  const apply = () => {
    const k = +shadowGradient.value;
    key.intensity = Math.PI * k;
    ambient.intensity = Math.PI * Math.max(0, 1 - k); // at k > 1 ambient = 0, light only gets stronger -> more contrast
  };
  shadowGradient.addEventListener("input", apply);
  apply();
}

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

// Tooth arch in the mouth system (unit = MW, y down): cutting edge of upper teeth EDGE_UP below point (0,0,0), lower ones EDGE_LOW above it (negative - below)
function archGeo(up) {
  const parts = [], { w: widths, h: heights } = up ? TEETH.up : TEETH.low;
  const quarter = ARCH_R * Math.PI / 2;
  // Path along arc length s: a quarter circle of radius ARCH_R at the front, then the row goes straight back (U-shaped arch)
  const path = (s) => s <= quarter
    ? { x: ARCH_R * Math.sin(s / ARCH_R), z: -ARCH_R * (1 - Math.cos(s / ARCH_R)), th: s / ARCH_R }
    : { x: ARCH_R, z: -ARCH_R - (s - quarter), th: Math.PI / 2 };
  // Tilt of the whole jaw (negative angle around X: the deeper the tooth along -z, the higher along -y) + forward lift
  const tilt = new THREE.Matrix4();
  tilt.makeTranslation(0, -TILT_FRONT_LIFT, 0).multiply(new THREE.Matrix4().makeTranslation(0, 0, -SETBACK))
    .multiply(new THREE.Matrix4().makeRotationX(-TILT_PITCH)).multiply(new THREE.Matrix4().makeTranslation(0, 0, SETBACK));
  for (const side of [1, -1]) {
    let arc = 0; // arc length from the center
    widths.forEach((w, i) => {
      const h = heights[i];
      const { x, z, th } = path(arc + w / 2); // teeth stand tightly along the arc, the tangent sets the rotation
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

/** @returns {{update(pts, visible)}} - adds teeth and cavity to glScene; update is called every frame */
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

  // Cavity: side walls from the lip contour inward + floor (fan)
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

  // --- Binding to rigid bodies: rigid fit of a point set to a reference configuration (rigidFit.js) ---
  // Skull - stable points (stablePoints.js), lower jaw - chin and jaw line points. Body reference (centered,
  // RMS = 1) is averaged over the first REF_FRAMES frames; after that each frame gives the body rotation q, scale s and shift c.
  const SKULL_IDS = STABLE_POINTS.flatMap(g => g.ids);
  // only the lower part of the chin (jaw bottom under the lower lip), without the jaw line by the ears
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
      refDist: (a, b) => ref[ids.indexOf(a)].distanceTo(ref[ids.indexOf(b)]), // distance in reference units
      fit(pts) {
        ids.forEach((id, i) => cur[i].set(pts[id].x, pts[id].y, -pts[id].z));
        if (!ref) { ref = cur.map(v => v.clone()); normalize(); n = 1; }
        const f = fitRigid(ref, cur);
        if (n < REF_FRAMES) { // warm-up: refine the reference by aligning the current frame to it
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

  // Lower jaw as a hinge: rotates around a transverse axis through the temporomandibular joint (TMJ), fixed in the skull frame.
  // The angle comes from the chin center offset relative to its closed-mouth position (more robust than rotation from the small chin
  // point cloud, which barely sees the rotation). The result is the jaw body pose (q, s, c) in the same form as rigidFit's.
  const HINGE_BACK = 0.25, HINGE_DOWN = 0.1;          // joint position relative to the midpoint between the cheeks (fractions of face width)
  const hinge = { pv: null, axis: null, rest: null, n: 0 };
  const chinW = new THREE.Vector3(), chinL = new THREE.Vector3(), va = new THREE.Vector3(), vb = new THREE.Vector3();
  const toLocal = (v, f) => v.sub(f.c).applyQuaternion(qInv.copy(f.q).invert()).divideScalar(f.s);
  const jawHinge = (pts, skullFit, lipAxes, closed, out) => {
    const mid = sub(pts[454], pts[234]).multiplyScalar(0.5).add(sub(pts[234], { x: 0, y: 0, z: 0 }));
    if (!hinge.pv) {
      const W = sub(pts[454], pts[234]).length();
      const pvW = mid.clone().addScaledVector(lipAxes.Z, -HINGE_BACK * W).addScaledVector(lipAxes.Y, HINGE_DOWN * W);
      hinge.pv = toLocal(pvW, skullFit);
      hinge.axis = toLocal(sub(pts[454], pts[234]).add(skullFit.c), skullFit).normalize();
    }
    chinW.set(0, 0, 0);
    JAW_IDS.forEach(id => chinW.add(sub(pts[id], { x: 0, y: 0, z: 0 })));
    chinL.copy(toLocal(chinW.divideScalar(JAW_IDS.length), skullFit));
    if (!hinge.rest) hinge.rest = chinL.clone();
    else if (closed && hinge.n < CALIB_FRAMES) { hinge.rest.lerp(chinL, 1 / (hinge.n + 2)); hinge.n++; }
    const ax = hinge.axis;
    va.copy(hinge.rest).sub(hinge.pv); va.addScaledVector(ax, -va.dot(ax));
    vb.copy(chinL).sub(hinge.pv); vb.addScaledVector(ax, -vb.dot(ax));
    const ang = Math.atan2(ax.dot(va.clone().cross(vb)), va.dot(vb));
    const rot = new THREE.Quaternion().setFromAxisAngle(ax, ang);
    out.q.copy(skullFit.q).multiply(rot);
    out.s = skullFit.s;
    // c = c_s + s * Qs * (pv - Rot * pv)
    out.c.copy(hinge.pv).sub(va.copy(hinge.pv).applyQuaternion(rot)).applyQuaternion(skullFit.q).multiplyScalar(skullFit.s).add(skullFit.c);
    return out;
  };
  const jawPose = { c: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1 };
  let faceRef = 1;

  // Arch binding to the body: position (in body reference units) and rotation relative to the body. Averaged over the first CALIB_FRAMES
  // frames with a closed mouth (lips rest on the teeth); before the first closed frame the current one is used; then the arch is fixed relative to the body.
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

  function update(pts, visible, cavityVisible = true, cavityDepth = 1, cavityColor = null) {
    const show = visible && pts.length > 454; // teeth always exist; a closed mouth hides them behind the lips (depth test)
    arches.forEach(m => { m.visible = show; });
    cavity.visible = show && cavityVisible;
    if (cavityColor) cavity.material.color.set(cavityColor);
    if (!show) return;

    const skullFit = skull.fit(pts);
    jaw.fit(pts); // only refines the jaw body reference (RMS scale); the pose comes from the hinge
    const ready = skull.ready && jaw.ready;
    if (ready && faceRef === 1) faceRef = skull.refDist(234, 454);

    // Lip system (needed only for orientation and binding in a closed mouth): X - cheek->cheek, Y - forehead->chin, Z = X x Y
    X.copy(sub(pts[454], pts[234])).normalize();
    Y.copy(sub(pts[152], pts[10]));
    Y.addScaledVector(X, -Y.dot(X)).normalize();
    Z.crossVectors(X, Y);
    lipQ.setFromRotationMatrix(lipM.makeBasis(X, Y, Z));
    const p13 = new THREE.Vector3(pts[13].x, pts[13].y, -pts[13].z), p14 = new THREE.Vector3(pts[14].x, pts[14].y, -pts[14].z);

    const S = ready ? skullFit.s * faceRef : Math.hypot(pts[454].x - pts[234].x, pts[454].y - pts[234].y, pts[454].z - pts[234].z) || 1;
    const sc = new THREE.Vector3().setScalar(S * MW);

    if (!ready) { // until the references are ready the arches follow the lips
      arches[0].matrix.compose(p13, lipQ, sc);
      arches[1].matrix.compose(p14, lipQ, sc);
    } else {
      const closed = mouthOpen(pts) < CLOSED;
      upperAnchor.pose(skullFit, p13, lipQ, closed, upPose);
      lowerAnchor.pose(jawHinge(pts, skullFit, { Y, Z }, closed, jawPose), p14, lipQ, closed, lowPose);
      arches[0].matrix.compose(upPose.p, upPose.q, sc);
      arches[1].matrix.compose(lowPose.p, lowPose.q, sc);
    }
    arches.forEach(m => { m.matrixWorldNeedsUpdate = true; });

    const a = cavGeo.attributes.position.array;
    let cx = 0, cy = 0, cz = 0;
    MOUTH_LOOP.forEach((li, i) => {
      const p = pts[li], zz = -p.z;
      a.set([p.x, p.y, zz], i * 3);
      a.set([p.x - Z.x * S * CAVITY_DEPTH * cavityDepth, p.y - Z.y * S * CAVITY_DEPTH * cavityDepth, zz - Z.z * S * CAVITY_DEPTH * cavityDepth], (n + i) * 3);
      cx += p.x; cy += p.y; cz += zz;
    });
    const b = S * CAVITY_BACK * cavityDepth;
    a.set([cx / n - Z.x * b, cy / n - Z.y * b, cz / n - Z.z * b], 2 * n * 3);
    cavGeo.attributes.position.needsUpdate = true;
  }

  return { update };
}
