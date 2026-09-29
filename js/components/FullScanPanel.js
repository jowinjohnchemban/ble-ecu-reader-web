// components/FullScanPanel.js — walks every known register tag with a read-only VarEx
// request in one pass. Still zero writes: every call goes through
// BleConnection.readRegister/readRegisterPaged, which only ever send a read opcode. See
// the safety comment block above REGISTER_MAP in core/fieldMap.js.

import { RegisterPanelBase } from "./RegisterPanelBase.js";
import { REGISTER_MAP } from "../core/fieldMap.js";
import { toHex, asciiPreview } from "../core/bitUtils.js";
import { downloadFile } from "../core/download.js";

export class FullScanPanel extends RegisterPanelBase {
  constructor(el, deps) {
    super(el, deps);
    this.lastResults = [];
  }

  bindEvents() {
    super.bindEvents();
    this.qs("#fullScanBtn").addEventListener("click", () => this._runScan());
    this.qs("#fullScanExportJsonBtn").addEventListener("click", () => this._exportJson());
    this.qs("#fullScanExportCsvBtn").addEventListener("click", () => this._exportCsv());
  }

  async _runScan() {
    const includeLarge = this.qs("#fullScanIncludeLarge").checked;
    const includeCaution = this.qs("#fullScanIncludeCaution").checked;
    const tbody = this.qs("#fullScanTableBody");
    const status = this.qs("#fullScanStatus");
    const progress = this.qs("#fullScanProgress");
    const scanBtn = this.qs("#fullScanBtn");

    const entries = Object.entries(REGISTER_MAP).filter(([, reg]) => {
      if (reg.writeTargeted && !includeCaution) return false;
      if (reg.paged && reg.length > 32 && !includeLarge) return false;
      return true;
    });

    scanBtn.disabled = true;
    tbody.innerHTML = "";
    this.lastResults = [];
    progress.classList.remove("hidden");
    progress.max = entries.length;
    progress.value = 0;

    for (const [name, reg] of entries) {
      status.textContent = `Reading ${name}… (${progress.value + 1}/${entries.length})`;
      let result;
      try {
        const bytes = reg.paged
          ? await this.ble.readRegisterPaged(reg.address, reg.length, { chunkSize: 16 })
          : await this.ble.readRegister(reg.address, reg.length);
        result = { name, ...reg, status: "ok", hex: toHex(bytes), ascii: asciiPreview(bytes) };
      } catch (err) {
        result = { name, ...reg, status: "failed", hex: "", ascii: "", error: err.message };
      }
      this.lastResults.push(result);
      this._appendRow(result);
      progress.value += 1;
      await new Promise((r) => setTimeout(r, 60)); // kinder to the BLE stack than back-to-back requests
    }

    status.textContent = `Done — ${this.lastResults.filter((r) => r.status === "ok").length}/${entries.length} registers read successfully.`;
    progress.classList.add("hidden");
    scanBtn.disabled = false;
  }

  _appendRow(result) {
    const tbody = this.qs("#fullScanTableBody");
    const row = document.createElement("tr");
    const isCaution = result.writeTargeted;
    row.className = isCaution ? "bg-red-950/20" : "";
    row.innerHTML = `
      <td class="px-3 py-1.5 font-semibold ${isCaution ? "text-red-300" : "text-slate-200"}">${result.name}</td>
      <td class="px-3 py-1.5 text-slate-400">${result.group}</td>
      <td class="px-3 py-1.5 text-slate-400">0x${result.address.toString(16)}</td>
      <td class="px-3 py-1.5 text-slate-400">${result.length}</td>
      <td class="px-3 py-1.5 ${result.status === "ok" ? "text-ok" : "text-err"}">${result.status}${result.error ? ` (${result.error})` : ""}</td>
      <td class="max-w-[220px] truncate px-3 py-1.5 text-slate-300" title="${result.hex}">${result.hex}</td>
      <td class="px-3 py-1.5 text-slate-300">${result.ascii}</td>
      <td class="max-w-[260px] px-3 py-1.5 text-slate-500">${result.description || ""}</td>
    `;
    tbody.appendChild(row);
  }

  _exportJson() {
    if (this.lastResults.length === 0) return this.toasts.show("Run a scan first.", "warn");
    downloadFile(JSON.stringify(this.lastResults, null, 2), "ecu-full-scan.json", "application/json");
  }

  _exportCsv() {
    if (this.lastResults.length === 0) return this.toasts.show("Run a scan first.", "warn");
    const header = "name,group,address,length,status,hex,ascii,description\n";
    const rows = this.lastResults
      .map(
        (r) =>
          `${r.name},${r.group},0x${r.address.toString(16)},${r.length},${r.status},"${r.hex}","${r.ascii.replace(/"/g, '""')}","${(r.description || "").replace(/"/g, '""')}"`
      )
      .join("\n");
    downloadFile(header + rows, "ecu-full-scan.csv", "text/csv");
  }
}
