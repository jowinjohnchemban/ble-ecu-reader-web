// fieldMap.js
// Default telemetry field map, transcribed from the OEM app's assets/bleCharacteristics.csv.
// See ../../docs/BLE_PROTOCOL.md for the protocol writeup this is based on.
//
// IMPORTANT — read this before trusting a single decoded number:
// The OEM app fragments each "characteristic" across multiple sub-page notifications
// (its decompiled code references up to 10 sub-pages for characteristic 9 and 33 for
// characteristic 11) and reassembles them before applying offsets like the ones below.
// That reassembly logic was NOT recoverable from decompilation (the relevant class body
// was missing). This field map instead assumes the SIMPLEST possible model — that each
// raw 20-byte notification already contains a complete frame matching these offsets
// directly. That assumption may be wrong for some fields. Use the "Raw Frames" tab to
// compare raw bytes against known-good values (trip meter, GPS, RPM on your dash) and
// edit this map (via the in-app Field Map Editor, persisted to localStorage) until the
// decoded values line up. Treat every value from the "Dashboard" tab as provisional
// until you've personally verified it against your bike.
//
// Bit-offset semantics: {byteStart, bitStart, byteEnd, bitEnd} describes an inclusive
// bit range read MSB-first within each byte, byteStart..byteEnd. This is an assumption,
// not a confirmed fact — flip BIT_ORDER in bitUtils.js if your readings look byte-reversed
// or bit-reversed compared to the dash.

const FIELD_MAP = {
  // Characteristic 0x09 — "CARACTERISTICA 09": core vehicle status
  9: {
    label: "Vehicle Status",
    fields: [
      { name: "DONGLE", byteStart: 0, bitStart: 0, byteEnd: 0, bitEnd: 8, unit: "", kind: "uint" },
      { name: "Odometer", byteStart: 1, bitStart: 0, byteEnd: 3, bitEnd: 8, unit: "km", kind: "uint" },
      { name: "GearShiftPattern", byteStart: 4, bitStart: 0, byteEnd: 4, bitEnd: 8, unit: "", kind: "uint" },
      { name: "DrivingTimeHour", byteStart: 6, bitStart: 4, byteEnd: 6, bitEnd: 8, unit: "h", kind: "uint" },
      { name: "DrivingTimeMinute", byteStart: 5, bitStart: 6, byteEnd: 6, bitEnd: 4, unit: "m", kind: "uint" },
      { name: "DrivingTimeSeconds", byteStart: 5, bitStart: 0, byteEnd: 5, bitEnd: 6, unit: "s", kind: "uint" },
      { name: "Battery", byteStart: 7, bitStart: 0, byteEnd: 8, bitEnd: 8, unit: "%", kind: "uint" },
      { name: "Fuel", byteStart: 7, bitStart: 0, byteEnd: 8, bitEnd: 8, unit: "%", kind: "uint", note: "Shares raw offsets with Battery in source CSV — verify which is which on your bike." },
      { name: "SideStandFault", byteStart: 9, bitStart: 0, byteEnd: 9, bitEnd: 1, unit: "", kind: "bool" },
      { name: "SideStand", byteStart: 9, bitStart: 1, byteEnd: 9, bitEnd: 2, unit: "", kind: "bool" },
      { name: "RollOverFault", byteStart: 9, bitStart: 2, byteEnd: 9, bitEnd: 3, unit: "", kind: "bool" },
      { name: "RollOver", byteStart: 9, bitStart: 3, byteEnd: 9, bitEnd: 4, unit: "", kind: "bool" },
      { name: "EngineTempStatus", byteStart: 9, bitStart: 4, byteEnd: 9, bitEnd: 5, unit: "", kind: "bool" },
      { name: "SeatLockStatus", byteStart: 9, bitStart: 5, byteEnd: 9, bitEnd: 6, unit: "", kind: "bool" },
      { name: "ImmoStatus", byteStart: 9, bitStart: 6, byteEnd: 9, bitEnd: 7, unit: "", kind: "bool" },
      { name: "SpeedFault", byteStart: 9, bitStart: 7, byteEnd: 9, bitEnd: 8, unit: "", kind: "bool" },
      { name: "Ignition", byteStart: 10, bitStart: 0, byteEnd: 10, bitEnd: 1, unit: "", kind: "bool" },
      { name: "FuelTheftAlert", byteStart: 10, bitStart: 1, byteEnd: 10, bitEnd: 2, unit: "", kind: "bool" },
      { name: "BatteryRemovalAlert", byteStart: 10, bitStart: 2, byteEnd: 10, bitEnd: 3, unit: "", kind: "bool" },
      { name: "SpeedingAlert", byteStart: 10, bitStart: 3, byteEnd: 10, bitEnd: 4, unit: "", kind: "bool" },
      { name: "TheftAlert", byteStart: 10, bitStart: 4, byteEnd: 10, bitEnd: 5, unit: "", kind: "bool" },
      { name: "AccidentAlert", byteStart: 10, bitStart: 5, byteEnd: 10, bitEnd: 6, unit: "", kind: "bool" },
      { name: "FalldownAlert", byteStart: 10, bitStart: 6, byteEnd: 10, bitEnd: 7, unit: "", kind: "bool" },
      { name: "PanicAlert", byteStart: 10, bitStart: 7, byteEnd: 10, bitEnd: 8, unit: "", kind: "bool" },
      { name: "ThrottleOpening", byteStart: 11, bitStart: 0, byteEnd: 12, bitEnd: 8, unit: "%", kind: "uint" },
      { name: "McuFwVer", byteStart: 12, bitStart: 0, byteEnd: 13, bitEnd: 8, unit: "", kind: "uint" },
      { name: "Ch9Checksum", byteStart: 16, bitStart: 0, byteEnd: 16, bitEnd: 8, unit: "", kind: "uint", internal: true },
    ],
  },

  // Characteristic 0x0A — "CARACTERISTICA 10": RTC + GPS
  10: {
    label: "Date/Time & GPS",
    fields: [
      { name: "Year", byteStart: 0, bitStart: 0, byteEnd: 0, bitEnd: 8, unit: "", kind: "uint" },
      { name: "Month", byteStart: 1, bitStart: 0, byteEnd: 1, bitEnd: 8, unit: "", kind: "uint" },
      { name: "Day", byteStart: 2, bitStart: 0, byteEnd: 2, bitEnd: 8, unit: "", kind: "uint" },
      { name: "Hour", byteStart: 3, bitStart: 0, byteEnd: 3, bitEnd: 8, unit: "", kind: "uint" },
      { name: "Minute", byteStart: 4, bitStart: 0, byteEnd: 4, bitEnd: 8, unit: "", kind: "uint" },
      { name: "Second", byteStart: 5, bitStart: 0, byteEnd: 5, bitEnd: 8, unit: "", kind: "uint" },
      { name: "LatitudeDegrees", byteStart: 6, bitStart: 0, byteEnd: 7, bitEnd: 8, unit: "", kind: "uint" },
      { name: "LatitudeDecimals", byteStart: 8, bitStart: 0, byteEnd: 9, bitEnd: 8, unit: "", kind: "uint" },
      { name: "LongitudeDegrees", byteStart: 10, bitStart: 0, byteEnd: 11, bitEnd: 8, unit: "", kind: "uint" },
      { name: "LongitudeDecimals", byteStart: 12, bitStart: 0, byteEnd: 13, bitEnd: 8, unit: "", kind: "uint" },
      { name: "Ch10Checksum", byteStart: 16, bitStart: 0, byteEnd: 16, bitEnd: 8, unit: "", kind: "uint", internal: true },
    ],
  },

  // Characteristic 0x0B — "CARACTERISTICA 11": two alternate framings (VIN vs. live stats),
  // presumably distinguished by the sub-page index byte (byte 17) — unconfirmed, calibrate.
  11: {
    label: "VIN / Logs / Live Stats",
    variants: {
      vin: {
        label: "VIN frame",
        fields: [
          { name: "Vin", byteStart: 0, bitStart: 0, byteEnd: 16, bitEnd: 8, unit: "", kind: "ascii" },
          { name: "Ch11ChecksumA", byteStart: 17, bitStart: 0, byteEnd: 17, bitEnd: 8, unit: "", kind: "uint", internal: true },
        ],
      },
      stats: {
        label: "Live stats frame",
        fields: [
          { name: "Tracklog0", byteStart: 0, bitStart: 0, byteEnd: 0, bitEnd: 8, unit: "", kind: "uint" },
          { name: "TracklogN", byteStart: 1, bitStart: 0, byteEnd: 1, bitEnd: 8, unit: "", kind: "uint" },
          { name: "Statlog0", byteStart: 2, bitStart: 0, byteEnd: 2, bitEnd: 8, unit: "", kind: "uint" },
          { name: "StatlogN", byteStart: 3, bitStart: 0, byteEnd: 3, bitEnd: 8, unit: "", kind: "uint" },
          { name: "Errorlog0", byteStart: 4, bitStart: 0, byteEnd: 4, bitEnd: 8, unit: "", kind: "uint" },
          { name: "ErrorlogN", byteStart: 5, bitStart: 0, byteEnd: 5, bitEnd: 8, unit: "", kind: "uint" },
          { name: "DiagnosislogPending", byteStart: 6, bitStart: 0, byteEnd: 6, bitEnd: 8, unit: "", kind: "uint" },
          { name: "Speed", byteStart: 7, bitStart: 0, byteEnd: 8, bitEnd: 8, unit: "km/h", kind: "uint" },
          { name: "EngineSpeed", byteStart: 9, bitStart: 0, byteEnd: 10, bitEnd: 8, unit: "RPM", kind: "uint" },
          { name: "EngineTemperature", byteStart: 11, bitStart: 0, byteEnd: 12, bitEnd: 8, unit: "°C", kind: "uint" },
          { name: "DistanceWithMil", byteStart: 13, bitStart: 0, byteEnd: 14, bitEnd: 8, unit: "km", kind: "uint" },
          { name: "Heartbeat", byteStart: 15, bitStart: 0, byteEnd: 15, bitEnd: 8, unit: "", kind: "uint" },
          { name: "Ch11ChecksumB", byteStart: 16, bitStart: 0, byteEnd: 16, bitEnd: 8, unit: "", kind: "uint", internal: true },
        ],
      },
    },
  },
};

// Register/VarEx address map, transcribed in full from assets/bleSpec.csv — every named
// tag the OEM app's protocol defines. See js/varex.js / js/ble.js.
//
// SAFETY DESIGN, read this before adding anything here: every entry below is only ever
// used with a *read* VarEx opcode (see ble.js readRegister/readRegisterPaged) — this file
// contains no write payloads and app.js never sends one. That holds even for the three
// entries marked `writeTargeted: true` (REGPROC_W, cmmdFota, phoneControl) — in the OEM
// app these addresses are where *commands* get written (register the TCU, trigger FOTA,
// control phone-call state), but reading the current value stored there is a passive
// query, not an action, in a normal register-style protocol. We don't have firmware
// source to *prove* a read has zero side effects on every dongle revision, so those three
// are flagged in the UI as "handle with care" and are excluded from the default Full Scan
// sweep (opt-in only) — see docs/research/BLE_SECURITY_FINDINGS.md for the broader context
// on why this protocol deserves that caution. We still never construct or send a write
// frame to any of them, on any bike, ever, in this codebase.
const REGISTER_MAP = {
  CARDATA: { address: 0x287c, length: 22, group: "vehicle", description: "Aggregate vehicle data block" },
  SN: { address: 0x2ac4, length: 8, group: "vehicle", description: "Dongle serial number" },
  FW_VER: { address: 0x2acc, length: 2, group: "vehicle", description: "Dongle firmware version" },
  MGD_MAC: { address: 0x237a, length: 7, group: "vehicle", description: "Managed/paired MAC address" },
  REGPROC_R: { address: 0x2ab4, length: 2, group: "vehicle", description: "Registration process status (read side)" },

  TRACKLOG_0: { address: 0x2ab9, length: 1, group: "logs", description: "Trip log: first record index" },
  TRACKLOG_N: { address: 0x2ab8, length: 1, group: "logs", description: "Trip log: record count" },
  TRACKLOG_00: { address: 0x2267, length: 1, group: "logs", description: "Trip log: page 0 marker" },
  TRACKLOG_PTR: { address: 0x10800, length: 1000, group: "logs", paged: true, description: "Trip log: full paged record region (record layout unknown — raw bytes only)" },
  statlog_0: { address: 0x2ad7, length: 1, group: "logs", description: "Stat log: first record index" },
  statlog_N: { address: 0x2ad6, length: 1, group: "logs", description: "Stat log: record count" },
  statlog_00: { address: 0x2269, length: 1, group: "logs", description: "Stat log: page 0 marker" },
  statlog_PTR: { address: 0x30800, length: 1000, group: "logs", paged: true, description: "Stat log: full paged record region (record layout unknown — raw bytes only)" },

  fotaResult: { address: 0x2adc, length: 1, group: "fota", description: "Last FOTA update result code" },
  fotaState: { address: 0x3e32, length: 1, group: "fota", description: "Current FOTA state machine value" },
  fotaImgA: { address: 0x2ade, length: 2, group: "fota", description: "FOTA image slot A version" },
  fotaImgB: { address: 0x2ae0, length: 2, group: "fota", description: "FOTA image slot B version" },
  fotaNewFW: { address: 0x2272, length: 2, group: "fota", description: "Available new firmware version, if any" },
  phoneState: { address: 0x2aef, length: 1, group: "fota", description: "Phone-side connection/call state as seen by dongle" },
  NotifEnable: { address: 0x2276, length: 1, group: "fota", description: "Notification-enable flags" },

  autenticate01: { address: 0x81a, length: 16, group: "security", experimental: true, description: "Auth handshake field 1 (shape/purpose not confirmed from decompilation — see docs/BLE_PROTOCOL.md §4)" },
  autenticate02: { address: 0x82a, length: 4, group: "security", experimental: true, description: "Auth handshake field 2 (shape/purpose not confirmed from decompilation)" },
  SMCERT: { address: 0x2042, length: 509, group: "security", paged: true, experimental: true, description: "509-byte cert-shaped blob (X.509?) — direction/purpose not confirmed" },

  // "Handle with care": these addresses are where the OEM app WRITES commands. We only ever
  // READ them here (current stored value), never write — but that guarantee is about our
  // code, not about how the dongle firmware reacts to an unexpected read. Excluded from the
  // default Full Scan; read individually and watch the Raw Frames tab if you try these.
  REGPROC_W: { address: 0x2000, length: 2, group: "writeTargeted", writeTargeted: true, description: "Registration command register (OEM app WRITEs here — we only read)" },
  cmmdFota: { address: 0x2270, length: 1, group: "writeTargeted", writeTargeted: true, description: "FOTA trigger register (OEM app WRITEs here to start FOTA — we only read)" },
  phoneControl: { address: 0x2274, length: 1, group: "writeTargeted", writeTargeted: true, description: "Phone-control register (OEM app WRITEs here — we only read)" },
};

if (typeof module !== "undefined") module.exports = { FIELD_MAP, REGISTER_MAP };
