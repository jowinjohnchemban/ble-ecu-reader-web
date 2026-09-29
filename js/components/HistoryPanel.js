// components/HistoryPanel.js — multi-field overlay trend charts (Chart.js) from this
// session's decoded numeric values. Only actually redraws the chart while its tab is
// visible (listens for the TabBar's "tabactivated" event) — no point paying for Chart.js
// updates on a hidden canvas.

import { Component } from "./Component.js";
import { downloadFile } from "../core/download.js";
import { MultiFieldChart } from "../core/MultiFieldChart.js";

export class HistoryPanel extends Component {
  constructor(el, deps) {
    super(el, deps);
    this.select = this.qs("#historyFieldSelect");
    this.canvas = this.qs("#historyCanvas");
    this.chart = new MultiFieldChart(this.canvas);
    this.knownFields = new Set();
    this.isVisible = false;
  }

  bindEvents() {
    this.select.addEventListener("change", () => this._renderChart());
    this.qs("#clearHistoryBtn").addEventListener("click", () => this.state.clearHistory());
    this.qs("#exportHistoryBtn").addEventListener("click", () => this._exportCsv());
    document.addEventListener("tabactivated", (e) => {
      this.isVisible = e.detail.tab === "history";
      if (this.isVisible) this._renderChart();
    });
  }

  bindState() {
    this.state.addEventListener("dashboard", () => this._updateFieldOptions());
    this.state.addEventListener("history-cleared", () => {
      this.knownFields = new Set();
      this.select.innerHTML = "";
      this.chart.clear();
    });
  }

  _selectedFields() {
    return Array.from(this.select.selectedOptions).map((o) => o.value);
  }

  _updateFieldOptions() {
    const current = new Set(this.state.history.fieldNames());
    if (current.size === this.knownFields.size && [...current].every((f) => this.knownFields.has(f))) {
      if (this.isVisible) this._renderChart();
      return;
    }
    const previouslySelected = new Set(this._selectedFields());
    this.knownFields = current;
    this.select.innerHTML = "";
    for (const name of this.state.history.fieldNames()) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      opt.selected = previouslySelected.has(name);
      this.select.appendChild(opt);
    }
    if (this.isVisible) this._renderChart();
  }

  _renderChart() {
    const fields = this._selectedFields();
    this.chart.render(fields.map((name) => ({ name, points: this.state.history.get(name) })));
  }

  _exportCsv() {
    const fields = this._selectedFields();
    if (fields.length === 0) return this.toasts.show("No field selected.", "warn");
    if (fields.length > 1) this.toasts.show(`Exporting only the first selected field (${fields[0]}) — pick one at a time for CSV export.`, "info");
    downloadFile(this.state.history.toCsv(fields[0]), `history-${fields[0]}.csv`, "text/csv");
  }
}
