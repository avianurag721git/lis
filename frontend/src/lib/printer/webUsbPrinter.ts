import { PrinterError, PrintResult, THERMAL_VENDOR_IDS } from "./types";

type UsbDeviceLike = USBDevice;

const textEncoder = new TextEncoder();

const isUsbSupported = (): boolean => typeof navigator !== "undefined" && "usb" in navigator;

/**
 * WebUSB raw path — for printers that expose a bulk OUT endpoint (common on Xprinter / some TSC).
 */
export const webUsbPrinter = {
  isSupported: isUsbSupported,

  async requestDevice(filters?: USBDeviceFilter[]): Promise<UsbDeviceLike> {
    if (!isUsbSupported()) {
      throw new PrinterError("UNSUPPORTED", "WebUSB is not available in this browser.");
    }
    const defaultFilters: USBDeviceFilter[] = filters ?? [
      { vendorId: THERMAL_VENDOR_IDS.ZEBRA },
      { vendorId: THERMAL_VENDOR_IDS.TSC },
      { vendorId: THERMAL_VENDOR_IDS.XPRINTER },
      { vendorId: THERMAL_VENDOR_IDS.XPRINTER_ALT },
      { vendorId: THERMAL_VENDOR_IDS.GODEX }
    ];
    try {
      const device = await navigator.usb.requestDevice({ filters: defaultFilters });
      return device;
    } catch {
      throw new PrinterError("PERMISSION_DENIED", "USB printer permission denied or cancelled.");
    }
  },

  async sendRaw(device: UsbDeviceLike, payload: string | Uint8Array): Promise<PrintResult> {
    const bytes = typeof payload === "string" ? textEncoder.encode(payload) : payload;
    try {
      await device.open();
      if (device.configuration == null) {
        await device.selectConfiguration(1);
      }
      const iface = device.configuration?.interfaces.find((i) =>
        i.alternates.some((a) => a.endpoints.some((e) => e.direction === "out"))
      );
      if (!iface) {
        throw new PrinterError("WRITE_FAILED", "No USB OUT endpoint found on printer.");
      }
      await device.claimInterface(iface.interfaceNumber);
      const alternate = iface.alternate;
      const endpoint = alternate.endpoints.find((e) => e.direction === "out");
      if (!endpoint) {
        throw new PrinterError("WRITE_FAILED", "USB OUT endpoint missing.");
      }
      await device.transferOut(endpoint.endpointNumber, bytes as unknown as BufferSource);
      return { ok: true, transport: "webusb", bytesSent: bytes.length };
    } catch (err) {
      if (err instanceof PrinterError) throw err;
      throw new PrinterError(
        "WRITE_FAILED",
        err instanceof Error ? err.message : "Failed to write to USB printer"
      );
    } finally {
      try {
        if (device.opened) await device.close();
      } catch {
        /* ignore */
      }
    }
  }
};
