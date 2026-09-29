// components/FieldMapEditorPanel.js — live JSON editor for the telemetry field map,
// persisted to localStorage via AppState.

import { Component } from "./Component.js";
import { FIELD_MAP } from "../core/fieldMap.js";

export class FieldMapEditorPanel extends Component {
  constructor(el, deps) {
    super(el, deps);
    this.textarea = this.qs("#fieldMapEditor");
  }

  bindEvents() {
    this.qs("#saveFieldMapBtn").addEventListener("click", () => this._save());
    this.qs("#resetFieldMapBtn").addEventListener("click", () => this._reset());
  }

  bindState() {
    this.state.addEventListener("fieldmap", (e) => {
      this.textarea.value = JSON.stringify(e.detail, null, 2);
    });
  }

  render() {
    this.textarea.value = JSON.stringify(this.state.fieldMap, null, 2);
  }

  _save() {
    try {
      const parsed = JSON.parse(this.textarea.value);
      this.state.saveFieldMap(parsed);
      this.toasts.show("Field map saved — applies to new incoming frames immediately.", "success");
    } catch (err) {
      this.toasts.show(`Invalid JSON: ${err.message}`, "error");
    }
  }

  _reset() {
    this.state.resetFieldMap();
    this.textarea.value = JSON.stringify(FIELD_MAP, null, 2);
  }
}
