// components/RegisterPanelBase.js — shared behavior for every panel built around
// "press a button, read a named register, show the result": Vehicle Info, Logs, FOTA
// Status. Subclasses just need their own extra buttons (paged dumps, multi-register
// sweeps); the generic `.reg-btn[data-reg][data-output]` wiring and the
// connection-gating of every button in the panel are handled once, here.

import { Component } from "./Component.js";
import { readNamedRegister, formatRegisterResult, formatRegisterError } from "../core/RegisterReader.js";

export class RegisterPanelBase extends Component {
  bindEvents() {
    this.qsa(".reg-btn").forEach((btn) => {
      btn.addEventListener("click", () => this._readIntoOutput(btn.dataset.reg, btn.dataset.output));
    });
  }

  bindState() {
    this.state.addEventListener("connection", (e) => {
      const connected = e.detail.state === "connected";
      this.qsa("button").forEach((btn) => {
        if (btn.dataset.keepEnabled !== undefined) return;
        btn.disabled = !connected;
      });
    });
  }

  async _readIntoOutput(regName, outputElementId) {
    const output = document.getElementById(outputElementId);
    output.textContent = `Reading ${regName}…`;
    try {
      const { hex, ascii } = await readNamedRegister(this.ble, regName);
      output.textContent = formatRegisterResult(regName, hex, ascii);
    } catch (err) {
      output.textContent = formatRegisterError(regName, err);
    }
  }
}
