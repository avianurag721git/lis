export type AnalyzerProtocol = "HL7" | "ASTM" | "UNKNOWN";

export type ParsedObservation = {
  /** Analyzer test/parameter code (OBX-3 / R-3) */
  code: string;
  /** Human-readable name if present */
  name: string | null;
  /** Numeric or text result (OBX-5 / R-4) */
  value: string;
  unit: string | null;
  /** Optional abnormal flags */
  flags: string | null;
};

export type ParsedAnalyzerMessage = {
  protocol: AnalyzerProtocol;
  messageControlId: string | null;
  sendingApplication: string | null;
  patientId: string | null;
  patientName: string | null;
  /** Sample / accession barcode (OBR-2/3 or O-3) */
  barcode: string | null;
  orderCode: string | null;
  observations: ParsedObservation[];
  raw: string;
};

export type AnalyzerIngestResult = {
  barcode: string;
  sampleId: string;
  orderId: string;
  labResultIds: string[];
  populatedCount: number;
  unmatchedCodes: string[];
  protocol: AnalyzerProtocol;
};
