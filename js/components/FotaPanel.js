// components/FotaPanel.js — read-only firmware/FOTA status fields. No trigger button for
// cmmdFota anywhere in this panel, by design (see docs/research/BLE_SECURITY_FINDINGS.md).

import { RegisterPanelBase } from "./RegisterPanelBase.js";
import { REGISTER_MAP } from "../core/fieldMap.js";
import { toHex } from "../core/bitUtils.js";

const FOTA_FIELDS = ["fotaResult", "fotaState", "fotaImgA", "fotaImgB", "fotaNewFW", "phoneState", "NotifEnable"];

export class FotaPanel extends RegisterPanelBase {
  bindEvents() {
    super.bindEvents();
    this.qs("#readFotaStatusBtn").addEventListener("click", () => this._readAll());
  }

  async _readAll() {
    const output = this.qs("#fotaOutput");
    output.textContent = "Reading FOTA status fields…";
    const lines = [];
    for (const name of FOTA_FIELDS) {
      const reg = REGISTER_MAP[name];
      try {
        const bytes = await this.ble.readRegister(reg.address, reg.length);
        lines.push(`${name}: ${toHex(bytes)}`);
      } catch (err) {
        lines.push(`${name}: failed (${err.message})`);
      }
    }
    output.textContent = lines.join("\n");
  }
}
