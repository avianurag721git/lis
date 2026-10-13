/** Thermal barcode label printer integration (Zebra / TSC / Xprinter). */

export type LabelDialect = "ZPL" | "EPL";

export type LabelSizeMm = {
  widthMm?: number;
  heightMm?: number;
  /** Dots per mm (e.g. 8 = 203 dpi, 12 = 300 dpi). */
  dpmm?: number;
};

export type BarcodeLabelPayload = {
  barcode: string;
  title?: string;
  subtitle?: string;
  patientName?: string;
  sampleType?: string;
  copies?: number;
};

export type PrinterTransport = "webhid" | "webusb" | "websocket";

export type PrintResult = {
  ok: true;
  transport: PrinterTransport;
  bytesSent: number;
};

export type PrinterErrorCode =
  | "UNSUPPORTED"
  | "PERMISSION_DENIED"
  | "DEVICE_NOT_FOUND"
  | "AGENT_UNAVAILABLE"
  | "WRITE_FAILED";

export class PrinterError extends Error {
  readonly code: PrinterErrorCode;
  constructor(code: PrinterErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "PrinterError";
  }
}

/** Common USB vendor IDs for lab thermal printers. */
export const THERMAL_VENDOR_IDS = {
  ZEBRA: 0x0a5f,
  TSC: 0x1203,
  XPRINTER: 0x1fc9, // NXP used by some Xprinter clones; also 0x0483
  XPRINTER_ALT: 0x0483,
  GODEX: 0x0fe6
} as const;
