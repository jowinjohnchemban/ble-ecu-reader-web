// components/LogsPanel.js — trip/stat log pointer/count registers, plus a full paged dump
// of the large TRACKLOG_PTR/statlog_PTR regions.

import { RegisterPanelBase } from "./RegisterPanelBase.js";
import { REGISTER_MAP } from "../core/fieldMap.js";
import { toHex } from "../core/bitUtils.js";

export class LogsPanel extends RegisterPanelBase {
  bindEvents() {
    super.bindEvents();
    this.qs("#readTrackLogPtrBtn").addEventListener("click", () => this._readPaged("TRACKLOG_PTR"));
    this.qs("#readStatLogPtrBtn").addEventListener("click", () => this._readPaged("statlog_PTR"));
  }

  async _readPaged(name) {
    const output = this.qs("#logsOutput");
    const progress = this.qs("#pagedReadProgress");
    const reg = REGISTER_MAP[name];
    output.textContent = `Reading ${name} (${reg.length} bytes, paged)…`;
    progress.classList.remove("hidden");
    progress.max = reg.length;
    progress.value = 0;
    try {
      const bytes = await this.ble.readRegisterPaged(reg.address, reg.length, {
        onProgress: (done, total) => {
          progress.value = done;
          output.textContent = `Reading ${name}: ${done}/${total} bytes…`;
        },
      });
      output.textContent = `${name} (${bytes.length} bytes):\n${toHex(bytes)}`;
    } catch (err) {
      output.textContent = `${name}: failed — ${err.message}`;
    } finally {
      progress.classList.add("hidden");
    }
  }
}
