// Builds a TalkingHead-compatible avatar scene (Ready Player Me style) from a captured MediaPipe face mesh.
//
// TalkingHead needs: an "Armature" root with the standard RPM/Mixamo bone names, meshes with ARKit blendshapes and
// Oculus viseme morph targets, and a LeftEye/RightEye bone. MediaPipe gives us only a face surface, so:
//  - the skeleton is the rest pose extracted from avatars/brunette.glb (src/rpmSkeleton.js),
//  - the face is parented to the Head bone, the eyeballs to the eye bones (so TalkingHead's gaze works),
//  - morph targets are synthesized procedurally from landmark anchors (see SHAPES below).
import * as THREE from 'three';
import SKELETON from './rpmSkeleton.js';
import FACE_TRIANGLES from './faceTriangles.js';

const V3 = THREE.Vector3;

// ---- Landmark groups (MediaPipe FaceMesh indices) ----
const INNER_UPPER_LIP = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308];
const INNER_LOWER_LIP = [95, 88, 178, 87, 14, 317, 402, 318, 324];
const OUTER_UPPER_LIP = [185, 40, 39, 37, 0, 267, 269, 270, 409];
const OUTER_LOWER_LIP = [146, 91, 181, 84, 17, 314, 405, 321, 375];

// ---- Morph target definitions ----
// Each primitive: [landmarkIndex, sigma, { out, up, fwd, dx, gate, side, exact }]
//  - sigma and displacement values are fractions of the face width; the effect falls off as a gaussian around the landmark
//  - out: away from the face midline (mirrored automatically), dx: absolute +x (avatar's left), up: +y, fwd: +z
//  - the landmark may be given on either side of the face; `side: 'L'|'R'` picks the avatar's left/right side (mirroring it),
//    otherwise the primitive is applied to both sides
//  - gate: 'below' / 'above' restricts the effect to vertices below / above the mouth line (jaw vs upper lip)
const J = 'below', U = 'above';
const SHAPES = {
  jawOpen: [[152, .28, { up: -.26, fwd: -.03, gate: J }], [17, .11, { up: -.25, fwd: -.025, gate: J }], [14, .1, { up: -.25, fwd: -.025, gate: J }],
    [84, .1, { up: -.25, gate: J }], [91, .1, { up: -.22, gate: J }], [146, .09, { up: -.2, gate: J }],
    [172, .16, { up: -.14, fwd: -.03, gate: J }], [136, .14, { up: -.08, fwd: -.03, gate: J }], [61, .09, { up: -.1, out: -.01 }]],
  jawForward: [[152, .28, { fwd: .06, gate: J }], [17, .11, { fwd: .06, gate: J }], [14, .1, { fwd: .06, gate: J }]],
  jawLeft: [[152, .28, { dx: .07, gate: J }], [17, .11, { dx: .07, gate: J }], [14, .1, { dx: .07, gate: J }]],
  jawRight: [[152, .28, { dx: -.07, gate: J }], [17, .11, { dx: -.07, gate: J }], [14, .1, { dx: -.07, gate: J }]],
  mouthClose: [[13, .1, { up: -.03, gate: U }], [0, .1, { up: -.03, gate: U }], [14, .09, { up: .05, gate: J }], [17, .1, { up: .05, gate: J }]],
  mouthFunnel: [[61, .09, { out: -.08, fwd: .04 }], [0, .1, { up: .03, fwd: .07, gate: U }], [13, .1, { up: .03, fwd: .07, gate: U }],
    [17, .1, { up: -.03, fwd: .07, gate: J }], [14, .1, { up: -.03, fwd: .07, gate: J }], [37, .09, { fwd: .06, up: .02, gate: U }], [84, .09, { fwd: .06, up: -.02, gate: J }]],
  mouthPucker: [[61, .1, { out: -.11, fwd: .06 }], [0, .1, { fwd: .08, gate: U }], [13, .1, { fwd: .08, gate: U }], [17, .1, { fwd: .08, gate: J }],
    [14, .1, { fwd: .08, gate: J }], [37, .09, { out: -.03, fwd: .07, gate: U }], [84, .09, { out: -.03, fwd: .07, gate: J }]],
  mouthLeft: [[61, .12, { dx: .07 }], [0, .1, { dx: .07 }], [13, .1, { dx: .07 }], [14, .1, { dx: .07 }], [17, .1, { dx: .07 }]],
  mouthRight: [[61, .12, { dx: -.07 }], [0, .1, { dx: -.07 }], [13, .1, { dx: -.07 }], [14, .1, { dx: -.07 }], [17, .1, { dx: -.07 }]],
  mouthSmile: [[61, .1, { out: .07, up: .07, fwd: -.01 }], [205, .14, { up: .035, out: .01 }], [40, .08, { up: .03, out: .03 }], [84, .08, { up: .02, out: .03 }]],
  mouthFrown: [[61, .1, { up: -.07, out: -.01 }], [84, .08, { up: -.025 }]],
  mouthDimple: [[61, .07, { out: .045, fwd: -.03 }]],
  mouthStretch: [[61, .09, { out: .07, up: -.02 }]],
  mouthRollLower: [[17, .1, { fwd: -.035, up: .02, gate: J }], [14, .1, { fwd: -.035, up: .02, gate: J }], [84, .09, { fwd: -.035, up: .02, gate: J }]],
  mouthRollUpper: [[0, .1, { fwd: -.035, up: -.02, gate: U }], [13, .1, { fwd: -.035, up: -.02, gate: U }], [37, .09, { fwd: -.035, up: -.02, gate: U }]],
  mouthShrugLower: [[17, .11, { up: .05, fwd: .015, gate: J }], [14, .1, { up: .05, fwd: .015, gate: J }], [152, .2, { up: .05, gate: J }]],
  mouthShrugUpper: [[0, .11, { up: .05, fwd: .01, gate: U }], [13, .1, { up: .05, fwd: .01, gate: U }]],
  mouthPress: [[84, .09, { up: .02, gate: J }], [37, .09, { up: -.02, gate: U }], [61, .08, { out: .02, up: -.015 }]],
  mouthLowerDown: [[84, .1, { up: -.07, gate: J }], [91, .1, { up: -.06, gate: J }], [146, .08, { up: -.04 }]],
  mouthUpperUp: [[37, .1, { up: .06, gate: U }], [40, .1, { up: .05, gate: U }], [39, .09, { up: .055, gate: U }]],
  cheekPuff: [[205, .17, { fwd: .07, out: .02 }], [50, .15, { fwd: .06 }]],
  cheekSquint: [[205, .15, { up: .045 }], [50, .14, { up: .04 }]],
  noseSneer: [[129, .08, { up: .035, out: .01 }], [98, .07, { up: .02 }]],
  browDown: [[107, .07, { up: -.05, out: -.025 }], [66, .07, { up: -.045 }], [105, .07, { up: -.04 }], [70, .08, { up: -.025 }]],
  browInnerUp: [[107, .07, { up: .085, out: -.01 }], [66, .07, { up: .05 }]],
  browOuterUp: [[70, .08, { up: .07 }], [46, .08, { up: .07 }], [105, .07, { up: .03 }]]
};
// Blendshapes that exist as separate Left/Right morph targets in ARKit.
const SIDED = ['mouthSmile', 'mouthFrown', 'mouthDimple', 'mouthStretch', 'mouthPress', 'mouthLowerDown', 'mouthUpperUp',
  'cheekSquint', 'noseSneer', 'browDown', 'browOuterUp'];
// Eyelid shapes: [upper-lid factor, lower-lid factor] - fraction of the lid's distance to the eye centre line it travels.
const LIDS = { eyeBlink: [1.35, 1.25], eyeSquint: [.3, .45], eyeWide: [-.25, .1], eyeLookDown: [.35, .1], eyeLookUp: [-.15, -.1] };

// Oculus visemes as mixes of the ARKit shapes above.
const VISEMES = {
  viseme_sil: {},
  viseme_PP: { mouthPressLeft: .6, mouthPressRight: .6, mouthRollLower: .3, mouthRollUpper: .3 },
  viseme_FF: { mouthRollLower: .8, mouthShrugLower: .3, jawOpen: .08, mouthUpperUpLeft: .2, mouthUpperUpRight: .2 },
  viseme_TH: { jawOpen: .15, mouthLowerDownLeft: .3, mouthLowerDownRight: .3 },
  viseme_DD: { jawOpen: .2, mouthStretchLeft: .1, mouthStretchRight: .1 },
  viseme_kk: { jawOpen: .2 },
  viseme_CH: { mouthFunnel: .6, jawOpen: .15 },
  viseme_SS: { mouthSmileLeft: .3, mouthSmileRight: .3, jawOpen: .05, mouthStretchLeft: .2, mouthStretchRight: .2 },
  viseme_nn: { jawOpen: .12, mouthRollUpper: .2 },
  viseme_RR: { mouthPucker: .4, jawOpen: .15 },
  viseme_aa: { jawOpen: .65, mouthLowerDownLeft: .3, mouthLowerDownRight: .3 },
  viseme_E: { jawOpen: .3, mouthStretchLeft: .5, mouthStretchRight: .5, mouthSmileLeft: .3, mouthSmileRight: .3 },
  viseme_I: { jawOpen: .2, mouthSmileLeft: .4, mouthSmileRight: .4, mouthStretchLeft: .3, mouthStretchRight: .3 },
  viseme_O: { mouthFunnel: .7, jawOpen: .35, mouthPucker: .3 },
  viseme_U: { mouthPucker: .9, jawOpen: .15 }
};

// ARKit shapes with no procedural geometry here (kept as empty targets so TalkingHead finds them).
const EMPTY = ['tongueOut', 'eyeLookInLeft', 'eyeLookInRight', 'eyeLookOutLeft', 'eyeLookOutRight'];

// Rotate the captured face so it looks straight along +z with the ears level (head pose in the snapshot is arbitrary).
function frontalize(positions, normals) {
  const at = (i) => new V3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
  const X = at(454).sub(at(234)).normalize();
  const up = at(10).sub(at(152));
  const Y = up.addScaledVector(X, -up.dot(X)).normalize();
  const Z = new V3().crossVectors(X, Y);
  const rot = (src) => {
    const out = new Float32Array(src.length);
    for (let i = 0; i < src.length; i += 3) {
      const v = new V3(src[i], src[i + 1], src[i + 2]);
      out[i] = v.dot(X); out[i + 1] = v.dot(Y); out[i + 2] = v.dot(Z);
    }
    return out;
  };
  return { positions: rot(positions), normals: rot(normals) };
}

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/**
 * @param {object} p
 * @param {Float32Array} p.positions  >=478 landmarks, metres, centred, y up, z towards the viewer (x = image x)
 * @param {Float32Array} p.normals    per-landmark normals in the same frame
 * @param {Float32Array} p.uv         per-landmark UVs (first 468 used)
 * @param {number[]}    [p.triangles] flat landmark index triples of the face surface, counter-clockwise seen from +z (default: MediaPipe's canonical 898 triangles)
 * @param {object[]}    p.eyes        [{contour, iris, irisEdge}] image-left eye first (= avatar's RightEye)
 * @param {THREE.Texture} [p.texture] face texture (camera frame)
 * @returns {THREE.Scene}
 */
export function buildAvatarScene({ positions, normals, uv, triangles = FACE_TRIANGLES, eyes, texture, skinColor = 0xd8a98c }) {
  ({ positions, normals } = frontalize(positions, normals));
  const NF = 468; // landmarks that belong to the face surface (the rest are iris points)

  // ---------- Skeleton ----------
  const armature = new THREE.Group();
  armature.name = 'Armature';
  const bones = {};
  for (const [name, parent, t, q, s] of SKELETON) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.fromArray(t); b.quaternion.fromArray(q); b.scale.fromArray(s);
    (parent ? bones[parent] : armature).add(b);
    bones[name] = b;
  }
  const scene = new THREE.Scene();
  scene.add(armature);
  scene.updateMatrixWorld(true);
  const worldPos = (b) => new V3().setFromMatrixPosition(b.matrixWorld);

  // ---------- Fit the face onto the skeleton (eyeball centres <-> eye bones, uniform scale) ----------
  const P = (i) => new V3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
  const N = (i) => new V3(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]);
  const eyeModel = eyes.map((eye, k) => {
    const c = new V3(), n = new V3();
    for (const i of eye.contour) { c.add(P(i)); n.add(N(i)); }
    c.divideScalar(eye.contour.length); n.normalize();
    const corners = k === 0 ? [33, 133] : [362, 263];
    const r = P(corners[0]).distanceTo(P(corners[1])) * 0.45;
    return { center: c.addScaledVector(n, -r * 0.92), r }; // eyeball sunk so its front surface sits just behind the lid plane
  });
  const boneEyes = [bones.RightEye, bones.LeftEye]; // eyes[0] is image-left = subject's right
  const bR = worldPos(boneEyes[0]), bL = worldPos(boneEyes[1]);
  const k = bR.distanceTo(bL) / (eyeModel[0].center.distanceTo(eyeModel[1].center) || 1);
  const midModel = eyeModel[0].center.clone().add(eyeModel[1].center).multiplyScalar(0.5);
  const midBone = bR.clone().add(bL).multiplyScalar(0.5);
  const toWorld = (v) => v.clone().sub(midModel).multiplyScalar(k).add(midBone);

  // Landmarks in the upright "world" frame where all morph maths happens
  const LM = Array.from({ length: positions.length / 3 }, (_, i) => toWorld(P(i)));
  const fw = LM[234].distanceTo(LM[454]);
  const midX = (LM[234].x + LM[454].x) / 2;
  const mouthY = (LM[13].y + LM[14].y) / 2;

  const headInv = bones.Head.matrixWorld.clone().invert();
  const dirToHead = (v) => v.clone().transformDirection(headInv).multiplyScalar(v.length());

  // ---------- Morph target synthesis ----------
  // Expand a list of primitives into gaussian anchors (mirroring across the face midline where needed).
  function anchorsOf(prims, extra = {}) {
    const out = [];
    for (const [lm, sigma, o] of prims) {
      const a = LM[lm];
      const centre = Math.abs(a.x - midX) < 0.03 * fw;
      const sides = o.exact || centre ? [0] : o.side === 'L' ? [1] : o.side === 'R' ? [-1] : [1, -1];
      for (const sd of sides) {
        const ax = sd !== 0 && Math.sign(a.x - midX) !== sd ? 2 * midX - a.x : a.x;
        out.push({
          x: ax, y: a.y, z: a.z, s2: (sigma * fw) ** 2,
          vx: ((o.out || 0) * sd + (o.dx || 0)) * fw, vy: (o.up || 0) * fw, vz: (o.fwd || 0) * fw, gate: o.gate
        });
      }
    }
    return out;
  }

  // Delta field for an array of vertices (world frame). gy = per-vertex y used for gating; zProj overrides z for weights.
  function evalField(anchors, V, gy, zProj = null) {
    const n = V.length / 3, delta = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const x = V[i * 3], y = V[i * 3 + 1], z = zProj ?? V[i * 3 + 2];
      const below = smooth((mouthY + 0.0015 - gy[i]) / 0.003);
      let sum = 0, dx = 0, dy = 0, dz = 0;
      for (const a of anchors) {
        let g = Math.exp(-((x - a.x) ** 2 + (y - a.y) ** 2 + (z - a.z) ** 2) / (2 * a.s2));
        if (a.gate === J) g *= below; else if (a.gate === U) g *= 1 - below;
        if (g < 1e-4) continue;
        sum += g; dx += g * a.vx; dy += g * a.vy; dz += g * a.vz;
      }
      const d = 1 / Math.max(1, sum);
      delta[i * 3] = dx * d; delta[i * 3 + 1] = dy * d; delta[i * 3 + 2] = dz * d;
    }
    return delta;
  }

  // Eyelid primitives are anchored on the eye-contour vertices themselves and move them towards the eye centre line.
  function lidAnchors(eyeIdx, [up, low]) {
    const ids = eyes[eyeIdx].contour;
    const yc = ids.reduce((s, i) => s + LM[i].y, 0) / ids.length;
    return anchorsOf(ids.map((i) => {
      const y = LM[i].y;
      const dy = y > yc ? -(y - yc) * up : (yc - y) * low;
      return [i, 0.014, { up: dy / fw, exact: true }];
    }));
  }

  // Build every base shape's anchor list: name -> anchors
  const baseAnchors = {};
  for (const [name, prims] of Object.entries(SHAPES)) {
    if (SIDED.includes(name)) {
      baseAnchors[name + 'Left'] = anchorsOf(prims.map(([a, b, o]) => [a, b, { ...o, side: 'L' }]));
      baseAnchors[name + 'Right'] = anchorsOf(prims.map(([a, b, o]) => [a, b, { ...o, side: 'R' }]));
    } else {
      baseAnchors[name] = anchorsOf(prims);
    }
  }
  for (const [name, f] of Object.entries(LIDS)) {
    baseAnchors[name + 'Left'] = lidAnchors(1, f);  // eyes[1] = image-right = avatar's left
    baseAnchors[name + 'Right'] = lidAnchors(0, f);
  }
  for (const name of EMPTY) baseAnchors[name] = [];

  /** All morph deltas (world frame) for one mesh. */
  function morphsFor(V, gy, zProj = null) {
    const deltas = {};
    for (const [name, anchors] of Object.entries(baseAnchors)) deltas[name] = evalField(anchors, V, gy, zProj);
    for (const [name, mix] of Object.entries(VISEMES)) {
      const d = new Float32Array(V.length);
      for (const [src, w] of Object.entries(mix)) for (let i = 0; i < d.length; i++) d[i] += deltas[src][i] * w;
      deltas[name] = d;
    }
    return deltas;
  }

  function attachMorphs(mesh, deltas) {
    const names = Object.keys(deltas);
    mesh.geometry.morphAttributes.position = names.map((name) => {
      const d = deltas[name], out = new Float32Array(d.length);
      for (let i = 0; i < d.length; i += 3) {
        const v = dirToHead(new V3(d[i], d[i + 1], d[i + 2]));
        out[i] = v.x; out[i + 1] = v.y; out[i + 2] = v.z;
      }
      const attr = new THREE.BufferAttribute(out, 3);
      attr.name = name;
      return attr;
    });
    mesh.geometry.morphTargetsRelative = true;
    mesh.updateMorphTargets();
  }

  // ---------- Face mesh ----------
  const faceW = new Float32Array(NF * 3);
  const faceLocal = new Float32Array(NF * 3), faceNor = new Float32Array(NF * 3);
  for (let i = 0; i < NF; i++) {
    const w = LM[i];
    faceW.set([w.x, w.y, w.z], i * 3);
    const l = w.clone().applyMatrix4(headInv);
    faceLocal.set([l.x, l.y, l.z], i * 3);
    const nl = N(i).transformDirection(headInv);
    faceNor.set([nl.x, nl.y, nl.z], i * 3);
  }

  // Drop the triangles that cover the eye openings and the mouth slit (eyeballs and mouth interior show through instead)
  const eyeSets = eyes.map((e) => new Set(e.contour));
  const mouthSet = new Set([...INNER_UPPER_LIP, ...INNER_LOWER_LIP]);
  const index = [];
  for (let t = 0; t < triangles.length; t += 3) {
    const tri = [triangles[t], triangles[t + 1], triangles[t + 2]];
    if (tri.some((i) => i >= NF)) continue;
    if (eyeSets.some((s) => tri.every((i) => s.has(i)))) continue;
    if (tri.every((i) => mouthSet.has(i))) continue;
    index.push(tri); // the canonical mesh already has consistent counter-clockwise winding (re-deriving it from the xy projection flips the steep nose triangles and leaves holes)
  }

  const faceGeo = new THREE.BufferGeometry();
  faceGeo.setAttribute('position', new THREE.BufferAttribute(faceLocal, 3));
  faceGeo.setAttribute('normal', new THREE.BufferAttribute(faceNor, 3));
  faceGeo.setAttribute('uv', new THREE.BufferAttribute(uv.slice(0, NF * 2), 2));
  faceGeo.setIndex(index.flat());
  const faceMat = new THREE.MeshStandardMaterial({ map: texture || null, color: texture ? 0xffffff : skinColor, roughness: 0.85, metalness: 0 });
  faceMat.name = 'FaceSkin';
  const face = new THREE.Mesh(faceGeo, faceMat);
  face.name = 'Wolf3D_Head';

  // Gate heights: the lip rings sit on the mouth line, so nudge them to the correct side of it.
  const gy = new Float32Array(NF);
  for (let i = 0; i < NF; i++) gy[i] = LM[i].y;
  for (const i of [...INNER_UPPER_LIP, ...OUTER_UPPER_LIP]) gy[i] = mouthY + 0.003;
  for (const i of [...INNER_LOWER_LIP, ...OUTER_LOWER_LIP]) gy[i] = mouthY - 0.003;
  attachMorphs(face, morphsFor(faceW, gy));
  bones.Head.add(face);

  // ---------- Mouth interior (dark cavity that follows the jaw morphs) ----------
  const mw = LM[61].distanceTo(LM[291]);
  const rx = mw * 0.45, ry = mw * 0.18, rz = mw * 0.38;
  const cav = new THREE.SphereGeometry(1, 24, 16);
  const cp = cav.attributes.position;
  const cw = new Float32Array(cp.count * 3), cgy = new Float32Array(cp.count);
  const cz = (LM[13].z + LM[14].z) / 2 - rz * 1.05;
  for (let i = 0; i < cp.count; i++) {
    const w = new V3(midX + cp.getX(i) * rx, mouthY + cp.getY(i) * ry, cz + cp.getZ(i) * rz);
    cw.set([w.x, w.y, w.z], i * 3);
    cgy[i] = w.y;
    const l = w.clone().applyMatrix4(headInv);
    cp.setXYZ(i, l.x, l.y, l.z);
  }
  cav.computeVertexNormals();
  const cavity = new THREE.Mesh(cav, new THREE.MeshStandardMaterial({ color: 0x2a0a0e, roughness: 0.9, side: THREE.DoubleSide }));
  cavity.name = 'Wolf3D_Teeth'; // RPM's mouth-interior mesh name
  attachMorphs(cavity, morphsFor(cw, cgy, (LM[13].z + LM[14].z) / 2));
  bones.Head.add(cavity);

  // ---------- Teeth: two rigid arches (the upper one fixed to the skull, the lower one riding the jaw) ----------
  // Like the eyeballs, the teeth are solid objects sized once from the neutral mouth width. The lips only reveal them;
  // morphs never deform a tooth, the lower arch is translated as a whole by the jaw morphs.
  const TEETH_W = [.105, .085, .09, .08];            // tooth widths from the midline outwards (fractions of mouth width)
  const TEETH_H = { up: [.17, .14, .15, .12], low: [.12, .12, .13, .11] };
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
  // One arch in world coordinates; `up` hangs from the upper lip line, otherwise the teeth stand on the lower one.
  function archGeo(up) {
    const parts = [], lipY = up ? LM[13].y : LM[14].y;
    const z0 = (LM[13].z + LM[14].z) / 2 - mw * 0.05, sag = mw * 0.14, half = mw * 0.4;
    const place = (side, i, xEdge) => {
      const w = TEETH_W[i] * mw, h = (up ? TEETH_H.up : TEETH_H.low)[i] * mw;
      const x = xEdge + side * w / 2;
      const zAt = (xx) => z0 - sag * (xx / half) ** 2;
      const g = toothGeo(w, h);
      const phi = Math.atan2(-(zAt(x + 1e-4) - zAt(x - 1e-4)), 2e-4); // follow the arch tangent
      const cy = up ? lipY + mw * 0.03 - h / 2 : lipY - mw * 0.03 + h / 2;
      g.applyMatrix4(new THREE.Matrix4().makeRotationY(phi).setPosition(midX + x, cy, zAt(x)));
      parts.push(g);
      return xEdge + side * w;
    };
    for (const side of [1, -1]) { let e = 0; for (let i = 0; i < TEETH_W.length; i++) e = place(side, i, e); }
    const n = parts.reduce((s, g) => s + g.attributes.position.count, 0);
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
    let o = 0;
    for (const g of parts) { pos.set(g.attributes.position.array, o); nor.set(g.attributes.normal.array, o); o += g.attributes.position.array.length; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    return { geo, centre: new V3(midX, up ? lipY - mw * 0.06 : lipY + mw * 0.06, z0) };
  }
  const teethMat = new THREE.MeshStandardMaterial({ color: 0xf6f3ea, roughness: 0.35, metalness: 0 });
  const JAW_SHAPES = ['jawOpen', 'jawForward', 'jawLeft', 'jawRight', 'mouthClose'];
  for (const up of [true, false]) {
    const { geo, centre } = archGeo(up);
    const mesh = new THREE.Mesh(geo, teethMat);
    mesh.name = up ? 'TeethUpper' : 'TeethLower';
    if (!up) {
      // rigid jaw motion: the jaw field sampled at the arch centre, applied as the same translation to every vertex
      const count = geo.attributes.position.count, deltas = {};
      const rigid = (name) => {
        const d = evalField(baseAnchors[name], [centre.x, centre.y, centre.z], [centre.y]);
        const out = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) out.set(d, i * 3);
        return out;
      };
      for (const name of JAW_SHAPES) deltas[name] = rigid(name);
      for (const [name, mix] of Object.entries(VISEMES)) {
        const d = new Float32Array(count * 3);
        for (const [src, w] of Object.entries(mix)) if (deltas[src]) for (let i = 0; i < d.length; i++) d[i] += deltas[src][i] * w;
        deltas[name] = d;
      }
      geo.applyMatrix4(headInv);
      attachMorphs(mesh, deltas);
    } else {
      geo.applyMatrix4(headInv);
    }
    bones.Head.add(mesh);
  }

  // ---------- Eyeballs (children of the eye bones so TalkingHead's gaze control rotates them) ----------
  const scleraMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.4 });
  const irisMat = new THREE.MeshStandardMaterial({ color: 0x3a7bd5, roughness: 0.3, side: THREE.DoubleSide });
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.2, side: THREE.DoubleSide });
  eyes.forEach((eye, i) => {
    const bone = boneEyes[i];
    const inv = bone.matrixWorld.clone().invert();
    const centerW = toWorld(eyeModel[i].center);
    const r = eyeModel[i].r * k;
    const irisR = Math.min(P(eye.irisEdge[0]).distanceTo(P(eye.irisEdge[1])) * k / 2, r * 0.6);

    const group = new THREE.Group();
    group.name = i === 0 ? 'EyeRight' : 'EyeLeft';
    // keep the eyeball aligned with the world axes (looking along +z) whatever the bone's rest rotation is
    group.position.copy(centerW.clone().applyMatrix4(inv));
    group.quaternion.setFromRotationMatrix(new THREE.Matrix4().extractRotation(inv));
    const sclera = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 24), scleraMat);
    // iris and pupil are thin spherical caps sitting just above the eyeball surface, centred on the +z pole
    const cap = (radius, angle, mat) => {
      const g = new THREE.SphereGeometry(radius, 32, 8, 0, Math.PI * 2, 0, angle);
      g.rotateX(Math.PI / 2);
      return new THREE.Mesh(g, mat);
    };
    group.add(sclera, cap(r * 1.004, Math.asin(irisR / r), irisMat), cap(r * 1.008, Math.asin(irisR * 0.45 / r), pupilMat));
    bone.add(group);
  });

  // ---------- Feet anchors ----------
  // TalkingHead keeps the avatar on the floor using the bounding box of the whole armature, so give it something at y = 0.
  const ghostMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  for (const name of ['LeftToeBase', 'RightToeBase']) {
    const bone = bones[name];
    const wp = worldPos(bone), inv = bone.matrixWorld.clone().invert();
    const g = new THREE.BufferGeometry();
    const pts = [[0, 0, 0], [0.002, 0, 0], [0, 0, 0.002]].map(([x, y, z]) => new V3(wp.x + x, y, wp.z + z).applyMatrix4(inv));
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((v) => [v.x, v.y, v.z]), 3));
    const m = new THREE.Mesh(g, ghostMat);
    m.name = name + '_Floor';
    bone.add(m);
  }

  return scene;
}
