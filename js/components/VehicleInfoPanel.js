// components/VehicleInfoPanel.js — VIN/serial/firmware/MAC reads, plus the experimental
// security-handshake fields and the explicitly-caged "write-targeted" registers. Most of
// the button wiring comes free from RegisterPanelBase; this only adds the one paged read
// (SMCERT) that doesn't fit the generic single-request pattern.

import { RegisterPanelBase } from "./RegisterPanelBase.js";
import { toHex } from "../core/bitUtils.js";

export class VehicleInfoPanel extends RegisterPanelBase {
  bindEvents() {
    super.bindEvents();
    this.qs("#readSmCertBtn").addEventListener("click", () => this._readSmCert());
  }

  async _readSmCert() {
    const output = this.qs("#securityOutput");
    const progress = this.qs("#securityReadProgress");
    output.textContent = "Reading SMCERT (509 bytes, paged)…";
    progress.classList.remove("hidden");
    progress.max = 509;
    progress.value = 0;
    try {
      const bytes = await this.ble.readRegisterPaged(0x2042, 509, {
        onProgress: (done, total) => {
          progress.value = done;
          output.textContent = `Reading SMCERT: ${done}/${total} bytes…`;
        },
      });
      output.textContent = `SMCERT (${bytes.length} bytes):\n${toHex(bytes)}`;
    } catch (err) {
      output.textContent = `SMCERT: failed — ${err.message}`;
    } finally {
      progress.classList.add("hidden");
    }
  }
}
