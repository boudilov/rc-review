/** Parse flat Excel rows (with forward-fill groups) into a radial tree. */

export function parseRows(rows) {
  if (!rows?.length) throw new Error("Пустой файл данных");

  let currentSubgroup = null;
  let currentAbbr = null;

  const root = {
    id: "rc",
    type: "root",
    label: "РЦ",
    fullLabel: "Ресурсные центры",
    children: [],
  };

  const tgMap = new Map();
  const workshopMap = new Map();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const subgroup = row[1] ?? null;
    const rcName = row[2] ?? null;
    const abbr = row[3] ?? null;
    const firstName = row[4] ?? null;
    const lastName = row[5] ?? null;
    const photo = row[6] ?? null;

    if (subgroup) {
      currentSubgroup = subgroup;
      if (!tgMap.has(subgroup)) {
        const num = subgroup.match(/(\d+)/);
        const tgNode = {
          id: `tg-${num?.[1] || tgMap.size + 1}`,
          type: "tg",
          label: num ? `${num[1]}ТГ` : subgroup,
          fullLabel: subgroup,
          children: [],
        };
        tgMap.set(subgroup, tgNode);
        root.children.push(tgNode);
      }
    }

    if (rcName && abbr) {
      currentAbbr = abbr;
      const tg = tgMap.get(currentSubgroup);
      if (!tg) continue;

      if (!workshopMap.has(abbr)) {
        const workshop = {
          id: abbr,
          type: "workshop",
          label: abbr,
          fullLabel: rcName,
          children: [],
        };
        workshopMap.set(abbr, workshop);
        tg.children.push(workshop);
      }
    }

    if (firstName && currentAbbr) {
      const workshop = workshopMap.get(currentAbbr);
      if (!workshop) continue;
      workshop.children.push({
        id: `${currentAbbr}-${firstName}-${lastName || i}`,
        type: "person",
        label: String(firstName).toUpperCase(),
        fullLabel: [firstName, lastName].filter(Boolean).join(" "),
        photo: photo || null,
      });
    }
  }

  if (!root.children.length) throw new Error("Не удалось построить дерево из данных");
  return root;
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function resolveHeaderIndex(headers, aliases) {
  const normalizedAliases = aliases.map((a) => normalizeHeader(a));
  return headers.findIndex((h) => normalizedAliases.includes(h));
}

function parseYear(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  const match = String(value).match(/\d{4}/);
  return match ? Number(match[0]) : null;
}

function parseSide(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  if (/^(л|лево|left|l)$/.test(raw)) return "left";
  if (/^(п|право|right|r)$/.test(raw)) return "right";
  return null;
}

export const HISTORY_YEAR_START = 2003;
export const HISTORY_YEAR_END = 2032;
export const HISTORY_DIVIDER_YEARS = [2003, 2026, 2032];
export const HISTORY_PLACEHOLDER_YEAR = 2029;

export function parseHistoryRows(rows) {
  if (!rows?.length) return [];

  const headers = (rows[0] || []).map(normalizeHeader);
  const yearCol = resolveHeaderIndex(headers, ["год", "год открытия"]);
  const nameCol = resolveHeaderIndex(headers, ["рц", "ресурсный центр", "название"]);
  const sideCol = resolveHeaderIndex(headers, ["положение", "сторона", "side"]);
  const activeCol = resolveHeaderIndex(headers, ["активен", "активна"]);

  if (yearCol < 0 || nameCol < 0) return [];

  const entries = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const year = parseYear(row[yearCol]);
    const name = row[nameCol] != null ? String(row[nameCol]).trim() : "";
    if (!year || !name) continue;

    const side = parseSide(row[sideCol]) || "right";
    const activeRaw = activeCol >= 0 ? String(row[activeCol] ?? "").trim().toLowerCase() : "да";
    const active = !/^(нет|no|false|0|-)$/.test(activeRaw);

    entries.push({
      id: `${year}-${name}-${i}`,
      year,
      name,
      side,
      active,
    });
  }

  return entries.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    const sideRank = { left: 0, right: 1 };
    const aSide = sideRank[a.side] ?? 2;
    const bSide = sideRank[b.side] ?? 2;
    if (aSide !== bSide) return aSide - bSide;
    return a.name.localeCompare(b.name, "ru");
  });
}

export function buildHistoryTimeline(
  entries,
  {
    start = HISTORY_YEAR_START,
    end = HISTORY_YEAR_END,
    dividerYears = HISTORY_DIVIDER_YEARS,
    placeholderYear = HISTORY_PLACEHOLDER_YEAR,
  } = {}
) {
  const byYear = new Map();
  for (const entry of entries) {
    if (entry.year == null) continue;
    if (!byYear.has(entry.year)) byYear.set(entry.year, []);
    byYear.get(entry.year).push(entry);
  }

  const rows = [];
  for (let year = start; year <= end; year++) {
    const events = byYear.get(year) || [];
    const isDivider = dividerYears.includes(year);
    rows.push({
      year,
      events,
      isDivider,
      showYear: events.length > 0 || isDivider,
      isDotOnly: events.length === 0 && !isDivider,
      placeholder: null,
    });
  }

  return rows;
}

export function countNodes(node) {
  let n = 1;
  for (const child of node.children || []) n += countNodes(child);
  return n;
}

export function countPeople(node) {
  if (node.type === "person") return 1;
  return (node.children || []).reduce((sum, c) => sum + countPeople(c), 0);
}
