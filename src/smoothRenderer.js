import * as THREE from "three";
import { addLights, createRigidTeeth, keepNormals, MOUTH_HOLE } from "./rigidTeeth.js";
import { eyeBall, eyeHoleSets, IRIS_RATIO, PUPIL_RATIO } from "./eyeBall.js";

// Smooth face render in Three.js: averaged vertex normals, face texture, eyes in the 3D scene.
// Draws into an offscreen WebGL canvas and copies the frame to the meshCanvas 2D context.
//  eyes         - eye contour description (EYES)
//  getTriangles - () => mesh triangles; getFaceTex - () => loaded face texture or null
export function createSmoothRenderer({ meshCanvas, controls, eyes: EYES, getTriangles, getFaceTex }) {
  const { shadowGradient, normalSmooth, toggleTexture, toggleEyes, eyeStyle, toggleTeeth, teethStyle, toggleCavity, cavityColor, cavityDepth } = controls;
  // --- Smooth render: Three.js, averaged vertex normals (drawn to an offscreen canvas, then copied to meshCanvas) ---
  const meshCtx = meshCanvas.getContext("2d");
  const glRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, stencil: true });
  glRenderer.setSize(meshCanvas.width, meshCanvas.height, false);
  glRenderer.setClearColor(0x000000, 1);
  const glScene = new THREE.Scene();
  const glCamera = new THREE.OrthographicCamera(0, meshCanvas.width, 0, meshCanvas.height, -2000, 2000);
  glCamera.position.z = 1000;
  addLights(glScene, shadowGradient);
  const glMaterial = new THREE.MeshPhongMaterial({ color: 0xd9a68a, shininess: 10, specular: 0x000000, side: THREE.DoubleSide });
  keepNormals(glMaterial);
  let faceColorHex = "#d9a68a";
  // Base face color; with the texture on the color is white, and this one is restored when it is turned off
  function setFaceColor(c) {
    faceColorHex = c;
    if (!glMaterial.map) glMaterial.color.set(c);
  }

  let glMesh = null, neighbors = null, tmpNor = null;
  const indexCache = new Map(), holeKey = { eyes: false, mouth: false }; // mesh indices: with / without holes for eyeballs / mouth

  // Computes smoothed vertex normals from the pos array (x right, y down, z toward camera) -> nor
  function computeNormals(pos, nor, count) {
    nor.fill(0);
    for (const [ia, ib, ic] of getTriangles()) {
      const ux = pos[ib*3] - pos[ia*3], uy = pos[ib*3+1] - pos[ia*3+1], uz = pos[ib*3+2] - pos[ia*3+2];
      const vx = pos[ic*3] - pos[ia*3], vy = pos[ic*3+1] - pos[ia*3+1], vz = pos[ic*3+2] - pos[ia*3+2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; } // orient normals toward the camera
      for (const i of [ia, ib, ic]) { nor[i*3] += nx; nor[i*3+1] += ny; nor[i*3+2] += nz; }
    }
    // MediaPipe z normals are noisy, so neighboring triangles differ strongly.
    // Blur normals across neighboring vertices (several passes) -> smooth gradients.
    if (!neighbors) {
      neighbors = Array.from({ length: count }, () => new Set());
      for (const [a, b, c] of getTriangles()) {
        neighbors[a].add(b).add(c); neighbors[b].add(a).add(c); neighbors[c].add(a).add(b);
      }
      neighbors = neighbors.map(set => [...set]);
      tmpNor = new Float32Array(nor.length);
    }
    for (let it = 0; it < +normalSmooth.value; it++) {
      for (let i = 0; i < count; i++) {
        let x = nor[i*3], y = nor[i*3+1], z = nor[i*3+2];
        for (const j of neighbors[i]) { x += nor[j*3]; y += nor[j*3+1]; z += nor[j*3+2]; }
        const n = neighbors[i].length + 1;
        tmpNor[i*3] = x / n; tmpNor[i*3+1] = y / n; tmpNor[i*3+2] = z / n;
      }
      nor.set(tmpNor);
    }
    for (let i = 0; i < count; i++) {
      const l = Math.hypot(nor[i*3], nor[i*3+1], nor[i*3+2]) || 1;
      nor[i*3] /= l; nor[i*3+1] /= l; nor[i*3+2] /= l;
    }
  }

  // Turns the face texture on/off on the WebGL material (UVs are set once - they don't change between frames)
  let glTexture = null;
  function syncGlTexture(pts) {
    const want = toggleTexture.checked && getFaceTex();
    if (!!want === !!glMaterial.map) return;
    if (want) {
      if (!glTexture) {
        glTexture = new THREE.Texture(getFaceTex().img);
        glTexture.flipY = false;
        glTexture.colorSpace = THREE.SRGBColorSpace;
        glTexture.needsUpdate = true;
      }
      const uv = new Float32Array(pts.length * 2);
      uv.set(getFaceTex().uv.subarray(0, Math.min(uv.length, getFaceTex().uv.length)));
      glMesh.geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      glMaterial.map = glTexture;
      glMaterial.color.set(0xffffff);
    } else {
      glMaterial.map = null;
      glMaterial.color.set(faceColorHex);
    }
    glMaterial.needsUpdate = true;
  }

  // Rigid 3D teeth: the mouth is cut out of the face mesh, teeth and cavity are drawn in the scene
  const rigidTeeth = createRigidTeeth(glScene, keepNormals);
  const rigidTeethOn = () => toggleTeeth.checked && teethStyle.value === "rigid";
  function meshIndex(eyesHoled, mouthHoled) {
    const key = `${eyesHoled}|${mouthHoled}`;
    if (!indexCache.has(key)) {
      const holes = [];
      if (eyesHoled) holes.push(...eyeHoleSets(EYES));
      if (mouthHoled) holes.push(MOUTH_HOLE);
      indexCache.set(key, getTriangles().filter(t => !holes.some(set => t.every(i => set.has(i)))).flat());
    }
    return indexCache.get(key);
  }

  function drawSmooth(pts) {
    if (!glMesh) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts.length * 3), 3));
      g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(pts.length * 3), 3));
      g.setIndex(meshIndex(false, false));
      glMesh = new THREE.Mesh(g, glMaterial);
      glMesh.frustumCulled = false;
      glScene.add(glMesh);
    }
    syncGlTexture(pts);
    const eyesHoled = pts.length > 477 && toggleEyes.checked && eyeStyle.value === "ball";
    const mouthHoled = rigidTeethOn();
    if (eyesHoled !== holeKey.eyes || mouthHoled !== holeKey.mouth) {
      glMesh.geometry.setIndex(meshIndex(eyesHoled, mouthHoled));
      holeKey.eyes = eyesHoled; holeKey.mouth = mouthHoled;
    }
    const pos = glMesh.geometry.attributes.position.array;
    const nor = glMesh.geometry.attributes.normal.array;
    // closer to the camera = larger z in the scene, so MediaPipe z is inverted
    pts.forEach((p, i) => { pos[i*3] = p.x; pos[i*3+1] = p.y; pos[i*3+2] = -p.z; });
    computeNormals(pos, nor, pts.length);
    glMesh.geometry.attributes.position.needsUpdate = true;
    glMesh.geometry.attributes.normal.needsUpdate = true;
    updateGlEyes(pts);
    rigidTeeth.update(pts, mouthHoled, toggleCavity.checked, +cavityDepth.value, cavityColor.value);
    glRenderer.render(glScene, glCamera);
    meshCtx.drawImage(glRenderer.domElement, 0, 0, meshCanvas.width, meshCanvas.height);
  }

  // In smooth mode the eyes are drawn in the 3D scene on the eye contour plane, so the nose and eyelids occlude them via the depth test.
  // The sclera writes stencil only where it is visible; the iris and pupil are drawn only inside that stencil.
  const EYE_BIAS = 3; // small shift toward the camera so the eye doesn't get lost inside the mesh surface
  const stencilBase = { side: THREE.DoubleSide, stencilWrite: true, stencilRef: 1 };
  const eyeMats = {
    white: new THREE.MeshBasicMaterial({ ...stencilBase, color: 0xf4f4f4, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp }),
    iris: new THREE.MeshBasicMaterial({ ...stencilBase, color: 0x3a7bd5, stencilFunc: THREE.EqualStencilFunc, depthTest: false, depthWrite: false }),
    pupil: new THREE.MeshBasicMaterial({ ...stencilBase, color: 0x000000, stencilFunc: THREE.EqualStencilFunc, depthTest: false, depthWrite: false }),
    line: new THREE.MeshBasicMaterial({ color: 0x222222, side: THREE.DoubleSide })
  };
  const IRIS_SEG = 24;
  function glEyeMesh(vertCount, index, material, order) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(vertCount * 3), 3));
    g.setIndex(index);
    const m = new THREE.Mesh(g, material);
    m.frustumCulled = false;
    m.renderOrder = order;
    glScene.add(m);
    return m;
  }
  function fanIndex(n) { const idx = []; for (let i = 0; i < n; i++) idx.push(n, i, (i + 1) % n); return idx; }
  function ringIndex(n) { const idx = []; for (let i = 0; i < n; i++) { const j = (i + 1) % n; idx.push(i, n + i, n + j, i, n + j, j); } return idx; }
  const glEyes = EYES.map(eye => {
    const n = eye.contour.length;
    return {
      white: glEyeMesh(n + 1, fanIndex(n), eyeMats.white, 1),
      line: glEyeMesh(2 * n, ringIndex(n), eyeMats.line, 2),
      iris: glEyeMesh(IRIS_SEG + 1, fanIndex(IRIS_SEG), eyeMats.iris, 3),
      pupil: glEyeMesh(IRIS_SEG + 1, fanIndex(IRIS_SEG), eyeMats.pupil, 4)
    };
  });

  // Eyeballs (eyeStyle = "ball"): a sphere behind the eyelid plane + iris and pupil caps rotated by the gaze.
  // The face mesh has no eye triangles, so the eyeball is visible only through the hole; lighting is shared with the face.
  const ballMats = {
    sclera: new THREE.MeshLambertMaterial({ color: 0xf4f4f4, side: THREE.DoubleSide }),
    iris: new THREE.MeshLambertMaterial({ color: 0x3a7bd5, side: THREE.DoubleSide }),
    pupil: new THREE.MeshLambertMaterial({ color: 0x000000, side: THREE.DoubleSide })
  };
  Object.values(ballMats).forEach(keepNormals);
  const ballCap = (radius, angle, mat) => {
    const g = new THREE.SphereGeometry(radius, 32, 8, 0, Math.PI * 2, 0, angle);
    g.rotateX(Math.PI / 2); // cap pole -> +z
    return new THREE.Mesh(g, mat);
  };
  const glBalls = EYES.map(() => {
    const group = new THREE.Group(), gazeGroup = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), ballMats.sclera), gazeGroup);
    gazeGroup.add(
      ballCap(1.004, Math.asin(IRIS_RATIO), ballMats.iris),
      ballCap(1.008, Math.asin(IRIS_RATIO * PUPIL_RATIO), ballMats.pupil)
    );
    group.traverse(o => { o.frustumCulled = false; });
    glScene.add(group);
    return { group, gazeGroup };
  });
  const AXIS_Z = new THREE.Vector3(0, 0, 1), gazeDir = new THREE.Vector3();

  function updateGlEyes(pts) {
    const show = pts.length > 477 && toggleEyes.checked;
    const ball = show && eyeStyle.value === "ball";
    EYES.forEach((eye, k) => {
      const ge = glEyes[k];
      for (const m of Object.values(ge)) m.visible = show && !ball;
      glBalls[k].group.visible = ball;
      if (ball) {
        const { center, r, gaze } = eyeBall(pts, eye);
        glBalls[k].group.position.set(center.x, center.y, center.z);
        glBalls[k].group.scale.setScalar(r);
        glBalls[k].gazeGroup.quaternion.setFromUnitVectors(AXIS_Z, gazeDir.set(gaze.x, gaze.y, gaze.z));
      }
      if (!show || ball) return;
      const ring = eye.contour.map(i => pts[i]);
      const n = ring.length;
      let cx = 0, cy = 0, cz = 0;
      for (const p of ring) { cx += p.x; cy += p.y; cz += -p.z; }
      cx /= n; cy /= n; cz /= n;
      // plane z = cz + gx*dx + gy*dy by least squares: the iris lies on it and does not "sink" into the mesh when the head turns
      let sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
      for (const p of ring) {
        const dx = p.x - cx, dy = p.y - cy, dz = -p.z - cz;
        sxx += dx * dx; sxy += dx * dy; syy += dy * dy; sxz += dx * dz; syz += dy * dz;
      }
      const det = sxx * syy - sxy * sxy || 1;
      const gx = (sxz * syy - syz * sxy) / det, gy = (syz * sxx - sxz * sxy) / det;
      const planeZ = (x, y) => cz + gx * (x - cx) + gy * (y - cy) + EYE_BIAS;

      const wp = ge.white.geometry.attributes.position.array;
      const lp = ge.line.geometry.attributes.position.array;
      ring.forEach((p, i) => {
        wp.set([p.x, p.y, -p.z + EYE_BIAS], i * 3);
        const dx = p.x - cx, dy = p.y - cy, l = Math.hypot(dx, dy) || 1;
        lp.set([p.x, p.y, -p.z + EYE_BIAS + 1], i * 3);
        lp.set([p.x + dx / l * 2, p.y + dy / l * 2, -p.z + EYE_BIAS + 1], (n + i) * 3);
      });
      wp.set([cx, cy, cz + EYE_BIAS], n * 3);
      ge.white.geometry.attributes.position.needsUpdate = true;
      ge.line.geometry.attributes.position.needsUpdate = true;

      const iris = pts[eye.iris];
      const [e1, e2] = eye.irisEdge.map(i => pts[i]);
      const r = Math.hypot(e1.x - e2.x, e1.y - e2.y) / 2;
      for (const [mesh, rr] of [[ge.iris, r], [ge.pupil, r * 0.45]]) {
        const a = mesh.geometry.attributes.position.array;
        for (let i = 0; i < IRIS_SEG; i++) {
          const t = i / IRIS_SEG * 2 * Math.PI;
          const x = iris.x + Math.cos(t) * rr, y = iris.y + Math.sin(t) * rr;
          a.set([x, y, planeZ(x, y)], i * 3);
        }
        a.set([iris.x, iris.y, planeZ(iris.x, iris.y)], IRIS_SEG * 3);
        mesh.geometry.attributes.position.needsUpdate = true;
      }
    });
  }

  return { draw: drawSmooth, computeNormals, setFaceColor, rigidTeethOn };
}
