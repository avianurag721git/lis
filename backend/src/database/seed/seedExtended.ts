import { randomUUID } from "crypto";
import { db } from "../postgres";
import { seedLog } from "./seedLogger";
import {
  APOLLO_TENANT_ID,
  CITYLABS_TENANT_ID,
  FRANCHISEE_ID,
  ORDER_IDS,
  PATIENT_IDS,
  PKG001_ID,
  REAGENT_ROCHE_ID,
  REAGENT_SYSMEX_ID
} from "./productionSeed.constants";
import type { CatalogSeedResult } from "./seedCatalog";
import type { ProductionUserIds } from "../../modules/auth/productionUsers.seed";

const rupees = (amount: number): number => amount * 100;

/**
 * Fill remaining empty tables with coherent Apollo-linked seed data
 * (billing ledger, referrals, QC holds, reports, SaaS metrics, etc.).
 */
export const seedProductionExtended = async (
  tenantId: string,
  catalog: CatalogSeedResult,
  users: ProductionUserIds
): Promise<void> => {
  seedLog.header("Extended linked seed (remaining tables)");

  const referralDoctorId = "a8000001-0001-4001-8001-000000000001";
  await db.query(
    `INSERT INTO referral_doctors
     (id, tenant_id, name, specialty, phone, doctor_code, clinic_name, whatsapp_number, commission_percentage, is_active, usage_count)
     VALUES ($1,$2,'Dr. Mehta Cardiology','Cardiology','9876511111','DOC-MEH','Mehta Heart Clinic','9876511111',7.5,TRUE,3)
     ON CONFLICT (tenant_id, name) DO UPDATE SET
       specialty = EXCLUDED.specialty,
       phone = EXCLUDED.phone,
       doctor_code = EXCLUDED.doctor_code,
       clinic_name = EXCLUDED.clinic_name`,
    [referralDoctorId, tenantId]
  );
  await db.query(
    `UPDATE order_bookings SET referral_doctor_id = $1 WHERE id = $2 AND tenant_id = $3`,
    [referralDoctorId, ORDER_IDS.ord1, tenantId]
  );
  seedLog.step("Referral doctor", "Dr. Mehta → ORD-20260830-001");

  for (const [code, price] of [
    ["CBC001", 200],
    ["HBA1C001", 350],
    ["KFT001", 450]
  ] as const) {
    const testId = catalog.testIds[code];
    if (!testId) continue;
    await db.query(
      `INSERT INTO b2b_prices (id, tenant_id, franchisee_id, test_id, price_minor)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (tenant_id, franchisee_id, test_id) DO UPDATE SET price_minor = EXCLUDED.price_minor`,
      [randomUUID(), tenantId, FRANCHISEE_ID, testId, rupees(price)]
    );
  }
  seedLog.step("B2B test prices", "CBC / HbA1c / KFT for Care Diagnostics");

  const billingInvoiceId = "a9000001-0001-4001-8001-000000000001";
  const paymentTxnId = "a9000001-0001-4001-8001-000000000002";
  const refundId = "a9000001-0001-4001-8001-000000000003";
  const paidMinor = rupees(2500);
  const refundMinor = rupees(200);

  await db.query(
    `INSERT INTO invoices (id, tenant_id, patient_id, total_amount_minor, paid_amount_minor, due_amount_minor, status)
     VALUES ($1,$2,$3,$4,$5,$6,'PARTIALLY_REFUNDED')
     ON CONFLICT (id) DO UPDATE SET
       paid_amount_minor = EXCLUDED.paid_amount_minor,
       due_amount_minor = EXCLUDED.due_amount_minor,
       status = EXCLUDED.status`,
    [billingInvoiceId, tenantId, PATIENT_IDS.rajesh, paidMinor, paidMinor - refundMinor, 0]
  );
  await db.query(
    `INSERT INTO payment_transactions
     (id, tenant_id, invoice_id, amount_minor, method, status, transaction_reference, gateway_order_id)
     VALUES ($1,$2,$3,$4,'UPI','CAPTURED','UPI-NEON-SEED-001','order_SEED_APOLLO_001')
     ON CONFLICT (id) DO NOTHING`,
    [paymentTxnId, tenantId, billingInvoiceId, paidMinor]
  );

  const ledgerExists = (
    await db.query(
      `SELECT 1 FROM ledger_entries WHERE tenant_id = $1 AND transaction_id = $2 AND refund_id IS NULL LIMIT 1`,
      [tenantId, paymentTxnId]
    )
  ).rowCount;
  if (!ledgerExists) {
    await db.query(
      `INSERT INTO ledger_entries (id, tenant_id, invoice_id, transaction_id, account_code, direction, amount_minor)
       VALUES ($1,$2,$3,$4,'CASH','DEBIT',$5), ($6,$2,$3,$4,'REVENUE','CREDIT',$5)`,
      [randomUUID(), tenantId, billingInvoiceId, paymentTxnId, paidMinor, randomUUID()]
    );
  }

  await db.query(
    `INSERT INTO refunds (id, tenant_id, invoice_id, transaction_id, amount_minor, reason, created_by_user_id)
     VALUES ($1,$2,$3,$4,$5,'Partial refund — duplicate package charge',$6)
     ON CONFLICT (id) DO NOTHING`,
    [refundId, tenantId, billingInvoiceId, paymentTxnId, refundMinor, users.cashier]
  );
  const refundLedgerExists = (
    await db.query(`SELECT 1 FROM ledger_entries WHERE refund_id = $1 LIMIT 1`, [refundId])
  ).rowCount;
  if (!refundLedgerExists) {
    await db.query(
      `INSERT INTO ledger_entries (id, tenant_id, invoice_id, transaction_id, refund_id, account_code, direction, amount_minor)
       VALUES ($1,$2,$3,$4,$5,'REVENUE','DEBIT',$6), ($7,$2,$3,$4,$5,'CASH','CREDIT',$6)`,
      [randomUUID(), tenantId, billingInvoiceId, paymentTxnId, refundId, refundMinor, randomUUID()]
    );
  }
  seedLog.step("Billing ledger", "Invoice + UPI capture + ₹200 refund");

  await db.query(
    `INSERT INTO idempotency_keys (id, tenant_id, operation, idempotency_key, response_json)
     VALUES ($1,$2,'payment.capture','seed-idem-apollo-ord001',$3::jsonb)
     ON CONFLICT (tenant_id, operation, idempotency_key) DO UPDATE SET response_json = EXCLUDED.response_json`,
    [
      randomUUID(),
      tenantId,
      JSON.stringify({ ok: true, invoiceId: billingInvoiceId, paymentTxnId })
    ]
  );

  const labResults = (
    await db.query(
      `SELECT id, test_id FROM lab_results WHERE tenant_id = $1 AND status = 'PATHOLOGIST_VERIFIED' ORDER BY created_at LIMIT 3`,
      [tenantId]
    )
  ).rows as Array<{ id: string; test_id: string | null }>;
  for (const lr of labResults) {
    await db.query(
      `INSERT INTO reagent_deductions (id, tenant_id, reagent_id, lab_result_id, test_id, deducted_count)
       VALUES ($1,$2,$3,$4,$5,1)
       ON CONFLICT (tenant_id, lab_result_id) DO NOTHING`,
      [randomUUID(), tenantId, REAGENT_SYSMEX_ID, lr.id, lr.test_id]
    );
  }
  seedLog.step("Reagent deductions", `${labResults.length} linked to verified results`);

  const rejectedControl = (
    await db.query(
      `SELECT id FROM control_sample_results WHERE tenant_id = $1 AND is_reject = TRUE ORDER BY run_date DESC LIMIT 1`,
      [tenantId]
    )
  ).rows[0] as { id: string } | undefined;
  if (rejectedControl) {
    await db.query(
      `INSERT INTO qc_holds
       (id, tenant_id, reason, westgard_rule, control_result_id, reagent_id, instrument_code, is_active)
       VALUES ($1,$2,'Hemoglobin control exceeded 1-3s — hold hematology release','1-3s',$3,$4,'SYSMEX-XN550',TRUE)`,
      [randomUUID(), tenantId, rejectedControl.id, REAGENT_SYSMEX_ID]
    );
    seedLog.step("QC hold", "Active 1-3s hold on Sysmex");
  }

  await db.query(
    `INSERT INTO purchase_orders
     (id, tenant_id, po_number, reagent_id, reagent_name, lot_number, quantity_vials, unit_cost_minor,
      supplier_name, status, notes, created_by_user_id)
     VALUES ($1,$2,'PO-2026-0841',$3,'Roche Cobas Creatinine Enzymatic','LOT-77121',10,$4,
             'Roche Diagnostics India','SUBMITTED','Reorder due to low stock',$5)
     ON CONFLICT (tenant_id, po_number) DO UPDATE SET status = EXCLUDED.status`,
    [randomUUID(), tenantId, REAGENT_ROCHE_ID, rupees(1200), users.manager]
  );
  seedLog.step("Purchase order", "PO-2026-0841 SUBMITTED");

  await db.query(
    `INSERT INTO report_distributions
     (id, tenant_id, order_id, channel, destination, status, payload)
     VALUES
       ($1,$2,$3,'WHATSAPP','9876543210','SENT',$4::jsonb),
       ($5,$2,$3,'EMAIL','rajesh.kumar@example.com','QUEUED',$6::jsonb)`,
    [
      randomUUID(),
      tenantId,
      ORDER_IDS.ord1,
      JSON.stringify({ reportOrder: "ORD-20260830-001", patient: "Rajesh Kumar" }),
      randomUUID(),
      JSON.stringify({ reportOrder: "ORD-20260830-001" })
    ]
  );
  await db.query(
    `INSERT INTO report_magic_links (id, tenant_id, order_id, token, expires_at, use_count, max_uses)
     VALUES ($1,$2,$3,'magic-apollo-ord001-seed',NOW() + INTERVAL '30 days',2,50)
     ON CONFLICT (token) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
    [randomUUID(), tenantId, ORDER_IDS.ord1]
  );
  seedLog.step("Report delivery", "WhatsApp SENT + magic link for ORD-001");

  await db.query(
    `INSERT INTO queue_tokens
     (id, tenant_id, order_id, patient_id, token_label, queue_number, status, mobile, amount_minor, payment_status, expires_at)
     VALUES ($1,$2,$3,$4,'A-014',14,'WAITING','9876543213',$5,'PENDING',NOW() + INTERVAL '4 hours')
     ON CONFLICT (tenant_id, order_id) DO UPDATE SET status = EXCLUDED.status, queue_number = EXCLUDED.queue_number`,
    [randomUUID(), tenantId, ORDER_IDS.ord4, PATIENT_IDS.anita, rupees(600)]
  );
  seedLog.step("Kiosk queue token", "A-014 waiting for Anita Roy");

  const anyTemplate = (
    await db.query(
      `SELECT id FROM report_templates WHERE tenant_id = $1 ORDER BY CASE WHEN template_type = 'STANDARD' THEN 0 ELSE 1 END LIMIT 1`,
      [tenantId]
    )
  ).rows[0] as { id: string } | undefined;
  if (anyTemplate) {
    const params = (
      await db.query(
        `SELECT p.id FROM parameters p
         JOIN test_parameter_assignments tpa ON tpa.parameter_id = p.id AND tpa.tenant_id = p.tenant_id
         JOIN tests t ON t.id = tpa.test_id AND t.tenant_id = p.tenant_id
         WHERE p.tenant_id = $1 AND t.code = 'CBC001'
         ORDER BY tpa.sort_index NULLS LAST
         LIMIT 8`,
        [tenantId]
      )
    ).rows as Array<{ id: string }>;
    let sort = 10;
    for (const p of params) {
      await db.query(
        `INSERT INTO report_template_items (id, tenant_id, template_id, parameter_id, sort_index)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (tenant_id, template_id, parameter_id) DO UPDATE SET sort_index = EXCLUDED.sort_index`,
        [randomUUID(), tenantId, anyTemplate.id, p.id, sort]
      );
      sort += 10;
    }
    seedLog.step("Report template items", `${params.length} CBC parameters linked`);
  }

  await db.query(
    `INSERT INTO whatsapp_sessions (phone, tenant_id, state, context)
     VALUES ('9876543210',$1,'REPORT_READY',$2::jsonb)
     ON CONFLICT (phone) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, state = EXCLUDED.state, context = EXCLUDED.context, updated_at = NOW()`,
    [tenantId, JSON.stringify({ orderId: ORDER_IDS.ord1, patientId: PATIENT_IDS.rajesh, uhid: "LAB-20260830-1001" })]
  );

  await db.query(
    `INSERT INTO background_jobs
     (id, job_type, dedupe_key, tenant_id, payload, status, attempts, max_attempts, next_run_at)
     VALUES ($1,'REPORT_PDF','ord1-report',$2,$3::jsonb,'COMPLETED',1,8,NOW())
     ON CONFLICT (tenant_id, job_type, dedupe_key) DO UPDATE SET status = EXCLUDED.status, payload = EXCLUDED.payload`,
    [
      randomUUID(),
      tenantId,
      JSON.stringify({ orderId: ORDER_IDS.ord1, patientId: PATIENT_IDS.rajesh })
    ]
  );
  await db.query(
    `INSERT INTO operations_job_runs (id, tenant_id, job_type, status, processed_count, detail)
     VALUES ($1,$2,'REPORT_GENERATION','SUCCESS',1,$3::jsonb),
            ($4,$2,'PAYMENT_PROCESS','SUCCESS',1,$5::jsonb)`,
    [
      randomUUID(),
      tenantId,
      JSON.stringify({ orderId: ORDER_IDS.ord1 }),
      randomUUID(),
      JSON.stringify({ invoiceId: billingInvoiceId, paymentTxnId })
    ]
  );

  await db.query(
    `INSERT INTO tenant_user_permissions (tenant_id, user_id, permissions, updated_by_user_id)
     VALUES ($1,$2,$3::jsonb,$4)
     ON CONFLICT (tenant_id, user_id) DO UPDATE SET permissions = EXCLUDED.permissions, updated_at = NOW()`,
    [
      tenantId,
      users.labTech,
      JSON.stringify(["results:enter", "results:approve", "samples:receive"]),
      users.manager
    ]
  );

  for (const [tid, plan] of [
    [APOLLO_TENANT_ID, "ENTERPRISE"],
    [CITYLABS_TENANT_ID, "PRO"]
  ] as const) {
    await db.query(
      `INSERT INTO subscriptions (id, tenant_id, plan, status, current_period_start, current_period_end, cancel_at_period_end)
       VALUES ($1,$2,$3,'ACTIVE',NOW() - INTERVAL '10 days',NOW() + INTERVAL '20 days',FALSE)`,
      [randomUUID(), tid, plan]
    );
    await db.query(
      `INSERT INTO tenant_usage_metrics (tenant_id, active_users, sample_volume_month, updated_at)
       VALUES ($1,$2,$3,NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET
         active_users = EXCLUDED.active_users,
         sample_volume_month = EXCLUDED.sample_volume_month,
         updated_at = NOW()`,
      [tid, tid === APOLLO_TENANT_ID ? 7 : 2, tid === APOLLO_TENANT_ID ? 4 : 0]
    );
  }
  seedLog.step("SaaS subscriptions", "apollo ENTERPRISE + citylabs PRO");

  const auditExists = (
    await db.query(
      `SELECT 1 FROM audit_logs WHERE tenant_id = $1 AND action = 'SEED_BOOTSTRAP' LIMIT 1`,
      [tenantId]
    )
  ).rowCount;
  if (!auditExists) {
    await db.query(
      `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity, entity_id, metadata)
       VALUES
         ($1,$2,$3,'SEED_BOOTSTRAP','system','production-seed',$4::jsonb),
         ($5,$2,$6,'ORDER_CREATED','order_bookings',$7,$8::jsonb),
         ($9,$2,$10,'RESULT_VERIFIED','lab_results',$7,$11::jsonb)`,
      [
        randomUUID(),
        tenantId,
        users.manager,
        JSON.stringify({ packageId: PKG001_ID, source: "seedExtended" }),
        randomUUID(),
        users.cashier,
        ORDER_IDS.ord1,
        JSON.stringify({ orderNumber: "ORD-20260830-001", patientId: PATIENT_IDS.rajesh }),
        randomUUID(),
        users.pathologist,
        JSON.stringify({ orderNumber: "ORD-20260830-001", status: "PATHOLOGIST_VERIFIED" })
      ]
    );
    seedLog.step("Audit logs", "3 immutable events");
  } else {
    seedLog.step("Audit logs", "bootstrap already present (immutable)");
  }

  seedLog.count("Extended tables", 1);
};
