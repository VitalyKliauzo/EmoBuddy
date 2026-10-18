// Внутренний контур губ слева направо: верхняя и нижняя дуги (78 и 308 - уголки рта)
const MOUTH_UPPER = [78,191,80,81,82,13,312,311,310,415,308];
const MOUTH_LOWER = [78,95,88,178,87,14,317,402,318,324,308];

// Полость рта + зубы. Рисуется поверх меша (меш закрашивает рот кожей), обрезается по внутреннему контуру губ.
// Зубы свисают от верхней/нижней губы вдоль оси лица (лоб -> подбородок), длина фиксирована и привязана к ширине рта.
export function drawTeeth(c, pts) {
  const up = MOUTH_UPPER.map(i => pts[i]), lo = MOUTH_LOWER.map(i => pts[i]);
  const open = Math.hypot(pts[13].x - pts[14].x, pts[13].y - pts[14].y);
  const mouthW = Math.hypot(pts[78].x - pts[308].x, pts[78].y - pts[308].y) || 1;
  if (open < mouthW * 0.03) return; // рот закрыт - зубов не видно

  const ax = pts[152].x - pts[10].x, ay = pts[152].y - pts[10].y;
  const al = Math.hypot(ax, ay) || 1;
  const dx = ax / al, dy = ay / al; // "вниз" в системе лица

  const curve = (arr, depth) => arr.map((p, k) => {
    const w = Math.sin(Math.PI * k / (arr.length - 1)) * 0.7 + 0.3; // у уголков зубов меньше
    return { x: p.x + dx * depth * w, y: p.y + dy * depth * w };
  });
  const poly = (list) => { c.beginPath(); list.forEach((p, k) => k ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.closePath(); };

  c.save();
  poly([...up, ...[...lo].reverse()]);
  c.clip();
  c.fillStyle = "#3b0d14"; // полость рта
  c.fillRect(0, 0, c.canvas.width, c.canvas.height);

  // фиксированная длина зубов (от ширины рта), раскрытие рта на неё не влияет - лишнее обрезает контур губ
  const upDepth = mouthW * 0.16, loDepth = mouthW * 0.12;
  const upTeeth = [...up, ...curve(up, upDepth).reverse()];
  const loTeeth = [...lo, ...curve(lo, -loDepth).reverse()];
  for (const [teeth, edge] of [[upTeeth, up], [loTeeth, lo]]) {
    poly(teeth);
    c.fillStyle = "#f6f3ea";
    c.fill();
    // промежутки между зубами
    c.strokeStyle = "rgba(120,110,100,0.55)";
    c.lineWidth = Math.max(1, mouthW * 0.008);
    const N = 8;
    c.save();
    poly(teeth);
    c.clip();
    for (let k = 1; k < N; k++) {
      const f = k / N * (edge.length - 1), i = Math.floor(f), t = f - i;
      const p = { x: edge[i].x + (edge[i+1].x - edge[i].x) * t, y: edge[i].y + (edge[i+1].y - edge[i].y) * t };
      c.beginPath();
      c.moveTo(p.x, p.y);
      c.lineTo(p.x + dx * (edge === up ? 1 : -1) * mouthW, p.y + dy * (edge === up ? 1 : -1) * mouthW);
      c.stroke();
    }
    c.restore();
  }
  c.restore();

  // обводка губ
  poly([...up, ...[...lo].reverse()]);
  c.strokeStyle = "#1c5a64";
  c.lineWidth = 1.5;
  c.stroke();
}
