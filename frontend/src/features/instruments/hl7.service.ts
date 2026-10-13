import { httpClient } from "../../services/http";

export type Hl7Health = {
  enabled: boolean;
  tcpPort: number;
  defaultTenantId: string;
  protocols: string[];
};

export type AnalyzerIngestResult = {
  barcode: string;
  sampleId?: string | null;
  orderId?: string | null;
  labResultIds: string[];
  populatedCount: number;
  unmatchedCodes: string[];
  protocol: "HL7" | "ASTM" | "UNKNOWN";
};

export const hl7Api = {
  async health(): Promise<Hl7Health> {
    const { data } = await httpClient.get("/api/hl7-astm/health");
    return data?.data ?? data;
  },

  async ingest(raw: string, tenantId?: string): Promise<AnalyzerIngestResult> {
    const { data } = await httpClient.post("/api/hl7-astm/ingest", {
      raw,
      ...(tenantId ? { tenantId } : {})
    });
    return data?.data?.ingest ?? data?.ingest ?? data?.data ?? data;
  }
};
