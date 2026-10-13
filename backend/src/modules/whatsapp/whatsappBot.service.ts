import { db } from "../../database/postgres";
import { env } from "../../config/env";
import { decryptReportBuffer, nablPdfEngine } from "../pdf-engine/nablPdf.engine";
import { ordersService } from "../orders/orders.service";
import { patientsRepository } from "../patients/patients.repository";
import { whatsappCloudService } from "./whatsappCloud.service";
import { whatsappSessionRepository } from "./whatsappSession.repository";
import {
  IncomingWhatsAppMessage,
  OutboundWhatsAppMessage,
  WhatsAppSession,
  WhatsAppSessionState
} from "./whatsapp.types";
import { logger } from "../../common/logger/logger";

const defaultTenant = (): string => env.whatsappDefaultTenantId || env.authSeedTenantId;

const mainMenuMessage = (): OutboundWhatsAppMessage => ({
  kind: "buttons",
  body: "Welcome to DiagLab 🏥\nHow can we help you today?",
  buttons: [
    { id: "download_report", title: "📄 Download Report" },
    { id: "book_home", title: "🏠 Book Collection" },
    { id: "track_sample", title: "📍 Track Sample" }
  ]
});

const normalizeLookup = (raw: string): string => raw.trim();

const findPatientReport = async (
  tenantId: string,
  lookup: string
): Promise<{ orderId: string; orderNumber: string; patientName: string } | null> => {
  if (!env.databaseUrl) return null;
  const q = normalizeLookup(lookup);
  const byPhone = q.replace(/\D/g, "");
  const result = await db.query(
    `SELECT o.id AS order_id, o.order_number, p.name AS patient_name
     FROM order_bookings o
     JOIN patients p ON p.id = o.patient_id
     JOIN order_reports r ON r.tenant_id = o.tenant_id AND r.order_id = o.id
     WHERE o.tenant_id = $1
       AND (
         p.phone = $2 OR p.phone = $3 OR p.uhid = $4 OR p.patient_code = $4
       )
     ORDER BY r.created_at DESC
     LIMIT 1`,
    [tenantId, q, byPhone.length >= 10 ? `+${byPhone}` : q, q.toUpperCase()]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    orderId: row.order_id as string,
    orderNumber: row.order_number as string,
    patientName: row.patient_name as string
  };
};

const findLatestOrderStatus = async (
  tenantId: string,
  lookup: string
): Promise<{ orderNumber: string; status: string; samples: string[]; trackUrl: string | null } | null> => {
  if (!env.databaseUrl) return null;
  const q = normalizeLookup(lookup);
  const byPhone = q.replace(/\D/g, "");
  const orderRow = await db.query(
    `SELECT o.id, o.order_number, o.status, o.collection_type
     FROM order_bookings o
     JOIN patients p ON p.id = o.patient_id
     WHERE o.tenant_id = $1
       AND (p.phone = $2 OR p.phone = $3 OR p.uhid = $4 OR p.patient_code = $4)
     ORDER BY o.created_at DESC
     LIMIT 1`,
    [tenantId, q, byPhone.length >= 10 ? `+${byPhone}` : q, q.toUpperCase()]
  );
  const order = orderRow.rows[0];
  if (!order) return null;

  const samples = await db.query(
    `SELECT barcode, status FROM samples WHERE tenant_id = $1 AND order_id = $2 ORDER BY created_at ASC`,
    [tenantId, order.id]
  );

  const trackUrl =
    order.collection_type === "HOME_COLLECTION"
      ? `${env.publicVerifyBaseUrl.replace(/\/verify.*$/, "")}/track-phleb/${order.id}`
      : null;

  return {
    orderNumber: order.order_number as string,
    status: order.status as string,
    samples: samples.rows.map((s) => `${s.barcode}: ${s.status}`),
    trackUrl
  };
};

const bookHomeCollection = async (
  tenantId: string,
  phone: string,
  ctx: Record<string, unknown>
): Promise<string> => {
  const address = String(ctx.address ?? "").trim();
  const preferredTime = String(ctx.preferredTime ?? "").trim();
  const testsRaw = String(ctx.tests ?? "").trim();

  const { tests } = await ordersService.listCatalog(tenantId);
  const matched = tests.filter((t) => {
    const needle = testsRaw.toLowerCase();
    return t.name.toLowerCase().includes(needle) || (t.code?.toLowerCase().includes(needle) ?? false);
  });

  const testItems =
    matched.length > 0
      ? matched.slice(0, 5).map((t) => ({ itemType: "TEST" as const, testId: t.id, quantity: 1 }))
      : tests.slice(0, 1).map((t) => ({ itemType: "TEST" as const, testId: t.id, quantity: 1 }));

  const { patient } = await patientsRepository.createOrFind(tenantId, {
    name: `WhatsApp Patient ${phone.slice(-4)}`,
    phone: phone.startsWith("+") ? phone : `+${phone.replace(/\D/g, "")}`,
    mobile: phone.replace(/\D/g, "")
  });

  const booked = await ordersService.book(tenantId, env.analyzerSystemUserId, {
    patientId: patient.id,
    collectionType: "HOME_COLLECTION",
    items: testItems,
    referredDoctor: "WhatsApp Bot"
  });

  if (env.databaseUrl && address) {
    await db.query(
      `UPDATE order_bookings
       SET collection_address = $3,
           collection_notes = $4,
           preferred_collection_time = CASE WHEN $5::text <> '' THEN $5::timestamptz ELSE NULL END,
           updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2`,
      [
        tenantId,
        booked.order.id,
        address,
        testsRaw || null,
        preferredTime ? new Date(preferredTime).toISOString() : ""
      ]
    );
  }

  const trackUrl = `${env.publicVerifyBaseUrl.replace(/\/verify.*$/, "")}/track-phleb/${booked.order.id}`;
  return `✅ Home collection booked!\nBooking: ${booked.order.orderNumber}\nTests: ${testItems.length} panel(s)\nAddress: ${address}\nPreferred: ${preferredTime || "ASAP"}\n\nTrack phlebotomist live:\n${trackUrl}`;
};

export const whatsappBotService = {
  parseWebhookBody(body: unknown): IncomingWhatsAppMessage[] {
    const messages: IncomingWhatsAppMessage[] = [];
    const b = body as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            messages?: Array<{
              from: string;
              id: string;
              type: string;
              text?: { body?: string };
              interactive?: { type?: string; button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } };
            }>;
          };
        }>;
      }>;
    };

    for (const entry of b.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const msg of change.value?.messages ?? []) {
          if (msg.type === "text" && msg.text?.body) {
            messages.push({ from: msg.from, messageId: msg.id, type: "text", text: msg.text.body });
          } else if (msg.type === "interactive") {
            const btn = msg.interactive?.button_reply ?? msg.interactive?.list_reply;
            if (btn) {
              messages.push({
                from: msg.from,
                messageId: msg.id,
                type: "interactive",
                buttonId: btn.id,
                buttonTitle: btn.title,
                text: btn.title
              });
            }
          }
        }
      }
    }
    return messages;
  },

  async handleIncoming(msg: IncomingWhatsAppMessage): Promise<void> {
    const phone = msg.from.replace(/\D/g, "");
    const tenantId = defaultTenant();
    let session =
      (await whatsappSessionRepository.get(phone)) ??
      (await whatsappSessionRepository.reset(phone, tenantId));

    const replies: OutboundWhatsAppMessage[] = [];
    const text = (msg.text ?? msg.buttonTitle ?? "").trim();
    const buttonId = msg.buttonId ?? "";

    if (buttonId === "download_report" || text.toLowerCase() === "menu") {
      session.state = "REPORT_LOOKUP";
      session.context = {};
      replies.push({ kind: "text", body: "Please enter your UHID or registered mobile number to download your report." });
    } else if (buttonId === "book_home") {
      session.state = "BOOK_ADDRESS";
      session.context = {};
      replies.push({ kind: "text", body: "🏠 Home Collection\n\nPlease send your full collection address (pin code included)." });
    } else if (buttonId === "track_sample") {
      session.state = "TRACK_LOOKUP";
      session.context = {};
      replies.push({ kind: "text", body: "Please enter your UHID or mobile number to track sample status." });
    } else {
      replies.push(...(await this.handleState(session, text, buttonId)));
    }

    await whatsappSessionRepository.upsert(session);

    for (const reply of replies) {
      try {
        await whatsappCloudService.send(phone, reply);
      } catch (err) {
        logger.error({ err, phone }, "WhatsApp outbound failed");
      }
    }
  },

  async handleState(
    session: WhatsAppSession,
    text: string,
    buttonId: string
  ): Promise<OutboundWhatsAppMessage[]> {
    const replies: OutboundWhatsAppMessage[] = [];
    const tenantId = session.tenantId;

    if (text.toLowerCase() === "hi" || text.toLowerCase() === "hello" || text.toLowerCase() === "menu") {
      session.state = "MENU";
      session.context = {};
      replies.push(mainMenuMessage());
      return replies;
    }

    switch (session.state as WhatsAppSessionState) {
      case "REPORT_LOOKUP": {
        const report = await findPatientReport(tenantId, text);
        if (!report) {
          replies.push({
            kind: "text",
            body: "No verified report found for that UHID/mobile. Reply *menu* to try again."
          });
          session.state = "MENU";
          break;
        }
        try {
          const { encrypted, fileName } = await nablPdfEngine.getEncryptedFile(tenantId, report.orderId);
          const pdf = decryptReportBuffer(encrypted);
          replies.push({
            kind: "document",
            caption: `Report for ${report.patientName} (${report.orderNumber})`,
            filename: fileName,
            pdfBuffer: pdf
          });
        } catch {
          replies.push({
            kind: "text",
            body: `Report for ${report.orderNumber} is being prepared. Please try again shortly or visit the lab.`
          });
        }
        session.state = "MENU";
        replies.push(mainMenuMessage());
        break;
      }

      case "BOOK_ADDRESS": {
        session.context.address = text;
        session.state = "BOOK_TIME";
        replies.push({
          kind: "text",
          body: "Preferred collection date & time?\n(e.g. `2026-08-31 09:00` or `Tomorrow morning`)"
        });
        break;
      }

      case "BOOK_TIME": {
        session.context.preferredTime = text;
        session.state = "BOOK_TESTS";
        replies.push({
          kind: "text",
          body: "Which tests do you need?\n(e.g. `CBC, Lipid Profile, HbA1c` — we will match from our catalog)"
        });
        break;
      }

      case "BOOK_TESTS": {
        session.context.tests = text;
        try {
          const confirmation = await bookHomeCollection(tenantId, session.phone, session.context);
          replies.push({ kind: "text", body: confirmation });
        } catch (err) {
          logger.error({ err }, "WhatsApp home booking failed");
          replies.push({ kind: "text", body: "Sorry, we could not complete booking. Please call the lab or reply *menu*." });
        }
        session.state = "MENU";
        session.context = {};
        replies.push(mainMenuMessage());
        break;
      }

      case "TRACK_LOOKUP": {
        const status = await findLatestOrderStatus(tenantId, text);
        if (!status) {
          replies.push({ kind: "text", body: "No booking found. Reply *menu* to start over." });
          session.state = "MENU";
          break;
        }
        const sampleLines = status.samples.length ? status.samples.join("\n") : "No samples yet";
        let body = `📍 *Sample Status*\nBooking: ${status.orderNumber}\nOrder: ${status.status}\n\n${sampleLines}`;
        if (status.trackUrl) {
          body += `\n\n🚗 Live phlebotomist tracking:\n${status.trackUrl}`;
        }
        replies.push({ kind: "text", body });
        session.state = "MENU";
        replies.push(mainMenuMessage());
        break;
      }

      default:
        session.state = "MENU";
        replies.push(mainMenuMessage());
    }

    void buttonId;
    return replies;
  },

  async sendMainMenu(to: string): Promise<void> {
    await whatsappCloudService.send(to.replace(/\D/g, ""), mainMenuMessage());
  }
};
