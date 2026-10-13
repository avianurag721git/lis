import { randomUUID } from "crypto";
import { db } from "../../database/postgres";
import { env } from "../../config/env";
import { logger } from "../../common/logger/logger";
import { SubscriptionPlan, SubscriptionStatus } from "./saas.types";

const isPg = (): boolean => Boolean(env.databaseUrl);

export const subscriptionRepository = {
  async createInitialSubscription(
    tenantId: string,
    plan: SubscriptionPlan,
    status: SubscriptionStatus = "ACTIVE"
  ): Promise<void> {
    if (!isPg()) {
      return;
    }
    const id = randomUUID();
    await db.query(
      `INSERT INTO subscriptions (id, tenant_id, plan, status, current_period_start, current_period_end, cancel_at_period_end)
       VALUES ($1, $2, $3, $4, NOW(), NOW() + INTERVAL '30 days', FALSE)`,
      [id, tenantId, plan, status]
    );
  },

  async listForTenant(tenantId: string, limit: number = 5): Promise<
    {
      id: string;
      plan: SubscriptionPlan;
      status: SubscriptionStatus;
      currentPeriodEnd: string;
    }[]
  > {
    if (!isPg()) {
      return [];
    }
    try {
      const result = await db.query(
        `SELECT id, plan, status, current_period_end FROM subscriptions
         WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2`,
        [tenantId, limit]
      );
      return result.rows.map((r: { id: string; plan: string; status: string; current_period_end: Date }) => ({
        id: r.id,
        plan: r.plan as SubscriptionPlan,
        status: r.status as SubscriptionStatus,
        currentPeriodEnd: r.current_period_end.toISOString()
      }));
    } catch (err) {
      logger.warn({ err, tenantId }, "subscriptions list failed (SaaS schema may be missing)");
      return [];
    }
  }
};
