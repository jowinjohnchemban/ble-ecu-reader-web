// components/ToastManager.js — non-blocking notifications, replacing alert() popups.
// No AppState wiring needed; other components call toasts.show(...) directly since a
// toast is a one-off side effect, not state anything else needs to react to.

import { Component } from "./Component.js";

const BORDER_BY_TYPE = { info: "border-l-accent", success: "border-l-ok", warn: "border-l-warn", error: "border-l-err" };

export class ToastManager extends Component {
  show(message, type = "info", timeoutMs = 5000) {
    const toast = document.createElement("div");
    toast.className = `toast-in cursor-pointer whitespace-pre-wrap rounded-lg border border-edge ${
      BORDER_BY_TYPE[type] || BORDER_BY_TYPE.info
    } border-l-4 bg-panel2 p-3 text-sm leading-relaxed shadow-xl`;
    toast.textContent = message;
    toast.addEventListener("click", () => this._dismiss(toast));
    this.el.appendChild(toast);
    if (timeoutMs > 0) setTimeout(() => this._dismiss(toast), timeoutMs);
    return toast;
  }

  _dismiss(toast) {
    if (!toast.isConnected) return;
    toast.classList.remove("toast-in");
    toast.classList.add("toast-out");
    setTimeout(() => toast.remove(), 200);
  }
}
