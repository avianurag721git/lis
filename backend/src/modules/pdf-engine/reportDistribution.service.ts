import { randomUUID } from "crypto";
import { db } from "../../database/postgres";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { logger } from "../../common/logger/logger";
import { whatsappService } from "../notification/whatsapp.service";
import { nablPdfEngine } from "./nablPdf.engine";
import { labResultService } from "../lab-results/labResult.service";
import { reportViewUrl } from "../orders/orderLifecycle.util";

export type DistributionChannel = "WHATSAPP" | "SMS" | "EMAIL" | "WEBHOOK";
export type DistributionStatus = "QUEUED" | "SENT" | "FAILED" | "SKIPPED";

export type DistributionResult = {
  channel: string;
  status: DistributionStatus;
  destination: string;
  mock?: boolean;
  reason?: string;
};

export const reportDistributionService = {
  async distribute(input: {
    tenantId: string;
    userId: string;
    orderId: string;
    channels?: DistributionChannel[];
    email?: string | null;
    phone?: string | null;
  }): Promise<{ distributions: DistributionResult[] }> {
    try {
      await nablPdfEngine.getEncryptedFile(input.tenantId, input.orderId);
    } catch {
      await nablPdfEngine.generateForOrder({
        tenantId: input.tenantId,
        userId: input.userId,
        orderId: input.orderId
      });
    }

    const verified = await labResultService.listVerifiedForOrder(input.tenantId, input.orderId);
    const patient = verified[0];
    if (!patient) {
      throw new AppError("No verified results for order", HTTP_STATUS.BAD_REQUEST, "NOT_VERIFIED");
    }

    const passcodeRow = (
      await db.query(`SELECT report_passcode FROM order_bookings WHERE tenant_id = $1 AND id = $2`, [
        input.tenantId,
        input.orderId
      ])
    ).rows[0];
    const passcode = passcodeRow?.report_passcode as string | null;
    const magicLink = passcode ? reportViewUrl(passcode) : null;
    const downloadUrl =
      magicLink ?? `${env.publicApiBaseUrl.replace(/\/$/, "")}/api/reports/download/${input.orderId}`;
    const channels = input.channels?.length ? input.channels : (["WHATSAPP", "WEBHOOK"] as DistributionChannel[]);
    const phone = input.phone ?? patient.patientPhone;
    const results: DistributionResult[] = [];

    for (const channel of channels) {
      const id = randomUUID();
      let destination = "";
      let status: DistributionStatus = "QUEUED";
      let lastError: string | null = null;
      let mock = false;
      let reason: string | undefined;

      try {
        if (channel === "WHATSAPP") {
          destination = phone ?? "";
          if (!destination) throw new Error("No phone for WhatsApp");
          const send = await whatsappService.sendReportReadyMessage({
            to: destination.startsWith("whatsapp:") ? destination : `whatsapp:${destination}`,
            patientName: patient.patientName,
            reportUrl: downloadUrl
          });
          status = send.status;
          mock = send.mock;
          if (send.status === "SKIPPED") reason = send.reason;
        } else if (channel === "SMS") {
          destination = phone ?? "";
          if (!destination) {
            status = "FAILED";
            lastError = "No phone for SMS";
          } else {
            // No SMS provider wired — honest mock queue, not SENT
            status = "SKIPPED";
            mock = true;
            reason = "SMS gateway not configured";
            logger.info({ orderId: input.orderId, destination }, "SMS distribution skipped (no SMS gateway)");
          }
        } else if (channel === "EMAIL") {
          destination = input.email ?? "";
          if (!destination) {
            status = "FAILED";
            lastError = "No email provided";
          } else {
            status = "SKIPPED";
            mock = true;
            reason = "Email gateway not configured";
            logger.info({ orderId: input.orderId, destination }, "Email distribution skipped (no email gateway)");
          }
        } else if (channel === "WEBHOOK") {
          destination = env.reportWebhookUrl || "inline-log";
          if (env.reportWebhookUrl) {
            const res = await fetch(env.reportWebhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                event: "REPORT_READY",
                orderId: input.orderId,
                patientName: patient.patientName,
                downloadUrl,
                tenantId: input.tenantId
              })
            });
            status = res.ok ? "SENT" : "FAILED";
            if (!res.ok) lastError = `Webhook HTTP ${res.status}`;
          } else {
            logger.info({ orderId: input.orderId, downloadUrl }, "REPORT_READY webhook skipped (no URL configured)");
            status = "SKIPPED";
            mock = true;
            reason = "REPORT_DISTRIBUTION_WEBHOOK_URL not configured";
          }
        }
      } catch (err) {
        status = "FAILED";
        lastError = err instanceof Error ? err.message : "distribute failed";
      }

      await db.query(
        `INSERT INTO report_distributions (id, tenant_id, order_id, channel, destination, status, payload, last_error)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
        [
          id,
          input.tenantId,
          input.orderId,
          channel,
          destination || "n/a",
          status,
          JSON.stringify({ downloadUrl, mock, reason: reason ?? null }),
          lastError ?? reason ?? null
        ]
      );
      results.push({
        channel,
        status,
        destination: destination || "n/a",
        ...(mock ? { mock: true } : {}),
        ...(reason ? { reason } : {})
      });
    }

    return { distributions: results };
  }
};
