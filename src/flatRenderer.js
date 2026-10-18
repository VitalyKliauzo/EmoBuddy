import * as THREE from "three";
import { addLights, createRigidTeeth, keepNormals, MOUTH_HOLE } from "./rigidTeeth.js";
import { eyeBall, eyeHoleSets, IRIS_RATIO, PUPIL_RATIO } from "./eyeBall.js";

// Flat 2D face render on canvas: triangles are depth-sorted (painter's algorithm), eyes are sorted together with them.
//  eyes         - eye contour description (EYES)
//  getTriangles - () => mesh triangles; getFaceTex - () => loaded face texture or null
export function createFlatRenderer({ meshCanvas, controls, eyes: EYES, getTriangles, getFaceTex }) {
  const { toggleTexture, toggleEyes, eyeStyle, toggleTeeth, teethStyle, toggleCavity, cavityColor, cavityDepth } = controls;
  const holeSets = eyeHoleSets(EYES);
  const c = meshCanvas.getContext("2d");
  const faceRGB = { r: 0, g: 0, b: 0 }; // base face color

  /** hex like "#rrggbb" */
  function setFaceColor(hex) {
    faceRGB.r = parseInt(hex.slice(1, 3), 16); faceRGB.g = parseInt(hex.slice(3, 5), 16); faceRGB.b = parseInt(hex.slice(5, 7), 16);
  }

  // Rigid 3D teeth over the flat render: a separate transparent WebGL scene. The face in it is only a depth buffer (no color written),
  // so closed lips, nose, etc. hide the teeth, while the mouth is cut out of the 2D mesh and the teeth with the cavity show through it.
  const rigidTeethOn = () => toggleTeeth.checked && teethStyle.value === "rigid";
  let gl = null;
  function initGl() {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(meshCanvas.width, meshCanvas.height, false);
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(0, meshCanvas.width, 0, meshCanvas.height, -2000, 2000);
    camera.position.z = 1000;
    addLights(scene, controls.shadowGradient);
    const geo = new THREE.BufferGeometry();
    const index = getTriangles().filter(t => !t.every(i => MOUTH_HOLE.has(i))).flat();
    geo.setIndex(index);
    const occluder = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }));
    occluder.frustumCulled = false;
    scene.add(occluder);
    gl = { renderer, scene, camera, geo, teeth: createRigidTeeth(scene, keepNormals), n: 0 };
  }

  function drawRigidTeeth(pts) {
    if (!gl) initGl();
    if (gl.n !== pts.length) {
      gl.geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts.length * 3), 3));
      gl.n = pts.length;
    }
    const pos = gl.geo.attributes.position;
    pts.forEach((p, i) => pos.setXYZ(i, p.x, p.y, -p.z));
    pos.needsUpdate = true;
    gl.teeth.update(pts, true, toggleCavity.checked, +cavityDepth.value, cavityColor.value);
    gl.renderer.render(gl.scene, gl.camera);
    c.drawImage(gl.renderer.domElement, 0, 0, meshCanvas.width, meshCanvas.height);
  }

  // Affine mapping of a texture triangle onto a screen triangle + shading by lighting
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
    // clip is expanded slightly from the center so there are no gaps between neighboring triangles
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

  // Eyeball: a sphere behind the eyelid plane, visible through the eye contour; the iris is an ellipse rotated toward the gaze
  function drawEyeBall(c, pts, eye) {
    if (!pts[eye.iris] || !pts[eye.contour[0]]) return;
    const { center, r, gaze } = eyeBall(pts, eye);
    const shade = (hex, k) => `rgb(${[1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * k))})`;
    const light = z => 0.25 + 0.75 * Math.max(0, z);

    c.save();
    c.beginPath();
    eye.contour.forEach((i, k) => k ? c.lineTo(pts[i].x, pts[i].y) : c.moveTo(pts[i].x, pts[i].y));
    c.closePath();
    c.clip();

    // sclera: lighting ~ cos of the angle between the sphere normal and the camera axis
    const g = c.createRadialGradient(center.x, center.y, 0, center.x, center.y, r);
    for (const s of [0, 0.5, 0.8, 0.95, 1]) g.addColorStop(s, shade("#f4f4f4", light(Math.sqrt(1 - s * s))));
    c.fillStyle = g;
    c.beginPath(); c.arc(center.x, center.y, r, 0, 2 * Math.PI); c.fill();

    // iris and pupil: a circle on the sphere around the gaze direction -> an ellipse compressed along the tilt direction
    const px = center.x + gaze.x * r, py = center.y + gaze.y * r;
    const rot = Math.atan2(gaze.y, gaze.x), flatten = Math.abs(gaze.z), lit = light(gaze.z);
    for (const [ratio, color] of [[IRIS_RATIO, "#3a7bd5"], [IRIS_RATIO * PUPIL_RATIO, "#000000"]]) {
      c.beginPath();
      c.ellipse(px, py, r * ratio * flatten, r * ratio, rot, 0, 2 * Math.PI);
      c.fillStyle = shade(color, lit);
      c.fill();
    }
    c.restore();
  }

  function drawEye(c, pts, eye) {
    if (eyeStyle.value === "ball") return drawEyeBall(c, pts, eye);
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

    // iris and pupil follow the real iris position from the camera; clipped by the eye contour
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
    const eyesShown = zpts.length > 477 && toggleEyes.checked;
    const mouthHoled = rigidTeethOn();
    const holes = eyesShown && eyeStyle.value === "ball"; // holes for the eyeballs are cut in the mesh
    for (const [ia, ib, ic] of getTriangles()) {
      if (holes && holeSets.some(s => s.has(ia) && s.has(ib) && s.has(ic))) continue;
      const a = zpts[ia], b = zpts[ib], c = zpts[ic];
      if (!a || !b || !c) continue;
      if (mouthHoled && MOUTH_HOLE.has(ia) && MOUTH_HOLE.has(ib) && MOUTH_HOLE.has(ic)) continue;

      const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
      const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      const facing = Math.abs(nz) / len;

      faces.push({ a, b, c, ia, ib, ic, avgZ: (a.z + b.z + c.z) / 3, facing });
    }

    if (eyesShown) for (const eye of EYES) {
      // the eye is sorted together with the triangles: nose and other near faces are drawn over it
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

    if (mouthHoled) drawRigidTeeth(zpts);
  }

  return { draw, setFaceColor, rigidTeethOn };
}
