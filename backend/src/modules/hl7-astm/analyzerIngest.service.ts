import { db } from "../../database/postgres";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { logger } from "../../common/logger/logger";
import { samplesService } from "../orders/orders.service";
import { labResultService } from "../lab-results/labResult.service";
import { emitAnalyzerDataReceived } from "../../realtime/sampleEvents";
import { parseHl7, isHl7Message } from "./hl7Parser";
import { parseAstm, isAstmMessage } from "./astmParser";
import { AnalyzerIngestResult, ParsedAnalyzerMessage } from "./hl7-astm.types";

const normalizeCode = (code: string): string =>
  code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "");

const parseNumeric = (raw: string): { value: number | null; valueText: string | null } => {
  const cleaned = raw.trim().replace(/,/g, "");
  if (!cleaned) return { value: null, valueText: null };
  const n = Number(cleaned);
  if (Number.isFinite(n)) return { value: n, valueText: null };
  // values like "<0.1" or "NEG"
  const m = cleaned.match(/-?\d+(\.\d+)?/);
  if (m) return { value: Number(m[0]), valueText: cleaned };
  return { value: null, valueText: cleaned };
};

export const detectAndParse = (raw: string): ParsedAnalyzerMessage => {
  const text = raw.replace(/^\x0b/, "").replace(/\x1c\x0d$/, "").trim();
  if (isHl7Message(text)) return parseHl7(text);
  if (isAstmMessage(text)) return parseAstm(text);
  // Heuristic fallback
  if (text.startsWith("MSH")) return parseHl7(text);
  if (text.startsWith("H|") || text.startsWith("1H|")) return parseAstm(text);
  throw new AppError("Unrecognized analyzer protocol (expected HL7 or ASTM)", HTTP_STATUS.BAD_REQUEST, "UNKNOWN_PROTOCOL");
};

type ParamRow = {
  parameterId: string;
  labResultId: string;
  testId: string;
  testCode: string | null;
  name: string;
  analyzerCode: string | null;
  formulaAlias: string | null;
};

const loadOrderParameters = async (tenantId: string, orderId: string): Promise<ParamRow[]> => {
  const result = await db.query(
    `SELECT lr.id AS lab_result_id, lr.test_id, t.code AS test_code,
            p.id AS parameter_id, p.name, p.analyzer_code, p.formula_alias
     FROM lab_results lr
     JOIN tests t ON t.id = lr.test_id
     JOIN test_parameter_assignments a ON a.test_id = lr.test_id AND a.tenant_id = lr.tenant_id
     JOIN parameters p ON p.id = a.parameter_id
     WHERE lr.tenant_id = $1 AND lr.order_id = $2
       AND lr.status IN ('PENDING', 'PROCESSING', 'DRAFT')`,
    [tenantId, orderId]
  );
  return result.rows.map((r: any) => ({
    parameterId: r.parameter_id as string,
    labResultId: r.lab_result_id as string,
    testId: r.test_id as string,
    testCode: r.test_code as string | null,
    name: r.name as string,
    analyzerCode: r.analyzer_code as string | null,
    formulaAlias: r.formula_alias as string | null
  }));
};

const matchParameter = (code: string, name: string | null, rows: ParamRow[]): ParamRow | null => {
  const needle = normalizeCode(code);
  const byAnalyzer = rows.find((r) => r.analyzerCode && normalizeCode(r.analyzerCode) === needle);
  if (byAnalyzer) return byAnalyzer;
  const byAlias = rows.find((r) => r.formulaAlias && normalizeCode(r.formulaAlias) === needle);
  if (byAlias) return byAlias;
  const byName = rows.find((r) => normalizeCode(r.name) === needle);
  if (byName) return byName;
  if (name) {
    const n = normalizeCode(name);
    const byObsName = rows.find((r) => normalizeCode(r.name) === n || normalizeCode(r.name).includes(n));
    if (byObsName) return byObsName;
  }
  return null;
};

export const analyzerIngestService = {
  async ingestRaw(
    tenantId: string,
    raw: string,
    meta?: { remoteAddress?: string }
  ): Promise<AnalyzerIngestResult> {
    if (!env.databaseUrl) {
      throw new AppError("Database not configured", HTTP_STATUS.INTERNAL_SERVER_ERROR, "DB_NOT_CONFIGURED");
    }

    const parsed = detectAndParse(raw);
    if (!parsed.barcode) {
      throw new AppError("No sample barcode found (OBR-2/3 or ASTM O-3)", HTTP_STATUS.BAD_REQUEST, "BARCODE_MISSING");
    }
    if (!parsed.observations.length) {
      throw new AppError("No observation results in message", HTTP_STATUS.BAD_REQUEST, "NO_OBSERVATIONS");
    }

    const sample = await samplesService.getByBarcode(tenantId, parsed.barcode);
    if (!sample) {
      throw new AppError(`Sample not found for barcode ${parsed.barcode}`, HTTP_STATUS.NOT_FOUND, "SAMPLE_NOT_FOUND");
    }

    // Ensure pending lab_results rows exist for this order's samples
    await labResultService.listPending(tenantId, { orderId: sample.orderId });

    let params = await loadOrderParameters(tenantId, sample.orderId);
    if (parsed.orderCode) {
      const orderNeedle = normalizeCode(parsed.orderCode);
      const filtered = params.filter(
        (p) => p.testCode && normalizeCode(p.testCode) === orderNeedle
      );
      if (filtered.length) params = filtered;
    }

    const byLabResult = new Map<string, Array<{ parameterId: string; value?: number | null; valueText?: string | null }>>();
    const unmatchedCodes: string[] = [];

    for (const obs of parsed.observations) {
      const match = matchParameter(obs.code, obs.name, params);
      if (!match) {
        unmatchedCodes.push(obs.code);
        continue;
      }
      const parsedVal = parseNumeric(obs.value);
      const list = byLabResult.get(match.labResultId) ?? [];
      const entry: { parameterId: string; value?: number | null; valueText?: string | null } = {
        parameterId: match.parameterId
      };
      if (parsedVal.value != null) entry.value = parsedVal.value;
      if (parsedVal.valueText != null) entry.valueText = parsedVal.valueText;
      // Prefer numeric; if only text, set valueText
      if (parsedVal.value == null && parsedVal.valueText == null) {
        entry.valueText = obs.value;
      }
      list.push(entry);
      byLabResult.set(match.labResultId, list);
    }

    const labResultIds: string[] = [];
    let populatedCount = 0;
    const userId = env.analyzerSystemUserId;

    for (const [labResultId, entries] of byLabResult) {
      // Merge with existing draft values so we don't wipe unmapped params
      const pending = await labResultService.listPending(tenantId, { orderId: sample.orderId });
      const current = pending.find((p) => p.labResultId === labResultId);
      const mergedMap = new Map<string, { parameterId: string; value?: number | null; valueText?: string | null }>();
      if (current) {
        for (const e of current.entries) {
          const base: { parameterId: string; value?: number | null; valueText?: string | null } = {
            parameterId: e.parameterId
          };
          if (e.value != null) base.value = e.value;
          mergedMap.set(e.parameterId, base);
        }
      }
      for (const e of entries) {
        mergedMap.set(e.parameterId, e);
      }
      const merged = [...mergedMap.values()];
      await labResultService.saveDraft(tenantId, userId, {
        labResultId,
        technicianNote: `Auto-populated from ${parsed.protocol} analyzer${parsed.sendingApplication ? ` (${parsed.sendingApplication})` : ""}`,
        entries: merged
      });
      labResultIds.push(labResultId);
      populatedCount += entries.length;
    }

    const result: AnalyzerIngestResult = {
      barcode: parsed.barcode,
      sampleId: sample.id,
      orderId: sample.orderId,
      labResultIds,
      populatedCount,
      unmatchedCodes,
      protocol: parsed.protocol
    };

    emitAnalyzerDataReceived(tenantId, {
      ...result,
      patientId: sample.patientId,
      sendingApplication: parsed.sendingApplication,
      remoteAddress: meta?.remoteAddress ?? null,
      observations: parsed.observations
    });

    logger.info(
      {
        tenantId,
        barcode: parsed.barcode,
        protocol: parsed.protocol,
        populatedCount,
        unmatchedCodes,
        remoteAddress: meta?.remoteAddress
      },
      "Analyzer message ingested"
    );

    return result;
  }
};
