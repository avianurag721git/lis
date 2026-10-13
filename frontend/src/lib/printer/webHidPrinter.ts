import { PrinterError, PrintResult, THERMAL_VENDOR_IDS } from "./types";

type HidDeviceLike = HIDDevice;

const textEncoder = new TextEncoder();

const isHidSupported = (): boolean => typeof navigator !== "undefined" && "hid" in navigator;

/**
 * WebHID raw path — preferred for Zebra / HID-class thermal printers.
 * Sends bytes directly; no OS print dialog.
 */
export const webHidPrinter = {
  isSupported: isHidSupported,

  async requestDevice(filters?: HIDDeviceFilter[]): Promise<HidDeviceLike> {
    if (!isHidSupported()) {
      throw new PrinterError("UNSUPPORTED", "WebHID is not available in this browser (use Chrome/Edge).");
    }
    const defaultFilters: HIDDeviceFilter[] = filters ?? [
      { vendorId: THERMAL_VENDOR_IDS.ZEBRA },
      { vendorId: THERMAL_VENDOR_IDS.TSC },
      { vendorId: THERMAL_VENDOR_IDS.XPRINTER },
      { vendorId: THERMAL_VENDOR_IDS.XPRINTER_ALT },
      { vendorId: THERMAL_VENDOR_IDS.GODEX }
    ];
    try {
      const devices = await navigator.hid.requestDevice({ filters: defaultFilters });
      const device = devices[0];
      if (!device) {
        throw new PrinterError("DEVICE_NOT_FOUND", "No thermal printer selected.");
      }
      return device;
    } catch (err) {
      if (err instanceof PrinterError) throw err;
      throw new PrinterError("PERMISSION_DENIED", "Printer permission denied or cancelled.");
    }
  },

  async getGrantedDevices(): Promise<HidDeviceLike[]> {
    if (!isHidSupported()) return [];
    return navigator.hid.getDevices();
  },

  async sendRaw(device: HidDeviceLike, payload: string | Uint8Array): Promise<PrintResult> {
    const bytes = typeof payload === "string" ? textEncoder.encode(payload) : payload;
    try {
      if (!device.opened) {
        await device.open();
      }
      // Prefer first output report; fall back to feature report 0
      const collections = device.collections ?? [];
      let reportId = 0;
      for (const c of collections) {
        const out = c.outputReports?.[0];
        if (out?.reportId != null) {
          reportId = out.reportId;
          break;
        }
      }
      // Chunk to ~64-byte HID packets when needed
      const chunkSize = 64;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.slice(i, i + chunkSize);
        await device.sendReport(reportId, chunk as unknown as BufferSource);
      }
      return { ok: true, transport: "webhid", bytesSent: bytes.length };
    } catch (err) {
      throw new PrinterError(
        "WRITE_FAILED",
        err instanceof Error ? err.message : "Failed to write to HID printer"
      );
    }
  }
};
