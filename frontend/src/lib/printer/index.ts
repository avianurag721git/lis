import { buildEplLabel } from "./epl";
import { buildZplLabel } from "./zpl";
import {
  BarcodeLabelPayload,
  LabelDialect,
  LabelSizeMm,
  PrinterError,
  PrintResult,
  PrinterTransport
} from "./types";
import { webHidPrinter } from "./webHidPrinter";
import { webUsbPrinter } from "./webUsbPrinter";
import { websocketAgentPrinter } from "./websocketAgent";

export * from "./types";
export { buildZplLabel } from "./zpl";
export { buildEplLabel } from "./epl";
export { webHidPrinter } from "./webHidPrinter";
export { webUsbPrinter } from "./webUsbPrinter";
export { websocketAgentPrinter } from "./websocketAgent";

export type PrintLabelOptions = {
  dialect?: LabelDialect;
  size?: LabelSizeMm;
  /** Force a transport; default tries WebHID → WebUSB → local agent. */
  prefer?: PrinterTransport;
  agentUrl?: string;
  /** Reuse an already-granted HID/USB device. */
  hidDevice?: HIDDevice;
  usbDevice?: USBDevice;
};

/**
 * Build raw EPL/ZPL and send to a thermal printer without the OS print dialog.
 */
export const printBarcodeLabel = async (
  payload: BarcodeLabelPayload,
  options: PrintLabelOptions = {}
): Promise<PrintResult> => {
  const dialect = options.dialect ?? "ZPL";
  const raw =
    dialect === "EPL"
      ? buildEplLabel(payload, options.size)
      : buildZplLabel(payload, options.size);

  const prefer = options.prefer;
  const order: PrinterTransport[] = prefer
    ? [prefer]
    : (["webhid", "webusb", "websocket"] as const);

  let lastError: PrinterError | undefined;

  for (const transport of order) {
    try {
      if (transport === "webhid" && webHidPrinter.isSupported()) {
        const device =
          options.hidDevice ??
          (await webHidPrinter.getGrantedDevices())[0] ??
          (await webHidPrinter.requestDevice());
        return await webHidPrinter.sendRaw(device, raw);
      }
      if (transport === "webusb" && webUsbPrinter.isSupported()) {
        const device = options.usbDevice ?? (await webUsbPrinter.requestDevice());
        return await webUsbPrinter.sendRaw(device, raw);
      }
      if (transport === "websocket") {
        const up = await websocketAgentPrinter.ping(options.agentUrl);
        if (!up) {
          throw new PrinterError(
            "AGENT_UNAVAILABLE",
            "Local print agent is not running (ws://127.0.0.1:9101)."
          );
        }
        return await websocketAgentPrinter.sendRaw(raw, {
          dialect,
          ...(options.agentUrl ? { url: options.agentUrl } : {})
        });
      }
    } catch (err) {
      lastError =
        err instanceof PrinterError
          ? err
          : new PrinterError("WRITE_FAILED", err instanceof Error ? err.message : "Print failed");
      if (prefer) break;
    }
  }

  throw (
    lastError ??
    new PrinterError(
      "UNSUPPORTED",
      "No printer transport available. Use Chrome/Edge with WebHID or run the local print agent."
    )
  );
};
