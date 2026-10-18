// Points that don't move relative to the skull (candidates for head axes); highlighting is for visual checking
export const STABLE_POINTS = [
  { color: "#ffe000", ids: [10, 9, 168, 6, 197, 195, 4, 1, 2] },   // midline
  { color: "#00e5ff", ids: [33, 263, 133, 362] },                  // eye corners
  { color: "#ff40ff", ids: [127, 356, 234, 454, 93, 323] }         // temples, cheek edges, upper jaw
];
export function drawStable(c, pts, sx, sy, r) {
  for (const { color, ids } of STABLE_POINTS) {
    c.fillStyle = color;
    c.strokeStyle = "#000";
    c.lineWidth = 1;
    for (const i of ids) {
      c.beginPath();
      c.arc(pts[i].x * sx, pts[i].y * sy, r, 0, 2 * Math.PI);
      c.fill();
      c.stroke();
    }
  }
}
