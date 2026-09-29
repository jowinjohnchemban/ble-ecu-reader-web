// components/DashboardPanel.js — live metric cards + the GPS card.
//
// Renders incrementally: each field gets one persistent card element, reused across
// renders (never rebuilt from innerHTML each frame) so we can flash a brief highlight on
// the exact card whose value just changed — that's what makes rapid updates read as
// "live data streaming in" rather than "the page just re-painted."

import { Component } from "./Component.js";

export class DashboardPanel extends Component {
  constructor(el, deps) {
    super(el, deps);
    this.grid = this.qs("#dashboardGrid");
    this.gpsValueEl = this.qs("#gpsValue");
    this.gpsLinkEl = this.qs("#gpsMapLink");
    this.cards = new Map(); // field name -> { root, valueText, unitText, gaugeFill, lastValue }
  }

  bindState() {
    this.state.addEventListener("dashboard", () => this.render());
    this.state.addEventListener("settings", () => this.render());
  }

  render() {
    const entries = Object.entries(this.state.dashboardValues).filter(([name]) => !name.startsWith("Latitude") && !name.startsWith("Longitude"));

    if (entries.length === 0) {
      if (this.cards.size > 0 || this.grid.children.length === 0) {
        this.grid.innerHTML = emptyStateHtml("No telemetry yet", "Connect to your bike — this fills in as soon as notifications arrive.");
        this.cards.clear();
      }
      this._renderGps();
      return;
    }

    if (this.cards.size === 0) this.grid.innerHTML = "";

    for (const [name, data] of entries) {
      const { value, unit } = this.state.displayValue(data.value, data.unit);
      let card = this.cards.get(name);
      if (!card) {
        card = this._createCard(name, data.unit === "%");
        this.grid.appendChild(card.root);
        this.cards.set(name, card);
      }

      if (card.lastValue !== value) {
        card.valueText.textContent = value;
        flash(card.root);
        card.lastValue = value;
      }
      card.unitText.textContent = unit || "";
      if (card.gaugeFill) {
        const pct = Math.min(100, Math.max(0, data.value));
        card.gaugeFill.style.width = `${pct}%`;
        card.gaugeFill.className = `h-full rounded-full transition-all ${data.value < 20 ? "bg-gradient-to-r from-err to-warn" : "bg-gradient-to-r from-accent to-ok"}`;
      }
      if (data.note && !card.noteShown) {
        const note = document.createElement("div");
        note.className = "mt-2 text-xs leading-snug text-warn";
        note.textContent = data.note;
        card.root.appendChild(note);
        card.noteShown = true;
      }
    }

    this._renderGps();
  }

  _createCard(name, isPercent) {
    const root = document.createElement("div");
    root.className = "rounded-xl border border-edge bg-gradient-to-br from-panel2 to-panel p-4 transition hover:-translate-y-0.5 hover:border-accent/40";

    const label = document.createElement("div");
    label.className = "text-xs font-semibold uppercase tracking-wide text-slate-400";
    label.textContent = name;
    root.appendChild(label);

    const valueRow = document.createElement("div");
    valueRow.className = "mt-1.5 font-mono text-2xl font-bold tabular-nums";
    const valueText = document.createElement("span");
    const unitText = document.createElement("span");
    unitText.className = "ml-1 text-sm font-medium text-slate-400";
    valueRow.append(valueText, unitText);
    root.appendChild(valueRow);

    let gaugeFill = null;
    if (isPercent) {
      const track = document.createElement("div");
      track.className = "mt-2.5 h-1.5 overflow-hidden rounded-full bg-black/40";
      gaugeFill = document.createElement("div");
      gaugeFill.className = "h-full rounded-full bg-gradient-to-r from-accent to-ok transition-all";
      track.appendChild(gaugeFill);
      root.appendChild(track);
    }

    return { root, valueText, unitText, gaugeFill, lastValue: undefined, noteShown: false };
  }

  _renderGps() {
    const lat = this.state.dashboardValues.LatitudeDegrees;
    const latDec = this.state.dashboardValues.LatitudeDecimals;
    const lon = this.state.dashboardValues.LongitudeDegrees;
    const lonDec = this.state.dashboardValues.LongitudeDecimals;
    if (!lat || !lon) return;
    const latitude = lat.value + (latDec ? latDec.value / 1e6 : 0);
    const longitude = lon.value + (lonDec ? lonDec.value / 1e6 : 0);
    this.gpsValueEl.textContent = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    this.gpsLinkEl.href = `https://www.google.com/maps?q=${latitude},${longitude}`;
  }
}

export function emptyStateHtml(title, body) {
  return `<div class="col-span-full rounded-xl border border-dashed border-edge py-12 text-center text-slate-400">
    <strong class="mb-1.5 block text-base text-slate-200">${title}</strong>${body}
  </div>`;
}

function flash(el) {
  el.classList.remove("ring-2", "ring-accent/60");
  // Force reflow so the animation restarts even if a flash is already mid-fade.
  void el.offsetWidth;
  el.classList.add("ring-2", "ring-accent/60", "transition-shadow");
  setTimeout(() => el.classList.remove("ring-2", "ring-accent/60"), 400);
}
