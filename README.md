# DIY ECU / Telematics Reader (Web Bluetooth)

A read-only web app that connects to your motorcycle's BLE telematics dongle and decodes live telemetry — odometer, speed, RPM, fuel, battery, engine temp, ignition/fault flags, GPS, VIN — for your own diagnostics, debugging, and repair work.

Built from the protocol reverse-engineered in [`../docs/BLE_PROTOCOL.md`](../docs/BLE_PROTOCOL.md). **Read that file, plus its Safety & Scope section, before using this.**

## What this is (and isn't)

- **Is:** a telemetry dashboard, trend-chart, raw-frame logger, and full-register scanner for your own bike — every read-only tag documented in the reverse-engineered protocol (see [`../docs/BLE_PROTOCOL.md`](../docs/BLE_PROTOCOL.md)) is reachable from this app.
- **Isn't:** a vehicle-command tool. There is no seat lock/unlock, immobilize/demobilize, open/close, or FOTA trigger implemented here — on purpose, anywhere in the codebase, including the Full Scan feature. That command channel has documented security weaknesses (see [`../docs/research/BLE_SECURITY_FINDINGS.md`](../docs/research/BLE_SECURITY_FINDINGS.md)); this tool doesn't touch it.
- **Isn't fully verified:** the exact sub-page reassembly logic the OEM app uses for the larger telemetry frames wasn't recoverable from decompilation. This tool assumes the simplest model (each raw notification is a complete frame) and ships with a **Field Map Editor** so you can calibrate offsets against your own dash readings. Treat every dashboard number as provisional until you've checked it.

## Requirements

- **Chrome or Edge** (desktop, or Android Chrome) — Web Bluetooth isn't supported in Firefox or Safari.
- **HTTPS or `http://localhost`** — Web Bluetooth refuses to run over plain `http://` on a non-localhost origin.
- Your bike's BLE dongle powered and advertising (ignition on, typically).

## Running it

### Option A — GitHub Pages (auto-deployed)

Push this repo to GitHub, then in **Settings → Pages**, set **Source** to **GitHub Actions** (one-time setup). The included workflow (`.github/workflows/deploy-pages.yml`) publishes the site on every push to `main`, at `https://<your-username>.github.io/<repo-name>/`.

GitHub Pages serves over HTTPS, which satisfies Web Bluetooth's secure-context requirement — no local server needed once deployed. Note: pair/connect from a device that's actually near your bike (a phone or laptop with Bluetooth), not from GitHub's own servers, which obviously can't reach your dongle.

### Option B — Run locally

From this folder:

```bash
# any static file server works; Python's is built-in on most systems
python -m http.server 8080
```

Then open `http://localhost:8080` in Chrome/Edge.

(Opening `index.html` directly via `file://` will **not** work — Web Bluetooth requires a proper origin.)

## About the stack

- **Tailwind CSS** (via the official Play CDN script, `cdn.tailwindcss.com`) for all styling — no build step, matching this repo's "clone and open" design. If you productionize this, swap the CDN `<script>` for a compiled Tailwind build (CLI or PostCSS) — the CDN build ships the whole utility engine at runtime, which is fine for a personal tool but not ideal for a high-traffic production site.
- **Chart.js** (`cdn.jsdelivr.net/npm/chart.js`) for the History tab's multi-field trend charts.
- Everything else (BLE transport, protocol decoding, UI wiring) is plain vanilla JavaScript — no framework — so the BLE/protocol logic stays easy to audit line-by-line.
- Note on "TailwindUI": the markup here is built with Tailwind CSS (the open-source utility framework) and hand-written component patterns in that style — it doesn't embed Tailwind Labs' commercial TailwindUI component kit, which is a paid, licensed product this repo has no license to redistribute.

## Using it

1. Click **Connect to Bike**, pick your dongle from the browser's device picker. Use **Reconnect** afterwards to relink without re-picking it (works until the browser tab closes).
2. **Dashboard** — live telemetry, with gauge bars on percentage fields (battery/fuel/throttle). Toggle units (metric/imperial) in **Settings**.
3. **Alerts** — every boolean fault/alert flag (side-stand, roll-over, theft, panic, accident, fall-down, speeding, fuel-theft, battery-removal), flashing red when active. Enable "alert sound" in **Settings** to get an audible beep the moment one flips on.
4. **History** — select one or more numeric fields (Ctrl/Cmd-click) for an overlaid live trend chart of this session's readings, exportable as CSV.
5. **Vehicle Info** — on-demand reads of VIN, serial number, firmware version, dongle MAC, and registration status, plus two extra sections:
   - **Security/Handshake fields** (experimental) — reads of `autenticate01`/`autenticate02`/`SMCERT`, whose real shape/purpose wasn't recoverable from decompilation; these are just raw-byte dumps for you to inspect.
   - **Write-targeted registers** (handle with care) — `REGPROC_W`, `cmmdFota`, `phoneControl` are addresses the OEM app *writes* commands to; this tool only ever sends a **read** to them (see the safety note in `js/fieldMap.js`). Read one at a time and watch **Raw Frames** if you try these.
6. **Logs** — trip-log/stat-log first-index and count registers, plus a full paged dump (with a progress bar) of the large `TRACKLOG_PTR`/`statlog_PTR` regions — record layout inside them isn't documented, so this hands you the raw bytes to work out yourself (diff dumps across rides to spot patterns).
7. **FOTA Status** — read-only firmware/FOTA status fields. There's deliberately no button to trigger a FOTA update.
8. **Full Scan** — the "get every possible bit of info" button: walks every known register tag from `bleSpec.csv` with a read-only request and reports the results in a table, exportable as JSON/CSV. Large/paged regions (SMCERT, the two log dumps) and write-targeted registers are opt-in checkboxes, off by default, since they're slower and more exploratory respectively — see the in-tab caption for exactly what's still guaranteed to never write anything.
9. **Raw Frames** — the ground truth: every notification, its checksum status, and hex bytes, exportable as JSON/CSV — the most reliable diagnostic tool here, and the best way to correlate a specific byte with a specific real-world event (rev the engine and watch which bytes move).
10. **Field Map Editor** — tweak byte/bit offsets live (persisted to `localStorage`) if a decoded value doesn't match reality.
11. **Settings** — units, alert sound, and auto-reconnect (automatically retries `Reconnect` after an unexpected disconnect).

The app is also installable as a PWA (look for the install icon in Chrome's address bar) — the UI shell loads instantly/offline via a service worker; Bluetooth itself obviously still needs to be in range of your bike.

## Troubleshooting: bike doesn't show up in the device picker

This is almost always one of these, in order of likelihood:

1. **Something else already has an active BLE connection to the dongle** — most commonly the OEM Hero app, or a stale connection held by the phone's system Bluetooth stack. Most BLE peripherals **stop advertising while connected** to a central, so if the phone (via the OEM app, or via a system-level pairing) is already linked to the dongle, no scan from anywhere — this app, another phone, a laptop — will find it. Fix: force-stop the Hero OneApp (Settings → Apps → Hero OneApp → Force stop), toggle Bluetooth off/on on the phone, then try **Connect to Bike** again promptly, before the OEM app's background service reconnects.
2. **The dongle doesn't advertise its GATT service UUID.** "Connect to Bike" filters by our known service UUID (`uuidFor("00")` in `js/ble.js`), which only matches devices that put that UUID in their advertisement packet — some peripherals only advertise a name/manufacturer data and expose services after connecting. Use the **Scan All (debug)** button instead — it shows every nearby BLE device by name (`acceptAllDevices: true`), bypassing the filter. If you spot your dongle there (usually named something like the TCU model or a generic "BLE"/"HM-1" style name) but "Connect to Bike" can't find it, this is confirmed as the cause, and matching filtered scans will need a name-prefix filter instead of a service filter (edit `js/ble.js`'s `requestOptions` once you know the exact advertised name).
3. **(Android Chrome only) Location permission/services.** Android requires apps — including Chrome — to hold Location permission and have system Location services ON to perform any BLE scan; if either is off, `requestDevice` silently returns an empty list with no error. Check Chrome's site permissions and the phone's Location toggle.
4. **Desktop Chrome/Edge**: confirm the machine's own Bluetooth adapter supports BLE (not just classic Bluetooth) and is turned on — Web Bluetooth uses the machine's radio, not your phone's, unless you're running Chrome on the phone itself.

If "Scan All (debug)" connects but then immediately errors with "doesn't expose the expected vehicle service," you picked a different nearby BLE device (there's often more than one advertising nearby) — try again and look for the dongle specifically.

## Calibration workflow (recommended)

1. Open **Raw Frames**, note the bytes for characteristic 9 while idling with a known odometer reading on the dash.
2. Ride a known short distance, stop, compare the new odometer bytes.
3. If the **Dashboard**'s decoded odometer doesn't match, open **Field Map Editor**, adjust `Odometer`'s `byteStart`/`byteEnd`, save, and check again on the next frames.
4. Repeat for speed, RPM, engine temp, fuel — these are the fields most likely to need adjustment since the “Battery” and “Fuel” fields share identical raw offsets in the source data (see the `note` field already flagged on that card).

## Project structure

```
index.html            — UI shell, tabs, Tailwind/Chart.js CDN includes
manifest.webmanifest   — PWA manifest
sw.js                   — service worker (offline app-shell cache)
icon.svg                 — PWA icon
js/fieldMap.js            — the CSV-derived telemetry field map + the full register address map
js/bitUtils.js              — generic MSB-first bit extraction, checksum helper
js/decoder.js                 — turns raw frames into named values using fieldMap.js
js/ble.js                       — Web Bluetooth transport, VarEx read-only framing, paged reads, reconnect
js/history.js                     — per-field time series store + Chart.js multi-series wrapper
js/app.js                           — UI wiring: dashboard/alerts/history/logs/fota/full-scan rendering, settings, toasts
```

## Extending this

- **Android native version:** see [`../docs/skill/10-diy-ecu-reader-blueprint.md`](../docs/skill/10-diy-ecu-reader-blueprint.md) for the RxAndroidBle-based equivalent architecture — same protocol module design, different transport.
- **More registers:** `REGISTER_MAP` in `js/fieldMap.js` already covers every tag in `../src/main/assets/bleSpec.csv`. If OTC Engineering's protocol has undocumented tags you find elsewhere, add them the same way — with a `group`, a `description`, and `writeTargeted: true` if the OEM app is known to write to that address (see the safety comment above `REGISTER_MAP`).
- **Full Scan as a starting point for real reverse-engineering:** export a Full Scan as JSON right after a ride vs. right after a long idle, diff the two, and you'll likely spot which unlabeled bytes in `CARDATA`/log regions correlate with what — a good next step beyond what static analysis of the OEM app could tell us.

## Ownership & safety

Use this only against a vehicle you own. Don't scan for or connect to other people's dongles. If you find something that looks like it'd work on more than just your own bike (e.g. Finding 2 in the security-findings doc), that's a responsible-disclosure opportunity, not a feature request for this tool — see [`../docs/research/BLE_SECURITY_FINDINGS.md`](../docs/research/BLE_SECURITY_FINDINGS.md) and [`../docs/research/DISCLOSURE_REPORT_TEMPLATE.md`](../docs/research/DISCLOSURE_REPORT_TEMPLATE.md).
