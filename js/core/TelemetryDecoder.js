// core/TelemetryDecoder.js — turns raw 20-byte BLE notifications into named values.
// Also runs the frame checksum and exposes both the decoded values AND the raw bytes,
// because for a genuinely unverified protocol, the raw log is the ground truth.

import { decodeField, toHex, simpleChecksum } from "./bitUtils.js";

export class TelemetryDecoder {
  constructor(fieldMap) {
    this.fieldMap = fieldMap;
  }

  setFieldMap(fieldMap) {
    this.fieldMap = fieldMap;
  }

  // charNumber: 9, 10, or 11 (matches CSV "CARACTERISTICA" numbering / char codes 09/0A/0B)
  process(charNumber, bytes) {
    const timestamp = Date.now();
    const subPage = bytes[17];
    const checksumByte = bytes[16];
    const computedChecksum = simpleChecksum(bytes, 16);
    const checksumOk = checksumByte === computedChecksum;

    const entry = {
      timestamp,
      charNumber,
      subPage,
      raw: bytes,
      rawHex: toHex(bytes),
      checksumOk,
      decoded: {},
      variant: null,
    };

    const def = this.fieldMap[charNumber];
    if (def) {
      if (def.fields) {
        for (const field of def.fields) {
          if (field.internal) continue;
          entry.decoded[field.name] = { value: decodeField(bytes, field), unit: field.unit, note: field.note };
        }
      } else if (def.variants) {
        // Best-effort: try every variant, pick whichever is listed first as "the" decode.
        // This is a heuristic stand-in for the real sub-page dispatch logic we don't have.
        for (const [key, variant] of Object.entries(def.variants)) {
          const decoded = {};
          for (const field of variant.fields) {
            if (field.internal) continue;
            decoded[field.name] = { value: decodeField(bytes, field), unit: field.unit, note: field.note };
          }
          if (entry.variant === null) {
            entry.variant = key;
            entry.decoded = decoded;
          }
          entry.allVariants = entry.allVariants || {};
          entry.allVariants[key] = decoded;
        }
      }
    }

    return entry;
  }
}
