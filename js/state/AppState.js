// state/AppState.js — single source of truth for everything the UI renders.
// Components never talk to each other directly; they read from and dispatch through this
// store, and listen for the events it fires. That's the whole architecture in one sentence:
// BleConnection -> AppState.applyFrame() -> events -> Components re-render themselves.

import { FIELD_MAP } from "../core/fieldMap.js";
import { TelemetryDecoder } from "../core/TelemetryDecoder.js";
import { FieldHistory } from "../core/FieldHistory.js";

const FIELD_MAP_STORAGE_KEY = "ecu-reader.fieldMap.v1";
const SETTINGS_STORAGE_KEY = "ecu-reader.settings.v1";
const DEFAULT_SETTINGS = { units: "metric", alertSound: false, autoReconnect: false };

const UNIT_CONVERSIONS = {
  km: (v) => [v * 0.621371, "mi"],
  "km/h": (v) => [v * 0.621371, "mph"],
  "°C": (v) => [(v * 9) / 5 + 32, "°F"],
};

export class AppState extends EventTarget {
  constructor() {
    super();

    this.settings = this._loadSettings();
    this.fieldMap = this._loadFieldMap();
    this.decoder = new TelemetryDecoder(this.fieldMap);
    this.history = new FieldHistory();

    this.dashboardValues = {}; // name -> { value, unit, note, charNumber, updatedAt }
    this.alertValues = {}; // name -> { value, charNumber, updatedAt }
    this._previousAlertState = {};
    this.rawFrames = [];
    this.connectionState = "disconnected";
    this.lastFrameAt = null;
  }

  // ---------- Settings ----------

  _loadSettings() {
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    } catch (e) {
      console.warn("Failed to load settings, using defaults:", e);
    }
    return { ...DEFAULT_SETTINGS };
  }

  updateSettings(patch) {
    this.settings = { ...this.settings, ...patch };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
    this.dispatchEvent(new CustomEvent("settings", { detail: this.settings }));
  }

  displayValue(value, unit) {
    if (this.settings.units === "imperial" && UNIT_CONVERSIONS[unit]) {
      const [converted, newUnit] = UNIT_CONVERSIONS[unit](value);
      return { value: Math.round(converted * 10) / 10, unit: newUnit };
    }
    return { value, unit };
  }

  // ---------- Field map ----------

  _loadFieldMap() {
    try {
      const stored = localStorage.getItem(FIELD_MAP_STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.warn("Failed to load saved field map, using defaults:", e);
    }
    return FIELD_MAP;
  }

  saveFieldMap(map) {
    localStorage.setItem(FIELD_MAP_STORAGE_KEY, JSON.stringify(map));
    this.fieldMap = map;
    this.decoder.setFieldMap(map);
    this.dispatchEvent(new CustomEvent("fieldmap", { detail: map }));
  }

  resetFieldMap() {
    localStorage.removeItem(FIELD_MAP_STORAGE_KEY);
    this.fieldMap = FIELD_MAP;
    this.decoder.setFieldMap(FIELD_MAP);
    this.dispatchEvent(new CustomEvent("fieldmap", { detail: FIELD_MAP }));
  }

  // ---------- Connection ----------

  setConnectionState(state, detail) {
    this.connectionState = state;
    this.dispatchEvent(new CustomEvent("connection", { detail: { state, detail } }));
  }

  // ---------- Incoming frames ----------
  // Batches rapid-fire BLE notifications into one render per animation frame instead of
  // one DOM update per packet — this is what keeps the UI feeling smooth ("real-time"
  // shouldn't mean "janky") when the dongle is pushing several notifications a second.

  applyFrame(charNumber, bytes) {
    const entry = this.decoder.process(charNumber, bytes);
    this.lastFrameAt = entry.timestamp;

    this.rawFrames.push(entry);
    if (this.rawFrames.length > 5000) this.rawFrames.shift(); // cap memory for very long sessions

    let dashboardChanged = false;
    let alertsChanged = false;

    for (const [name, data] of Object.entries(entry.decoded)) {
      if (typeof data.value === "boolean") {
        const becameActive = data.value === true && this._previousAlertState[name] === false;
        this._previousAlertState[name] = data.value;
        this.alertValues[name] = { ...data, charNumber: entry.charNumber, updatedAt: entry.timestamp };
        alertsChanged = true;
        if (becameActive) this.dispatchEvent(new CustomEvent("alert-triggered", { detail: { name } }));
      } else {
        this.dashboardValues[name] = { ...data, charNumber: entry.charNumber, updatedAt: entry.timestamp };
        dashboardChanged = true;
        if (typeof data.value === "number") this.history.record(name, data.value, entry.timestamp);
      }
    }

    this._scheduleFlush({ dashboardChanged, alertsChanged, frame: entry });
  }

  _scheduleFlush(update) {
    this._pendingUpdate = this._pendingUpdate || { dashboardChanged: false, alertsChanged: false, frames: [] };
    this._pendingUpdate.dashboardChanged ||= update.dashboardChanged;
    this._pendingUpdate.alertsChanged ||= update.alertsChanged;
    this._pendingUpdate.frames.push(update.frame);

    if (this._flushHandle) return;
    this._flushHandle = requestAnimationFrame(() => {
      const pending = this._pendingUpdate;
      this._pendingUpdate = null;
      this._flushHandle = null;

      if (pending.dashboardChanged) this.dispatchEvent(new CustomEvent("dashboard"));
      if (pending.alertsChanged) this.dispatchEvent(new CustomEvent("alerts"));
      this.dispatchEvent(new CustomEvent("frames", { detail: pending.frames }));
    });
  }

  clearRawFrames() {
    this.rawFrames = [];
    this.dispatchEvent(new CustomEvent("frames-cleared"));
  }

  clearHistory() {
    this.history.clear();
    this.dispatchEvent(new CustomEvent("history-cleared"));
  }
}
