import twilio from "twilio";
import { env } from "../../config/env";
import { logger } from "../../common/logger/logger";

const client = env.twilioAccountSid && env.twilioAuthToken ? twilio(env.twilioAccountSid, env.twilioAuthToken) : null;

const delay = async (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export type WhatsAppSendResult =
  | { status: "SENT"; mock: false }
  | { status: "SKIPPED"; mock: true; reason: string };

export const whatsappService = {
  isConfigured(): boolean {
    return Boolean(client && env.twilioWhatsappFrom);
  },

  async sendReportReadyMessage(input: {
    to: string;
    patientName: string;
    reportUrl: string;
  }): Promise<WhatsAppSendResult> {
    if (!client || !env.twilioWhatsappFrom) {
      logger.info(
        { to: input.to },
        "WhatsApp skipped — Twilio not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM)"
      );
      return {
        status: "SKIPPED",
        mock: true,
        reason: "Twilio WhatsApp not configured"
      };
    }

    const body = `Hello ${input.patientName}, your diagnostic report is ready. Download: ${input.reportUrl}`;

    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        await client.messages.create({
          from: env.twilioWhatsappFrom,
          to: input.to,
          body
        });
        return { status: "SENT", mock: false };
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        await delay(500 * attempt);
      }
    }

    throw new Error("WhatsApp send failed after retries");
  }
};
