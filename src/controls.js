// Control panel: styles, markup and references to its elements. The logic the panel toggles is held by the calling code.

const CSS = `
  #controls {
    width: 320px;
    box-sizing: border-box;
    background: #1b1b1b;
    border: 1px solid #333;
    border-radius: 12px;
    padding: 16px;
  }
  #controls h4 { margin: 0 0 12px 0; font-size: 14px; color: #ccc; }
  .control-group { border-top: 1px solid #333; padding: 4px 0; }
  .control-group:first-of-type { border-top: 0; }
  .control-group summary { cursor: pointer; list-style: none; font-size: 13px; font-weight: 600; color: #ccc; padding: 8px 0; user-select: none; }
  .control-group summary::-webkit-details-marker { display: none; }
  .control-group summary::before { content: "▸"; display: inline-block; width: 16px; transition: transform .15s; }
  .control-group[open] > summary::before { transform: rotate(90deg); }
  .control-group[open] > summary { margin-bottom: 4px; }
  .control-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; font-size: 13px; }
  .control-row label { cursor: pointer; }
  .control-row button { width: 100%; background:#2a5bd7; color:#fff; border:0; border-radius:8px; padding:8px; cursor:pointer; font-size:13px; }
  .control-row button:hover { background:#3a6be7; }
  .control-row select { background:#222; color:#eee; border:1px solid #444; border-radius:6px; padding:2px 4px; }
  .control-row input[type="checkbox"] { width: 18px; height: 18px; cursor: pointer; }
`;

const HTML = `
  <h4>Controls</h4>
  <details class="control-group" open>
    <summary>Display</summary>
    <div class="control-row">
      <label for="togglePoints">Points on camera</label>
      <input type="checkbox" id="togglePoints">
    </div>
    <div class="control-row">
      <label for="toggleMeshPoints">Points on face</label>
      <input type="checkbox" id="toggleMeshPoints">
    </div>
    <div class="control-row">
      <label for="toggleStable">Stable points</label>
      <input type="checkbox" id="toggleStable">
    </div>
    <div class="control-row">
      <label for="toggleMesh">Face polygons</label>
      <input type="checkbox" id="toggleMesh" checked>
    </div>
    <div class="control-row">
      <label for="toggleTexture">Face texture (face_v4)</label>
      <input type="checkbox" id="toggleTexture" checked>
    </div>
    <div class="control-row">
      <label for="toggleStatus">Status line</label>
      <input type="checkbox" id="toggleStatus">
    </div>
  </details>
  <details class="control-group">
    <summary>Render</summary>
    <div class="control-row">
      <label for="renderMode">Render</label>
      <select id="renderMode">
        <option value="flat">Flat (2D)</option>
        <option value="smooth" selected>Smooth (WebGL)</option>
      </select>
    </div>
    <div class="control-row">
      <label for="faceColor">Face color</label>
      <input type="color" id="faceColor" value="#d9a68a">
    </div>
    <div class="control-row">
      <label for="normalSmooth">Normal smoothness</label>
      <input type="range" id="normalSmooth" min="0" max="12" step="1" value="7" style="width:90px">
    </div>
    <div class="control-row">
      <label for="shadowGradient">Shadow gradient</label>
      <input type="range" id="shadowGradient" min="0" max="3" step="0.05" value="0.5" style="width:90px">
    </div>
  </details>
  <details class="control-group">
    <summary>Eyes</summary>
    <div class="control-row">
      <label for="toggleEyes">Eyes</label>
      <input type="checkbox" id="toggleEyes" checked>
    </div>
    <div class="control-row">
      <label for="eyeStyle">Eye style</label>
      <select id="eyeStyle">
        <option value="flat">Flat</option>
        <option value="ball" selected>Eyeballs</option>
      </select>
    </div>
  </details>
  <details class="control-group">
    <summary>Mouth</summary>
    <div class="control-row">
      <label for="toggleTeeth">Teeth</label>
      <input type="checkbox" id="toggleTeeth" checked>
    </div>
    <div class="control-row">
      <label for="teethStyle">Teeth style</label>
      <select id="teethStyle">
        <option value="rigid" selected>Rigid 3D</option>
        <option value="stretch">Stretch with lips</option>
      </select>
    </div>
    <div class="control-row">
      <label for="toggleCavity">Mouth cavity</label>
      <input type="checkbox" id="toggleCavity" checked>
    </div>
    <div class="control-row">
      <label for="cavityColor">Mouth cavity color</label>
      <input type="color" id="cavityColor" value="#3b0d14">
    </div>
    <div class="control-row">
      <label for="cavityDepth">Cavity depth</label>
      <input type="range" id="cavityDepth" min="0" max="2" step="0.05" value="1" style="width:90px">
    </div>
  </details>
  <details class="control-group">
    <summary>Camera</summary>
    <div class="control-row">
      <label for="zoom">Zoom</label>
      <input type="range" id="zoom" min="1" max="5" step="0.05" value="2.6" style="width:90px">
    </div>
    <div class="control-row">
      <button id="resetView" type="button">Reset zoom</button>
    </div>
  </details>
  <details class="control-group">
    <summary>Point smoothing</summary>
    <div class="control-row">
      <label for="toggleFilter">Point smoothing</label>
      <input type="checkbox" id="toggleFilter" checked>
    </div>
    <div class="control-row">
      <label for="filterStrength">Strength</label>
      <input type="range" id="filterStrength" min="0" max="1" step="0.05" value="0.6" style="width:90px">
    </div>
  </details>
  <details class="control-group">
    <summary>Actions</summary>
    <div class="control-row">
      <button id="refreshPage" type="button">Refresh</button>
    </div>
    <div class="control-row">
      <button id="exportGlb" type="button">Download GLB</button>
    </div>
  </details>
`;

const IDS = [
  "togglePoints", "toggleMesh", "toggleTexture", "toggleMeshPoints", "toggleEyes", "eyeStyle", "toggleTeeth", "teethStyle", "toggleCavity", "cavityColor", "cavityDepth", "toggleStable",
  "toggleStatus", "renderMode", "faceColor", "normalSmooth", "shadowGradient", "zoom", "resetView", "exportGlb",
  "toggleFilter", "filterStrength"
];

/** Renders the panel inside `mount` and returns { id: element } for its controls. */
export function createControls(mount) {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  mount.id = "controls";
  mount.innerHTML = HTML;
  mount.querySelector("#refreshPage").addEventListener("click", () => location.reload());

  return Object.fromEntries(IDS.map(id => [id, mount.querySelector("#" + id)]));
}
