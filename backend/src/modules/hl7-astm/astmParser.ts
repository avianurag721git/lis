import { ParsedAnalyzerMessage, ParsedObservation } from "./hl7-astm.types";

const splitRecords = (raw: string): string[] =>
  raw
    .replace(/\n/g, "\r")
    .split("\r")
    .map((s) => s.replace(/^\d+H/, "H").trim()) // strip ASTM frame numbers if present
    .map((s) => s.replace(/^\x02/, "").replace(/\x03.*$/, "").trim()) // STX/ETX
    .filter(Boolean);

const field = (record: string, index1Based: number): string => {
  // ASTM uses | separators; record type is field 0 conceptually as first char before |
  const parts = record.split("|");
  return (parts[index1Based] ?? "").trim();
};

/**
 * Parse ASTM E1394 / LIS2-A2 style records: H, P, O, R, L.
 */
export const parseAstm = (raw: string): ParsedAnalyzerMessage => {
  const records = splitRecords(raw);
  let sendingApplication: string | null = null;
  let patientId: string | null = null;
  let patientName: string | null = null;
  let barcode: string | null = null;
  let orderCode: string | null = null;
  const observations: ParsedObservation[] = [];

  for (const rec of records) {
    const type = rec.charAt(0).toUpperCase();
    if (type === "H") {
      // H|\^&|||Sysmex^XN-550...
      sendingApplication = field(rec, 4) || field(rec, 5) || null;
    } else if (type === "P") {
      patientId = field(rec, 3) || field(rec, 2) || null;
      patientName = field(rec, 5) || field(rec, 6) || null;
    } else if (type === "O") {
      // O|1|BARCODE^...|...|TESTCODE
      const o3 = field(rec, 2);
      barcode = o3.split("^")[0]?.trim() || o3 || barcode;
      orderCode = field(rec, 4).split("^")[0]?.trim() || field(rec, 3) || orderCode;
    } else if (type === "R") {
      // R|1|^^^WBC^1|6.5|10*3/uL|...
      const r3 = field(rec, 2);
      const parts = r3.split("^").filter(Boolean);
      const code = parts[parts.length - 1] || parts[0] || r3;
      const value = field(rec, 3);
      const unit = field(rec, 4) || null;
      const flags = field(rec, 6) || null;
      if (code && value !== "") {
        observations.push({
          code,
          name: parts.length > 1 ? parts[0]! : null,
          value,
          unit,
          flags
        });
      }
    } else if (type === "L") {
      // terminator — ignore
    }
  }

  return {
    protocol: "ASTM",
    messageControlId: null,
    sendingApplication,
    patientId,
    patientName,
    barcode,
    orderCode,
    observations,
    raw
  };
};

export const isAstmMessage = (raw: string): boolean => {
  const t = raw.trim();
  return (
    t.startsWith("H|") ||
    t.startsWith("1H|") ||
    /^H\|/m.test(t) ||
    (t.includes("\rP|") && t.includes("\rR|")) ||
    (t.includes("\nP|") && t.includes("\nR|"))
  );
};
