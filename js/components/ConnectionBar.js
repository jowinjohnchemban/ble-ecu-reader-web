// components/ConnectionBar.js — connect/scan/reconnect/disconnect buttons + a live status
// pill. Also owns the "real-time" heartbeat readout (seconds since last frame), ticking
// every second so the UI visibly proves data is still flowing, not just sitting there.

import { Component } from "./Component.js";

const STATUS_STYLES = {
  connected: "bg-emerald-950 text-ok",
  connecting: "bg-amber-950 text-warn",
  disconnected: "bg-red-950 text-err",
};

export class ConnectionBar extends Component {
  constructor(el, deps) {
    super(el, deps);
    this.hadSuccessfulConnection = false;
    this.connectBtn = this.qs("#connectBtn");
    this.debugScanBtn = this.qs("#debugScanBtn");
    this.reconnectBtn = this.qs("#reconnectBtn");
    this.disconnectBtn = this.qs("#disconnectBtn");
    this.statusEl = this.qs("#connStatus");
  }

  bindEvents() {
    this.connectBtn.addEventListener("click", () => this._connect("filtered"));
    this.debugScanBtn.addEventListener("click", () => this._connect("debug-all"));
    this.reconnectBtn.addEventListener("click", () => this._reconnect());
    this.disconnectBtn.addEventListener("click", () => this.ble.disconnect());
  }

  bindState() {
    this.ble.addEventListener("statechange", (e) => this._onStateChange(e.detail.state, e.detail.detail));
    // Tick every second so "last frame Xs ago" stays live even between new frames.
    setInterval(() => this._renderHeartbeat(), 1000);
    this.state.addEventListener("frames", () => this._renderHeartbeat());
  }

  async _connect(mode) {
    try {
      await this.ble.connect({ mode });
      this.toasts.show(`Connected to ${this.ble.device?.name || "device"}.`, "success");
    } catch (err) {
      if (err.name !== "NotFoundError") {
        const hint =
          mode === "filtered"
            ? `\n\nIf the device picker showed an empty list, try "Scan All (debug)" instead — many BLE dongles don't advertise their GATT service UUID, which is required for the filtered scan to find them.`
            : "";
        this.toasts.show(`${err.message}${hint}`, "error", 9000);
      }
      console.error(err);
    }
  }

  async _reconnect() {
    try {
      await this.ble.reconnect();
      this.toasts.show("Reconnected.", "success");
    } catch (err) {
      this.toasts.show(`Reconnect failed: ${err.message}`, "error");
    }
  }

  _onStateChange(state, detail) {
    this.state.setConnectionState(state, detail);

    const styleKey = state === "connected" ? "connected" : state === "requesting" || state === "connecting" ? "connecting" : "disconnected";
    this.statusEl.className = `inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[styleKey]}`;
    const label =
      state === "connected" ? `Connected: ${detail?.name || "device"}` : state === "requesting" ? "Choosing device…" : state === "connecting" ? "Connecting…" : "Disconnected";
    this.statusEl.innerHTML = `<span class="h-1.5 w-1.5 rounded-full bg-current ${styleKey === "connecting" ? "animate-pulse" : ""}"></span> ${label}`;

    this.connectBtn.disabled = state === "connected" || state === "connecting" || state === "requesting";
    this.disconnectBtn.disabled = state !== "connected";

    if (state === "connected") {
      this.hadSuccessfulConnection = true;
      this.reconnectBtn.disabled = true;
    } else if (state === "disconnected" && this.hadSuccessfulConnection) {
      this.reconnectBtn.disabled = false;
      if (this.state.settings.autoReconnect) {
        setTimeout(() => {
          if (!this.ble.device?.gatt?.connected) this.ble.reconnect().catch((err) => console.warn("Auto-reconnect failed:", err.message));
        }, 1500);
      }
    }

    this._renderHeartbeat();
  }

  _renderHeartbeat() {
    let heartbeat = this.qs("#connHeartbeat");
    if (!heartbeat) {
      heartbeat = document.createElement("span");
      heartbeat.id = "connHeartbeat";
      heartbeat.className = "text-xs text-slate-500";
      this.statusEl.insertAdjacentElement("afterend", heartbeat);
    }
    if (this.state.connectionState !== "connected" || !this.state.lastFrameAt) {
      heartbeat.textContent = "";
      return;
    }
    const secondsAgo = Math.round((Date.now() - this.state.lastFrameAt) / 1000);
    heartbeat.textContent = secondsAgo <= 1 ? "● live" : `last frame ${secondsAgo}s ago`;
    heartbeat.className = `text-xs ${secondsAgo <= 2 ? "text-ok" : secondsAgo <= 10 ? "text-warn" : "text-slate-500"}`;
  }

  render() {
    this._renderHeartbeat();
  }
}
