// core/MultiFieldChart.js — thin wrapper around a single Chart.js instance that supports
// showing several fields' histories overlaid on one linear x-axis (seconds since the
// earliest visible point, avoiding a dependency on a date-adapter CDN script).

const CHART_COLORS = ["#3fa9f5", "#2fbf71", "#f5a623", "#e5484d", "#a78bfa", "#f472b6", "#38bdf8", "#fbbf24"];

export class MultiFieldChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.chart = null;
  }

  render(fieldsWithPoints) {
    // fieldsWithPoints: [{ name, points: [{t, v}] }]
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
            y: { ticks: { color: "#8b93a3" }, grid: { color: "#2a3140" } },
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
