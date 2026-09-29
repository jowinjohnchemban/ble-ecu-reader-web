// core/GaugeRenderer.js — semi-circular canvas gauges (speedometer-style) for bounded
// sensor fields. Hand-rolled on the 2D canvas API rather than another Chart.js instance
// per gauge — a redraw here is a handful of arc() calls, cheap enough to run on every
// incoming BLE notification, and gives full control over color zones (which is the point:
// seeing "engine temp is in the red zone" at a glance is the whole value of a gauge over
// a plain number).
//
// Ranges/zones below are reasonable defaults for a typical commuter motorcycle, NOT
// manufacturer-specified redlines for any particular model — treat the colors as a rough
// visual aid, not a certified warning system, and adjust GAUGE_DEFS for your bike if you
// know its actual redline/operating temp range.

export const GAUGE_DEFS = {
  Speed: { min: 0, max: 180, unit: "km/h", decimals: 0, zones: [{ to: 100, color: "#2fbf71" }, { to: 140, color: "#f5a623" }, { to: 180, color: "#e5484d" }] },
  EngineSpeed: { min: 0, max: 12000, unit: "RPM", decimals: 0, zones: [{ to: 7000, color: "#2fbf71" }, { to: 9500, color: "#f5a623" }, { to: 12000, color: "#e5484d" }] },
  EngineTemperature: { min: 0, max: 130, unit: "°C", decimals: 0, zones: [{ to: 90, color: "#2fbf71" }, { to: 110, color: "#f5a623" }, { to: 130, color: "#e5484d" }] },
  ThrottleOpening: { min: 0, max: 100, unit: "%", decimals: 0, zones: [{ to: 100, color: "#3fa9f5" }] },
  Fuel: { min: 0, max: 100, unit: "%", decimals: 0, zones: [{ to: 15, color: "#e5484d" }, { to: 35, color: "#f5a623" }, { to: 100, color: "#2fbf71" }] },
  Battery: { min: 0, max: 100, unit: "%", decimals: 0, zones: [{ to: 15, color: "#e5484d" }, { to: 35, color: "#f5a623" }, { to: 100, color: "#2fbf71" }] },
};

export function drawGauge(canvas, { value, def, label }) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h * 0.82;
  const radius = Math.min(w, h * 1.6) / 2 - 14;
  const startAngle = Math.PI; // 180deg, left
  const endAngle = 2 * Math.PI; // 360deg, right — top semicircle sweep

  const clamped = Math.max(def.min, Math.min(def.max, value));
  const frac = (clamped - def.min) / (def.max - def.min);

  // Background track
  ctx.lineWidth = 14;
  ctx.strokeStyle = "#0d1116";
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, endAngle);
  ctx.stroke();

  // Color zones
  let zoneStart = def.min;
  for (const zone of def.zones) {
    const zStartFrac = (zoneStart - def.min) / (def.max - def.min);
    const zEndFrac = (Math.min(zone.to, def.max) - def.min) / (def.max - def.min);
    ctx.strokeStyle = zone.color;
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle + zStartFrac * Math.PI, startAngle + zEndFrac * Math.PI);
    ctx.stroke();
    zoneStart = zone.to;
  }

  // Needle
  const needleAngle = startAngle + frac * Math.PI;
  const needleLen = radius - 6;
  ctx.strokeStyle = "#e9ecf2";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + needleLen * Math.cos(needleAngle), cy + needleLen * Math.sin(needleAngle));
  ctx.stroke();

  ctx.fillStyle = "#e9ecf2";
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
  ctx.fill();

  // Min/max tick labels
  ctx.fillStyle = "#8b93a3";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(String(def.min), cx - radius - 4, cy + 14);
  ctx.textAlign = "right";
  ctx.fillText(String(def.max), cx + radius + 4, cy + 14);

  // Digital readout
  ctx.textAlign = "center";
  ctx.fillStyle = "#e9ecf2";
  ctx.font = "bold 22px sans-serif";
  ctx.fillText(`${value.toFixed(def.decimals)}`, cx, cy - 14);
  ctx.fillStyle = "#8b93a3";
  ctx.font = "11px sans-serif";
  ctx.fillText(`${def.unit}`, cx, cy + 2);

  ctx.font = "12px sans-serif";
  ctx.fillStyle = "#8b93a3";
  ctx.textAlign = "center";
  ctx.fillText(label, cx, h - 4);
}
