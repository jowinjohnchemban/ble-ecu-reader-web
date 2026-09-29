// history.js — per-field time-series ring buffer + a small canvas line-chart renderer.
// Session-only (in-memory), matching the "raw frames" log — reload the page and it resets.
// If you want persistence across reloads, export CSV from the History tab.

class FieldHistory {
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

function drawLineChart(canvas, points, { label = "", color = "#3fa9f5" } = {}) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "#8b93a3";
  ctx.font = "12px sans-serif";

  if (points.length < 2) {
    ctx.fillText(points.length === 0 ? "No data yet — waiting for frames…" : "Need at least 2 points…", 12, h / 2);
    return;
  }

  const values = points.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padding = 30;

  // gridlines
  ctx.strokeStyle = "#2a3140";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding + ((h - padding * 2) * i) / 4;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(w - 10, y);
    ctx.stroke();
    const val = max - (range * i) / 4;
    ctx.fillText(val.toFixed(1), 2, y + 4);
  }

  // line
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = padding + ((w - padding - 10) * i) / (points.length - 1);
    const y = padding + (h - padding * 2) * (1 - (p.v - min) / range);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "#e6e9ef";
  ctx.font = "13px sans-serif";
  ctx.fillText(`${label}  (min ${min.toFixed(1)}, max ${max.toFixed(1)}, latest ${values[values.length - 1].toFixed(1)})`, padding, 16);
}

if (typeof module !== "undefined") module.exports = { FieldHistory, drawLineChart };
