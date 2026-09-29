// components/TabBar.js — drives both the desktop tab row (.tab-btn) and the mobile
// bottom quick-nav (.tab-btn-mobile), keeping them in sync from one place. Tab navigation
// is UI state, not app data, so rather than routing it through AppState this dispatches a
// plain "tabactivated" DOM event on `document` — any panel that only needs to redraw when
// it becomes visible (e.g. a chart that's pointless to update while hidden) can listen for
// that without TabBar needing to know panels exist.

import { Component } from "./Component.js";

export class TabBar extends Component {
  bindEvents() {
    this.qsa(".tab-btn, .tab-btn-mobile").forEach((btn) => {
      btn.addEventListener("click", () => this.activate(btn.dataset.tab));
    });
  }

  activate(tabName) {
    document.querySelectorAll(".tab-btn").forEach((b) => {
      const isActive = b.dataset.tab === tabName;
      b.classList.toggle("border-accent", isActive);
      b.classList.toggle("text-accent", isActive);
      b.classList.toggle("border-transparent", !isActive);
      b.classList.toggle("text-slate-400", !isActive);
    });
    document.querySelectorAll(".tab-btn-mobile").forEach((b) => {
      const isActive = b.dataset.tab === tabName;
      b.classList.toggle("text-accent", isActive);
      b.classList.toggle("text-slate-500", !isActive);
    });
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("hidden", p.id !== `tab-${tabName}`));
    document.dispatchEvent(new CustomEvent("tabactivated", { detail: { tab: tabName } }));
  }
}
