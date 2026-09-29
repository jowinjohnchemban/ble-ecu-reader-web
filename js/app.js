// app.js — wires the UI to the decoder + BLE connection.

const STORAGE_KEY = "ecu-reader.fieldMap.v1";
const SETTINGS_KEY = "ecu-reader.settings.v1";
const DEFAULT_SETTINGS = { units: "metric", alertSound: false, autoReconnect: false };

let activeFieldMap = loadFieldMap();
let decoder = new TelemetryDecoder(activeFieldMap);
const ble = new VehicleBleConnection();
const history = new FieldHistory();
const settings = loadSettings();

const rawFrames = [];
const dashboardValues = {}; // name -> { value, unit, note, charNumber }
const alertValues = {};
const previousAlertState = {}; // name -> boolean, to detect false->true transitions

// ---------- Settings ----------

function loadSettings() {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch (e) {
    console.warn("Failed to load settings, using defaults:", e);
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

const unitsSelect = document.getElementById("unitsSelect");
const alertSoundToggle = document.getElementById("alertSoundToggle");
const autoReconnectToggle = document.getElementById("autoReconnectToggle");
unitsSelect.value = settings.units;
alertSoundToggle.checked = settings.alertSound;
autoReconnectToggle.checked = settings.autoReconnect;

unitsSelect.addEventListener("change", () => {
  settings.units = unitsSelect.value;
  saveSettings();
  renderDashboard();
  renderGauges();
});
alertSoundToggle.addEventListener("change", () => {
  settings.alertSound = alertSoundToggle.checked;
  saveSettings();
});
autoReconnectToggle.addEventListener("change", () => {
  settings.autoReconnect = autoReconnectToggle.checked;
  saveSettings();
});

// Unit conversion applied only at render time — decoder/history always store raw metric values.
const UNIT_CONVERSIONS = {
  km: (v) => [v * 0.621371, "mi"],
  "km/h": (v) => [v * 0.621371, "mph"],
  "°C": (v) => [(v * 9) / 5 + 32, "°F"],
};

function displayValue(value, unit) {
  if (settings.units === "imperial" && UNIT_CONVERSIONS[unit]) {
    const [converted, newUnit] = UNIT_CONVERSIONS[unit](value);
    return { value: Math.round(converted * 10) / 10, unit: newUnit };
  }
  return { value, unit };
}

// ---------- Alert sound ----------

let audioCtx = null;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  } catch (e) {
    console.warn("Could not play alert sound:", e);
  }
}

// ---------- Toasts (replaces blocking alert() popups) ----------

const TOAST_BORDER_BY_TYPE = { info: "border-l-accent", success: "border-l-ok", warn: "border-l-warn", error: "border-l-err" };

function showToast(message, type = "info", timeoutMs = 5000) {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast-in cursor-pointer whitespace-pre-wrap rounded-lg border border-edge ${TOAST_BORDER_BY_TYPE[type] || TOAST_BORDER_BY_TYPE.info} border-l-4 bg-panel2 p-3 text-sm leading-relaxed shadow-xl`;
  toast.textContent = message;
  toast.addEventListener("click", () => dismissToast(toast));
  container.appendChild(toast);
  if (timeoutMs > 0) setTimeout(() => dismissToast(toast), timeoutMs);
  return toast;
}

function dismissToast(toast) {
  if (!toast.isConnected) return;
  toast.classList.remove("toast-in");
  toast.classList.add("toast-out");
  setTimeout(() => toast.remove(), 200);
}

// ---------- Service worker (installable / offline app shell) ----------

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => console.warn("Service worker registration failed:", err));
  });
}

// ---------- Field map persistence ----------

function loadFieldMap() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) {
    console.warn("Failed to load saved field map, using defaults:", e);
  }
  return FIELD_MAP;
}

function saveFieldMap(map) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

// ---------- Tabs ----------

const TAB_ACTIVE_CLASSES = ["border-accent", "text-accent"];
const TAB_INACTIVE_CLASSES = ["border-transparent", "text-slate-400"];

function activateTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach((b) => {
    const isActive = b.dataset.tab === tabName;
    b.classList.toggle("border-accent", isActive);
    b.classList.toggle("text-accent", isActive);
    b.classList.toggle("border-transparent", !isActive);
    b.classList.toggle("text-slate-400", !isActive);
  });
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("hidden", p.id !== `tab-${tabName}`));
  if (tabName === "history") renderHistoryIfActive();
}

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => activateTab(btn.dataset.tab));
});

// ---------- Connection ----------

const connectBtn = document.getElementById("connectBtn");
const debugScanBtn = document.getElementById("debugScanBtn");
const reconnectBtn = document.getElementById("reconnectBtn");
const disconnectBtn = document.getElementById("disconnectBtn");
const connStatus = document.getElementById("connStatus");
const gatedButtons = () =>
  Array.from(document.querySelectorAll(".reg-btn, #readTrackLogPtrBtn, #readStatLogPtrBtn, #readFotaStatusBtn, #readSmCertBtn, #fullScanBtn"));

const STATUS_STYLES = {
  connected: "bg-emerald-950 text-ok",
  connecting: "bg-amber-950 text-warn",
  disconnected: "bg-red-950 text-err",
};

let hadSuccessfulConnection = false;

ble.onStateChange((state, detail) => {
  const styleKey = state === "connected" ? "connected" : state === "requesting" || state === "connecting" ? "connecting" : "disconnected";
  connStatus.className = `inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[styleKey]}`;
  connStatus.innerHTML = `<span class="h-1.5 w-1.5 rounded-full bg-current ${styleKey === "connecting" ? "animate-pulse" : ""}"></span> ${
    state === "connected" ? `Connected: ${detail?.name || "device"}` : state === "requesting" ? "Choosing device…" : state === "connecting" ? "Connecting…" : "Disconnected"
  }`;
  connectBtn.disabled = state === "connected" || state === "connecting" || state === "requesting";
  disconnectBtn.disabled = state !== "connected";
  gatedButtons().forEach((b) => (b.disabled = state !== "connected"));

  if (state === "connected") {
    hadSuccessfulConnection = true;
    reconnectBtn.disabled = true;
  } else if (state === "disconnected" && hadSuccessfulConnection) {
    reconnectBtn.disabled = false;
    if (settings.autoReconnect) {
      setTimeout(() => {
        if (!ble.device?.gatt?.connected) ble.reconnect().catch((err) => console.warn("Auto-reconnect failed:", err.message));
      }, 1500);
    }
  }
});

connectBtn.addEventListener("click", async () => {
  try {
    await ble.connect({ mode: "filtered" });
    showToast(`Connected to ${ble.device?.name || "device"}.`, "success");
  } catch (err) {
    if (err.name !== "NotFoundError") {
      // NotFoundError just means the user closed the device picker without choosing — not worth a toast.
      showToast(
        `${err.message}\n\nIf the device picker showed an empty list, try "Scan All (debug)" instead — many BLE dongles don't advertise their GATT service UUID, which is required for the filtered scan to find them.`,
        "error",
        9000
      );
    }
    console.error(err);
  }
});

debugScanBtn.addEventListener("click", async () => {
  try {
    await ble.connect({ mode: "debug-all" });
    showToast(`Connected to ${ble.device?.name || "device"}.`, "success");
  } catch (err) {
    if (err.name !== "NotFoundError") showToast(err.message, "error", 8000);
    console.error(err);
  }
});

reconnectBtn.addEventListener("click", async () => {
  try {
    await ble.reconnect();
    showToast("Reconnected.", "success");
  } catch (err) {
    showToast(`Reconnect failed: ${err.message}`, "error");
  }
});

disconnectBtn.addEventListener("click", () => ble.disconnect());

ble.onFrame((charNumber, bytes) => {
  const entry = decoder.process(charNumber, bytes);
  recordRawFrame(entry);
  applyDecodedValues(entry);
});

// ---------- Decoded value routing ----------

function applyDecodedValues(entry) {
  for (const [name, data] of Object.entries(entry.decoded)) {
    if (typeof data.value === "boolean") {
      if (settings.alertSound && data.value === true && previousAlertState[name] === false) beep();
      previousAlertState[name] = data.value;
      alertValues[name] = { ...data, charNumber: entry.charNumber, updatedAt: entry.timestamp };
    } else {
      dashboardValues[name] = { ...data, charNumber: entry.charNumber, updatedAt: entry.timestamp };
      if (typeof data.value === "number") {
        history.record(name, data.value, entry.timestamp);
        updateHistoryFieldOptions();
      }
    }
  }
  renderDashboard();
  renderGauges();
  renderAlerts();
  renderGps();
  renderHistoryIfActive();
}

function emptyStateHtml(title, body) {
  return `<div class="col-span-full rounded-xl border border-dashed border-edge py-12 text-center text-slate-400">
    <strong class="mb-1.5 block text-base text-slate-200">${title}</strong>${body}
  </div>`;
}

function renderDashboard() {
  const grid = document.getElementById("dashboardGrid");
  const entries = Object.entries(dashboardValues).filter(([name]) => !name.startsWith("Latitude") && !name.startsWith("Longitude"));

  if (entries.length === 0) {
    grid.innerHTML = emptyStateHtml("No telemetry yet", "Connect to your bike — this fills in as soon as notifications arrive.");
    return;
  }

  grid.innerHTML = "";
  for (const [name, data] of entries) {
    const { value, unit } = displayValue(data.value, data.unit);
    const isPercent = data.unit === "%";
    const pct = Math.min(100, Math.max(0, data.value));
    const card = document.createElement("div");
    card.className = "rounded-xl border border-edge bg-gradient-to-br from-panel2 to-panel p-4 transition hover:-translate-y-0.5 hover:border-accent/40";
    card.innerHTML = `
      <div class="text-xs font-semibold uppercase tracking-wide text-slate-400">${name}</div>
      <div class="mt-1.5 font-mono text-2xl font-bold tabular-nums">${value}<span class="ml-1 text-sm font-medium text-slate-400">${unit || ""}</span></div>
      ${
        isPercent
          ? `<div class="mt-2.5 h-1.5 overflow-hidden rounded-full bg-black/40"><div class="h-full rounded-full ${
              data.value < 20 ? "bg-gradient-to-r from-err to-warn" : "bg-gradient-to-r from-accent to-ok"
            } transition-all" style="width:${pct}%"></div></div>`
          : ""
      }
      ${data.note ? `<div class="mt-2 text-xs leading-snug text-warn">${data.note}</div>` : ""}
    `;
    grid.appendChild(card);
  }
}

// ---------- Gauges (speedometer-style dials for bounded sensor fields) ----------

let gaugeCanvases = {}; // field name -> <canvas>, kept across renders so we redraw in place

function renderGauges() {
  const grid = document.getElementById("gaugesGrid");
  const available = Object.keys(GAUGE_DEFS).filter((name) => dashboardValues[name] !== undefined);

  if (available.length === 0) {
    if (Object.keys(gaugeCanvases).length > 0 || grid.children.length === 0) {
      grid.innerHTML = emptyStateHtml("No gauge-ready sensors yet", "Speed, RPM, engine temp, throttle, fuel, and battery show up here once connected.");
      gaugeCanvases = {};
    }
    return;
  }

  if (Object.keys(gaugeCanvases).length === 0) grid.innerHTML = "";

  for (const name of available) {
    let canvas = gaugeCanvases[name];
    if (!canvas) {
      const card = document.createElement("div");
      card.className = "flex justify-center rounded-xl border border-edge bg-panel p-3";
      canvas = document.createElement("canvas");
      canvas.width = 260;
      canvas.height = 170;
      canvas.className = "max-w-full";
      card.appendChild(canvas);
      grid.appendChild(card);
      gaugeCanvases[name] = canvas;
    }

    const def = GAUGE_DEFS[name];
    const raw = dashboardValues[name].value;
    const { value: displayVal, unit: displayUnit } = displayValue(raw, def.unit);

    let displayDef = def;
    if (displayUnit !== def.unit) {
      displayDef = {
        ...def,
        min: displayValue(def.min, def.unit).value,
        max: displayValue(def.max, def.unit).value,
        unit: displayUnit,
        zones: def.zones.map((z) => ({ ...z, to: displayValue(z.to, def.unit).value })),
      };
    }

    drawGauge(canvas, { value: displayVal, def: displayDef, label: name });
  }
}

function renderAlerts() {
  const grid = document.getElementById("alertsGrid");
  const entries = Object.entries(alertValues);

  if (entries.length === 0) {
    grid.innerHTML = emptyStateHtml("No alert data yet", "Fault/alert flags show up here once connected.");
    return;
  }

  grid.innerHTML = "";
  for (const [name, data] of entries) {
    const card = document.createElement("div");
    card.className = `rounded-xl border p-4 transition ${
      data.value ? "alert-flash border-err bg-gradient-to-br from-red-950 to-red-950/40" : "border-edge bg-gradient-to-br from-panel2 to-panel"
    }`;
    card.innerHTML = `
      <div class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${data.value ? "text-red-200" : "text-slate-400"}">
        <span class="h-1.5 w-1.5 rounded-full ${data.value ? "bg-err" : "bg-ok"}"></span>${name}
      </div>
      <div class="mt-1.5 text-base font-bold ${data.value ? "text-err" : "text-slate-500"}">${data.value ? "ACTIVE" : "clear"}</div>
    `;
    grid.appendChild(card);
  }
}

function renderGps() {
  const lat = dashboardValues.LatitudeDegrees;
  const latDec = dashboardValues.LatitudeDecimals;
  const lon = dashboardValues.LongitudeDegrees;
  const lonDec = dashboardValues.LongitudeDecimals;
  if (!lat || !lon) return;
  const latitude = lat.value + (latDec ? latDec.value / 1e6 : 0);
  const longitude = lon.value + (lonDec ? lonDec.value / 1e6 : 0);
  document.getElementById("gpsValue").textContent = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  document.getElementById("gpsMapLink").href = `https://www.google.com/maps?q=${latitude},${longitude}`;
}

// ---------- History (trend charts, Chart.js, multi-field overlay) ----------

const historyFieldSelect = document.getElementById("historyFieldSelect");
const historyCanvas = document.getElementById("historyCanvas");
const multiChart = new MultiFieldChart(historyCanvas);
let knownHistoryFields = new Set();

function selectedHistoryFields() {
  return Array.from(historyFieldSelect.selectedOptions).map((o) => o.value);
}

function updateHistoryFieldOptions() {
  const current = new Set(history.fieldNames());
  if (current.size === knownHistoryFields.size && [...current].every((f) => knownHistoryFields.has(f))) return;
  const previouslySelected = new Set(selectedHistoryFields());
  knownHistoryFields = current;
  historyFieldSelect.innerHTML = "";
  for (const name of history.fieldNames()) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    opt.selected = previouslySelected.has(name);
    historyFieldSelect.appendChild(opt);
  }
}

function renderHistoryIfActive() {
  const panel = document.getElementById("tab-history");
  if (panel.classList.contains("hidden")) return;
  const fields = selectedHistoryFields();
  multiChart.render(fields.map((name) => ({ name, points: history.get(name) })));
}

historyFieldSelect.addEventListener("change", renderHistoryIfActive);

document.getElementById("clearHistoryBtn").addEventListener("click", () => {
  history.clear();
  knownHistoryFields = new Set();
  historyFieldSelect.innerHTML = "";
  multiChart.clear();
});

document.getElementById("exportHistoryBtn").addEventListener("click", () => {
  const fields = selectedHistoryFields();
  if (fields.length === 0) return showToast("No field selected.", "warn");
  if (fields.length > 1) showToast(`Exporting only the first selected field (${fields[0]}) — pick one at a time for CSV export.`, "info");
  downloadFile(history.toCsv(fields[0]), `history-${fields[0]}.csv`, "text/csv");
});

// ---------- Raw frame log ----------

function recordRawFrame(entry) {
  rawFrames.push(entry);
  document.getElementById("frameCount").textContent = `${rawFrames.length} frames`;
  if (document.getElementById("pauseRaw").checked) return;

  const log = document.getElementById("rawLog");
  const line = document.createElement("div");
  line.className = `border-b border-black/30 px-3 py-1 ${entry.checksumOk ? "even:bg-white/[0.02]" : "bg-red-950/40 text-err"}`;
  const time = new Date(entry.timestamp).toISOString().split("T")[1].replace("Z", "");
  line.textContent = `[${time}] ch${entry.charNumber} sub=${entry.subPage} ${entry.checksumOk ? "" : "BADCHK "}${entry.rawHex}`;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

document.getElementById("clearRawBtn").addEventListener("click", () => {
  rawFrames.length = 0;
  document.getElementById("rawLog").innerHTML = "";
  document.getElementById("frameCount").textContent = "0 frames";
});

document.getElementById("exportJsonBtn").addEventListener("click", () => {
  downloadFile(
    JSON.stringify(rawFrames.map(withPlainRaw), null, 2),
    "ecu-frames.json",
    "application/json"
  );
});

document.getElementById("exportCsvBtn").addEventListener("click", () => {
  const header = "timestamp,charNumber,subPage,checksumOk,rawHex\n";
  const rows = rawFrames
    .map((f) => `${f.timestamp},${f.charNumber},${f.subPage},${f.checksumOk},"${f.rawHex}"`)
    .join("\n");
  downloadFile(header + rows, "ecu-frames.csv", "text/csv");
});

function withPlainRaw(entry) {
  return { ...entry, raw: Array.from(entry.raw) };
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- Register reads (VIN/SN/FW/MAC/logs — generic, driven by data-reg/data-output) ----------

document.querySelectorAll(".reg-btn").forEach((btn) => {
  btn.addEventListener("click", () => readRegisterByName(btn.dataset.reg, btn.dataset.output));
});

async function readRegisterByName(name, outputElementId) {
  const output = document.getElementById(outputElementId);
  const reg = REGISTER_MAP[name];
  if (!reg) {
    output.textContent = `Unknown register: ${name}`;
    return;
  }
  output.textContent = `Reading ${name} (address 0x${reg.address.toString(16)}, length ${reg.length})…`;
  try {
    const bytes = await ble.readRegister(reg.address, reg.length);
    output.textContent = `${name}:\nhex: ${toHex(bytes)}\nascii: ${asciiPreview(bytes)}`;
  } catch (err) {
    output.textContent = `${name}: failed — ${err.message}\n\nThis is expected if the opcode/frame assumptions in js/ble.js don't match your dongle's firmware. Check the Raw Frames tab while retrying to see what (if anything) comes back.`;
  }
}

function asciiPreview(bytes) {
  return Array.from(bytes)
    .map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : "."))
    .join("");
}

// ---------- Logs tab: paged dump of TRACKLOG_PTR / statlog_PTR ----------

document.getElementById("readTrackLogPtrBtn").addEventListener("click", () => readPagedRegister("TRACKLOG_PTR", "logsOutput", "pagedReadProgress"));
document.getElementById("readStatLogPtrBtn").addEventListener("click", () => readPagedRegister("statlog_PTR", "logsOutput", "pagedReadProgress"));
document.getElementById("readSmCertBtn").addEventListener("click", () => readPagedRegister("SMCERT", "securityOutput", "pagedReadProgress"));

async function readPagedRegister(name, outputElementId, progressElementId) {
  const output = document.getElementById(outputElementId);
  const progress = document.getElementById(progressElementId);
  const reg = REGISTER_MAP[name];
  output.textContent = `Reading ${name} (${reg.length} bytes, paged)…`;
  progress.classList.remove("hidden");
  progress.max = reg.length;
  progress.value = 0;
  try {
    const bytes = await ble.readRegisterPaged(reg.address, reg.length, {
      onProgress: (done, total) => {
        progress.value = done;
        output.textContent = `Reading ${name}: ${done}/${total} bytes…`;
      },
    });
    output.textContent = `${name} (${bytes.length} bytes):\n${toHex(bytes)}`;
  } catch (err) {
    output.textContent = `${name}: failed — ${err.message}`;
  } finally {
    progress.classList.add("hidden");
  }
}

// ---------- FOTA status tab (read-only — see docs/research/BLE_SECURITY_FINDINGS.md) ----------

document.getElementById("readFotaStatusBtn").addEventListener("click", async () => {
  const output = document.getElementById("fotaOutput");
  const fields = ["fotaResult", "fotaState", "fotaImgA", "fotaImgB", "fotaNewFW", "phoneState", "NotifEnable"];
  output.textContent = "Reading FOTA status fields…";
  const lines = [];
  for (const name of fields) {
    const reg = REGISTER_MAP[name];
    try {
      const bytes = await ble.readRegister(reg.address, reg.length);
      lines.push(`${name}: ${toHex(bytes)}`);
    } catch (err) {
      lines.push(`${name}: failed (${err.message})`);
    }
  }
  output.textContent = lines.join("\n");
});

// ---------- Full Scan: read-only sweep of every known register tag ----------
// Still zero writes: every call below goes through ble.readRegister/readRegisterPaged,
// which only ever send a VarEx READ opcode. See fieldMap.js's REGISTER_MAP comment block
// for the full safety reasoning, especially around the "writeTargeted" group.

let lastFullScanResults = [];

document.getElementById("fullScanBtn").addEventListener("click", runFullScan);

async function runFullScan() {
  const includeLarge = document.getElementById("fullScanIncludeLarge").checked;
  const includeCaution = document.getElementById("fullScanIncludeCaution").checked;
  const tbody = document.getElementById("fullScanTableBody");
  const status = document.getElementById("fullScanStatus");
  const progress = document.getElementById("fullScanProgress");
  const scanBtn = document.getElementById("fullScanBtn");

  const entries = Object.entries(REGISTER_MAP).filter(([, reg]) => {
    if (reg.writeTargeted && !includeCaution) return false;
    if (reg.paged && reg.length > 32 && !includeLarge) return false;
    return true;
  });

  scanBtn.disabled = true;
  tbody.innerHTML = "";
  lastFullScanResults = [];
  progress.classList.remove("hidden");
  progress.max = entries.length;
  progress.value = 0;

  for (const [name, reg] of entries) {
    status.textContent = `Reading ${name}… (${progress.value + 1}/${entries.length})`;
    let result;
    try {
      const bytes = reg.paged
        ? await ble.readRegisterPaged(reg.address, reg.length, { chunkSize: 16 })
        : await ble.readRegister(reg.address, reg.length);
      result = { name, ...reg, status: "ok", hex: toHex(bytes), ascii: asciiPreview(bytes) };
    } catch (err) {
      result = { name, ...reg, status: "failed", hex: "", ascii: "", error: err.message };
    }
    lastFullScanResults.push(result);
    appendFullScanRow(result);
    progress.value += 1;
    // Small delay between reads — kinder to the BLE stack/dongle than back-to-back requests.
    await new Promise((r) => setTimeout(r, 60));
  }

  status.textContent = `Done — ${lastFullScanResults.filter((r) => r.status === "ok").length}/${entries.length} registers read successfully.`;
  progress.classList.add("hidden");
  scanBtn.disabled = false;
}

function appendFullScanRow(result) {
  const tbody = document.getElementById("fullScanTableBody");
  const row = document.createElement("tr");
  const isCaution = result.writeTargeted;
  row.className = isCaution ? "bg-red-950/20" : "";
  row.innerHTML = `
    <td class="px-3 py-1.5 font-semibold ${isCaution ? "text-red-300" : "text-slate-200"}">${result.name}</td>
    <td class="px-3 py-1.5 text-slate-400">${result.group}</td>
    <td class="px-3 py-1.5 text-slate-400">0x${result.address.toString(16)}</td>
    <td class="px-3 py-1.5 text-slate-400">${result.length}</td>
    <td class="px-3 py-1.5 ${result.status === "ok" ? "text-ok" : "text-err"}">${result.status}${result.error ? ` (${result.error})` : ""}</td>
    <td class="max-w-[220px] truncate px-3 py-1.5 text-slate-300" title="${result.hex}">${result.hex}</td>
    <td class="px-3 py-1.5 text-slate-300">${result.ascii}</td>
    <td class="max-w-[260px] px-3 py-1.5 text-slate-500">${result.description || ""}</td>
  `;
  tbody.appendChild(row);
}

document.getElementById("fullScanExportJsonBtn").addEventListener("click", () => {
  if (lastFullScanResults.length === 0) return showToast("Run a scan first.", "warn");
  downloadFile(JSON.stringify(lastFullScanResults, null, 2), "ecu-full-scan.json", "application/json");
});

document.getElementById("fullScanExportCsvBtn").addEventListener("click", () => {
  if (lastFullScanResults.length === 0) return showToast("Run a scan first.", "warn");
  const header = "name,group,address,length,status,hex,ascii,description\n";
  const rows = lastFullScanResults
    .map((r) => `${r.name},${r.group},0x${r.address.toString(16)},${r.length},${r.status},"${r.hex}","${r.ascii.replace(/"/g, '""')}","${(r.description || "").replace(/"/g, '""')}"`)
    .join("\n");
  downloadFile(header + rows, "ecu-full-scan.csv", "text/csv");
});

// ---------- Field map editor ----------

const editor = document.getElementById("fieldMapEditor");
editor.value = JSON.stringify(activeFieldMap, null, 2);

document.getElementById("saveFieldMapBtn").addEventListener("click", () => {
  try {
    const parsed = JSON.parse(editor.value);
    saveFieldMap(parsed);
    activeFieldMap = parsed;
    decoder = new TelemetryDecoder(activeFieldMap);
    showToast("Field map saved — applies to new incoming frames immediately.", "success");
  } catch (err) {
    showToast(`Invalid JSON: ${err.message}`, "error");
  }
});

document.getElementById("resetFieldMapBtn").addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  activeFieldMap = FIELD_MAP;
  decoder = new TelemetryDecoder(activeFieldMap);
  editor.value = JSON.stringify(activeFieldMap, null, 2);
});
