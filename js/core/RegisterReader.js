// core/RegisterReader.js — shared "read a named register and format the result" helper,
// used by every panel that offers register-read buttons (Vehicle Info, Logs, FOTA Status,
// Full Scan). Keeping this in one place means the hex/ascii formatting and error messaging
// stay consistent everywhere a register gets read, instead of four slightly-different
// copies drifting apart over time.

import { REGISTER_MAP } from "./fieldMap.js";
import { toHex, asciiPreview } from "./bitUtils.js";

export async function readNamedRegister(ble, name) {
  const reg = REGISTER_MAP[name];
  if (!reg) throw new Error(`Unknown register: ${name}`);
  const bytes = reg.paged ? await ble.readRegisterPaged(reg.address, reg.length) : await ble.readRegister(reg.address, reg.length);
  return { reg, bytes, hex: toHex(bytes), ascii: asciiPreview(bytes) };
}

export function formatRegisterResult(name, hex, ascii) {
  return `${name}:\nhex: ${hex}\nascii: ${ascii}`;
}

export function formatRegisterError(name, err) {
  return `${name}: failed — ${err.message}\n\nThis is expected if the opcode/frame assumptions in core/BleConnection.js don't match your dongle's firmware. Check the Raw Frames tab while retrying to see what (if anything) comes back.`;
}
