import { env } from "../../config/env";
import { logger } from "../../common/logger/logger";
import { OutboundWhatsAppMessage } from "./whatsapp.types";

const graphBase = (): string => {
  const version = env.whatsappApiVersion || "v21.0";
  return `https://graph.facebook.com/${version}/${env.whatsappPhoneNumberId}`;
};

const normalizePhone = (phone: string): string => phone.replace(/\D/g, "");

export const whatsappCloudService = {
  isConfigured(): boolean {
    return Boolean(env.whatsappCloudToken && env.whatsappPhoneNumberId);
  },

  async send(to: string, message: OutboundWhatsAppMessage): Promise<void> {
    if (!this.isConfigured()) {
      logger.info({ to, message: message.kind }, "WhatsApp Cloud API not configured — message skipped");
      return;
    }

    const url = `${graphBase()}/messages`;
    const recipient = normalizePhone(to);

    let payload: Record<string, unknown>;

    if (message.kind === "text") {
      payload = {
        messaging_product: "whatsapp",
        to: recipient,
        type: "text",
        text: { body: message.body }
      };
    } else if (message.kind === "buttons") {
      payload = {
        messaging_product: "whatsapp",
        to: recipient,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: message.body },
          action: {
            buttons: message.buttons.slice(0, 3).map((b) => ({
              type: "reply",
              reply: { id: b.id, title: b.title.slice(0, 20) }
            }))
          }
        }
      };
    } else {
      const mediaId = await this.uploadDocument(message.pdfBuffer, message.filename);
      payload = {
        messaging_product: "whatsapp",
        to: recipient,
        type: "document",
        document: {
          id: mediaId,
          filename: message.filename,
          caption: message.caption
        }
      };
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.whatsappCloudToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`WhatsApp send failed ${res.status}: ${err.slice(0, 300)}`);
    }
  },

  async uploadDocument(pdfBuffer: Buffer, filename: string): Promise<string> {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append(
      "file",
      new Blob([pdfBuffer], { type: "application/pdf" }),
      filename.endsWith(".pdf") ? filename : `${filename}.pdf`
    );
    form.append("type", "application/pdf");

    const res = await fetch(`${graphBase()}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.whatsappCloudToken}` },
      body: form
    });
    if (!res.ok) {
      throw new Error(`WhatsApp media upload failed: ${await res.text()}`);
    }
    const json = (await res.json()) as { id?: string };
    if (!json.id) throw new Error("WhatsApp media upload missing id");
    return json.id;
  }
};
