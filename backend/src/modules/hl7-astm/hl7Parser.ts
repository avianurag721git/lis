import { ParsedAnalyzerMessage, ParsedObservation } from "./hl7-astm.types";

const splitSegments = (raw: string): string[] =>
  raw
    .replace(/\n/g, "\r")
    .split("\r")
    .map((s) => s.trim())
    .filter(Boolean);

const field = (segment: string, index1Based: number): string => {
  const parts = segment.split("|");
  return (parts[index1Based] ?? "").trim();
};

const component = (composite: string, index1Based: number): string => {
  const parts = composite.split("^");
  return (parts[index1Based - 1] ?? "").trim();
};

/**
 * Parse HL7 v2.x ORU^R01-style result messages (MSH, PID, OBR, OBX).
 */
export const parseHl7 = (raw: string): ParsedAnalyzerMessage => {
  const segments = splitSegments(raw);
  let messageControlId: string | null = null;
  let sendingApplication: string | null = null;
  let patientId: string | null = null;
  let patientName: string | null = null;
  let barcode: string | null = null;
  let orderCode: string | null = null;
  const observations: ParsedObservation[] = [];

  for (const seg of segments) {
    const type = seg.slice(0, 3);
    if (type === "MSH") {
      sendingApplication = field(seg, 2) || null;
      messageControlId = field(seg, 9) || null;
    } else if (type === "PID") {
      patientId = component(field(seg, 3), 1) || field(seg, 3) || null;
      const name = field(seg, 5);
      patientName = name ? name.replace(/\^/g, " ").trim() : null;
    } else if (type === "OBR") {
      // OBR-2 placer, OBR-3 filler — barcode often in either
      const obr2 = field(seg, 2);
      const obr3 = field(seg, 3);
      barcode = component(obr2, 1) || obr2 || component(obr3, 1) || obr3 || barcode;
      const obr4 = field(seg, 4);
      orderCode = component(obr4, 1) || obr4 || orderCode;
    } else if (type === "OBX") {
      const obx3 = field(seg, 3);
      const code = component(obx3, 1) || obx3;
      const name = component(obx3, 2) || null;
      const value = field(seg, 5);
      const unit = component(field(seg, 6), 1) || field(seg, 6) || null;
      const flags = field(seg, 8) || null;
      if (code && value !== "") {
        observations.push({ code, name, value, unit, flags });
      }
    }
  }

  return {
    protocol: "HL7",
    messageControlId,
    sendingApplication,
    patientId,
    patientName,
    barcode,
    orderCode,
    observations,
    raw
  };
};

export const isHl7Message = (raw: string): boolean => {
  const t = raw.trim();
  return t.startsWith("MSH") || t.includes("\rMSH") || t.includes("\nMSH");
};
