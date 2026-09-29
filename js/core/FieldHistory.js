// core/FieldHistory.js — per-field time-series ring buffer. Session-only (in-memory),
// matching the "raw frames" log — reload the page and it resets. Export CSV from the
// History panel if you want persistence across reloads.

export class FieldHistory {
  constructor(maxPoints = 600) {
    this.maxPoints = maxPoints;
    this.series = new Map(); // name -> [{t, v}]
  }

  record(name, value, timestamp) {
    if (typeof value !== "number" || Number.isNaN(value)) return;
    if (!this.series.has(name)) this.series.set(name, []);
    const arr = this.series.get(name);
    arr.push({ t: timestamp, v: value });
    if (arr.length > this.maxPoints) arr.shift();
  }

  fieldNames() {
    return Array.from(this.series.keys()).sort();
  }

  get(name) {
    return this.series.get(name) || [];
  }

  clear() {
    this.series.clear();
  }

  toCsv(name) {
    const rows = this.get(name).map((p) => `${p.t},${p.v}`);
    return `timestamp,value\n${rows.join("\n")}`;
  }
}
