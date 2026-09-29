// history.js — per-field time-series ring buffer + a Chart.js-backed multi-series chart.
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

const CHART_COLORS = ["#3fa9f5", "#2fbf71", "#f5a623", "#e5484d", "#a78bfa", "#f472b6", "#38bdf8", "#fbbf24"];

// Thin wrapper around a single Chart.js instance that supports showing several fields'
// histories overlaid (each on its own y-axis-agnostic normalized-by-Chart.js line —
// Chart.js handles differing scales fine via multiple lines on one linear axis; for very
// different magnitudes, pick fields with comparable ranges for a readable overlay).
class MultiFieldChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.chart = null;
  }

  render(fieldsWithPoints) {
    // fieldsWithPoints: [{ name, points: [{t, v}] }]
    // Uses a plain linear x-axis (seconds since the earliest visible point) rather than
    // Chart.js's "time" scale, to avoid depending on an extra date-adapter CDN script —
    // keeps this a no-build, minimal-dependency setup.
    const allTimestamps = fieldsWithPoints.flatMap((f) => f.points.map((p) => p.t));
    const t0 = allTimestamps.length ? Math.min(...allTimestamps) : 0;

    const datasets = fieldsWithPoints.map((f, i) => ({
      label: f.name,
      data: f.points.map((p) => ({ x: (p.t - t0) / 1000, y: p.v })),
      borderColor: CHART_COLORS[i % CHART_COLORS.length],
      backgroundColor: CHART_COLORS[i % CHART_COLORS.length] + "22",
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.25,
      fill: false,
    }));

    if (!this.chart) {
      this.chart = new Chart(this.canvas.getContext("2d"), {
        type: "line",
        data: { datasets },
        options: {
          animation: false,
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "nearest", intersect: false },
          scales: {
            x: {
              type: "linear",
              title: { display: true, text: "Seconds since earliest shown point", color: "#8b93a3" },
              ticks: { color: "#8b93a3" },
              grid: { color: "#2a3140" },
            },
            y: {
              ticks: { color: "#8b93a3" },
              grid: { color: "#2a3140" },
            },
          },
          plugins: {
            legend: { labels: { color: "#e9ecf2" } },
            tooltip: { mode: "nearest", intersect: false },
          },
        },
      });
    } else {
      this.chart.data.datasets = datasets;
      this.chart.update("none");
    }
  }

  clear() {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }
}

if (typeof module !== "undefined") module.exports = { FieldHistory, MultiFieldChart };
