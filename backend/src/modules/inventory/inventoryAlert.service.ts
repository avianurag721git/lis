import { logger } from "../../common/logger/logger";
import { env } from "../../config/env";

/**
 * Low-stock / QC email alerts. Uses webhook when configured; always logs.
 */
export const inventoryAlertService = {
  async sendLowStockAlert(input: {
    tenantId: string;
    reagentName: string;
    lotNumber: string;
    remainingTests: number;
    reorderLevel: number;
    purchaseOrderNumber?: string;
  }): Promise<void> {
    const subject = `[DiagLab] Low reagent stock: ${input.reagentName} (${input.lotNumber})`;
    const poLine = input.purchaseOrderNumber
      ? ` Auto-drafted purchase order ${input.purchaseOrderNumber}.`
      : "";
    const body = `Tenant ${input.tenantId}: reagent "${input.reagentName}" lot ${input.lotNumber} has ${input.remainingTests} tests remaining (reorder level ${input.reorderLevel}).${poLine}`;

    logger.warn({ ...input, subject }, "REAGENT_LOW_STOCK_ALERT");

    if (env.inventoryAlertWebhookUrl) {
      try {
        await fetch(env.inventoryAlertWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel: "EMAIL",
            event: "REAGENT_LOW_STOCK",
            to: env.inventoryAlertEmail || undefined,
            subject,
            body,
            ...input
          })
        });
      } catch (err) {
        logger.error({ err }, "Low stock email webhook failed");
      }
    } else if (env.inventoryAlertEmail) {
      logger.info(
        { to: env.inventoryAlertEmail, subject, body },
        "EMAIL alert queued (set INVENTORY_ALERT_WEBHOOK_URL for delivery)"
      );
    }
  },

  async sendQcHoldAlert(input: {
    tenantId: string;
    rule: string;
    parameterName: string;
    reagentLot?: string | null;
    instrumentCode?: string | null;
  }): Promise<void> {
    const subject = `[DiagLab] QC HOLD: Westgard ${input.rule} on ${input.parameterName}`;
    const body = `QC reject rule ${input.rule} fired for ${input.parameterName}. Patient result verification is blocked until hold is resolved.`;
    logger.warn({ ...input, subject }, "QC_HOLD_ALERT");
    if (env.inventoryAlertWebhookUrl) {
      try {
        await fetch(env.inventoryAlertWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel: "EMAIL", event: "QC_HOLD", subject, body, ...input })
        });
      } catch (err) {
        logger.error({ err }, "QC hold email webhook failed");
      }
    }
  }
};
