// main.js — composition root. This is the only file that knows every component and
// wires them to the shared AppState + BleConnection. Nothing else in the codebase should
// need to import from more than a couple of these at once; if it does, that's a sign a
// piece of logic belongs in AppState instead of a component.

import { AppState } from "./state/AppState.js";
import { BleConnection } from "./core/BleConnection.js";

import { ToastManager } from "./components/ToastManager.js";
import { ConnectionBar } from "./components/ConnectionBar.js";
import { TabBar } from "./components/TabBar.js";
import { DashboardPanel } from "./components/DashboardPanel.js";
import { GaugesPanel } from "./components/GaugesPanel.js";
import { AlertsPanel } from "./components/AlertsPanel.js";
import { HistoryPanel } from "./components/HistoryPanel.js";
import { VehicleInfoPanel } from "./components/VehicleInfoPanel.js";
import { LogsPanel } from "./components/LogsPanel.js";
import { FotaPanel } from "./components/FotaPanel.js";
import { FullScanPanel } from "./components/FullScanPanel.js";
import { ExplorePanel } from "./components/ExplorePanel.js";
import { RawFramesPanel } from "./components/RawFramesPanel.js";
import { FieldMapEditorPanel } from "./components/FieldMapEditorPanel.js";
import { SettingsPanel } from "./components/SettingsPanel.js";

function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`main.js: expected element #${id} to exist`);
  return el;
}

function bootstrap() {
  const state = new AppState();
  const ble = new BleConnection();
  const toasts = new ToastManager(byId("toastContainer")).init();

  const deps = { state, ble, toasts };

  // Bridge: BleConnection's raw DOM events -> AppState's application-level state.
  ble.addEventListener("frame", (e) => state.applyFrame(e.detail.charNumber, e.detail.bytes));

  new ConnectionBar(byId("topbar"), deps).init();
  new TabBar(document.body, deps).init();
  new DashboardPanel(byId("tab-dashboard"), deps).init();
  new GaugesPanel(byId("tab-gauges"), deps).init();
  new AlertsPanel(byId("tab-alerts"), deps).init();
  new HistoryPanel(byId("tab-history"), deps).init();
  new VehicleInfoPanel(byId("tab-vehicle"), deps).init();
  new LogsPanel(byId("tab-logs"), deps).init();
  new FotaPanel(byId("tab-fota"), deps).init();
  new FullScanPanel(byId("tab-fullscan"), deps).init();
  new ExplorePanel(byId("tab-explore"), deps).init();
  new RawFramesPanel(byId("tab-raw"), deps).init();
  new FieldMapEditorPanel(byId("tab-fieldmap"), deps).init();
  new SettingsPanel(byId("tab-settings"), deps).init();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch((err) => console.warn("Service worker registration failed:", err));
    });
  }

  // Handy for manual debugging from the browser console.
  window.__ecuReader = { state, ble };
}

bootstrap();
