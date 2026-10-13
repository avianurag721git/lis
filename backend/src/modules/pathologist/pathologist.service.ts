import { db } from "../../database/postgres";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { auditService } from "../audit/audit.service";
import { labResultService } from "../lab-results/labResult.service";
import { BatchVerifyInput, PendingLabResultRow, PathologistProfile } from "../lab-results/labResult.types";
import { nablPdfEngine } from "../pdf-engine/nablPdf.engine";
import { reportDistributionService } from "../pdf-engine/reportDistribution.service";
import { emitLabResultPathologistVerified, emitOrderPipelineUpdate } from "../../realtime/sampleEvents";
import { finalizeOrderVerification, getOrderPipelineStatus, markReportDispatched } from "../orders/orderLifecycle.util";

const ensurePg = (): void => {
  if (!env.databaseUrl) {
    throw new AppError("Database not configured", HTTP_STATUS.INTERNAL_SERVER_ERROR, "DB_NOT_CONFIGURED");
  }
};

export const pathologistService = {
  async reviewQueue(tenantId: string): Promise<PendingLabResultRow[]> {
    return labResultService.listPathologistQueue(tenantId);
  },

  async verifySingle(
    tenantId: string,
    userId: string,
    input: {
      labResultId: string;
      digitalSignatureUrl?: string | null;
      medicalLicenseNumber?: string | null;
      pathologistName?: string | null;
      clinicalImpression?: string | null;
    }
  ): Promise<{ verified: PendingLabResultRow; profile: PathologistProfile; report?: { orderId: string; reportUrl: string; verifyUrl: string } }> {
    const batchInput: BatchVerifyInput = { labResultIds: [input.labResultId] };
    if (input.digitalSignatureUrl !== undefined) batchInput.digitalSignatureUrl = input.digitalSignatureUrl;
    if (input.medicalLicenseNumber !== undefined) batchInput.medicalLicenseNumber = input.medicalLicenseNumber;
    if (input.pathologistName !== undefined) batchInput.pathologistName = input.pathologistName;

    const { verified, profile } = await labResultService.batchVerify(tenantId, userId, batchInput);
    const row = verified[0];
    if (!row) {
      throw new AppError("Verification failed", HTTP_STATUS.INTERNAL_SERVER_ERROR, "VERIFY_FAILED");
    }

    auditService.log({
      userId,
      tenantId,
      action: "PATHOLOGIST_VERIFIED",
      entity: "lab_result",
      entityId: row.labResultId,
      metadata: {
        orderId: row.orderId,
        orderNumber: row.orderNumber,
        testName: row.testName,
        pathologistName: profile.fullName,
        license: profile.medicalLicenseNumber
      }
    });

    emitLabResultPathologistVerified(tenantId, verified);

    const report = await nablPdfEngine.generateForOrder({
      tenantId,
      userId,
      orderId: row.orderId,
      ...(input.clinicalImpression?.trim()
        ? { clinicalImpression: input.clinicalImpression.trim() }
        : {})
    });

    auditService.log({
      userId,
      tenantId,
      action: "REPORT_GENERATED",
      entity: "order_report",
      entityId: row.orderId,
      metadata: { reportUrl: report.reportUrl, verifyUrl: report.verifyUrl }
    });

    // Auto-dispatch patient notifications (WhatsApp / webhook / SMS-email stubs)
    try {
      await finalizeOrderVerification(tenantId, row.orderId);
      const dist = await reportDistributionService.distribute({
        tenantId,
        userId,
        orderId: row.orderId,
        channels: ["WHATSAPP", "SMS", "EMAIL", "WEBHOOK"]
      });
      await markReportDispatched(tenantId, row.orderId);
      const pipeline = await getOrderPipelineStatus(tenantId, row.orderId);
      emitOrderPipelineUpdate(tenantId, row.orderId, pipeline);
      auditService.log({
        userId,
        tenantId,
        action: "REPORT_DISTRIBUTED",
        entity: "order_report",
        entityId: row.orderId,
        metadata: { distributions: dist.distributions }
      });
    } catch {
      // non-fatal
    }

    return { verified: row, profile, report };
  },

  async verifyBatch(
    tenantId: string,
    userId: string,
    input: {
      orderIds?: string[];
      labResultIds?: string[];
      digitalSignatureUrl?: string | null;
      medicalLicenseNumber?: string | null;
      pathologistName?: string | null;
    }
  ): Promise<{
    verified: PendingLabResultRow[];
    profile: PathologistProfile;
    reports: Array<{ orderId: string; reportUrl: string; verifyUrl: string }>;
  }> {
    ensurePg();
    let labResultIds = input.labResultIds ?? [];

    if (input.orderIds?.length) {
      const result = await db.query(
        `SELECT id FROM lab_results
         WHERE tenant_id = $1 AND order_id = ANY($2::uuid[]) AND status = 'TECHNICIAN_APPROVED'`,
        [tenantId, input.orderIds]
      );
      labResultIds = [...new Set([...labResultIds, ...result.rows.map((r: { id: string }) => r.id)])];
    }

    if (!labResultIds.length) {
      throw new AppError("No TECHNICIAN_APPROVED results for given ids", HTTP_STATUS.BAD_REQUEST, "IDS_REQUIRED");
    }

    const batchInput: BatchVerifyInput = {
      labResultIds
    };
    if (input.digitalSignatureUrl !== undefined) batchInput.digitalSignatureUrl = input.digitalSignatureUrl;
    if (input.medicalLicenseNumber !== undefined) batchInput.medicalLicenseNumber = input.medicalLicenseNumber;
    if (input.pathologistName !== undefined) batchInput.pathologistName = input.pathologistName;

    const { verified, profile } = await labResultService.batchVerify(tenantId, userId, batchInput);
    emitLabResultPathologistVerified(tenantId, verified);

    for (const row of verified) {
      auditService.log({
        userId,
        tenantId,
        action: "PATHOLOGIST_VERIFIED",
        entity: "lab_result",
        entityId: row.labResultId,
        metadata: { orderId: row.orderId, orderNumber: row.orderNumber, batch: true }
      });
    }

    const orderIds = [...new Set(verified.map((v) => v.orderId))];
    const reports: Array<{ orderId: string; reportUrl: string; verifyUrl: string }> = [];
    for (const orderId of orderIds) {
      const report = await nablPdfEngine.generateForOrder({ tenantId, userId, orderId });
      reports.push({ orderId: report.orderId, reportUrl: report.reportUrl, verifyUrl: report.verifyUrl });
      try {
        await finalizeOrderVerification(tenantId, orderId);
        await reportDistributionService.distribute({
          tenantId,
          userId,
          orderId,
          channels: ["WHATSAPP", "WEBHOOK"]
        });
        await markReportDispatched(tenantId, orderId);
        const pipeline = await getOrderPipelineStatus(tenantId, orderId);
        emitOrderPipelineUpdate(tenantId, orderId, pipeline);
        auditService.log({
          userId,
          tenantId,
          action: "REPORT_DISTRIBUTED",
          entity: "order_report",
          entityId: orderId,
          metadata: { auto: true }
        });
      } catch {
        // non-fatal
      }
    }

    return { verified, profile, reports };
  },

  /**
   * Pathologist rejects for rerun: status REJECTED (logged) then PROCESSING for technician;
   * linked samples forced back to RECEIVED_IN_LAB (lab "processing" stage).
   */
  async rejectRerun(
    tenantId: string,
    userId: string,
    input: { labResultId: string; note: string }
  ): Promise<PendingLabResultRow> {
    ensurePg();
    if (!input.note?.trim()) {
      throw new AppError("Pathologist note required", HTTP_STATUS.BAD_REQUEST, "NOTE_REQUIRED");
    }

    const existing = await db.query(
      `SELECT id, order_id, status FROM lab_results WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, input.labResultId]
    );
    const row = existing.rows[0];
    if (!row) throw new AppError("Lab result not found", HTTP_STATUS.NOT_FOUND, "LAB_RESULT_NOT_FOUND");
    if (row.status !== "TECHNICIAN_APPROVED") {
      throw new AppError("Only TECHNICIAN_APPROVED results can be rejected for rerun", HTTP_STATUS.CONFLICT, "INVALID_STATUS");
    }

    await db.query(
      `UPDATE lab_results
       SET status = 'REJECTED',
           pathologist_rejection_note = $3,
           pathologist_user_id = $4,
           rerun_instructions = $3,
           technician_note = TRIM(BOTH E'\n' FROM CONCAT(COALESCE(technician_note, ''), E'\n[REJECTED FOR RERUN] ', $3)),
           updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, input.labResultId, input.note.trim(), userId]
    );

    // Move back to PROCESSING for technician re-entry
    await db.query(
      `UPDATE lab_results SET status = 'PROCESSING', qc_blocked = FALSE, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, input.labResultId]
    );

    // Return samples to lab processing pool (RECEIVED_IN_LAB)
    await db.query(
      `UPDATE samples
       SET status = 'RECEIVED_IN_LAB',
           rejection_reason = NULL,
           updated_at = NOW()
       WHERE tenant_id = $1 AND order_id = $2
         AND status IN ('RECEIVED_IN_LAB', 'REJECTED', 'COLLECTED', 'IN_TRANSIT')`,
      [tenantId, row.order_id]
    );

    auditService.log({
      userId,
      tenantId,
      action: "PATHOLOGIST_REJECTED",
      entity: "lab_result",
      entityId: input.labResultId,
      metadata: { note: input.note.trim(), orderId: row.order_id, nextStatus: "PROCESSING" }
    });

    const refreshed = await labResultService.getById(tenantId, input.labResultId);
    if (!refreshed) throw new AppError("Failed to reload result", HTTP_STATUS.INTERNAL_SERVER_ERROR, "RELOAD_FAILED");
    return refreshed;
  },

  getProfile(tenantId: string, userId: string): Promise<PathologistProfile> {
    return labResultService.getPathologistProfile(tenantId, userId);
  },

  upsertProfile(
    tenantId: string,
    userId: string,
    input: { fullName: string; medicalLicenseNumber: string; digitalSignatureUrl?: string | null }
  ): Promise<PathologistProfile> {
    return labResultService.upsertPathologistProfile(tenantId, userId, input);
  }
};
