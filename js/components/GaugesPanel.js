// components/GaugesPanel.js — speedometer-style dials for bounded sensor fields.
// Canvases are created once per field and reused (redraw in place), matching the same
// "persistent DOM, cheap updates" approach as DashboardPanel.

import { Component } from "./Component.js";
import { emptyStateHtml } from "./DashboardPanel.js";
import { GAUGE_DEFS, drawGauge } from "../core/GaugeRenderer.js";

export class GaugesPanel extends Component {
  constructor(el, deps) {
    super(el, deps);
    this.grid = this.qs("#gaugesGrid");
    this.canvases = {}; // field name -> <canvas>
  }

  bindState() {
    this.state.addEventListener("dashboard", () => this.render());
    this.state.addEventListener("settings", () => this.render());
  }

  render() {
    const available = Object.keys(GAUGE_DEFS).filter((name) => this.state.dashboardValues[name] !== undefined);

    if (available.length === 0) {
      if (Object.keys(this.canvases).length > 0 || this.grid.children.length === 0) {
        this.grid.innerHTML = emptyStateHtml("No gauge-ready sensors yet", "Speed, RPM, engine temp, throttle, fuel, and battery show up here once connected.");
        this.canvases = {};
      }
      return;
    }

    if (Object.keys(this.canvases).length === 0) this.grid.innerHTML = "";

    for (const name of available) {
      let canvas = this.canvases[name];
      if (!canvas) {
        const card = document.createElement("div");
        card.className = "flex justify-center rounded-xl border border-edge bg-panel p-3";
        canvas = document.createElement("canvas");
        canvas.width = 260;
        canvas.height = 170;
        canvas.className = "max-w-full";
        card.appendChild(canvas);
        this.grid.appendChild(card);
        this.canvases[name] = canvas;
      }

      const def = GAUGE_DEFS[name];
      const raw = this.state.dashboardValues[name].value;
      const { value: displayVal, unit: displayUnit } = this.state.displayValue(raw, def.unit);

      let displayDef = def;
      if (displayUnit !== def.unit) {
        displayDef = {
          ...def,
          min: this.state.displayValue(def.min, def.unit).value,
          max: this.state.displayValue(def.max, def.unit).value,
          unit: displayUnit,
          zones: def.zones.map((z) => ({ ...z, to: this.state.displayValue(z.to, def.unit).value })),
        };
      }

      drawGauge(canvas, { value: displayVal, def: displayDef, label: name });
    }
  }
}
