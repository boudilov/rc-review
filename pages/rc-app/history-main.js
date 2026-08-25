import { initShell } from "./app.js";
import { parseHistoryRows, buildHistoryTimeline } from "./parser.js";

const HISTORY_DATA_URL = "./history.json";

let historyEntries = [];
let historyAnimStep = 0;
let historyAnimSteps = [];
let historyBoardEl = null;

async function loadHistoryData() {
  const res = await fetch(HISTORY_DATA_URL);
  if (!res.ok) throw new Error(`Не удалось загрузить ${HISTORY_DATA_URL}`);
  return res.json();
}

function renderHistoryWorkspace(container) {
  container.innerHTML = "";
  historyBoardEl = null;
  container.removeEventListener("click", onHistoryStageClick);
  container.removeEventListener("contextmenu", onHistoryStageContextMenu);

  const rows = buildHistoryTimeline(historyEntries);
  if (!historyEntries.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent =
      "Не удалось загрузить history.json. Обновите history.xlsx и запустите convert.py.";
    container.appendChild(empty);
    return;
  }

  historyAnimSteps = buildHistoryAnimSteps(rows);
  historyAnimStep = 0;

  const board = document.createElement("section");
  board.className = "history-board";
  historyBoardEl = board;

  const seed = document.createElement("div");
  seed.className = "history-seed is-visible";
  seed.innerHTML = '<span class="history-dot history-seed-dot"></span>';
  board.appendChild(seed);

  const spine = document.createElement("div");
  spine.className = "history-trunk-spine";
  spine.setAttribute("aria-hidden", "true");
  spine.innerHTML = `
    <span class="history-trunk-line history-trunk-line-up"></span>
    <span class="history-trunk-line history-trunk-line-down"></span>
  `;
  board.appendChild(spine);

  const rowsWrap = document.createElement("div");
  rowsWrap.className = "history-rows";
  let trunkIndex = 0;
  let orbitIndex = 0;

  for (const row of rows) {
    const rowEl = createHistoryRow(row);
    rowEl.dataset.year = String(row.year);
    if (row.isDotOnly) {
      rowEl.style.setProperty("--trunk-i", String(trunkIndex++));
    }
    for (const label of rowEl.querySelectorAll(".history-label")) {
      label.style.setProperty("--orbit-i", String(orbitIndex++));
    }
    rowsWrap.appendChild(rowEl);
  }

  board.appendChild(rowsWrap);
  container.appendChild(board);
  container.classList.add("history-stage");

  container.addEventListener("click", onHistoryStageClick);
  container.addEventListener("contextmenu", onHistoryStageContextMenu);

  applyHistoryAnimStep(board);
  layoutHistoryTrunkSpine(board);
}

function layoutHistoryTrunkSpine(board) {
  const rowsWrap = board.querySelector(".history-rows");
  const spine = board.querySelector(".history-trunk-spine");
  if (!rowsWrap || !spine) return;

  const boardRect = board.getBoundingClientRect();
  const rowsRect = rowsWrap.getBoundingClientRect();
  const spineH = rowsRect.height;
  const spineTop = rowsRect.top - boardRect.top;

  board.style.setProperty("--spine-h", `${spineH}px`);
  board.style.setProperty("--spine-top", `${spineTop}px`);
  spine.style.setProperty("--spine-h", `${spineH}px`);
  spine.style.setProperty("--spine-top", `${spineTop}px`);
}

function restartTrunkGrowAnimation(board) {
  const spine = board.querySelector(".history-trunk-spine");
  if (!spine) return;

  spine.classList.remove("is-growing");
  for (const line of spine.querySelectorAll(".history-trunk-line")) {
    line.style.animation = "none";
  }
  void spine.offsetHeight;
  for (const line of spine.querySelectorAll(".history-trunk-line")) {
    line.style.animation = "";
  }
  spine.classList.add("is-growing");
}

function buildHistoryAnimSteps(rows) {
  const steps = [{ kind: "seed" }, { kind: "trunk" }];
  for (const row of rows) {
    if (row.showYear) steps.push({ kind: "year", year: row.year });
  }
  steps.push({ kind: "complete" });
  return steps;
}

function historyRevealYearForStep(stepIndex) {
  const step = historyAnimSteps[stepIndex];
  if (!step) return -1;
  if (step.kind === "complete") return Infinity;
  if (step.kind === "year") return step.year;
  return -1;
}

function applyHistoryAnimStep(board) {
  const step = historyAnimSteps[historyAnimStep] || { kind: "seed" };
  const revealYear = historyRevealYearForStep(historyAnimStep);

  board.dataset.historyStep = step.kind;
  board.classList.toggle("is-seed", step.kind === "seed");
  board.classList.toggle("is-trunk", step.kind === "trunk");
  board.classList.toggle("is-year", step.kind === "year");
  board.classList.toggle("is-complete", step.kind === "complete");

  const seed = board.querySelector(".history-seed");
  const spine = board.querySelector(".history-trunk-spine");
  seed?.classList.toggle("is-visible", step.kind === "seed" || step.kind === "trunk");
  spine?.classList.toggle("is-visible", step.kind === "trunk");

  if (step.kind === "trunk") {
    layoutHistoryTrunkSpine(board);
    restartTrunkGrowAnimation(board);
  } else {
    spine?.classList.remove("is-growing");
  }

  board.querySelectorAll(".history-row").forEach((rowEl) => {
    const year = Number(rowEl.dataset.year);
    const isDotOnly = rowEl.classList.contains("is-dot-only");
    const revealed = step.kind !== "seed";
    const yearOpened =
      step.kind === "complete" || (step.kind === "year" && !isDotOnly && year <= revealYear);

    rowEl.classList.toggle("is-revealed", revealed);
    rowEl.classList.toggle("is-open-year", Boolean(yearOpened));
    rowEl.classList.toggle("is-new", step.kind === "year" && year === step.year && !isDotOnly);
  });
}

function onHistoryStageClick(e) {
  if (e.button !== 0) return;
  if (e.target.closest(".history-label")) return;
  advanceHistoryStep();
}

function onHistoryStageContextMenu(e) {
  if (e.target.closest(".history-label")) return;
  e.preventDefault();
  retreatHistoryStep();
}

function advanceHistoryStep() {
  if (historyAnimStep >= historyAnimSteps.length - 1) return;
  historyAnimStep += 1;
  if (historyBoardEl) applyHistoryAnimStep(historyBoardEl);
}

function retreatHistoryStep() {
  if (historyAnimStep <= 0) return;
  historyAnimStep -= 1;
  if (historyBoardEl) applyHistoryAnimStep(historyBoardEl);
}

function historyLabelText(entry) {
  return String(entry.name || "").toUpperCase();
}

function isInactiveHistoryEntry(entry) {
  return entry.active === false;
}

function createHistoryRow(row) {
  const el = document.createElement("div");
  el.className = "history-row";
  if (row.isDotOnly) el.classList.add("is-dot-only");

  const left = document.createElement("div");
  left.className = "history-side left";
  const center = document.createElement("div");
  center.className = "history-center";
  const right = document.createElement("div");
  right.className = "history-side right";

  for (const event of row.events) {
    const side = event.side === "left" || event.side === "right" ? event.side : "right";
    const label = document.createElement("div");
    label.className = "history-label";
    if (isInactiveHistoryEntry(event)) label.classList.add("is-inactive");
    label.textContent = historyLabelText(event);
    (side === "left" ? left : right).appendChild(label);
  }

  if (row.showYear) {
    const dot = document.createElement("span");
    dot.className = "history-dot";
    center.appendChild(dot);

    const year = document.createElement("span");
    year.className = "history-year";
    year.textContent = String(row.year);
    center.appendChild(year);
  } else {
    const dot = document.createElement("span");
    dot.className = "history-dot";
    center.appendChild(dot);
  }

  el.appendChild(left);
  el.appendChild(center);
  el.appendChild(right);
  return el;
}

async function boot() {
  initShell({ viz: () => null });

  const content = document.getElementById("workspace-content");
  try {
    historyEntries = parseHistoryRows(await loadHistoryData());
  } catch (err) {
    historyEntries = [];
    console.error(err);
  }
  renderHistoryWorkspace(content);
}

boot();
