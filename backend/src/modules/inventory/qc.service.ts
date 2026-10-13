import { randomUUID } from "crypto";
import { db } from "../../database/postgres";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import {
  evaluateWestgard,
  leveyJenningsBands,
  normalizeControlLevel,
  westgardCorrectiveAction
} from "./westgard.engine";
import { inventoryAlertService } from "./inventoryAlert.service";
import {
  ControlSampleResult,
  CreateControlInput,
  LabInstrument,
  QcHold
} from "./inventory.types";

const ensurePg = (): void => {
  if (!env.databaseUrl) {
    throw new AppError("Database not configured", HTTP_STATUS.INTERNAL_SERVER_ERROR, "DB_NOT_CONFIGURED");
  }
};

const mapControl = (r: any): ControlSampleResult => ({
  id: r.id,
  reagentId: r.reagent_id,
  testId: r.test_id,
  instrumentCode: r.instrument_code,
  controlLevel: r.control_level,
  parameterName: r.parameter_name,
  targetMean: Number(r.target_mean),
  targetSd: Number(r.target_sd),
  observedValue: Number(r.observed_value),
  runDate: new Date(r.run_date).toISOString(),
  zScore: r.z_score == null ? null : Number(r.z_score),
  westgardFlags: Array.isArray(r.westgard_flags) ? r.westgard_flags : [],
  isReject: Boolean(r.is_reject),
  status: (r.status as ControlSampleResult["status"]) ?? (r.is_reject ? "REJECTED" : "PASSED"),
  violatedRule: r.violated_rule ?? null
});

const mapHold = (r: any): QcHold => ({
  id: r.id,
  reason: r.reason,
  westgardRule: r.westgard_rule,
  reagentId: r.reagent_id,
  testId: r.test_id,
  instrumentCode: r.instrument_code,
  isActive: Boolean(r.is_active),
  createdAt: new Date(r.created_at).toISOString()
});

const mapInstrument = (r: any): LabInstrument => ({
  id: r.id,
  code: r.code,
  name: r.name,
  status: r.status,
  outOfCalibrationReason: r.out_of_calibration_reason,
  lastCalibrationAt: r.last_calibration_at ? new Date(r.last_calibration_at).toISOString() : null
});

const upsertInstrumentOutOfCal = async (
  tenantId: string,
  code: string,
  reason: string
): Promise<void> => {
  const id = randomUUID();
  await db.query(
    `INSERT INTO lab_instruments (id, tenant_id, code, name, status, out_of_calibration_reason, updated_at)
     VALUES ($1,$2,$3,$3,'OUT_OF_CALIBRATION',$4,NOW())
     ON CONFLICT (tenant_id, code) DO UPDATE SET
       status = 'OUT_OF_CALIBRATION',
       out_of_calibration_reason = EXCLUDED.out_of_calibration_reason,
       updated_at = NOW()`,
    [id, tenantId, code.trim(), reason]
  );
};

export const qcService = {
  async listControls(
    tenantId: string,
    filters: { parameterName?: string; controlLevel?: string; limit?: number }
  ): Promise<ControlSampleResult[]> {
    ensurePg();
    const params: unknown[] = [tenantId];
    let where = `tenant_id = $1`;
    if (filters.parameterName) {
      params.push(filters.parameterName);
      where += ` AND parameter_name = $${params.length}`;
    }
    if (filters.controlLevel) {
      const level = normalizeControlLevel(filters.controlLevel);
      // Match both legacy NORMAL/HIGH and LEVEL_* storage
      params.push(filters.controlLevel, level);
      where += ` AND (control_level = $${params.length - 1} OR control_level = $${params.length})`;
    }
    const limit = filters.limit ?? 60;
    params.push(limit);
    const result = await db.query(
      `SELECT * FROM control_sample_results WHERE ${where} ORDER BY run_date ASC LIMIT $${params.length}`,
      params
    );
    return result.rows.map(mapControl);
  },

  async listInstruments(tenantId: string): Promise<LabInstrument[]> {
    ensurePg();
    const result = await db.query(
      `SELECT * FROM lab_instruments WHERE tenant_id = $1 ORDER BY code ASC`,
      [tenantId]
    );
    return result.rows.map(mapInstrument);
  },

  async recordControl(
    tenantId: string,
    userId: string,
    input: CreateControlInput
  ): Promise<{
    result: ControlSampleResult;
    hold: QcHold | null;
    evaluation: ReturnType<typeof evaluateWestgard>;
    instrument: LabInstrument | null;
  }> {
    ensurePg();
    if (input.targetSd <= 0) {
      throw new AppError("targetSD must be > 0", HTTP_STATUS.BAD_REQUEST, "INVALID_SD");
    }

    const controlLevel = normalizeControlLevel(input.controlLevel);

    const historyRows = await db.query(
      `SELECT * FROM control_sample_results
       WHERE tenant_id = $1 AND parameter_name = $2
         AND (control_level = $3 OR control_level = $4)
       ORDER BY run_date ASC
       LIMIT 30`,
      [tenantId, input.parameterName, input.controlLevel, controlLevel]
    );
    const history = historyRows.rows.map((r: any) => ({
      observedValue: Number(r.observed_value),
      targetMean: Number(r.target_mean),
      targetSd: Number(r.target_sd),
      controlLevel: normalizeControlLevel(r.control_level),
      runDate: new Date(r.run_date).toISOString()
    }));

    const current = {
      observedValue: input.observedValue,
      targetMean: input.targetMean,
      targetSd: input.targetSd,
      controlLevel,
      runDate: input.runDate ?? new Date().toISOString()
    };
    const evaluation = evaluateWestgard(current, history);
    evaluation.correctiveAction = westgardCorrectiveAction(
      evaluation.violatedRule,
      input.instrumentCode
    );

    const id = randomUUID();
    await db.query(
      `INSERT INTO control_sample_results
       (id, tenant_id, reagent_id, test_id, instrument_code, control_level, parameter_name,
        target_mean, target_sd, observed_value, run_date, z_score, westgard_flags, is_reject,
        status, violated_rule, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        id,
        tenantId,
        input.reagentId ?? null,
        input.testId ?? null,
        input.instrumentCode ?? null,
        controlLevel,
        input.parameterName.trim(),
        input.targetMean,
        input.targetSd,
        input.observedValue,
        current.runDate,
        evaluation.zScore,
        evaluation.flags,
        evaluation.isReject,
        evaluation.status,
        evaluation.violatedRule,
        userId
      ]
    );

    let hold: QcHold | null = null;
    let instrument: LabInstrument | null = null;

    if (evaluation.isReject) {
      const rule = evaluation.rejectRules[0] ?? evaluation.violatedRule ?? "1-3s";
      const holdId = randomUUID();
      const reason = `Westgard ${rule} violation on ${input.parameterName} (${controlLevel}) z=${evaluation.zScore}`;
      await db.query(
        `INSERT INTO qc_holds
         (id, tenant_id, reason, westgard_rule, control_result_id, reagent_id, test_id, instrument_code, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)`,
        [
          holdId,
          tenantId,
          reason,
          rule,
          id,
          input.reagentId ?? null,
          input.testId ?? null,
          input.instrumentCode ?? null
        ]
      );

      if (input.instrumentCode?.trim()) {
        await upsertInstrumentOutOfCal(tenantId, input.instrumentCode, reason);
        const inst = (
          await db.query(`SELECT * FROM lab_instruments WHERE tenant_id = $1 AND code = $2`, [
            tenantId,
            input.instrumentCode.trim()
          ])
        ).rows[0];
        if (inst) instrument = mapInstrument(inst);

        // Block all patient results on this analyzer (via linked reagent instrument_code)
        await db.query(
          `UPDATE lab_results lr
           SET qc_blocked = TRUE, updated_at = NOW()
           FROM reagents r
           WHERE lr.tenant_id = $1 AND lr.reagent_lot_id = r.id
             AND r.tenant_id = $1 AND r.instrument_code = $2
             AND lr.status IN ('TECHNICIAN_APPROVED', 'PROCESSING', 'DRAFT')`,
          [tenantId, input.instrumentCode.trim()]
        );
      }

      if (input.testId) {
        await db.query(
          `UPDATE lab_results SET qc_blocked = TRUE, updated_at = NOW()
           WHERE tenant_id = $1 AND test_id = $2 AND status = 'TECHNICIAN_APPROVED'`,
          [tenantId, input.testId]
        );
      }
      if (input.reagentId) {
        await db.query(
          `UPDATE lab_results SET qc_blocked = TRUE, updated_at = NOW()
           WHERE tenant_id = $1 AND reagent_lot_id = $2 AND status IN ('TECHNICIAN_APPROVED', 'PROCESSING', 'DRAFT')`,
          [tenantId, input.reagentId]
        );
      }

      hold = mapHold((await db.query(`SELECT * FROM qc_holds WHERE id = $1`, [holdId])).rows[0]);
      const alertPayload: {
        tenantId: string;
        rule: string;
        parameterName: string;
        reagentLot?: string | null;
        instrumentCode?: string | null;
      } = {
        tenantId,
        rule,
        parameterName: input.parameterName
      };
      if (input.reagentId !== undefined) alertPayload.reagentLot = input.reagentId;
      if (input.instrumentCode !== undefined) alertPayload.instrumentCode = input.instrumentCode;
      void inventoryAlertService.sendQcHoldAlert(alertPayload);
    }

    const result = mapControl((await db.query(`SELECT * FROM control_sample_results WHERE id = $1`, [id])).rows[0]);
    return { result, hold, evaluation, instrument };
  },

  async getLeveyJennings(
    tenantId: string,
    parameterName: string,
    controlLevel: string
  ): Promise<{
    points: ControlSampleResult[];
    bands: Record<string, number> | null;
  }> {
    const points = await this.listControls(tenantId, { parameterName, controlLevel, limit: 60 });
    if (points.length === 0) return { points, bands: null };
    const last = points[points.length - 1]!;
    return { points, bands: leveyJenningsBands(last.targetMean, last.targetSd) };
  },

  async listActiveHolds(tenantId: string): Promise<QcHold[]> {
    ensurePg();
    const result = await db.query(
      `SELECT * FROM qc_holds WHERE tenant_id = $1 AND is_active = TRUE ORDER BY created_at DESC`,
      [tenantId]
    );
    return result.rows.map(mapHold);
  },

  /**
   * Resolve hold. When calibrationPass=true, restore instrument to IN_CALIBRATION.
   */
  async resolveHold(
    tenantId: string,
    userId: string,
    holdId: string,
    opts?: { calibrationPass?: boolean }
  ): Promise<QcHold> {
    ensurePg();
    const row = (
      await db.query(`SELECT * FROM qc_holds WHERE tenant_id = $1 AND id = $2`, [tenantId, holdId])
    ).rows[0];
    if (!row) throw new AppError("QC hold not found", HTTP_STATUS.NOT_FOUND, "HOLD_NOT_FOUND");

    await db.query(
      `UPDATE qc_holds SET is_active = FALSE, resolved_at = NOW(), resolved_by_user_id = $3 WHERE id = $1 AND tenant_id = $2`,
      [holdId, tenantId, userId]
    );

    if (opts?.calibrationPass && row.instrument_code) {
      await db.query(
        `UPDATE lab_instruments
         SET status = 'IN_CALIBRATION',
             out_of_calibration_reason = NULL,
             last_calibration_at = NOW(),
             updated_at = NOW()
         WHERE tenant_id = $1 AND code = $2`,
        [tenantId, row.instrument_code]
      );
    }

    if (row.test_id) {
      const still = await db.query(
        `SELECT id FROM qc_holds WHERE tenant_id = $1 AND test_id = $2 AND is_active = TRUE LIMIT 1`,
        [tenantId, row.test_id]
      );
      if (!still.rows[0]) {
        await db.query(
          `UPDATE lab_results SET qc_blocked = FALSE, updated_at = NOW()
           WHERE tenant_id = $1 AND test_id = $2 AND qc_blocked = TRUE`,
          [tenantId, row.test_id]
        );
      }
    }
    if (row.reagent_id) {
      const still = await db.query(
        `SELECT id FROM qc_holds WHERE tenant_id = $1 AND reagent_id = $2 AND is_active = TRUE LIMIT 1`,
        [tenantId, row.reagent_id]
      );
      if (!still.rows[0]) {
        await db.query(
          `UPDATE lab_results SET qc_blocked = FALSE, updated_at = NOW()
           WHERE tenant_id = $1 AND reagent_lot_id = $2 AND qc_blocked = TRUE`,
          [tenantId, row.reagent_id]
        );
      }
    }
    if (row.instrument_code) {
      const stillInstr = await db.query(
        `SELECT id FROM qc_holds WHERE tenant_id = $1 AND instrument_code = $2 AND is_active = TRUE LIMIT 1`,
        [tenantId, row.instrument_code]
      );
      const instr = (
        await db.query(`SELECT status FROM lab_instruments WHERE tenant_id = $1 AND code = $2`, [
          tenantId,
          row.instrument_code
        ])
      ).rows[0];
      if (!stillInstr.rows[0] && instr?.status !== "OUT_OF_CALIBRATION") {
        await db.query(
          `UPDATE lab_results lr
           SET qc_blocked = FALSE, updated_at = NOW()
           FROM reagents r
           WHERE lr.tenant_id = $1 AND lr.reagent_lot_id = r.id
             AND r.instrument_code = $2 AND lr.qc_blocked = TRUE`,
          [tenantId, row.instrument_code]
        );
      }
    }

    return mapHold((await db.query(`SELECT * FROM qc_holds WHERE id = $1`, [holdId])).rows[0]);
  },

  async assertVerificationAllowed(tenantId: string, labResultIds: string[]): Promise<void> {
    ensurePg();
    if (!labResultIds.length) return;

    const blocked = await db.query(
      `SELECT lr.id, lr.qc_blocked, t.name AS test_name
       FROM lab_results lr
       JOIN tests t ON t.id = lr.test_id
       WHERE lr.tenant_id = $1 AND lr.id = ANY($2::uuid[]) AND lr.qc_blocked = TRUE`,
      [tenantId, labResultIds]
    );
    if (blocked.rows.length > 0) {
      const names = blocked.rows.map((r: any) => r.test_name).join(", ");
      throw new AppError(
        `QC hold active — pathologist verification blocked for: ${names}. Resolve Westgard 1-3s/2-2s/R-4s holds and log calibration pass.`,
        HTTP_STATUS.CONFLICT,
        "QC_HOLD"
      );
    }

    const outOfCal = await db.query(
      `SELECT DISTINCT i.code, i.out_of_calibration_reason, t.name AS test_name
       FROM lab_results lr
       JOIN tests t ON t.id = lr.test_id
       LEFT JOIN reagents r ON r.id = lr.reagent_lot_id
       JOIN lab_instruments i ON i.tenant_id = lr.tenant_id
         AND i.code = COALESCE(r.instrument_code, '')
       WHERE lr.tenant_id = $1 AND lr.id = ANY($2::uuid[]) AND i.status = 'OUT_OF_CALIBRATION'`,
      [tenantId, labResultIds]
    );
    if (outOfCal.rows.length > 0) {
      throw new AppError(
        `Instrument ${outOfCal.rows[0].code} is OUT_OF_CALIBRATION — verification blocked for ${outOfCal.rows[0].test_name}. Log a calibration pass first.`,
        HTTP_STATUS.CONFLICT,
        "OUT_OF_CALIBRATION"
      );
    }

    const holds = await db.query(
      `SELECT h.westgard_rule, h.reason
       FROM qc_holds h
       JOIN lab_results lr ON lr.tenant_id = h.tenant_id
         AND (
           (h.test_id IS NOT NULL AND lr.test_id = h.test_id)
           OR (h.reagent_id IS NOT NULL AND lr.reagent_lot_id = h.reagent_id)
           OR (
             h.instrument_code IS NOT NULL AND EXISTS (
               SELECT 1 FROM reagents r
               WHERE r.id = lr.reagent_lot_id AND r.instrument_code = h.instrument_code
             )
           )
         )
       WHERE h.tenant_id = $1 AND h.is_active = TRUE AND lr.id = ANY($2::uuid[])
       LIMIT 5`,
      [tenantId, labResultIds]
    );
    if (holds.rows.length > 0) {
      throw new AppError(
        `QC hold (${holds.rows[0].westgard_rule}): ${holds.rows[0].reason}`,
        HTTP_STATUS.CONFLICT,
        "QC_HOLD"
      );
    }
  }
};
