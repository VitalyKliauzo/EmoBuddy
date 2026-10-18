import * as THREE from "three";

// Гладкий рендер лица в Three.js: усреднённые нормали вершин, текстура лица, глаза в 3D-сцене.
// Рисует в offscreen-канвас WebGL и копирует кадр в 2D-контекст meshCanvas.
//   eyes         - описание контуров глаз (EYES)
//   getTriangles - () => треугольники меша; getFaceTex - () => загруженная текстура лица или null
export function createSmoothRenderer({ meshCanvas, controls, eyes: EYES, getTriangles, getFaceTex }) {
  const { shadowGradient, normalSmooth, toggleTexture, toggleEyes } = controls;
  // --- Гладкий рендер: Three.js, усреднённые нормали вершин (рисуем в offscreen-canvas, потом копируем в meshCanvas) ---
  const meshCtx = meshCanvas.getContext("2d");
  const glRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, stencil: true });
  glRenderer.setSize(meshCanvas.width, meshCanvas.height, false);
  glRenderer.setClearColor(0x000000, 1);
  const glScene = new THREE.Scene();
  const glCamera = new THREE.OrthographicCamera(0, meshCanvas.width, 0, meshCanvas.height, -2000, 2000);
  glCamera.position.z = 1000;
  // Освещение подобрано под палитру плоского режима: ambient 25% + направленный свет 75% (в Three.js интенсивность умножается на PI)
  // Коэффициент градиента теней = доля направленного света; ambient = 1 - коэффициент (яркость лицом к камере остаётся прежней)
  const ambientLight = new THREE.AmbientLight(0xffffff, Math.PI * 0.25);
  glScene.add(ambientLight);
  const keyLight = new THREE.DirectionalLight(0xffffff, Math.PI * 0.75);
  function applyShadowGradient() {
    const k = +shadowGradient.value;
    keyLight.intensity = Math.PI * k;
    ambientLight.intensity = Math.PI * Math.max(0, 1 - k); // при k > 1 ambient = 0, свет только усиливается -> контрастнее
  }
  shadowGradient.addEventListener("input", applyShadowGradient);
  applyShadowGradient();
  keyLight.position.set(0, -150, 1000);
  glScene.add(keyLight);
  const glMaterial = new THREE.MeshPhongMaterial({ color: 0xd9a68a, shininess: 10, specular: 0x000000, side: THREE.DoubleSide });
  // Направление обхода у восстановленных треугольников произвольное, а DoubleSide в Three.js инвертирует нормаль у "обратных" граней -
  // отсюда шахматный узор. Нормали мы уже ориентировали к камере сами, поэтому отключаем эту инверсию.
  glMaterial.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_begin>",
      THREE.ShaderChunk.normal_fragment_begin.replace("normal *= faceDirection;", "")
    );
  };
  let faceColorHex = "#d9a68a";
  // Базовый цвет лица; при включённой текстуре цвет белый, и этот восстанавливается после её выключения
  function setFaceColor(c) {
    faceColorHex = c;
    if (!glMaterial.map) glMaterial.color.set(c);
  }

  let glMesh = null, neighbors = null, tmpNor = null;

  // Считает сглаженные нормали вершин по массиву позиций pos (x вправо, y вниз, z к камере) -> nor
  function computeNormals(pos, nor, count) {
    nor.fill(0);
    for (const [ia, ib, ic] of getTriangles()) {
      const ux = pos[ib*3] - pos[ia*3], uy = pos[ib*3+1] - pos[ia*3+1], uz = pos[ib*3+2] - pos[ia*3+2];
      const vx = pos[ic*3] - pos[ia*3], vy = pos[ic*3+1] - pos[ia*3+1], vz = pos[ic*3+2] - pos[ia*3+2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; } // ориентируем нормали к камере
      for (const i of [ia, ib, ic]) { nor[i*3] += nx; nor[i*3+1] += ny; nor[i*3+2] += nz; }
    }
    // Нормали по z у MediaPipe шумные, поэтому соседние треугольники сильно различаются.
    // Размываем нормали по соседним вершинам (несколько проходов) -> плавные градиенты.
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

  // Включает/выключает текстуру лица на WebGL-материале (UV ставятся один раз - они не меняются по кадрам)
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

  function drawSmooth(pts) {
    if (!glMesh) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts.length * 3), 3));
      g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(pts.length * 3), 3));
      g.setIndex(getTriangles().flat());
      glMesh = new THREE.Mesh(g, glMaterial);
      glMesh.frustumCulled = false;
      glScene.add(glMesh);
    }
    syncGlTexture(pts);
    const pos = glMesh.geometry.attributes.position.array;
    const nor = glMesh.geometry.attributes.normal.array;
    // ближе к камере = больше z в сцене, поэтому инвертируем z MediaPipe
    pts.forEach((p, i) => { pos[i*3] = p.x; pos[i*3+1] = p.y; pos[i*3+2] = -p.z; });
    computeNormals(pos, nor, pts.length);
    glMesh.geometry.attributes.position.needsUpdate = true;
    glMesh.geometry.attributes.normal.needsUpdate = true;
    updateGlEyes(pts);
    glRenderer.render(glScene, glCamera);
    meshCtx.drawImage(glRenderer.domElement, 0, 0, meshCanvas.width, meshCanvas.height);
  }

  // Глаза в smooth-режиме рисуются в 3D-сцене на плоскости контура глаза, поэтому нос и веки перекрывают их через depth-тест.
  // Белок пишет stencil только там, где он виден; радужка и зрачок рисуются только внутри этого stencil.
  const EYE_BIAS = 3; // небольшой сдвиг к камере, чтобы глаз не терялся внутри поверхности меша
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

  function updateGlEyes(pts) {
    const show = pts.length > 477 && toggleEyes.checked;
    EYES.forEach((eye, k) => {
      const ge = glEyes[k];
      for (const m of Object.values(ge)) m.visible = show;
      if (!show) return;
      const ring = eye.contour.map(i => pts[i]);
      const n = ring.length;
      let cx = 0, cy = 0, cz = 0;
      for (const p of ring) { cx += p.x; cy += p.y; cz += -p.z; }
      cx /= n; cy /= n; cz /= n;
      // плоскость z = cz + gx*dx + gy*dy по МНК: радужка лежит на ней и не "проваливается" в меш при повороте головы
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

  return { draw: drawSmooth, computeNormals, setFaceColor };
}
