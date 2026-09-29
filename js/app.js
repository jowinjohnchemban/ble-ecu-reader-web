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

function showToast(message, type = "info", timeoutMs = 5000) {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toast.addEventListener("click", () => dismissToast(toast));
  container.appendChild(toast);
  if (timeoutMs > 0) setTimeout(() => dismissToast(toast), timeoutMs);
  return toast;
}

function dismissToast(toast) {
  if (!toast.isConnected) return;
  toast.classList.add("closing");
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

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
  });
});

// ---------- Connection ----------

const connectBtn = document.getElementById("connectBtn");
const debugScanBtn = document.getElementById("debugScanBtn");
const reconnectBtn = document.getElementById("reconnectBtn");
const disconnectBtn = document.getElementById("disconnectBtn");
const connStatus = document.getElementById("connStatus");
const gatedButtons = () => Array.from(document.querySelectorAll(".reg-btn, #readTrackLogPtrBtn, #readStatLogPtrBtn, #readFotaStatusBtn"));

let hadSuccessfulConnection = false;

ble.onStateChange((state, detail) => {
  connStatus.className = `status status-${state === "connected" ? "connected" : state === "requesting" || state === "connecting" ? "connecting" : "disconnected"}`;
  connStatus.textContent =
    state === "connected" ? `Connected: ${detail?.name || "device"}` : state === "requesting" ? "Choosing device…" : state === "connecting" ? "Connecting…" : "Disconnected";
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
  renderAlerts();
  renderGps();
  renderHistoryIfActive();
}

function renderDashboard() {
  const grid = document.getElementById("dashboardGrid");
  const entries = Object.entries(dashboardValues).filter(([name]) => !name.startsWith("Latitude") && !name.startsWith("Longitude"));

  if (entries.length === 0) {
    grid.innerHTML = `<div class="empty-state"><strong>No telemetry yet</strong>Connect to your bike — this fills in as soon as notifications arrive.</div>`;
    return;
  }

  grid.innerHTML = "";
  for (const [name, data] of entries) {
    const { value, unit } = displayValue(data.value, data.unit);
    const card = document.createElement("div");
    card.className = "metric-card";
    const isPercent = data.unit === "%";
    card.innerHTML = `
      <div class="label">${name}</div>
      <div class="value">${value}<span class="unit">${unit || ""}</span></div>
      ${isPercent ? `<div class="gauge-track"><div class="gauge-fill ${data.value < 20 ? "low" : ""}" style="width:${Math.min(100, Math.max(0, data.value))}%"></div></div>` : ""}
      ${data.note ? `<div class="note">${data.note}</div>` : ""}
    `;
    grid.appendChild(card);
  }
}

function renderAlerts() {
  const grid = document.getElementById("alertsGrid");
  const entries = Object.entries(alertValues);

  if (entries.length === 0) {
    grid.innerHTML = `<div class="empty-state"><strong>No alert data yet</strong>Fault/alert flags show up here once connected.</div>`;
    return;
  }

  grid.innerHTML = "";
  for (const [name, data] of entries) {
    const card = document.createElement("div");
    card.className = `metric-card alert-card ${data.value ? "active" : ""}`;
    card.innerHTML = `<div class="label">${name}</div><div class="value">${data.value ? "ACTIVE" : "clear"}</div>`;
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

// ---------- History (trend charts) ----------

const historyFieldSelect = document.getElementById("historyFieldSelect");
const historyCanvas = document.getElementById("historyCanvas");
let knownHistoryFields = new Set();

function updateHistoryFieldOptions() {
  const current = new Set(history.fieldNames());
  if (current.size === knownHistoryFields.size && [...current].every((f) => knownHistoryFields.has(f))) return;
  knownHistoryFields = current;
  const selected = historyFieldSelect.value;
  historyFieldSelect.innerHTML = "";
  for (const name of history.fieldNames()) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    historyFieldSelect.appendChild(opt);
  }
  if (selected && current.has(selected)) historyFieldSelect.value = selected;
}

function renderHistoryIfActive() {
  if (!document.getElementById("tab-history").classList.contains("active")) return;
  const field = historyFieldSelect.value;
  if (!field) return;
  drawLineChart(historyCanvas, history.get(field), { label: field });
}

historyFieldSelect.addEventListener("change", renderHistoryIfActive);
document.querySelector('.tab-btn[data-tab="history"]').addEventListener("click", renderHistoryIfActive);

document.getElementById("clearHistoryBtn").addEventListener("click", () => {
  history.clear();
  knownHistoryFields = new Set();
  historyFieldSelect.innerHTML = "";
  historyCanvas.getContext("2d").clearRect(0, 0, historyCanvas.width, historyCanvas.height);
});

document.getElementById("exportHistoryBtn").addEventListener("click", () => {
  const field = historyFieldSelect.value;
  if (!field) return showToast("No field selected.", "warn");
  downloadFile(history.toCsv(field), `history-${field}.csv`, "text/csv");
});

// ---------- Raw frame log ----------

function recordRawFrame(entry) {
  rawFrames.push(entry);
  document.getElementById("frameCount").textContent = `${rawFrames.length} frames`;
  if (document.getElementById("pauseRaw").checked) return;

  const log = document.getElementById("rawLog");
  const line = document.createElement("div");
  line.className = `frame-line ${entry.checksumOk ? "" : "bad-checksum"}`;
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

document.getElementById("readTrackLogPtrBtn").addEventListener("click", () => readPagedRegister("TRACKLOG_PTR"));
document.getElementById("readStatLogPtrBtn").addEventListener("click", () => readPagedRegister("statlog_PTR"));

async function readPagedRegister(name) {
  const output = document.getElementById("logsOutput");
  const progress = document.getElementById("pagedReadProgress");
  const reg = REGISTER_MAP[name];
  output.textContent = `Reading ${name} (${reg.length} bytes, paged)…`;
  progress.style.display = "inline-block";
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
    progress.style.display = "none";
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
