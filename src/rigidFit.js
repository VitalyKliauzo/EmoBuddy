import * as THREE from "three";

// Жёсткое совмещение (Horn/Umeyama): находит поворот q, масштаб s и сдвиг c, при которых ref_i -> c + s * q * ref_i
// лучше всего (по МНК) ложатся на cur_i. Шум отдельных точек усредняется по всему набору, а не определяет ось целиком.
// ref - центрированные векторы (центроид 0), cur - текущие позиции; обе списки одной длины.

// Собственный вектор симметричной 4x4 матрицы с наибольшим собственным значением (метод Якоби)
function topEigenvector(M) {
  const A = M.map(r => r.slice()), V = [[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]];
  for (let sweep = 0; sweep < 20; sweep++) {
    let off = 0;
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) off += A[i][j] ** 2;
    if (off < 1e-18) break;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 4; q++) {
      if (Math.abs(A[p][q]) < 1e-30) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 4; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for (let k = 0; k < 4; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < 4; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  let best = 0;
  for (let i = 1; i < 4; i++) if (A[i][i] > A[best][best]) best = i;
  return [V[0][best], V[1][best], V[2][best], V[3][best]];
}

/** @returns {{c: THREE.Vector3, q: THREE.Quaternion, s: number}} */
export function fitRigid(ref, cur) {
  const n = ref.length, c = new THREE.Vector3();
  for (const p of cur) c.add(p);
  c.divideScalar(n);
  let Sxx = 0, Sxy = 0, Sxz = 0, Syx = 0, Syy = 0, Syz = 0, Szx = 0, Szy = 0, Szz = 0, refSq = 0;
  for (let i = 0; i < n; i++) {
    const a = ref[i], bx = cur[i].x - c.x, by = cur[i].y - c.y, bz = cur[i].z - c.z;
    Sxx += a.x * bx; Sxy += a.x * by; Sxz += a.x * bz;
    Syx += a.y * bx; Syy += a.y * by; Syz += a.y * bz;
    Szx += a.z * bx; Szy += a.z * by; Szz += a.z * bz;
    refSq += a.lengthSq();
  }
  const [w, x, y, z] = topEigenvector([
    [Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx],
    [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz],
    [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy],
    [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz]
  ]);
  const q = new THREE.Quaternion(x, y, z, w).normalize();
  let dot = 0; // s = sum(b . R a) / sum(|a|^2)
  const t = new THREE.Vector3();
  for (let i = 0; i < n; i++) dot += t.copy(ref[i]).applyQuaternion(q).dot(new THREE.Vector3(cur[i].x - c.x, cur[i].y - c.y, cur[i].z - c.z));
  return { c, q, s: dot / (refSq || 1) };
}
