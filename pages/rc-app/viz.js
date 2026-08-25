import { openOverlay, closeOverlay, bindPhotoZoom } from "./app.js?v=44";
import { layoutTree, collectLinks, flattenNodes } from "./layout.js?v=44";
import { countPeople } from "./parser.js?v=44";

const NODE_STYLE = {
  root: { r: 28, font: 11, stroke: 1.2, fill: true },
  tg: { r: 24, font: 10, stroke: 1, fill: false },
  workshop: { r: 22, font: 8, stroke: 1, fill: false },
  person: { r: 14, font: 7, stroke: 1, fill: true },
};

const FOLD_DELAY_MS = { tg: 90, workshop: 180, person: 280 };

export class StructureViz {
  constructor(container) {
    this.container = container;
    this.svg = null;
    this.viewport = null;
    this.shellGroup = null;
    this.shellCenterGroup = null;
    this.shellHaloEl = null;
    this.shellEl = null;
    this.defsEl = null;
    this.guidesGroup = null;
    this.contentGroup = null;
    this.ringHitsGroup = null;
    this.camera = { x: 0, y: 0, scale: 1 };
    this.tree = null;
    this.layout = null;
    this.nodes = [];
    this.links = [];
    this.focusId = null;
    this.hoverId = null;
    this.hoverRing = null;
    this.searchQuery = "";
    this.panning = null;
    this.spacePressed = false;
    this.suppressClick = false;
    this.rcMosaicClosing = false;
    this.diagramExpanded = false;
    this.onResize = this.onResize.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onClick = this.onClick.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onContextMenu = this.onContextMenu.bind(this);
  }

  mount() {
    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svg.setAttribute("class", "structure-svg");
    this.svg.setAttribute("width", "100%");
    this.svg.setAttribute("height", "100%");

    this.viewport = document.createElementNS("http://www.w3.org/2000/svg", "g");
    this.viewport.setAttribute("class", "structure-viewport");

    this.shellGroup = svgEl("g", { class: "structure-shell" });
    this.shellUnfoldGroup = svgEl("g", { class: "structure-fold-layer structure-shell-unfold" });
    this.shellCenterGroup = svgEl("g", { class: "structure-shell-center" });
    this.shellHaloEl = svgEl("circle", { class: "structure-outer-shell-halo" });
    this.shellEl = svgEl("circle", { class: "structure-outer-shell", fill: "none" });
    this.shellCenterGroup.appendChild(this.shellHaloEl);
    this.shellCenterGroup.appendChild(this.shellEl);
    this.shellUnfoldGroup.appendChild(this.shellCenterGroup);
    this.shellGroup.appendChild(this.shellUnfoldGroup);

    this.guidesGroup = svgEl("g", { class: "structure-guides" });
    this.contentGroup = svgEl("g", { class: "structure-content" });
    this.ringHitsGroup = svgEl("g", { class: "structure-ring-hits" });

    this.ensureGlowDefs();

    this.viewport.appendChild(this.guidesGroup);
    this.viewport.appendChild(this.shellGroup);
    this.viewport.appendChild(this.ringHitsGroup);
    this.viewport.appendChild(this.contentGroup);

    this.container.innerHTML = "";
    this.container.appendChild(this.svg);
    this.svg.appendChild(this.viewport);
    this.svg.setAttribute("data-diagram-fold", "collapsed");

    window.addEventListener("resize", this.onResize);
    this.svg.addEventListener("wheel", this.onWheel, { passive: false });
    this.svg.addEventListener("click", this.onClick);
    this.svg.addEventListener("contextmenu", this.onContextMenu);
    this.svg.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("keyup", this.onKeyUp);
  }

  destroy() {
    window.removeEventListener("resize", this.onResize);
    this.svg?.removeEventListener("wheel", this.onWheel);
    this.svg?.removeEventListener("click", this.onClick);
    this.svg?.removeEventListener("contextmenu", this.onContextMenu);
    this.svg?.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    document.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("keyup", this.onKeyUp);
  }

  setData(tree) {
    this.tree = tree;
    this.focusId = null;
    this.hoverId = null;
    this.hoverRing = null;
    this.diagramExpanded = false;
    this.onResize();
    this.updateHud();
    this.applyDiagramFoldState();
  }

  setSearch(query) {
    this.searchQuery = (query || "").trim().toLowerCase();
    this.render();
  }

  resetCamera() {
    this.camera = { x: 0, y: 0, scale: 1 };
    this.applyCamera();
  }

  size() {
    const rect = this.container.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  onResize() {
    if (!this.tree) return;
    const size = this.size();
    if (size.width < 1 || size.height < 1) return;
    this.layout = layoutTree(this.tree, { size });
    this.links = collectLinks(this.layout.root);
    this.nodes = flattenNodes(this.layout.root);
    this.render();
    this.applyCamera();
  }

  applyCamera() {
    const { x, y, scale } = this.camera;
    this.viewport.setAttribute(
      "transform",
      `translate(${x},${y}) scale(${scale})`
    );
    const hud = document.getElementById("hud-status");
    if (hud) {
      hud.textContent = `масштаб: ${scale.toFixed(2)}×`;
    }
  }

  onWheel(e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const rect = this.svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const nextScale = Math.min(3, Math.max(0.35, this.camera.scale * factor));
    const ratio = nextScale / this.camera.scale;
    this.camera.x = mx - (mx - this.camera.x) * ratio;
    this.camera.y = my - (my - this.camera.y) * ratio;
    this.camera.scale = nextScale;
    this.applyCamera();
  }

  clientToLayout(clientX, clientY) {
    const point = this.svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const matrix = this.viewport.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const local = point.matrixTransform(matrix.inverse());
    return { x: local.x, y: local.y };
  }

  nodeHitRadius(node) {
    const style = NODE_STYLE[node.type] || NODE_STYLE.person;
    if (node.type === "root") return 46;
    if (node.type === "workshop") return 52;
    if (node.type === "tg") return 28;
    return style.r + 6;
  }

  pickNodeIdFromElement(el) {
    let current = el;
    while (current && current !== this.svg) {
      const id = current.getAttribute?.("data-node-id");
      if (id) return id;
      current = current.parentNode;
    }
    return null;
  }

  pickNodeId(e) {
    if (!this.layout) return null;

    const stack = document.elementsFromPoint(e.clientX, e.clientY);
    const TYPE_RANK = { workshop: 0, tg: 1, person: 2, root: 3 };
    let domId = null;
    let domRank = Infinity;

    for (const el of stack) {
      const id = this.pickNodeIdFromElement(el);
      if (!id) continue;
      const node = this.nodes.find((n) => n.id === id);
      if (!this.diagramExpanded && node?.id !== "rc") continue;
      const rank = TYPE_RANK[node?.type] ?? 9;
      if (rank < domRank) {
        domRank = rank;
        domId = id;
      }
    }
    if (domId) return domId;

    const pt = this.clientToLayout(e.clientX, e.clientY);
    let bestId = null;
    let bestDist = Infinity;
    let bestRank = Infinity;

    for (const node of this.nodes) {
      if (!this.diagramExpanded && node.id !== "rc") continue;
      const dist = Math.hypot(pt.x - node.x, pt.y - node.y);
      const hitR = this.nodeHitRadius(node);
      if (dist > hitR) continue;

      const rank = TYPE_RANK[node.type] ?? 9;
      if (rank < bestRank || (rank === bestRank && dist < bestDist)) {
        bestRank = rank;
        bestDist = dist;
        bestId = node.id;
      }
    }

    return bestId;
  }

  openWorkshop(node) {
    if (!node || node.type !== "workshop") return;
    this.focusId = node.id;
    this.hoverId = null;
    this.hoverRing = null;
    this.closeRcMosaicModal({ keepFocus: true, animate: false });
    this.showWorkshopModal(node);
    this.render();
  }

  openRcMosaic() {
    if (!this.diagramExpanded) {
      this.expandDiagram();
      return;
    }
    this.focusId = "rc";
    this.hoverId = null;
    this.hoverRing = null;
    this.closeWorkshopModal();
    this.showRcMosaicModal();
    this.render();
  }

  selectNode(nodeId) {
    if (!nodeId) {
      this.focusId = null;
      this.hoverRing = null;
      this.closeWorkshopModal();
      this.closeRcMosaicModal({ animate: true });
      this.render();
      return;
    }

    const node = this.nodes.find((n) => n.id === nodeId);
    if (node?.type === "workshop") {
      this.openWorkshop(node);
      return;
    }
    if (nodeId === "rc") {
      if (!this.diagramExpanded) {
        this.expandDiagram();
        return;
      }
      this.openRcMosaic();
      return;
    }

    this.focusId = nodeId;
    this.hoverId = null;
    this.hoverRing = null;
    this.closeWorkshopModal();
    this.closeRcMosaicModal({ keepFocus: true, animate: false });
    this.render();
  }

  nodeFromEventTarget(target) {
    if (!target) return null;
    let el = target;
    while (el && el !== this.svg) {
      const nodeId = el.getAttribute?.("data-node-id");
      if (nodeId) {
        return this.nodes.find((n) => n.id === nodeId) || null;
      }
      el = el.parentNode;
    }
    return null;
  }

  onClick(e) {
    if (this.suppressClick) return;
    if (!this.diagramExpanded) {
      let node = this.nodeFromEventTarget(e.target);
      if (!node) {
        const nodeId = this.pickNodeId(e);
        if (nodeId) node = this.nodes.find((n) => n.id === nodeId) || null;
      }
      if (node?.id === "rc") {
        this.expandDiagram();
      }
      return;
    }

    let node = this.nodeFromEventTarget(e.target);
    if (!node) {
      const nodeId = this.pickNodeId(e);
      if (nodeId) node = this.nodes.find((n) => n.id === nodeId) || null;
    }
    if (node?.type === "workshop") {
      this.openWorkshop(node);
      return;
    }
    if (node) {
      this.selectNode(node.id);
      return;
    }

    this.selectNode(null);
  }

  onContextMenu(e) {
    const node = this.nodeFromEventTarget(e.target);
    if (node?.id !== "rc") return;
    e.preventDefault();
    if (this.diagramExpanded) {
      this.collapseDiagram();
    }
  }

  expandDiagram() {
    if (this.diagramExpanded || !this.layout) return;
    this.diagramExpanded = true;
    this.applyDiagramFoldState();
  }

  collapseDiagram() {
    if (!this.diagramExpanded) return;
    this.focusId = null;
    this.hoverId = null;
    this.hoverRing = null;
    this.closeWorkshopModal();
    this.closeRcMosaicModal({ animate: true });
    this.diagramExpanded = false;
    this.applyDiagramFoldState();
    this.syncInteractionStyles();
    this.updateGuideRingStyles();
    this.updateRcHoverEffects();
  }

  applyDiagramFoldState() {
    if (!this.svg) return;
    this.svg.setAttribute(
      "data-diagram-fold",
      this.diagramExpanded ? "expanded" : "collapsed"
    );
  }

  onPointerDown(e) {
    if (this.spacePressed || e.button === 1) {
      e.preventDefault();
      this.panning = {
        startX: e.clientX,
        startY: e.clientY,
        baseX: this.camera.x,
        baseY: this.camera.y,
        moved: false,
      };
      this.svg.setAttribute("data-panning", "true");
    }
  }

  onPointerMove(e) {
    if (!this.panning) return;
    const dx = e.clientX - this.panning.startX;
    const dy = e.clientY - this.panning.startY;
    if (Math.hypot(dx, dy) > 4) this.panning.moved = true;
    this.camera.x = this.panning.baseX + dx;
    this.camera.y = this.panning.baseY + dy;
    this.applyCamera();
  }

  onPointerUp() {
    if (this.panning?.moved) {
      this.suppressClick = true;
      requestAnimationFrame(() => {
        this.suppressClick = false;
      });
    }
    this.panning = null;
    this.svg?.removeAttribute("data-panning");
  }

  onKeyDown(e) {
    if (e.code === "Space" && !this.spacePressed) {
      this.spacePressed = true;
      this.svg?.setAttribute("data-space", "true");
    }
  }

  onKeyUp(e) {
    if (e.code === "Space") {
      this.spacePressed = false;
      this.svg?.removeAttribute("data-space");
    }
  }

  ringTypeFromTarget(target) {
    if (!target) return null;
    let el = target;
    while (el && el !== this.svg) {
      if (
        el.getAttribute?.("data-ring-type") &&
        el.classList?.contains("structure-guide-hit")
      ) {
        return el.getAttribute("data-ring-type");
      }
      el = el.parentNode;
    }
    return null;
  }

  activeHighlightId() {
    return this.hoverId || this.focusId;
  }

  isBranchHighlightMode() {
    return !!this.diagramExpanded && !!this.activeHighlightId() && !this.hoverRing && this.focusId !== "rc";
  }

  isInActiveBranch(node) {
    if (this.focusId === "rc") return true;

    const activeId = this.activeHighlightId();
    if (!activeId) return false;

    const activeNode = this.nodes.find((n) => n.id === activeId);
    if (!activeNode) return false;

    const pathToActive = this.pathToRoot(activeNode);
    if (pathToActive.some((n) => n.id === node.id)) return true;

    return this.isDescendantOf(activeNode, node);
  }

  isDescendantOf(ancestor, node) {
    if (ancestor.id === node.id) return true;
    for (const child of ancestor.children || []) {
      if (this.isDescendantOf(child, node)) return true;
    }
    return false;
  }

  pathToRoot(node) {
    const path = [];
    const find = (current, trail) => {
      const next = [...trail, current];
      if (current.id === node.id) {
        path.push(...next);
        return true;
      }
      for (const child of current.children || []) {
        if (find(child, next)) return true;
      }
      return false;
    };
    find(this.layout.root, []);
    return path;
  }

  matchesSearch(node) {
    if (!this.searchQuery) return true;
    const hay = [node.label, node.fullLabel, node.id]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(this.searchQuery);
  }

  isDimmed(node) {
    if (this.focusId === "rc") return false;
    if (!this.diagramExpanded && node.type !== "root") return true;

    if (this.hoverRing && !this.focusId) {
      return node.type !== this.hoverRing;
    }

    if (this.isBranchHighlightMode()) {
      return !this.isInActiveBranch(node);
    }

    if (this.searchQuery) {
      if (this.matchesSearch(node)) return false;
      if (
        node.type === "workshop" &&
        (node.children || []).some((c) => this.matchesSearch(c))
      ) {
        return false;
      }
      return true;
    }

    return true;
  }

  updateHud() {
    const countEl = document.getElementById("hud-count");
    if (countEl && this.tree) {
      const workshops = this.nodes.filter((n) => n.type === "workshop").length;
      const tg = this.tree.children?.length || 0;
      countEl.textContent = `тг: ${tg} · рц: ${workshops} · люди: ${countPeople(this.tree)}`;
    }
  }

  findParentNode(nodeId) {
    const walk = (current, parent = null) => {
      if (current.id === nodeId) return parent;
      for (const child of current.children || []) {
        const found = walk(child, current);
        if (found) return found;
      }
      return null;
    };
    return this.layout ? walk(this.layout.root) : null;
  }

  closeWorkshopModal() {
    closeOverlay("workshop-overlay");
  }

  closeRcMosaicModal({ keepFocus = false, animate = true } = {}) {
    const overlay = document.getElementById("rc-mosaic-overlay");
    if (!overlay?.classList.contains("open")) {
      if (!keepFocus && this.focusId === "rc") {
        this.focusId = null;
        this.render();
      }
      return;
    }
    if (this.rcMosaicClosing) return;

    const finish = () => {
      this.rcMosaicClosing = false;
      clearTimeout(this._rcMosaicCloseTimer);
      overlay.classList.remove("rc-mosaic-from-rc", "rc-mosaic-opening", "rc-mosaic-closing");
      closeOverlay("rc-mosaic-overlay");
      if (!keepFocus && this.focusId === "rc") {
        this.focusId = null;
        this.render();
      }
    };

    if (!animate) {
      finish();
      return;
    }

    this.rcMosaicClosing = true;
    const origin = this.getRcScreenPoint();
    overlay.style.setProperty("--rc-origin-x", `${origin.x}px`);
    overlay.style.setProperty("--rc-origin-y", `${origin.y}px`);
    overlay.classList.remove("rc-mosaic-opening");
    overlay.classList.add("rc-mosaic-from-rc", "rc-mosaic-closing");
    this._rcMosaicCloseTimer = setTimeout(finish, 780);
  }

  getRcScreenPoint() {
    const root = this.nodes.find((n) => n.id === "rc");
    if (!root || !this.svg) {
      return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }
    const point = this.svg.createSVGPoint();
    point.x = root.x;
    point.y = root.y;
    const matrix = this.viewport?.getScreenCTM();
    if (!matrix) {
      return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }
    const screen = point.matrixTransform(matrix);
    return { x: screen.x, y: screen.y };
  }

  showRcMosaicModal() {
    const overlay = document.getElementById("rc-mosaic-overlay");
    const grid = overlay?.querySelector("[data-rc-mosaic]");
    if (!overlay || !grid) return;
    if (overlay.classList.contains("open")) return;

    const people = this.nodes.filter((n) => n.type === "person");
    grid.innerHTML = "";

    for (const person of people) {
      const cell = document.createElement("div");
      cell.className = "rc-mosaic-cell";

      if (person.photo) {
        const img = document.createElement("img");
        img.className = "rc-mosaic-photo";
        img.src = person.photo;
        img.alt = "";
        img.loading = "eager";
        bindPhotoZoom(img);
        cell.appendChild(img);
      } else {
        const placeholder = document.createElement("span");
        placeholder.className = "rc-mosaic-photo rc-mosaic-photo-placeholder";
        placeholder.setAttribute("aria-hidden", "true");
        cell.appendChild(placeholder);
      }

      grid.appendChild(cell);
    }

    const cols = this.layoutMosaicGrid(grid, people.length);
    grid.querySelectorAll(".rc-mosaic-cell").forEach((cell, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      const centerCol = (cols - 1) / 2;
      const centerRow = (Math.min(people.length, 4) - 1) / 2;
      const dist = Math.hypot(col - centerCol, row - centerRow);
      cell.style.setProperty("--cell-delay", `${220 + dist * 42}ms`);
    });

    const origin = this.getRcScreenPoint();
    overlay.style.setProperty("--rc-origin-x", `${origin.x}px`);
    overlay.style.setProperty("--rc-origin-y", `${origin.y}px`);
    overlay.classList.remove("rc-mosaic-closing", "rc-mosaic-opening");
    overlay.classList.add("open", "rc-mosaic-from-rc");
    overlay.setAttribute("aria-hidden", "false");
    this.rcMosaicClosing = false;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.classList.add("rc-mosaic-opening");
      });
    });
  }

  layoutMosaicGrid(grid, count) {
    const rows = 4;
    if (!count) {
      grid.style.gridTemplateColumns = "";
      grid.style.gridTemplateRows = "";
      return 1;
    }

    const cols = Math.max(1, Math.ceil(count / rows));
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${rows}, auto)`;
    return cols;
  }

  showWorkshopModal(node) {
    const overlay = document.getElementById("workshop-overlay");
    if (!overlay) return;

    const parent = this.findParentNode(node.id);
    const staff = node.children || [];

    overlay.querySelector("[data-workshop-name]").textContent = node.fullLabel || node.label;
    overlay.querySelector("[data-workshop-code]").textContent = node.id;
    overlay.querySelector("[data-workshop-tg]").textContent = parent?.fullLabel || parent?.label || "—";
    overlay.querySelector("[data-workshop-count]").textContent = String(staff.length);

    const staffList = overlay.querySelector("[data-workshop-staff]");
    staffList.innerHTML = "";
    if (!staff.length) {
      const empty = document.createElement("li");
      empty.className = "workshop-staff-empty";
      empty.textContent = "Нет данных о сотрудниках";
      staffList.appendChild(empty);
    } else {
      for (const person of staff) {
        const item = document.createElement("li");
        item.className = "workshop-staff-item";

        if (person.photo) {
          const img = document.createElement("img");
          img.className = "workshop-staff-photo";
          img.src = person.photo;
          img.alt = "";
          bindPhotoZoom(img, { alt: person.fullLabel || person.label });
          item.appendChild(img);
        } else {
          const placeholder = document.createElement("span");
          placeholder.className = "workshop-staff-photo workshop-staff-photo-placeholder";
          placeholder.setAttribute("aria-hidden", "true");
          item.appendChild(placeholder);
        }

        const name = document.createElement("span");
        name.className = "workshop-staff-name";
        name.textContent = person.fullLabel || person.label;
        item.appendChild(name);

        staffList.appendChild(item);
      }
    }

    openOverlay("workshop-overlay");
  }

  hideDetail() {
    this.selectNode(null);
  }

  updateShell() {
    if (!this.layout) return;
    const { cx, cy, maxR } = this.layout;
    const shellR = maxR * 0.76;
    const stroke =
      getComputedStyle(document.documentElement).getPropertyValue("--fg").trim() || "#f2f2f2";

    this.shellGroup.setAttribute("transform", `translate(${cx},${cy})`);
    this.shellEl.setAttribute("cx", "0");
    this.shellEl.setAttribute("cy", "0");
    this.shellEl.setAttribute("r", String(shellR));
    this.shellEl.setAttribute("stroke", stroke);

    this.shellHaloEl.setAttribute("cx", "0");
    this.shellHaloEl.setAttribute("cy", "0");
    this.shellHaloEl.setAttribute("r", String(shellR));
    this.shellUnfoldGroup?.style.setProperty("--fold-delay", "50ms");
  }

  ensureGlowDefs() {
    if (this.defsEl) return;

    this.defsEl = svgEl("defs");
    this.defsEl.appendChild(glowFilter("structure-rc-glow-wide", 32));
    this.defsEl.appendChild(glowFilter("structure-rc-glow-mid", 12));
    this.defsEl.appendChild(glowFilter("structure-rc-glow-core", 4));
    this.defsEl.appendChild(glowFilter("structure-shell-glow", 24));

    this.svg.appendChild(this.defsEl);
  }

  updateRcHoverEffects() {
    const on = this.hoverId === "rc" && this.diagramExpanded;
    this.shellCenterGroup?.classList.toggle("structure-shell-breathe", on);
  }

  isLinkDimmed(link) {
    if (this.focusId === "rc") return false;
    if (this.hoverRing && !this.focusId) return true;
    if (this.isBranchHighlightMode()) {
      return !(this.isInActiveBranch(link.source) && this.isInActiveBranch(link.target));
    }
    return this.isDimmed(link.target);
  }

  setHoverRing(type) {
    if (!this.diagramExpanded) return;
    this.hoverRing = type;
    this.hoverId = null;
    this.syncInteractionStyles();
    this.updateGuideRingStyles();
  }

  clearHoverRing(type) {
    if (this.hoverRing !== type) return;
    this.hoverRing = null;
    this.syncInteractionStyles();
    this.updateGuideRingStyles();
  }

  updateGuideRingStyles() {
    this.guidesGroup?.querySelectorAll("[data-ring-type]").forEach((el) => {
      el.classList.toggle("ring-active", el.getAttribute("data-ring-type") === this.hoverRing);
    });
  }

  syncInteractionStyles() {
    if (!this.contentGroup) return;

    this.contentGroup.querySelectorAll(".structure-node[data-node-id]").forEach((g) => {
      const node = this.nodes.find((n) => n.id === g.getAttribute("data-node-id"));
      if (!node) return;
      const ringActive = this.hoverRing && !this.focusId && node.type === this.hoverRing;
      const branchActive = this.isBranchHighlightMode() && this.isInActiveBranch(node);
      g.classList.toggle("dim", this.isDimmed(node));
      g.classList.toggle(
        "active",
        node.id === this.focusId || node.id === this.hoverId || ringActive || branchActive
      );
    });

    this.contentGroup.querySelectorAll(".structure-link[data-target-id]").forEach((line) => {
      const targetId = line.getAttribute("data-target-id");
      const link = this.links.find((l) => l.target.id === targetId);
      if (!link) return;
      line.classList.toggle("dim", this.isLinkDimmed(link));
    });

    this.contentGroup.querySelectorAll(".structure-node-root").forEach((g) => {
      g.classList.toggle(
        "rc-hover",
        g.getAttribute("data-node-id") === "rc" && this.hoverId === "rc" && this.diagramExpanded
      );
    });

    this.updateRcHoverEffects();
  }

  handleNodeActivate(node, e) {
    if (this.suppressClick) return;
    e?.stopPropagation?.();
    if (node.type === "root") {
      if (!this.diagramExpanded) {
        this.expandDiagram();
        return;
      }
      this.openRcMosaic();
      return;
    }
    if (node.type === "workshop") {
      this.openWorkshop(node);
      return;
    }
    this.selectNode(node.id);
  }

  updateGuides() {
    if (!this.layout) return;
    const { cx, cy, maxR } = this.layout;
    const ringMap = [
      { frac: 0.2, type: "tg" },
      { frac: 0.42, type: "workshop" },
      { frac: 0.68, type: "person" },
    ];

    while (this.guidesGroup.firstChild) {
      this.guidesGroup.removeChild(this.guidesGroup.firstChild);
    }
    while (this.ringHitsGroup.firstChild) {
      this.ringHitsGroup.removeChild(this.ringHitsGroup.firstChild);
    }

    for (const { frac, type } of ringMap) {
      const r = maxR * frac;
      const originG = svgEl("g", {
        class: "structure-guides-origin",
        transform: `translate(${cx},${cy})`,
      });
      const foldG = svgEl("g", { class: "structure-fold-layer structure-guides-inner" });
      foldG.appendChild(
        svgEl("circle", {
          cx: 0,
          cy: 0,
          r,
          class: "structure-guide-ring",
          "data-ring-type": type,
        })
      );
      originG.appendChild(foldG);
      this.guidesGroup.appendChild(originG);

      const hitOrigin = svgEl("g", {
        class: "structure-ring-hits-origin",
        transform: `translate(${cx},${cy})`,
      });
      const hitFold = svgEl("g", { class: "structure-fold-layer structure-ring-hits-inner" });
      const hit = svgEl("circle", {
        cx: 0,
        cy: 0,
        r,
        class: "structure-guide-hit",
        "data-ring-type": type,
      });
      hitFold.appendChild(hit);
      hitOrigin.appendChild(hitFold);
      this.ringHitsGroup.appendChild(hitOrigin);
    }

    this.updateGuideRingStyles();
  }

  render() {
    if (!this.layout) return;

    this.updateShell();
    this.updateGuides();

    while (this.contentGroup.firstChild) {
      this.contentGroup.removeChild(this.contentGroup.firstChild);
    }

    const linksLayer = svgEl("g", { class: "structure-links structure-links-fold" });
    const { cx, cy } = this.layout;
    for (const link of this.links) {
      const dim = this.isLinkDimmed(link);
      linksLayer.appendChild(
        svgEl("line", {
          x1: link.source.x,
          y1: link.source.y,
          x2: link.target.x,
          y2: link.target.y,
          class: `structure-link${dim ? " dim" : ""}`,
          "data-target-id": link.target.id,
        })
      );
    }
    this.contentGroup.appendChild(linksLayer);

    const nodesLayer = svgEl("g", { class: "structure-nodes" });
    const drawOrder = [...this.nodes].sort((a, b) => {
      const rank = (n) => {
        if (n.type === "tg") return 0;
        if (n.type === "person") return 1;
        if (n.type === "workshop") return 2;
        if (n.type === "root") return 3;
        return 0;
      };
      return rank(a) - rank(b);
    });
    for (const node of drawOrder) {
      const style = NODE_STYLE[node.type] || NODE_STYLE.person;
      const dim = this.isDimmed(node);
      const ringActive = this.hoverRing && !this.focusId && node.type === this.hoverRing;
      const branchActive = this.isBranchHighlightMode() && this.isInActiveBranch(node);
      const active = node.id === this.focusId || node.id === this.hoverId || ringActive || branchActive;
      const g = svgEl("g", {
        class: `structure-node structure-node-${node.type}${dim ? " dim" : ""}${active ? " active" : ""}`,
        "data-node-id": node.id,
        transform: `translate(${node.x},${node.y})`,
      });

      let body;
      if (node.type === "root") {
        body = g;
      } else {
        g.setAttribute("data-foldable", "true");
        const unfold = svgEl("g", { class: "structure-node-unfold" });
        unfold.style.setProperty("--fold-ox", String(cx - node.x));
        unfold.style.setProperty("--fold-oy", String(cy - node.y));
        unfold.style.setProperty("--fold-delay", `${FOLD_DELAY_MS[node.type] || 0}ms`);
        g.appendChild(unfold);

        const floatWrap = svgEl("g", { class: "structure-node-float" });
        const { delay, duration } = floatTiming(node.id);
        floatWrap.style.setProperty("--float-delay", `${delay}s`);
        floatWrap.style.setProperty("--float-duration", `${duration}s`);
        unfold.appendChild(floatWrap);
        body = floatWrap;
      }

      if (node.type === "root") {
        body.appendChild(
          svgEl("circle", {
            r: style.r * 4.5,
            class: "structure-rc-aura structure-rc-aura-wide",
          })
        );
        body.appendChild(
          svgEl("circle", {
            r: style.r * 2.2,
            class: "structure-rc-aura structure-rc-aura-mid",
          })
        );
      }

      const hitR = this.nodeHitRadius(node);
      body.appendChild(
        svgEl("rect", {
          x: -hitR,
          y: -hitR,
          width: hitR * 2,
          height: hitR * 2,
          class: "structure-node-hit",
          "data-node-id": node.id,
        })
      );

      body.appendChild(
        svgEl("circle", {
          r: style.r,
          class: style.fill ? "structure-node-fill" : "structure-node-ring",
        })
      );

      if (node.type === "workshop") {
        wrapText(body, node.label, style.font, style.r * 1.5);
      } else {
        const t = svgEl("text", {
          class: "structure-node-text",
          "font-size": style.font,
        });
        t.textContent = node.label;
        body.appendChild(t);
      }

      g.addEventListener("click", (e) => this.handleNodeActivate(node, e));

      nodesLayer.appendChild(g);
    }
    this.contentGroup.appendChild(nodesLayer);
    this.updateRcHoverEffects();
    this.applyDiagramFoldState();
  }
}

function floatTiming(nodeId) {
  let hash = 0;
  for (let i = 0; i < nodeId.length; i++) {
    hash = (hash * 31 + nodeId.charCodeAt(i)) | 0;
  }
  hash = Math.abs(hash);
  return {
    delay: -((hash % 5000) / 1000),
    duration: 3.2 + (hash % 1800) / 1000,
  };
}

function glowFilter(id, stdDeviation) {
  const NS = "http://www.w3.org/2000/svg";
  const filter = document.createElementNS(NS, "filter");
  filter.setAttribute("id", id);
  filter.setAttribute("x", "-150%");
  filter.setAttribute("y", "-150%");
  filter.setAttribute("width", "400%");
  filter.setAttribute("height", "400%");
  filter.setAttribute("color-interpolation-filters", "sRGB");

  const blur = document.createElementNS(NS, "feGaussianBlur");
  blur.setAttribute("in", "SourceGraphic");
  blur.setAttribute("stdDeviation", String(stdDeviation));
  blur.setAttribute("result", "blur");

  const merge = document.createElementNS(NS, "feMerge");
  merge.appendChild(createFeMergeNode(NS, "blur"));
  merge.appendChild(createFeMergeNode(NS, "SourceGraphic"));

  filter.appendChild(blur);
  filter.appendChild(merge);
  return filter;
}

function createFeMergeNode(NS, input) {
  const node = document.createElementNS(NS, "feMergeNode");
  node.setAttribute("in", input);
  return node;
}

function svgEl(name, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attrs)) {
    if (value != null) el.setAttribute(key, String(value));
  }
  return el;
}

function wrapText(group, text, fontSize, maxWidth) {
  const words = String(text).split(/[_\s/]+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length * fontSize * 0.55 > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);

  const startY = -((lines.length - 1) * fontSize * 1.15) / 2;
  lines.forEach((ln, i) => {
    const t = svgEl("text", {
      class: "structure-node-text",
      y: startY + i * fontSize * 1.15,
      "font-size": fontSize,
    });
    t.textContent = ln;
    group.appendChild(t);
  });
}
