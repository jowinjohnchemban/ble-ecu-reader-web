// core/bitUtils.js — generic bit-field extraction, driven entirely by fieldMap.js.
// No per-field magic numbers live in code; if a field looks wrong, fix the map, not this file.

// Reads an inclusive bit range [byteStart:bitStart .. byteEnd:bitEnd) MSB-first.
// bitStart/bitEnd follow the source CSV's own convention: bitEnd == 8 means "through
// the end of that byte". This is an assumption (see core/fieldMap.js header) — if decoded
// values consistently look bit-reversed or byte-swapped vs. your dash, flip BIT_ORDER.
export const BIT_ORDER = "msb-first";

export function extractBits(bytes, byteStart, bitStart, byteEnd, bitEnd) {
  let value = 0n;
  for (let b = byteStart; b <= byteEnd; b++) {
    const byte = bytes[b] ?? 0;
    const lo = b === byteStart ? bitStart : 0;
    const hi = b === byteEnd ? bitEnd : 8;
    for (let bit = lo; bit < hi; bit++) {
      const bitVal = BIT_ORDER === "msb-first" ? (byte >> (7 - bit)) & 1 : (byte >> bit) & 1;
      value = (value << 1n) | BigInt(bitVal);
    }
  }
  return value;
}

export function decodeField(bytes, field) {
  const raw = extractBits(bytes, field.byteStart, field.bitStart, field.byteEnd, field.bitEnd);
  switch (field.kind) {
    case "bool":
      return raw !== 0n;
    case "ascii": {
      let str = "";
      for (let b = field.byteStart; b <= field.byteEnd; b++) {
        const c = bytes[b] ?? 0;
        if (c >= 0x20 && c < 0x7f) str += String.fromCharCode(c);
      }
      return str.trim();
    }
    case "uint":
    default:
      return Number(raw);
  }
}

export function toHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}

export function asciiPreview(bytes) {
  return Array.from(bytes)
    .map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : "."))
    .join("");
}

export function simpleChecksum(bytes, upTo) {
  let sum = 0;
  for (let i = 0; i < upTo; i++) sum = (sum + bytes[i]) & 0xff;
  return sum;
}
