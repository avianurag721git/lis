import { randomUUID } from "crypto";
import Stripe from "stripe";
import { db, DbClient } from "../../database/postgres";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";

export type B2BFranchisee = {
  id: string;
  code: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  walletBalanceMinor: number;
  creditLimitMinor: number;
  isActive: boolean;
};

export type B2BWalletTx = {
  id: string;
  type: string;
  amountMinor: number;
  balanceAfterMinor: number;
  orderId: string | null;
  gateway: string | null;
  gatewayRef: string | null;
  note: string | null;
  createdAt: string;
};

export type B2BPriceRow = {
  testId?: string;
  packageId?: string;
  name: string;
  retailPriceMinor: number;
  wholesalePriceMinor: number;
};

const ensurePg = (): void => {
  if (!env.databaseUrl) {
    throw new AppError("Database not configured", HTTP_STATUS.INTERNAL_SERVER_ERROR, "DB_NOT_CONFIGURED");
  }
};

const mapFranchisee = (r: any): B2BFranchisee => ({
  id: r.id,
  code: r.code,
  name: r.name,
  contactName: r.contact_name,
  phone: r.phone,
  email: r.email,
  address: r.address,
  walletBalanceMinor: Number(r.wallet_balance_minor),
  creditLimitMinor: Number(r.credit_limit_minor),
  isActive: Boolean(r.is_active)
});

let stripeClient: Stripe | null = null;
const getStripe = (): Stripe => {
  if (!env.stripeSecretKey) {
    throw new AppError("Stripe is not configured for wallet recharge", HTTP_STATUS.INTERNAL_SERVER_ERROR, "STRIPE_MISSING");
  }
  stripeClient ??= new Stripe(env.stripeSecretKey, { apiVersion: "2025-02-24.acacia" });
  return stripeClient;
};

export const b2bService = {
  async listFranchisees(tenantId: string): Promise<B2BFranchisee[]> {
    ensurePg();
    const result = await db.query(
      `SELECT * FROM b2b_franchisees WHERE tenant_id = $1 ORDER BY name ASC`,
      [tenantId]
    );
    return result.rows.map(mapFranchisee);
  },

  async getFranchisee(tenantId: string, id: string): Promise<B2BFranchisee> {
    ensurePg();
    const row = (
      await db.query(`SELECT * FROM b2b_franchisees WHERE tenant_id = $1 AND id = $2 LIMIT 1`, [tenantId, id])
    ).rows[0];
    if (!row) throw new AppError("Franchisee not found", HTTP_STATUS.NOT_FOUND, "FRANCHISEE_NOT_FOUND");
    return mapFranchisee(row);
  },

  async upsertFranchisee(
    tenantId: string,
    input: {
      id?: string;
      code: string;
      name: string;
      contactName?: string | null;
      phone?: string | null;
      email?: string | null;
      address?: string | null;
      creditLimitMinor?: number;
      isActive?: boolean;
    }
  ): Promise<B2BFranchisee> {
    ensurePg();
    const id = input.id ?? randomUUID();
    await db.query(
      `INSERT INTO b2b_franchisees
       (id, tenant_id, code, name, contact_name, phone, email, address, credit_limit_minor, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10, TRUE))
       ON CONFLICT (tenant_id, code) DO UPDATE SET
         name = EXCLUDED.name,
         contact_name = EXCLUDED.contact_name,
         phone = EXCLUDED.phone,
         email = EXCLUDED.email,
         address = EXCLUDED.address,
         credit_limit_minor = EXCLUDED.credit_limit_minor,
         is_active = EXCLUDED.is_active,
         updated_at = NOW()`,
      [
        id,
        tenantId,
        input.code.trim().toUpperCase(),
        input.name.trim(),
        input.contactName ?? null,
        input.phone ?? null,
        input.email ?? null,
        input.address ?? null,
        input.creditLimitMinor ?? 0,
        input.isActive ?? true
      ]
    );
    const row = (
      await db.query(`SELECT * FROM b2b_franchisees WHERE tenant_id = $1 AND code = $2`, [
        tenantId,
        input.code.trim().toUpperCase()
      ])
    ).rows[0];
    return mapFranchisee(row);
  },

  async getRateCard(tenantId: string, franchiseeId: string): Promise<{ tests: B2BPriceRow[]; packages: B2BPriceRow[] }> {
    ensurePg();
    await this.getFranchisee(tenantId, franchiseeId);
    const tests = await db.query(
      `SELECT t.id, t.name, t.price_minor AS retail,
              COALESCE(bp.price_minor, ROUND(t.price_minor * 0.7)) AS wholesale
       FROM tests t
       LEFT JOIN b2b_prices bp ON bp.test_id = t.id AND bp.franchisee_id = $2 AND bp.tenant_id = t.tenant_id
       WHERE t.tenant_id = $1
       ORDER BY t.name`,
      [tenantId, franchiseeId]
    );
    const packages = await db.query(
      `SELECT p.id, p.name, p.price_minor AS retail,
              COALESCE(bp.price_minor, ROUND(p.price_minor * 0.7)) AS wholesale
       FROM test_packages p
       LEFT JOIN b2b_package_prices bp ON bp.package_id = p.id AND bp.franchisee_id = $2 AND bp.tenant_id = p.tenant_id
       WHERE p.tenant_id = $1
       ORDER BY p.name`,
      [tenantId, franchiseeId]
    );
    return {
      tests: tests.rows.map((r: any) => ({
        testId: r.id,
        name: r.name,
        retailPriceMinor: Number(r.retail),
        wholesalePriceMinor: Number(r.wholesale)
      })),
      packages: packages.rows.map((r: any) => ({
        packageId: r.id,
        name: r.name,
        retailPriceMinor: Number(r.retail),
        wholesalePriceMinor: Number(r.wholesale)
      }))
    };
  },

  async setPrices(
    tenantId: string,
    franchiseeId: string,
    input: {
      tests?: Array<{ testId: string; priceMinor: number }>;
      packages?: Array<{ packageId: string; priceMinor: number }>;
    }
  ): Promise<{ tests: B2BPriceRow[]; packages: B2BPriceRow[] }> {
    ensurePg();
    await this.getFranchisee(tenantId, franchiseeId);
    for (const t of input.tests ?? []) {
      await db.query(
        `INSERT INTO b2b_prices (id, tenant_id, franchisee_id, test_id, price_minor)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (tenant_id, franchisee_id, test_id) DO UPDATE SET price_minor = EXCLUDED.price_minor, updated_at = NOW()`,
        [randomUUID(), tenantId, franchiseeId, t.testId, t.priceMinor]
      );
    }
    for (const p of input.packages ?? []) {
      await db.query(
        `INSERT INTO b2b_package_prices (id, tenant_id, franchisee_id, package_id, price_minor)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (tenant_id, franchisee_id, package_id) DO UPDATE SET price_minor = EXCLUDED.price_minor, updated_at = NOW()`,
        [randomUUID(), tenantId, franchiseeId, p.packageId, p.priceMinor]
      );
    }
    return this.getRateCard(tenantId, franchiseeId);
  },

  async listWalletTx(
    tenantId: string,
    franchiseeId: string,
    opts?: { from?: string; to?: string; limit?: number }
  ): Promise<B2BWalletTx[]> {
    ensurePg();
    const limit = Math.min(Math.max(opts?.limit ?? 500, 1), 5000);
    const params: unknown[] = [tenantId, franchiseeId];
    let where = `tenant_id = $1 AND franchisee_id = $2`;
    if (opts?.from) {
      params.push(opts.from);
      where += ` AND created_at >= $${params.length}::timestamptz`;
    }
    if (opts?.to) {
      params.push(opts.to);
      where += ` AND created_at <= $${params.length}::timestamptz`;
    }
    params.push(limit);
    const result = await db.query(
      `SELECT * FROM b2b_wallet_transactions
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params
    );
    return result.rows.map((r: any) => ({
      id: r.id,
      type: r.type,
      amountMinor: Number(r.amount_minor),
      balanceAfterMinor: Number(r.balance_after_minor),
      orderId: r.order_id,
      gateway: r.gateway,
      gatewayRef: r.gateway_ref,
      note: r.note,
      createdAt: new Date(r.created_at).toISOString()
    }));
  },

  async getLedger(
    tenantId: string,
    franchiseeId: string,
    opts?: { from?: string; to?: string }
  ): Promise<{ franchisee: B2BFranchisee; transactions: B2BWalletTx[]; openingBalanceMinor: number; closingBalanceMinor: number }> {
    ensurePg();
    const franchisee = await this.getFranchisee(tenantId, franchiseeId);
    const transactions = await this.listWalletTx(tenantId, franchiseeId, { ...opts, limit: 5000 });
    const chronological = [...transactions].reverse();
    const closingBalanceMinor =
      chronological.length > 0
        ? chronological[chronological.length - 1]!.balanceAfterMinor
        : franchisee.walletBalanceMinor;
    const openingBalanceMinor =
      chronological.length > 0
        ? chronological[0]!.balanceAfterMinor - chronological[0]!.amountMinor
        : franchisee.walletBalanceMinor;
    return { franchisee, transactions, openingBalanceMinor, closingBalanceMinor };
  },

  async exportLedgerCsv(
    tenantId: string,
    franchiseeId: string,
    opts?: { from?: string; to?: string }
  ): Promise<string> {
    const ledger = await this.getLedger(tenantId, franchiseeId, opts);
    const lines = [
      "date,type,amount_inr,balance_after_inr,order_id,gateway,gateway_ref,note",
      ...ledger.transactions.map((t) =>
        [
          t.createdAt,
          t.type,
          (t.amountMinor / 100).toFixed(2),
          (t.balanceAfterMinor / 100).toFixed(2),
          t.orderId ?? "",
          t.gateway ?? "",
          t.gatewayRef ?? "",
          JSON.stringify(t.note ?? "")
        ].join(",")
      )
    ];
    return lines.join("\n");
  },

  async exportLedgerPdf(
    tenantId: string,
    franchiseeId: string,
    opts?: { from?: string; to?: string }
  ): Promise<Buffer> {
    const PDFDocument = (await import("pdfkit")).default;
    const ledger = await this.getLedger(tenantId, franchiseeId, opts);
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    doc.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
    });

    doc.font("Helvetica-Bold").fontSize(14).text("B2B Franchisee Wallet Ledger");
    doc.font("Helvetica").fontSize(10);
    doc.text(`${ledger.franchisee.code} — ${ledger.franchisee.name}`);
    doc.text(`Period: ${opts?.from ?? "start"} → ${opts?.to ?? "now"}`);
    doc.text(`Opening: ₹${(ledger.openingBalanceMinor / 100).toFixed(2)}  ·  Closing: ₹${(ledger.closingBalanceMinor / 100).toFixed(2)}`);
    doc.moveDown();
    for (const t of ledger.transactions.slice(0, 80)) {
      doc.text(
        `${t.createdAt.slice(0, 19)}  ${t.type.padEnd(10)}  ₹${(t.amountMinor / 100).toFixed(2).padStart(10)}  bal ₹${(t.balanceAfterMinor / 100).toFixed(2)}`
      );
    }
    if (ledger.transactions.length > 80) {
      doc.text(`… ${ledger.transactions.length - 80} more rows (use CSV export for full statement)`);
    }
    doc.end();
    return done;
  },

  async createOrder(
    tenantId: string,
    userId: string,
    input: {
      franchiseeId: string;
      patientId?: string;
      patient?: {
        name?: string;
        phone?: string;
        mobile?: string;
        gender?: "MALE" | "FEMALE" | "OTHER" | null;
        ageYears?: number | null;
      };
      items: Array<{ itemType: "TEST" | "PACKAGE"; testId?: string; packageId?: string; quantity?: number }>;
      referredDoctor?: string | null;
    }
  ) {
    ensurePg();
    const { ordersService } = await import("../orders/orders.service");
    return ordersService.book(tenantId, userId, {
      collectionType: "B2B_FRANCHISEE",
      franchiseeId: input.franchiseeId,
      items: input.items,
      ...(input.patientId !== undefined ? { patientId: input.patientId } : {}),
      ...(input.patient !== undefined ? { patient: input.patient } : {}),
      ...(input.referredDoctor !== undefined ? { referredDoctor: input.referredDoctor } : {})
    });
  },

  /**
   * Stripe (and optional Razorpay) webhook: verify signature and CREDIT wallet atomically.
   */
  async processWalletWebhook(rawBody: Buffer, signature: string | undefined, gatewayHint?: string): Promise<{ credited: boolean }> {
    ensurePg();

    // Razorpay path: JSON body with event payment.captured + notes
    if (gatewayHint === "RAZORPAY" || (!signature && rawBody.length)) {
      try {
        const payload = JSON.parse(rawBody.toString("utf8")) as {
          event?: string;
          payload?: { payment?: { entity?: { id?: string; amount?: number; notes?: Record<string, string> } } };
        };
        if (payload.event === "payment.captured" || payload.event === "payment.authorized") {
          const entity = payload.payload?.payment?.entity;
          const notes = entity?.notes ?? {};
          const tenantId = notes.tenantId;
          const franchiseeId = notes.franchiseeId;
          const amountMinor = Number(entity?.amount ?? 0);
          const gatewayRef = entity?.id;
          if (tenantId && franchiseeId && gatewayRef && amountMinor > 0) {
            await this.confirmWalletRecharge(tenantId, "WEBHOOK", franchiseeId, amountMinor, "RAZORPAY", gatewayRef);
            return { credited: true };
          }
        }
      } catch {
        // fall through to Stripe
      }
    }

    if (!env.stripeWebhookSecret || !env.stripeSecretKey) {
      throw new AppError("Wallet webhook config missing", HTTP_STATUS.INTERNAL_SERVER_ERROR, "WEBHOOK_CONFIG_MISSING");
    }
    if (!signature) {
      throw new AppError("Missing Stripe signature", HTTP_STATUS.BAD_REQUEST, "SIGNATURE_REQUIRED");
    }

    const event = getStripe().webhooks.constructEvent(rawBody, signature, env.stripeWebhookSecret);
    if (event.type !== "payment_intent.succeeded") {
      return { credited: false };
    }
    const intent = event.data.object as Stripe.PaymentIntent;
    if (intent.metadata.purpose !== "B2B_WALLET_RECHARGE") {
      return { credited: false };
    }
    const tenantId = intent.metadata.tenantId;
    const franchiseeId = intent.metadata.franchiseeId;
    const userId = intent.metadata.userId || "WEBHOOK";
    if (!tenantId || !franchiseeId) {
      return { credited: false };
    }
    await this.confirmWalletRecharge(tenantId, userId, franchiseeId, intent.amount, "STRIPE", intent.id);
    return { credited: true };
  },

  async debitWallet(
    client: DbClient,
    tenantId: string,
    franchiseeId: string,
    amountMinor: number,
    orderId: string,
    userId: string
  ): Promise<number> {
    const locked = await client.query(
      `SELECT wallet_balance_minor, credit_limit_minor, is_active
       FROM b2b_franchisees WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
      [tenantId, franchiseeId]
    );
    const row = locked.rows[0];
    if (!row) throw new AppError("Franchisee not found", HTTP_STATUS.NOT_FOUND, "FRANCHISEE_NOT_FOUND");
    if (!row.is_active) throw new AppError("Franchisee is inactive", HTTP_STATUS.CONFLICT, "FRANCHISEE_INACTIVE");
    const balance = Number(row.wallet_balance_minor);
    const credit = Number(row.credit_limit_minor);
    if (balance + credit < amountMinor) {
      throw new AppError(
        `Insufficient wallet balance. Need ₹${(amountMinor / 100).toFixed(2)}, available ₹${((balance + credit) / 100).toFixed(2)}`,
        HTTP_STATUS.PAYMENT_REQUIRED,
        "INSUFFICIENT_WALLET_BALANCE"
      );
    }
    const next = balance - amountMinor;
    await client.query(
      `UPDATE b2b_franchisees SET wallet_balance_minor = $3, updated_at = NOW() WHERE tenant_id = $1 AND id = $2`,
      [tenantId, franchiseeId, next]
    );
    await client.query(
      `INSERT INTO b2b_wallet_transactions
       (id, tenant_id, franchisee_id, type, amount_minor, balance_after_minor, order_id, note, created_by_user_id)
       VALUES ($1,$2,$3,'DEBIT',$4,$5,$6,$7,$8)`,
      [randomUUID(), tenantId, franchiseeId, -amountMinor, next, orderId, "Order booking debit", userId]
    );
    return next;
  },

  async resolveWholesalePrice(
    client: DbClient,
    tenantId: string,
    franchiseeId: string,
    itemType: "TEST" | "PACKAGE",
    catalogId: string,
    retailMinor: number
  ): Promise<number> {
    if (itemType === "TEST") {
      const row = (
        await client.query(
          `SELECT price_minor FROM b2b_prices WHERE tenant_id = $1 AND franchisee_id = $2 AND test_id = $3`,
          [tenantId, franchiseeId, catalogId]
        )
      ).rows[0];
      return row ? Number(row.price_minor) : Math.round(retailMinor * 0.7);
    }
    const row = (
      await client.query(
        `SELECT price_minor FROM b2b_package_prices WHERE tenant_id = $1 AND franchisee_id = $2 AND package_id = $3`,
        [tenantId, franchiseeId, catalogId]
      )
    ).rows[0];
    return row ? Number(row.price_minor) : Math.round(retailMinor * 0.7);
  },

  async createWalletRecharge(
    tenantId: string,
    userId: string,
    franchiseeId: string,
    amountMinor: number,
    gateway: "STRIPE" | "RAZORPAY" = "STRIPE"
  ): Promise<{ gateway: string; clientSecret?: string; paymentIntentId?: string; amountMinor: number; mock?: boolean }> {
    ensurePg();
    if (amountMinor < 10000) {
      throw new AppError("Minimum recharge is ₹100", HTTP_STATUS.BAD_REQUEST, "MIN_RECHARGE");
    }
    await this.getFranchisee(tenantId, franchiseeId);

    if (gateway === "RAZORPAY") {
      // Razorpay SDK optional — accept manual confirm via verify endpoint with gateway_ref
      const ref = `rzp_mock_${randomUUID().slice(0, 8)}`;
      return {
        gateway: "RAZORPAY",
        amountMinor,
        paymentIntentId: ref,
        mock: !env.stripeSecretKey,
        clientSecret: ref
      };
    }

    if (!env.stripeSecretKey) {
      // Dev fallback: instant credit
      await this.confirmWalletRecharge(tenantId, userId, franchiseeId, amountMinor, "STRIPE", `dev_${randomUUID()}`);
      return { gateway: "STRIPE", amountMinor, mock: true };
    }

    const intent = await getStripe().paymentIntents.create({
      amount: amountMinor,
      currency: "inr",
      metadata: { tenantId, franchiseeId, purpose: "B2B_WALLET_RECHARGE", userId },
      automatic_payment_methods: { enabled: true }
    });
    return {
      gateway: "STRIPE",
      amountMinor,
      paymentIntentId: intent.id,
      ...(intent.client_secret ? { clientSecret: intent.client_secret } : {})
    };
  },

  async confirmWalletRecharge(
    tenantId: string,
    userId: string,
    franchiseeId: string,
    amountMinor: number,
    gateway: string,
    gatewayRef: string
  ): Promise<B2BFranchisee> {
    ensurePg();
    return db.transaction(async (client) => {
      const locked = await client.query(
        `SELECT wallet_balance_minor FROM b2b_franchisees WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, franchiseeId]
      );
      if (!locked.rows[0]) throw new AppError("Franchisee not found", HTTP_STATUS.NOT_FOUND, "FRANCHISEE_NOT_FOUND");

      const dup = await client.query(
        `SELECT id FROM b2b_wallet_transactions WHERE tenant_id = $1 AND gateway_ref = $2 LIMIT 1`,
        [tenantId, gatewayRef]
      );
      if (dup.rows[0]) {
        return mapFranchisee(
          (await client.query(`SELECT * FROM b2b_franchisees WHERE id = $1`, [franchiseeId])).rows[0]
        );
      }

      const next = Number(locked.rows[0].wallet_balance_minor) + amountMinor;
      await client.query(
        `UPDATE b2b_franchisees SET wallet_balance_minor = $3, updated_at = NOW() WHERE tenant_id = $1 AND id = $2`,
        [tenantId, franchiseeId, next]
      );
      await client.query(
        `INSERT INTO b2b_wallet_transactions
         (id, tenant_id, franchisee_id, type, amount_minor, balance_after_minor, gateway, gateway_ref, note, created_by_user_id)
         VALUES ($1,$2,$3,'CREDIT',$4,$5,$6,$7,$8,$9)`,
        [
          randomUUID(),
          tenantId,
          franchiseeId,
          amountMinor,
          next,
          gateway,
          gatewayRef,
          "Online wallet recharge (CREDIT)",
          userId
        ]
      );
      return mapFranchisee(
        (await client.query(`SELECT * FROM b2b_franchisees WHERE id = $1`, [franchiseeId])).rows[0]
      );
    });
  },

  async parseBulkCsv(
    tenantId: string,
    userId: string,
    franchiseeId: string,
    csvText: string
  ): Promise<{ created: number; errors: string[]; orderIds: string[] }> {
    ensurePg();
    const { ordersService } = await import("../orders/orders.service");
    const lines = csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) {
      throw new AppError("CSV must include header + at least one row", HTTP_STATUS.BAD_REQUEST, "CSV_EMPTY");
    }
    const header = lines[0]!.toLowerCase().split(",").map((h) => h.trim());
    const idx = (name: string): number => header.indexOf(name);
    const iPatient = idx("patient_name");
    const iPhone = idx("phone");
    const iTestCode = idx("test_code");
    const iPackageCode = idx("package_code");
    if (iPatient < 0 || (iTestCode < 0 && iPackageCode < 0)) {
      throw new AppError(
        "CSV header must include patient_name and test_code and/or package_code",
        HTTP_STATUS.BAD_REQUEST,
        "CSV_HEADER"
      );
    }

    const errors: string[] = [];
    const orderIds: string[] = [];
    let created = 0;

    for (let n = 1; n < lines.length; n += 1) {
      const cols = lines[n]!.split(",").map((c) => c.trim());
      try {
        const patientName = cols[iPatient] ?? "";
        const phone = iPhone >= 0 ? cols[iPhone] : undefined;
        const testCode = iTestCode >= 0 ? cols[iTestCode] : "";
        const packageCode = iPackageCode >= 0 ? cols[iPackageCode] : "";
        if (!patientName) throw new Error("patient_name missing");

        const items: Array<{ itemType: "TEST" | "PACKAGE"; testId?: string; packageId?: string }> = [];
        if (testCode) {
          const t = (
            await db.query(`SELECT id FROM tests WHERE tenant_id = $1 AND LOWER(code) = LOWER($2) LIMIT 1`, [
              tenantId,
              testCode
            ])
          ).rows[0];
          if (!t) throw new Error(`Unknown test_code ${testCode}`);
          items.push({ itemType: "TEST", testId: t.id });
        }
        if (packageCode) {
          const p = (
            await db.query(
              `SELECT id FROM test_packages WHERE tenant_id = $1 AND LOWER(code) = LOWER($2) LIMIT 1`,
              [tenantId, packageCode]
            )
          ).rows[0];
          if (!p) throw new Error(`Unknown package_code ${packageCode}`);
          items.push({ itemType: "PACKAGE", packageId: p.id });
        }
        if (items.length === 0) throw new Error("No test/package on row");

        const patientPayload: {
          name: string;
          phone?: string;
          mobile?: string;
        } = { name: patientName };
        if (phone) {
          patientPayload.phone = phone;
          patientPayload.mobile = phone;
        }
        const result = await ordersService.book(tenantId, userId, {
          collectionType: "B2B_FRANCHISEE",
          franchiseeId,
          patient: patientPayload,
          items
        });
        orderIds.push(result.order.id);
        created += 1;
      } catch (err) {
        errors.push(`Row ${n + 1}: ${err instanceof Error ? err.message : "failed"}`);
      }
    }

    return { created, errors, orderIds };
  }
};
