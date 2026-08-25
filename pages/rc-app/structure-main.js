import { initShell } from "./app.js";
import { parseRows } from "./parser.js";
import { StructureViz } from "./viz.js";

const DATA_URL = "./structure.json";

let viz = null;

async function loadDefaultData() {
  const res = await fetch(DATA_URL);
  if (!res.ok) throw new Error(`Не удалось загрузить ${DATA_URL}`);
  return res.json();
}

async function applyRows(rows) {
  const tree = parseRows(rows);
  viz.setData(tree);
}

function setHudCount(text) {
  const el = document.getElementById("hud-count");
  if (el) el.textContent = text;
}

function showBootError(message) {
  setHudCount("—");
  const stage = document.getElementById("structure-stage");
  if (stage) stage.innerHTML = `<p class="workspace-content-text">${message}</p>`;
}

async function boot() {
  try {
    initShell({ viz: () => viz });

    const stage = document.getElementById("structure-stage");
    viz = new StructureViz(stage);
    viz.mount();

    try {
      await applyRows(await loadDefaultData());
    } catch (err) {
      setHudCount("—");
      console.error(err);
    }
  } catch (err) {
    console.error(err);
    showBootError("Не удалось запустить приложение. Обновите страницу (Ctrl+F5).");
  }
}

document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") window.parent?.rcNavigate?.(1);
  if (e.key === "ArrowLeft") window.parent?.rcNavigate?.(-1);
  if (e.key === "ArrowUp") viz?.expandDiagram();
  if (e.key === "ArrowDown") viz?.collapseDiagram();
});

boot();
