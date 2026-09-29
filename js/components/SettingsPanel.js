// components/SettingsPanel.js — units, alert sound, auto-reconnect toggles.

import { Component } from "./Component.js";

export class SettingsPanel extends Component {
  constructor(el, deps) {
    super(el, deps);
    this.unitsSelect = this.qs("#unitsSelect");
    this.alertSoundToggle = this.qs("#alertSoundToggle");
    this.autoReconnectToggle = this.qs("#autoReconnectToggle");
  }

  bindEvents() {
    this.unitsSelect.addEventListener("change", () => this.state.updateSettings({ units: this.unitsSelect.value }));
    this.alertSoundToggle.addEventListener("change", () => this.state.updateSettings({ alertSound: this.alertSoundToggle.checked }));
    this.autoReconnectToggle.addEventListener("change", () => this.state.updateSettings({ autoReconnect: this.autoReconnectToggle.checked }));
  }

  render() {
    this.unitsSelect.value = this.state.settings.units;
    this.alertSoundToggle.checked = this.state.settings.alertSound;
    this.autoReconnectToggle.checked = this.state.settings.autoReconnect;
  }
}
