// Camera crop/zoom: a square window (x0, y0, size 1/z) in normalized video coordinates.
// Crops the camera image, and the rendered face is displayed through the same window.
//  camWrap - wrapper (wheel = zoom, drag = pan, double click = reset); video, canvas - what gets cropped
//  zoom - zoom slider; resetButton - reset button
export function createCameraView({ camWrap, video, canvas, zoom, resetButton }) {
  const view = { z: 1, x0: 0, y0: 0 };
  function applyView() {
    view.z = Math.min(5, Math.max(1, view.z));
    view.x0 = Math.min(1 - 1 / view.z, Math.max(0, view.x0));
    view.y0 = Math.min(1 - 1 / view.z, Math.max(0, view.y0));
    const t = `scale(${view.z}) translate(${-view.x0 * 320}px, ${-view.y0 * 240}px)`;
    video.style.transform = canvas.style.transform = t;
    zoom.value = view.z;
  }
  // zoom to z2 keeping the video point at display fraction (u, v) fixed; the wrapper is mirrored, so x is flipped
  function zoomAt(z2, u, v) {
    const vx = view.x0 + (1 - u) / view.z, vy = view.y0 + v / view.z;
    view.z = Math.min(5, Math.max(1, z2));
    view.x0 = vx - (1 - u) / view.z;
    view.y0 = vy - v / view.z;
    applyView();
  }
  camWrap.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = camWrap.getBoundingClientRect();
    zoomAt(view.z * Math.exp(-e.deltaY * 0.002), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  }, { passive: false });
  let drag = null;
  camWrap.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY };
    camWrap.setPointerCapture(e.pointerId);
    camWrap.classList.add("dragging");
  });
  camWrap.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const r = camWrap.getBoundingClientRect();
    view.x0 += (e.clientX - drag.x) / r.width / view.z;   // mirrored: dragging right moves the window right
    view.y0 -= (e.clientY - drag.y) / r.height / view.z;
    drag = { x: e.clientX, y: e.clientY };
    applyView();
  });
  const endDrag = () => { drag = null; camWrap.classList.remove("dragging"); };
  camWrap.addEventListener("pointerup", endDrag);
  camWrap.addEventListener("pointercancel", endDrag);
  function resetView() { view.z = 1; view.x0 = view.y0 = 0; applyView(); }
  camWrap.addEventListener("dblclick", resetView);
  resetButton.addEventListener("click", resetView);
  zoom.addEventListener("input", () => {
    const c = view.x0 + 0.5 / view.z, d = view.y0 + 0.5 / view.z; // keep the window centre
    view.z = +zoom.value;
    view.x0 = c - 0.5 / view.z; view.y0 = d - 0.5 / view.z;
    applyView();
  });

  // initial zoom is taken from the slider, window centered
  view.z = +zoom.value;
  view.x0 = view.y0 = 0.5 - 0.5 / view.z;
  applyView();

  // Maps points (in mesh pixels W x H) through the crop window; without cropping returns them as is
  function mapPoints(pts, W, H) {
    const zk = view.z;
    if (zk === 1 && view.x0 === 0 && view.y0 === 0) return pts;
    return pts.map(p => ({ x: (p.x - view.x0 * W) * zk, y: (p.y - view.y0 * H) * zk, z: p.z * zk }));
  }

  return { view, mapPoints };
}
