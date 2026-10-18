// Панель управления: стили, разметка и ссылки на её элементы. Логику, которую панель переключает, держит вызывающий код.

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
  <h4>Управление</h4>
  <details class="control-group" open>
    <summary>Отображение</summary>
    <div class="control-row">
      <label for="togglePoints">Точки на камере</label>
      <input type="checkbox" id="togglePoints">
    </div>
    <div class="control-row">
      <label for="toggleMeshPoints">Точки на лице</label>
      <input type="checkbox" id="toggleMeshPoints">
    </div>
    <div class="control-row">
      <label for="toggleStable">Неподвижные точки</label>
      <input type="checkbox" id="toggleStable">
    </div>
    <div class="control-row">
      <label for="toggleMesh">Полигоны лица</label>
      <input type="checkbox" id="toggleMesh" checked>
    </div>
    <div class="control-row">
      <label for="toggleTexture">Текстура лица (face_v4)</label>
      <input type="checkbox" id="toggleTexture" checked>
    </div>
    <div class="control-row">
      <label for="toggleStatus">Строка статуса</label>
      <input type="checkbox" id="toggleStatus">
    </div>
  </details>
  <details class="control-group">
    <summary>Рендер</summary>
    <div class="control-row">
      <label for="renderMode">Рендер</label>
      <select id="renderMode">
        <option value="flat">Плоский (2D)</option>
        <option value="smooth" selected>Гладкий (WebGL)</option>
      </select>
    </div>
    <div class="control-row">
      <label for="faceColor">Цвет лица</label>
      <input type="color" id="faceColor" value="#d9a68a">
    </div>
    <div class="control-row">
      <label for="normalSmooth">Гладкость нормалей</label>
      <input type="range" id="normalSmooth" min="0" max="12" step="1" value="7" style="width:90px">
    </div>
    <div class="control-row">
      <label for="shadowGradient">Градиент теней</label>
      <input type="range" id="shadowGradient" min="0" max="3" step="0.05" value="0.5" style="width:90px">
    </div>
  </details>
  <details class="control-group">
    <summary>Глаза</summary>
    <div class="control-row">
      <label for="toggleEyes">Глаза</label>
      <input type="checkbox" id="toggleEyes" checked>
    </div>
    <div class="control-row">
      <label for="eyeStyle">Вид глаз</label>
      <select id="eyeStyle">
        <option value="flat">Плоские</option>
        <option value="ball" selected>Глазные яблоки</option>
      </select>
    </div>
  </details>
  <details class="control-group">
    <summary>Рот</summary>
    <div class="control-row">
      <label for="toggleTeeth">Зубы</label>
      <input type="checkbox" id="toggleTeeth" checked>
    </div>
    <div class="control-row">
      <label for="teethStyle">Вид зубов</label>
      <select id="teethStyle">
        <option value="rigid" selected>Жёсткие 3D</option>
        <option value="stretch">Растягиваются по губам</option>
      </select>
    </div>
    <div class="control-row">
      <label for="toggleCavity">Полость рта</label>
      <input type="checkbox" id="toggleCavity" checked>
    </div>
    <div class="control-row">
      <label for="cavityColor">Цвет полости рта</label>
      <input type="color" id="cavityColor" value="#3b0d14">
    </div>
    <div class="control-row">
      <label for="cavityDepth">Глубина полости</label>
      <input type="range" id="cavityDepth" min="0" max="2" step="0.05" value="1" style="width:90px">
    </div>
  </details>
  <details class="control-group">
    <summary>Камера</summary>
    <div class="control-row">
      <label for="zoom">Zoom</label>
      <input type="range" id="zoom" min="1" max="5" step="0.05" value="2.6" style="width:90px">
    </div>
    <div class="control-row">
      <button id="resetView" type="button">Reset zoom</button>
    </div>
  </details>
  <details class="control-group">
    <summary>Сглаживание точек</summary>
    <div class="control-row">
      <label for="toggleFilter">Сглаживание точек</label>
      <input type="checkbox" id="toggleFilter" checked>
    </div>
    <div class="control-row">
      <label for="filterStrength">Сила</label>
      <input type="range" id="filterStrength" min="0" max="1" step="0.05" value="0.6" style="width:90px">
    </div>
  </details>
  <details class="control-group">
    <summary>Действия</summary>
    <div class="control-row">
      <button id="refreshPage" type="button">Refresh</button>
    </div>
    <div class="control-row">
      <button id="exportGlb" type="button">Скачать GLB</button>
    </div>
  </details>
`;

const IDS = [
  "togglePoints", "toggleMesh", "toggleTexture", "toggleMeshPoints", "toggleEyes", "eyeStyle", "toggleTeeth", "teethStyle", "toggleCavity", "cavityColor", "cavityDepth", "toggleStable",
  "toggleStatus", "renderMode", "faceColor", "normalSmooth", "shadowGradient", "zoom", "resetView", "exportGlb",
  "toggleFilter", "filterStrength"
];

/** Рисует панель внутри `mount` и возвращает { id: element } для её элементов управления. */
export function createControls(mount) {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  mount.id = "controls";
  mount.innerHTML = HTML;
  mount.querySelector("#refreshPage").addEventListener("click", () => location.reload());

  return Object.fromEntries(IDS.map(id => [id, mount.querySelector("#" + id)]));
}
