// components/ExplorePanel.js — for hardware that doesn't match the reverse-engineered
// service UUID (see BleConnection.connect's "explore" mode). Connects with broad
// optionalServices access and lists every GATT service + characteristic actually present,
// so you can find your specific dongle's real service code instead of guessing.

import { Component } from "./Component.js";
import { downloadFile } from "../core/download.js";

export class ExplorePanel extends Component {
  constructor(el, deps) {
    super(el, deps);
    this.lastResults = [];
  }

  bindEvents() {
    this.qs("#exploreBtn").addEventListener("click", () => this._explore());
    this.qs("#exploreExportBtn").addEventListener("click", () => this._export());
  }

  async _explore() {
    const status = this.qs("#exploreStatus");
    const output = this.qs("#exploreOutput");
    const btn = this.qs("#exploreBtn");
    btn.disabled = true;
    status.textContent = "Choosing device…";
    output.innerHTML = "";

    try {
      await this.ble.connect({ mode: "explore" });
      status.textContent = "Connected — enumerating services (this can take a few seconds)…";
      const results = await this.ble.exploreServices();
      this.lastResults = results;
      this._render(results);
      status.textContent = `Found ${results.length} service(s) on "${this.ble.device?.name || "device"}".`;
      if (results.length === 0) {
        status.textContent += " None matched the 256 probed OTC-family codes — this dongle likely uses a completely different UUID scheme; try a generic BLE inspector app (e.g. nRF Connect) instead.";
      }
    } catch (err) {
      if (err.name !== "NotFoundError") status.textContent = `Failed: ${err.message}`;
      else status.textContent = "";
    } finally {
      btn.disabled = false;
    }
  }

  _render(results) {
    const output = this.qs("#exploreOutput");
    output.innerHTML = "";
    for (const service of results) {
      const card = document.createElement("div");
      card.className = "mb-3 rounded-xl border border-edge bg-panel p-3";
      const badge = service.otcCode
        ? `<span class="rounded bg-emerald-900/50 px-2 py-0.5 text-xs text-ok">OTC code "${service.otcCode}"</span>`
        : `<span class="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">non-OTC / standard UUID</span>`;
      const charRows = service.characteristics
        .map((c) => `<div class="pl-4 text-xs text-slate-300">${c.uuid} <span class="text-slate-500">[${c.properties.join(", ")}]</span></div>`)
        .join("");
      card.innerHTML = `<div class="mb-1 flex items-center gap-2 font-mono text-sm text-slate-200">${service.uuid} ${badge}</div>${charRows}`;
      output.appendChild(card);
    }
  }

  _export() {
    if (this.lastResults.length === 0) return this.toasts.show("Run Explore Device first.", "warn");
    downloadFile(JSON.stringify(this.lastResults, null, 2), "ecu-explore-services.json", "application/json");
  }
}
