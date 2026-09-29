// app.js — wires the UI to the decoder + BLE connection.

const STORAGE_KEY = "ecu-reader.fieldMap.v1";

let activeFieldMap = loadFieldMap();
let decoder = new TelemetryDecoder(activeFieldMap);
const ble = new VehicleBleConnection();

const rawFrames = [];
const dashboardValues = {}; // name -> { value, unit, note, charNumber }
const alertValues = {};

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
const disconnectBtn = document.getElementById("disconnectBtn");
const connStatus = document.getElementById("connStatus");
const registerButtons = [
  document.getElementById("readVinBtn"),
  document.getElementById("readSnBtn"),
  document.getElementById("readFwBtn"),
];

ble.onStateChange((state, detail) => {
  connStatus.className = `status status-${state === "connected" ? "connected" : state === "requesting" || state === "connecting" ? "connecting" : "disconnected"}`;
  connStatus.textContent =
    state === "connected" ? `Connected: ${detail?.name || "device"}` : state === "requesting" ? "Choosing device…" : state === "connecting" ? "Connecting…" : "Disconnected";
  connectBtn.disabled = state === "connected" || state === "connecting" || state === "requesting";
  disconnectBtn.disabled = state !== "connected";
  registerButtons.forEach((b) => (b.disabled = state !== "connected"));
});

connectBtn.addEventListener("click", async () => {
  try {
    await ble.connect();
  } catch (err) {
    alert(err.message);
    console.error(err);
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
    const target = typeof data.value === "boolean" ? alertValues : dashboardValues;
    target[name] = { ...data, charNumber: entry.charNumber, updatedAt: entry.timestamp };
  }
  renderDashboard();
  renderAlerts();
  renderGps();
}

function renderDashboard() {
  const grid = document.getElementById("dashboardGrid");
  grid.innerHTML = "";
  for (const [name, data] of Object.entries(dashboardValues)) {
    if (name.startsWith("Latitude") || name.startsWith("Longitude")) continue; // shown in GPS card
    const card = document.createElement("div");
    card.className = "metric-card";
    card.innerHTML = `
      <div class="label">${name}</div>
      <div class="value">${data.value}<span class="unit">${data.unit || ""}</span></div>
      ${data.note ? `<div class="note">${data.note}</div>` : ""}
    `;
    grid.appendChild(card);
  }
}

function renderAlerts() {
  const grid = document.getElementById("alertsGrid");
  grid.innerHTML = "";
  for (const [name, data] of Object.entries(alertValues)) {
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

// ---------- Register reads (VIN/SN/FW) ----------

document.getElementById("readVinBtn").addEventListener("click", () => readRegisterByName("CARDATA"));
document.getElementById("readSnBtn").addEventListener("click", () => readRegisterByName("SN"));
document.getElementById("readFwBtn").addEventListener("click", () => readRegisterByName("FW_VER"));

async function readRegisterByName(name) {
  const output = document.getElementById("registerOutput");
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

// ---------- Field map editor ----------

const editor = document.getElementById("fieldMapEditor");
editor.value = JSON.stringify(activeFieldMap, null, 2);

document.getElementById("saveFieldMapBtn").addEventListener("click", () => {
  try {
    const parsed = JSON.parse(editor.value);
    saveFieldMap(parsed);
    activeFieldMap = parsed;
    decoder = new TelemetryDecoder(activeFieldMap);
    alert("Field map saved. It will apply to new incoming frames immediately.");
  } catch (err) {
    alert(`Invalid JSON: ${err.message}`);
  }
});

document.getElementById("resetFieldMapBtn").addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  activeFieldMap = FIELD_MAP;
  decoder = new TelemetryDecoder(activeFieldMap);
  editor.value = JSON.stringify(activeFieldMap, null, 2);
});
