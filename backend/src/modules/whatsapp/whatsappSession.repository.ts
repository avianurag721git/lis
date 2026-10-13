import { db } from "../../database/postgres";
import { env } from "../../config/env";
import { WhatsAppSession, WhatsAppSessionState } from "./whatsapp.types";

const memSessions = new Map<string, WhatsAppSession>();

const isPg = (): boolean => Boolean(env.databaseUrl);

export const whatsappSessionRepository = {
  async get(phone: string): Promise<WhatsAppSession | null> {
    const key = phone.replace(/\D/g, "");
    if (isPg()) {
      try {
        const r = await db.query(
          `SELECT phone, tenant_id, state, context, updated_at FROM whatsapp_sessions WHERE phone = $1`,
          [key]
        );
        const row = r.rows[0];
        if (!row) return null;
        return {
          phone: row.phone,
          tenantId: row.tenant_id,
          state: row.state as WhatsAppSessionState,
          context: (row.context as Record<string, unknown>) ?? {},
          updatedAt: new Date(row.updated_at).toISOString()
        };
      } catch {
        /* fall through */
      }
    }
    return memSessions.get(key) ?? null;
  },

  async upsert(session: WhatsAppSession): Promise<void> {
    const key = session.phone.replace(/\D/g, "");
    memSessions.set(key, session);
    if (!isPg()) return;
    try {
      await db.query(
        `INSERT INTO whatsapp_sessions (phone, tenant_id, state, context, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, NOW())
         ON CONFLICT (phone) DO UPDATE SET
           tenant_id = EXCLUDED.tenant_id,
           state = EXCLUDED.state,
           context = EXCLUDED.context,
           updated_at = NOW()`,
        [key, session.tenantId, session.state, JSON.stringify(session.context)]
      );
    } catch {
      /* in-memory only */
    }
  },

  async reset(phone: string, tenantId: string): Promise<WhatsAppSession> {
    const session: WhatsAppSession = {
      phone: phone.replace(/\D/g, ""),
      tenantId,
      state: "MENU",
      context: {},
      updatedAt: new Date().toISOString()
    };
    await this.upsert(session);
    return session;
  }
};
