// components/RawFramesPanel.js — the ground truth: every notification, checksum status,
// and hex bytes. Appends incrementally (batched per animation frame by AppState) rather
// than re-rendering the whole log every time, so this stays smooth even at a few frames a
// second — export/clear always work regardless of connection state.

import { Component } from "./Component.js";
import { downloadFile } from "../core/download.js";

export class RawFramesPanel extends Component {
  constructor(el, deps) {
    super(el, deps);
    this.logEl = this.qs("#rawLog");
    this.countEl = this.qs("#frameCount");
    this.pauseCheckbox = this.qs("#pauseRaw");
  }

  bindEvents() {
    this.qs("#clearRawBtn").addEventListener("click", () => this.state.clearRawFrames());
    this.qs("#exportJsonBtn").addEventListener("click", () => this._exportJson());
    this.qs("#exportCsvBtn").addEventListener("click", () => this._exportCsv());
  }

  bindState() {
    this.state.addEventListener("frames", (e) => this._appendFrames(e.detail));
    this.state.addEventListener("frames-cleared", () => {
      this.logEl.innerHTML = "";
      this.countEl.textContent = "0 frames";
    });
  }

  _appendFrames(entries) {
    this.countEl.textContent = `${this.state.rawFrames.length} frames`;
    if (this.pauseCheckbox.checked) return;

    const fragment = document.createDocumentFragment();
    for (const entry of entries) {
      const line = document.createElement("div");
      line.className = `border-b border-black/30 px-3 py-1 ${entry.checksumOk ? "even:bg-white/[0.02]" : "bg-red-950/40 text-err"}`;
      const time = new Date(entry.timestamp).toISOString().split("T")[1].replace("Z", "");
      line.textContent = `[${time}] ch${entry.charNumber} sub=${entry.subPage} ${entry.checksumOk ? "" : "BADCHK "}${entry.rawHex}`;
      fragment.appendChild(line);
    }
    this.logEl.appendChild(fragment);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  _exportJson() {
    const plain = this.state.rawFrames.map((entry) => ({ ...entry, raw: Array.from(entry.raw) }));
    downloadFile(JSON.stringify(plain, null, 2), "ecu-frames.json", "application/json");
  }

  _exportCsv() {
    const header = "timestamp,charNumber,subPage,checksumOk,rawHex\n";
    const rows = this.state.rawFrames.map((f) => `${f.timestamp},${f.charNumber},${f.subPage},${f.checksumOk},"${f.rawHex}"`).join("\n");
    downloadFile(header + rows, "ecu-frames.csv", "text/csv");
  }
}
