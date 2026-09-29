// components/AlertsPanel.js — boolean fault/alert flags, flashing red when active, with
// an optional audible beep (Settings toggle) the moment one flips from clear to active.

import { Component } from "./Component.js";
import { emptyStateHtml } from "./DashboardPanel.js";
import { beep } from "../core/AudioAlerts.js";

export class AlertsPanel extends Component {
  constructor(el, deps) {
    super(el, deps);
    this.grid = this.qs("#alertsGrid");
    this.cards = new Map(); // field name -> { root, statusText }
  }

  bindState() {
    this.state.addEventListener("alerts", () => this.render());
    this.state.addEventListener("alert-triggered", () => {
      if (this.state.settings.alertSound) beep();
    });
  }

  render() {
    const entries = Object.entries(this.state.alertValues);

    if (entries.length === 0) {
      if (this.cards.size > 0 || this.grid.children.length === 0) {
        this.grid.innerHTML = emptyStateHtml("No alert data yet", "Fault/alert flags show up here once connected.");
        this.cards.clear();
      }
      return;
    }

    if (this.cards.size === 0) this.grid.innerHTML = "";

    for (const [name, data] of entries) {
      let card = this.cards.get(name);
      if (!card) {
        card = this._createCard(name);
        this.grid.appendChild(card.root);
        this.cards.set(name, card);
      }
      this._updateCard(card, data.value);
    }
  }

  _createCard(name) {
    const root = document.createElement("div");

    const labelRow = document.createElement("div");
    labelRow.className = "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide";
    const dot = document.createElement("span");
    dot.className = "h-1.5 w-1.5 rounded-full";
    const labelText = document.createElement("span");
    labelText.textContent = name;
    labelRow.append(dot, labelText);
    root.appendChild(labelRow);

    const statusText = document.createElement("div");
    statusText.className = "mt-1.5 text-base font-bold";
    root.appendChild(statusText);

    return { root, dot, statusText };
  }

  _updateCard(card, isActive) {
    card.root.className = `rounded-xl border p-4 transition ${
      isActive ? "alert-flash border-err bg-gradient-to-br from-red-950 to-red-950/40" : "border-edge bg-gradient-to-br from-panel2 to-panel"
    }`;
    card.root.querySelector(".uppercase").className = `flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${isActive ? "text-red-200" : "text-slate-400"}`;
    card.dot.className = `h-1.5 w-1.5 rounded-full ${isActive ? "bg-err" : "bg-ok"}`;
    card.statusText.textContent = isActive ? "ACTIVE" : "clear";
    card.statusText.className = `mt-1.5 text-base font-bold ${isActive ? "text-err" : "text-slate-500"}`;
  }
}
