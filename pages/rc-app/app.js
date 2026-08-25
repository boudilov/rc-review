const THEME_KEY = "rc-structure-theme";

export function applyTheme(theme) {
  const next = theme === "bright" ? "bright" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  const toggle = document.getElementById("theme-toggle");
  if (toggle) toggle.textContent = next;
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch (_) {}
  return next;
}

export function loadTheme() {
  try {
    return localStorage.getItem(THEME_KEY) || "dark";
  } catch (_) {
    return "dark";
  }
}

export function initThemeToggle() {
  const toggle = document.getElementById("theme-toggle");
  if (!toggle) return;
  applyTheme(loadTheme());
  toggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    applyTheme(current === "dark" ? "bright" : "dark");
  });
}

export function openOverlay(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("open");
  el.setAttribute("aria-hidden", "false");
}

export function closeOverlay(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("open");
  el.setAttribute("aria-hidden", "true");
}

export function openPhotoLightbox(src, alt = "") {
  const overlay = document.getElementById("rc-photo-lightbox");
  const img = overlay?.querySelector(".rc-photo-lightbox-img");
  if (!overlay || !img || !src) return;
  img.src = src;
  img.alt = alt;
  openOverlay("rc-photo-lightbox");
}

export function closePhotoLightbox() {
  const overlay = document.getElementById("rc-photo-lightbox");
  if (!overlay?.classList.contains("open")) return false;
  closeOverlay("rc-photo-lightbox");
  return true;
}

export function bindPhotoZoom(img, { alt = "" } = {}) {
  if (!img?.src) return;
  img.classList.add("rc-photo-zoomable");
  img.addEventListener("click", (e) => {
    e.stopPropagation();
    openPhotoLightbox(img.src, alt);
  });
}


export function initOverlayDismiss(id, { closeOnBackdrop = true, onClose, animated = false } = {}) {
  const el = document.getElementById(id);
  if (!el) return;
  const dismiss = () => {
    if (animated && typeof onClose === "function") {
      onClose();
      return;
    }
    closeOverlay(id);
    if (typeof onClose === "function") onClose();
  };
  if (closeOnBackdrop) {
    el.addEventListener("mousedown", (e) => {
      if (e.target === el) dismiss();
    });
  }
  el.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", dismiss);
  });
}

export function openConfirm({ title, text, onConfirm, danger = false }) {
  const overlay = document.getElementById("confirm-overlay");
  const titleEl = document.getElementById("confirm-title");
  const textEl = document.getElementById("confirm-text");
  const cancelBtn = document.getElementById("confirm-cancel");
  const okBtn = document.getElementById("confirm-ok");
  if (!overlay || !titleEl || !textEl || !cancelBtn || !okBtn) return;

  titleEl.textContent = title || "Подтверждение";
  textEl.textContent = text || "";
  okBtn.classList.toggle("btn-danger", danger);
  okBtn.textContent = danger ? "Удалить" : "OK";

  const close = () => overlay.classList.remove("open");

  const onCancel = () => {
    cancelBtn.removeEventListener("click", onCancel);
    okBtn.removeEventListener("click", onOk);
    overlay.removeEventListener("mousedown", onBackdrop);
    close();
  };

  const onOk = () => {
    onCancel();
    if (typeof onConfirm === "function") onConfirm();
  };

  const onBackdrop = (e) => {
    if (e.target === overlay) onCancel();
  };

  cancelBtn.addEventListener("click", onCancel);
  okBtn.addEventListener("click", onOk);
  overlay.addEventListener("mousedown", onBackdrop);
  overlay.classList.add("open");
}

export function initShell({ viz } = {}) {
  initThemeToggle();
  initOverlayDismiss("help-overlay");
  initOverlayDismiss("workshop-overlay");
  initOverlayDismiss("rc-photo-lightbox");
  initOverlayDismiss("rc-mosaic-overlay", {
    animated: true,
    onClose: () => viz?.()?.closeRcMosaicModal?.(),
  });

  const helpTrigger = document.getElementById("help-trigger");
  if (helpTrigger) {
    helpTrigger.addEventListener("click", (e) => {
      e.preventDefault();
      openOverlay("help-overlay");
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (closePhotoLightbox()) return;
      closeOverlay("help-overlay");
      closeOverlay("workshop-overlay");
      viz?.()?.closeRcMosaicModal?.();
      const confirm = document.getElementById("confirm-overlay");
      if (confirm?.classList.contains("open")) confirm.classList.remove("open");
      viz?.()?.hideDetail?.();
    }
  });

  const hudStatus = document.getElementById("hud-status");
  hudStatus?.addEventListener("click", () => viz?.()?.resetCamera?.());
}
