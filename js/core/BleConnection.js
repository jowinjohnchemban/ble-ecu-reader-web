// core/BleConnection.js — Web Bluetooth transport for the OTC Engineering vehicle dongle
// protocol. See ../../docs/BLE_PROTOCOL.md for the protocol this implements.
//
// Scope, by design: this file only ever READS. It subscribes to notifications and issues
// VarEx *read* requests. It does not implement REGPROC_W, cmmdFota, or any RemoteAction
// (seat lock/unlock, immobilize/demobilize, open/close, buzzer) command encoding. See
// docs/skill/10-diy-ecu-reader-blueprint.md for why, and docs/research/BLE_SECURITY_FINDINGS.md
// for the security issues found in the command channel that make "just add the write path"
// a bad idea to casually bolt on here.
//
// Extends EventTarget so the rest of the app can subscribe without a bespoke pub/sub —
// dispatches "frame" (detail: {charNumber, bytes}) and "statechange" (detail: {state, detail}).

const UUID_SUFFIX = "10676e-6972-6565-6e69-676e4543544f";
export const uuidFor = (code) => `${code.toLowerCase().padStart(2, "0")}${UUID_SUFFIX}`;

export const CHAR_CODES = {
  service: "00",
  varexWrite: "01", // command out
  varexAck: "02", // command ack in
  varexRead: "03", // read-request out
  varexData: "04", // read-ack/data in
  telemetry9: "09",
  telemetry10: "0a",
  telemetry11: "0b",
  telemetry12: "0c",
  heartbeat: "99",
};

const CHAR_NUMBER_BY_CODE = { "09": 9, "0a": 10, "0b": 11, "0c": 12 };

export class BleConnection extends EventTarget {
  constructor() {
    super();
    this.device = null;
    this.server = null;
    this.service = null;
    this._varexAckWaiters = [];
  }

  _setState(state, detail) {
    this.dispatchEvent(new CustomEvent("statechange", { detail: { state, detail } }));
  }

  // All 256 possible single-byte-prefix UUIDs in the OTC "base suffix" family. Web
  // Bluetooth only allows querying services listed in `optionalServices` at request time
  // (a deliberate privacy restriction — pages can't fingerprint arbitrary GATT services on
  // a device) so to find out which service code a given dongle actually uses, we have to
  // ask for all of them up front and see which ones resolve. See exploreServices() below.
  static ALL_OTC_SERVICE_CODES = Array.from({ length: 256 }, (_, i) => uuidFor(i.toString(16)));

  // mode: "filtered" (default) only shows devices advertising our assumed service UUID —
  // most reliable once it works, but many BLE peripherals don't put their GATT service
  // UUID in the advertisement packet at all, in which case this filter shows nothing even
  // though the device is right there and connectable. mode: "debug-all" bypasses the
  // filter entirely (shows every nearby BLE device by name) so you can find the dongle and
  // confirm whether that's actually the problem. mode: "explore" also bypasses the filter,
  // but additionally requests access to every possible OTC-family service code (see
  // exploreServices()) instead of assuming code "00" — use this when "debug-all" connects
  // but then fails with "doesn't expose the expected vehicle service", which means this
  // specific hardware revision uses a different service code than the one reverse-engineered
  // from the reference app. See README's Troubleshooting section.
  async connect({ mode = "filtered" } = {}) {
    if (!navigator.bluetooth) {
      throw new Error("Web Bluetooth isn't available. Use Chrome or Edge, over HTTPS or http://localhost, on desktop or Android.");
    }

    this._setState("requesting");
    let requestOptions;
    if (mode === "explore") {
      requestOptions = { acceptAllDevices: true, optionalServices: BleConnection.ALL_OTC_SERVICE_CODES };
    } else if (mode === "debug-all") {
      requestOptions = { acceptAllDevices: true, optionalServices: [uuidFor(CHAR_CODES.service)] };
    } else {
      requestOptions = { filters: [{ services: [uuidFor(CHAR_CODES.service)] }], optionalServices: [uuidFor(CHAR_CODES.service)] };
    }
    this.device = await navigator.bluetooth.requestDevice(requestOptions);

    this.device.addEventListener("gattserverdisconnected", () => this._setState("disconnected"));

    this._setState("connecting");
    this.server = await this.device.gatt.connect();

    if (mode === "explore") {
      // Don't assume anything about characteristics — the caller inspects
      // exploreServices() output and decides what to do next.
      this._setState("connected", { name: this.device.name, exploring: true });
      return this.device;
    }

    try {
      this.service = await this.server.getPrimaryService(uuidFor(CHAR_CODES.service));
    } catch (err) {
      throw new Error(
        `Connected to "${this.device.name || "device"}" but it doesn't expose the expected vehicle service. ` +
          `Try the "Explore Device" tool to find out what service codes this specific dongle actually uses. ` +
          `Original error: ${err.message}`
      );
    }

    await this._subscribeTelemetry();
    await this._subscribeVarExAck();

    this._setState("connected", { name: this.device.name });
    return this.device;
  }

  // Enumerates every GATT primary service (and its characteristics) that this connection
  // was granted access to — meaningful only after connect({mode: "explore"}), since that's
  // the mode that requested broad access. Returns [{ uuid, otcCode, characteristics: [{uuid, properties}] }].
  // otcCode is the matching 2-hex-digit prefix if this UUID fits the OTC family, else null —
  // that's the number you'd plug into CHAR_CODES if you were extending this app for a new
  // hardware revision.
  async exploreServices() {
    if (!this.server) throw new Error("Not connected");
    const services = await this.server.getPrimaryServices();
    const results = [];
    for (const service of services) {
      let characteristics = [];
      try {
        const chars = await service.getCharacteristics();
        characteristics = chars.map((c) => ({
          uuid: c.uuid,
          properties: Object.entries(c.properties)
            .filter(([, supported]) => supported)
            .map(([name]) => name),
        }));
      } catch (err) {
        characteristics = [{ uuid: "(failed to enumerate)", properties: [err.message] }];
      }
      const otcMatch = /^([0-9a-f]{2})10676e-6972-6565-6e69-676e4543544f$/i.exec(service.uuid);
      results.push({ uuid: service.uuid, otcCode: otcMatch ? otcMatch[1] : null, characteristics });
    }
    return results;
  }

  // Re-establishes the GATT connection to the same device without a new device picker —
  // the browser retains permission for a device once granted (for this origin/session).
  async reconnect() {
    if (!this.device) throw new Error("No previously connected device to reconnect to.");
    this._setState("connecting");
    this.server = await this.device.gatt.connect();
    this.service = await this.server.getPrimaryService(uuidFor(CHAR_CODES.service));
    await this._subscribeTelemetry();
    await this._subscribeVarExAck();
    this._setState("connected", { name: this.device.name });
    return this.device;
  }

  disconnect() {
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
  }

  async _subscribeTelemetry() {
    for (const code of ["09", "0a", "0b", "0c"]) {
      try {
        const char = await this.service.getCharacteristic(uuidFor(code));
        await char.startNotifications();
        char.addEventListener("characteristicvaluechanged", (e) => {
          const bytes = new Uint8Array(e.target.value.buffer);
          this.dispatchEvent(new CustomEvent("frame", { detail: { charNumber: CHAR_NUMBER_BY_CODE[code], bytes } }));
        });
      } catch (err) {
        console.warn(`Characteristic ${code} not available on this dongle:`, err.message);
      }
    }
  }

  async _subscribeVarExAck() {
    try {
      this.varexAckChar = await this.service.getCharacteristic(uuidFor(CHAR_CODES.varexAck));
      await this.varexAckChar.startNotifications();
      this.varexAckChar.addEventListener("characteristicvaluechanged", (e) => {
        const bytes = new Uint8Array(e.target.value.buffer);
        const waiter = this._varexAckWaiters.shift();
        if (waiter) waiter(bytes);
      });
    } catch (err) {
      console.warn("VarEx ack characteristic not available:", err.message);
    }
  }

  // Sends a read request for a named register (see core/fieldMap.js REGISTER_MAP) using
  // the VarEx frame format from docs/BLE_PROTOCOL.md §2. Opcode value is a best guess
  // (0x01) transcribed from the app's read-path constant naming — confirm against your
  // own dongle's response before trusting it; if you get no ack, try 0x02 instead.
  async readRegister(address, length, { opcode = 0x01, timeoutMs = 2000 } = {}) {
    if (!this.service) throw new Error("Not connected");
    const writeChar = await this.service.getCharacteristic(uuidFor(CHAR_CODES.varexWrite));

    const frame = new Uint8Array(20);
    frame[0] = opcode;
    frame[1] = (address >>> 24) & 0xff;
    frame[2] = (address >>> 16) & 0xff;
    frame[3] = (address >>> 8) & 0xff;
    frame[4] = address & 0xff;
    frame[5] = (length >>> 8) & 0xff;
    frame[6] = length & 0xff;
    let checksum = 0;
    for (let i = 0; i < 19; i++) checksum = (checksum + frame[i]) & 0xff;
    frame[19] = checksum;

    const ackPromise = new Promise((resolve, reject) => {
      this._varexAckWaiters.push(resolve);
      setTimeout(() => reject(new Error("VarEx read timed out — no ack received")), timeoutMs);
    });

    await writeChar.writeValueWithResponse(frame);
    return ackPromise;
  }

  // For the large paged regions (TRACKLOG_PTR / statlog_PTR / SMCERT) — reads in fixed-size
  // chunks, incrementing the address each time, and concatenates the results. The real
  // chunking/pagination scheme used by the dongle firmware isn't confirmed (see
  // docs/BLE_PROTOCOL.md) — this is a reasonable guess (16 bytes/read, matching the VarEx
  // frame payload size) for exploration purposes. onProgress(bytesRead, totalBytes) is
  // optional, for a progress bar on a large pull.
  async readRegisterPaged(address, totalLength, { chunkSize = 16, onProgress, opcode = 0x01 } = {}) {
    const result = new Uint8Array(totalLength);
    let offset = 0;
    while (offset < totalLength) {
      const len = Math.min(chunkSize, totalLength - offset);
      const chunk = await this.readRegister(address + offset, len, { opcode });
      result.set(chunk.slice(0, len), offset);
      offset += len;
      if (onProgress) onProgress(offset, totalLength);
    }
    return result;
  }
}
