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

function parseWorkbookRows(workbook) {
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
}

async function applyRows(rows) {
  const tree = parseRows(rows);
  viz.setData(tree);
}

function setHudStatus(text) {
  const el = document.getElementById("hud-status");
  if (el) el.textContent = text;
}

function setHudCount(text) {
  const el = document.getElementById("hud-count");
  if (el) el.textContent = text;
}

function showBootError(message) {
  setHudStatus("ошибка загрузки");
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
      setHudStatus("ошибка загрузки");
      setHudCount("—");
      console.error(err);
    }
  } catch (err) {
    console.error(err);
    showBootError("Не удалось запустить приложение. Обновите страницу (Ctrl+F5).");
  }

  const resetBtn = document.getElementById("reset-camera-btn");
  resetBtn?.addEventListener("click", () => viz?.resetCamera());

  const importBtn = document.getElementById("import-btn");
  const importInput = document.getElementById("import-file");
  importBtn?.addEventListener("click", () => importInput?.click());
  importInput?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const workbook = window.XLSX.read(buffer, { type: "array" });
      await applyRows(parseWorkbookRows(workbook));
    } catch (err) {
      setHudStatus("ошибка импорта");
      console.error(err);
      alert("Не удалось прочитать Excel-файл.");
    }
  });

  const exportBtn = document.getElementById("export-btn");
  exportBtn?.addEventListener("click", () => {
    if (!viz?.tree) return;
    const blob = new Blob([JSON.stringify(viz.tree, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "structure-tree.json";
    a.click();
    URL.revokeObjectURL(url);
  });
}

boot();
