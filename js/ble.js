// ble.js — Web Bluetooth transport for the OTC Engineering vehicle dongle protocol.
// See ../../docs/BLE_PROTOCOL.md for the protocol this implements.
//
// Scope, by design: this file only ever READS. It subscribes to notifications and issues
// VarEx *read* requests (VIN/serial/firmware version). It does not implement REGPROC_W,
// cmmdFota, or any RemoteAction (seat lock/unlock, immobilize/demobilize, open/close,
// buzzer) command encoding. See docs/skill/10-diy-ecu-reader-blueprint.md for why, and
// docs/research/BLE_SECURITY_FINDINGS.md for the security issues found in the command
// channel that make "just add the write path" a bad idea to casually bolt on here.

const UUID_SUFFIX = "10676e-6972-6565-6e69-676e4543544f";
const uuidFor = (code) => `${code.toLowerCase().padStart(2, "0")}${UUID_SUFFIX}`;

const CHAR_CODES = {
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

class VehicleBleConnection {
  constructor() {
    this.device = null;
    this.server = null;
    this.service = null;
    this.frameListeners = [];
    this.stateListeners = [];
    this._varexAckWaiters = [];
  }

  onFrame(cb) {
    this.frameListeners.push(cb);
  }

  onStateChange(cb) {
    this.stateListeners.push(cb);
  }

  _setState(state, detail) {
    this.stateListeners.forEach((cb) => cb(state, detail));
  }

  async connect() {
    if (!navigator.bluetooth) {
      throw new Error(
        "Web Bluetooth isn't available. Use Chrome or Edge, over HTTPS or http://localhost, on desktop or Android."
      );
    }

    this._setState("requesting");
    this.device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [uuidFor(CHAR_CODES.service)] }],
      optionalServices: [uuidFor(CHAR_CODES.service)],
    });

    this.device.addEventListener("gattserverdisconnected", () => this._setState("disconnected"));

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
          this.frameListeners.forEach((cb) => cb(CHAR_NUMBER_BY_CODE[code], bytes));
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

  // Sends a read request for a named register (see fieldMap.js REGISTER_MAP) using the
  // VarEx frame format from docs/BLE_PROTOCOL.md §2. Opcode value is a best guess (0x01)
  // transcribed from the app's read-path constant naming — confirm against your own
  // dongle's response before trusting it; if you get no ack, try 0x02 instead.
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
}

if (typeof module !== "undefined") module.exports = { VehicleBleConnection, uuidFor, CHAR_CODES };
