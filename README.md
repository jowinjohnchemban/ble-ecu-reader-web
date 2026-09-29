# DIY ECU / Telematics Reader (Web Bluetooth)

A read-only web app that connects to your motorcycle's BLE telematics dongle and decodes live telemetry — odometer, speed, RPM, fuel, battery, engine temp, ignition/fault flags, GPS, VIN — for your own diagnostics, debugging, and repair work.

Built from the protocol reverse-engineered in [`../docs/BLE_PROTOCOL.md`](../docs/BLE_PROTOCOL.md). **Read that file, plus its Safety & Scope section, before using this.**

## What this is (and isn't)

- **Is:** a telemetry dashboard + raw-frame logger for your own bike, plus a register reader for VIN/serial/firmware version.
- **Isn't:** a vehicle-command tool. There is no seat lock/unlock, immobilize/demobilize, open/close, or FOTA trigger implemented here — on purpose. That command channel has documented security weaknesses (see [`../docs/research/BLE_SECURITY_FINDINGS.md`](../docs/research/BLE_SECURITY_FINDINGS.md)); this tool doesn't touch it.
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

## Using it

1. Click **Connect to Bike**, pick your dongle from the browser's device picker.
2. The **Dashboard** tab starts filling in as telemetry notifications arrive.
3. The **Alerts** tab shows every boolean fault/alert flag (side-stand, roll-over, theft, panic, accident, fall-down, speeding, fuel-theft, battery-removal), lit up red when active.
4. The **Registers** tab lets you request VIN/serial/firmware version on demand — this path is more experimental than the notify-based dashboard (see code comments in `js/ble.js`); if it times out, that's expected until the exact opcode is confirmed against your dongle.
5. The **Raw Frames** tab is the ground truth: every notification, its checksum status, and hex bytes, exportable as JSON/CSV for offline analysis (Excel, Python/pandas, etc.) — this is the most reliable diagnostic tool here, and the best way to correlate a specific byte with a specific real-world event (rev the engine and watch which bytes move).
6. The **Field Map Editor** lets you tweak byte/bit offsets live (persisted to your browser's `localStorage`) if a decoded value doesn't match reality.

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
index.html          — UI shell, tabs
css/style.css        — styling
js/fieldMap.js        — the CSV-derived field map + register address map (edit here, or via the in-app editor)
js/bitUtils.js         — generic MSB-first bit extraction, checksum helper
js/decoder.js           — turns raw frames into named values using fieldMap.js
js/ble.js                — Web Bluetooth transport, VarEx read-only framing
js/app.js                 — UI wiring, dashboard/alerts rendering, raw log, export, field map editor
```

## Extending this

- **Android native version:** see [`../docs/skill/10-diy-ecu-reader-blueprint.md`](../docs/skill/10-diy-ecu-reader-blueprint.md) for the RxAndroidBle-based equivalent architecture — same protocol module design, different transport.
- **Charting/history:** the raw-frame array in `app.js` (`rawFrames`) already has everything needed to drive a simple canvas sparkline per field if you want trend lines instead of just current values.
- **More registers:** add entries to `REGISTER_MAP` in `js/fieldMap.js` using addresses from `../src/main/assets/bleSpec.csv` (only add **read** tags — see the scope note above for why write tags are deliberately excluded).

## Ownership & safety

Use this only against a vehicle you own. Don't scan for or connect to other people's dongles. If you find something that looks like it'd work on more than just your own bike (e.g. Finding 2 in the security-findings doc), that's a responsible-disclosure opportunity, not a feature request for this tool — see [`../docs/research/BLE_SECURITY_FINDINGS.md`](../docs/research/BLE_SECURITY_FINDINGS.md) and [`../docs/research/DISCLOSURE_REPORT_TEMPLATE.md`](../docs/research/DISCLOSURE_REPORT_TEMPLATE.md).
