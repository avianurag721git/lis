import { randomUUID } from "crypto";
import { db, DbClient } from "../../database/postgres";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { inventoryAlertService } from "./inventoryAlert.service";
import { CreatePurchaseOrderInput, CreateReagentInput, PurchaseOrder, Reagent } from "./inventory.types";

const ensurePg = (): void => {
  if (!env.databaseUrl) {
    throw new AppError("Database not configured", HTTP_STATUS.INTERNAL_SERVER_ERROR, "DB_NOT_CONFIGURED");
  }
};

const mapReagent = (r: any): Reagent => ({
  id: r.id,
  name: r.name,
  lotNumber: r.lot_number,
  expiryDate: new Date(r.expiry_date).toISOString().slice(0, 10),
  vialCapacity: Number(r.vial_capacity),
  testsPerVial: Number(r.tests_per_vial ?? r.vial_capacity),
  remainingTests: Number(r.remaining_tests),
  reorderLevel: Number(r.reorder_level),
  unitCostMinor: Number(r.unit_cost_minor ?? 0),
  supplierName: r.supplier_name ?? null,
  branchId: r.branch_id ?? null,
  testId: r.test_id,
  departmentId: r.department_id,
  instrumentCode: r.instrument_code,
  isActive: Boolean(r.is_active),
  lowStockAlertedAt: r.low_stock_alerted_at ? new Date(r.low_stock_alerted_at).toISOString() : null
});

const mapPo = (r: any): PurchaseOrder => ({
  id: r.id,
  poNumber: r.po_number,
  reagentId: r.reagent_id,
  reagentName: r.reagent_name,
  lotNumber: r.lot_number,
  quantityVials: Number(r.quantity_vials),
  unitCostMinor: Number(r.unit_cost_minor),
  supplierName: r.supplier_name,
  status: r.status,
  notes: r.notes,
  createdAt: new Date(r.created_at).toISOString()
});

const draftPurchaseOrder = async (
  client: DbClient,
  tenantId: string,
  reagent: { id: string; name: string; lot_number: string; unit_cost_minor?: number; supplier_name?: string | null },
  remainingTests: number,
  reorderLevel: number
): Promise<PurchaseOrder> => {
  const id = randomUUID();
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const count = (
    await client.query(`SELECT COUNT(*)::int AS c FROM purchase_orders WHERE tenant_id = $1`, [tenantId])
  ).rows[0]?.c as number;
  const poNumber = `PO-${day}-${String((count ?? 0) + 1).padStart(4, "0")}`;
  const qty = Math.max(1, Math.ceil((reorderLevel * 2) / Math.max(1, remainingTests || 1)));
  await client.query(
    `INSERT INTO purchase_orders
     (id, tenant_id, po_number, reagent_id, reagent_name, lot_number, quantity_vials, unit_cost_minor, supplier_name, status, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'DRAFT',$10)`,
    [
      id,
      tenantId,
      poNumber,
      reagent.id,
      reagent.name,
      reagent.lot_number,
      qty,
      Number(reagent.unit_cost_minor ?? 0),
      reagent.supplier_name ?? null,
      `Auto-drafted: remaining ${remainingTests} ≤ reorder ${reorderLevel}`
    ]
  );
  return mapPo((await client.query(`SELECT * FROM purchase_orders WHERE id = $1`, [id])).rows[0]);
};

export const reagentService = {
  async list(tenantId: string): Promise<Reagent[]> {
    ensurePg();
    const result = await db.query(
      `SELECT * FROM reagents WHERE tenant_id = $1 ORDER BY remaining_tests ASC, name ASC`,
      [tenantId]
    );
    return result.rows.map(mapReagent);
  },

  async create(tenantId: string, input: CreateReagentInput): Promise<Reagent> {
    ensurePg();
    const id = randomUUID();
    const testsPerVial = input.testsPerVial ?? input.vialCapacity;
    const remaining = input.remainingTests ?? testsPerVial;
    await db.query(
      `INSERT INTO reagents
       (id, tenant_id, name, lot_number, expiry_date, vial_capacity, tests_per_vial, remaining_tests,
        reorder_level, unit_cost_minor, supplier_name, branch_id, test_id, department_id, instrument_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        id,
        tenantId,
        input.name.trim(),
        input.lotNumber.trim(),
        input.expiryDate,
        input.vialCapacity,
        testsPerVial,
        remaining,
        input.reorderLevel ?? 20,
        input.unitCostMinor ?? 0,
        input.supplierName ?? null,
        input.branchId ?? null,
        input.testId ?? null,
        input.departmentId ?? null,
        input.instrumentCode ?? null
      ]
    );
    return mapReagent((await db.query(`SELECT * FROM reagents WHERE id = $1`, [id])).rows[0]);
  },

  async update(
    tenantId: string,
    id: string,
    patch: Partial<CreateReagentInput> & { isActive?: boolean; remainingTests?: number }
  ): Promise<Reagent> {
    ensurePg();
    const existing = (
      await db.query(`SELECT * FROM reagents WHERE tenant_id = $1 AND id = $2`, [tenantId, id])
    ).rows[0];
    if (!existing) throw new AppError("Reagent not found", HTTP_STATUS.NOT_FOUND, "REAGENT_NOT_FOUND");

    await db.query(
      `UPDATE reagents SET
         name = COALESCE($3, name),
         expiry_date = COALESCE($4, expiry_date),
         vial_capacity = COALESCE($5, vial_capacity),
         remaining_tests = COALESCE($6, remaining_tests),
         reorder_level = COALESCE($7, reorder_level),
         test_id = COALESCE($8, test_id),
         department_id = COALESCE($9, department_id),
         instrument_code = COALESCE($10, instrument_code),
         is_active = COALESCE($11, is_active),
         tests_per_vial = COALESCE($12, tests_per_vial),
         unit_cost_minor = COALESCE($13, unit_cost_minor),
         supplier_name = COALESCE($14, supplier_name),
         branch_id = COALESCE($15, branch_id),
         updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2`,
      [
        tenantId,
        id,
        patch.name ?? null,
        patch.expiryDate ?? null,
        patch.vialCapacity ?? null,
        patch.remainingTests ?? null,
        patch.reorderLevel ?? null,
        patch.testId !== undefined ? patch.testId : null,
        patch.departmentId !== undefined ? patch.departmentId : null,
        patch.instrumentCode !== undefined ? patch.instrumentCode : null,
        patch.isActive ?? null,
        patch.testsPerVial ?? null,
        patch.unitCostMinor ?? null,
        patch.supplierName !== undefined ? patch.supplierName : null,
        patch.branchId !== undefined ? patch.branchId : null
      ]
    );
    return mapReagent((await db.query(`SELECT * FROM reagents WHERE id = $1`, [id])).rows[0]);
  },

  async listPurchaseOrders(tenantId: string): Promise<PurchaseOrder[]> {
    ensurePg();
    const result = await db.query(
      `SELECT * FROM purchase_orders WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [tenantId]
    );
    return result.rows.map(mapPo);
  },

  async createPurchaseOrder(
    tenantId: string,
    userId: string,
    input: CreatePurchaseOrderInput
  ): Promise<PurchaseOrder> {
    ensurePg();
    const id = randomUUID();
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const count = (
      await db.query(`SELECT COUNT(*)::int AS c FROM purchase_orders WHERE tenant_id = $1`, [tenantId])
    ).rows[0]?.c as number;
    const poNumber = `PO-${day}-${String((count ?? 0) + 1).padStart(4, "0")}`;
    await db.query(
      `INSERT INTO purchase_orders
       (id, tenant_id, po_number, reagent_id, reagent_name, lot_number, quantity_vials, unit_cost_minor, supplier_name, status, notes, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'DRAFT',$10,$11)`,
      [
        id,
        tenantId,
        poNumber,
        input.reagentId ?? null,
        input.reagentName.trim(),
        input.lotNumber ?? null,
        input.quantityVials,
        input.unitCostMinor ?? 0,
        input.supplierName ?? null,
        input.notes ?? null,
        userId
      ]
    );
    return mapPo((await db.query(`SELECT * FROM purchase_orders WHERE id = $1`, [id])).rows[0]);
  },

  /**
   * Deduct 1 test from the best matching active lot for this lab result's test.
   * Idempotent per lab_result_id. Auto-drafts PO + alerts on low stock.
   */
  async deductForLabResult(
    tenantId: string,
    labResultId: string,
    testId: string
  ): Promise<{ reagent: Reagent | null; deducted: boolean; purchaseOrder: PurchaseOrder | null }> {
    ensurePg();
    const already = await db.query(
      `SELECT id FROM reagent_deductions WHERE tenant_id = $1 AND lab_result_id = $2 LIMIT 1`,
      [tenantId, labResultId]
    );
    if (already.rows[0]) {
      return { reagent: null, deducted: false, purchaseOrder: null };
    }

    return db.transaction(async (client) => {
      const lot = await client.query(
        `SELECT * FROM reagents
         WHERE tenant_id = $1 AND is_active = TRUE AND remaining_tests > 0
           AND expiry_date >= CURRENT_DATE
           AND (test_id = $2 OR test_id IS NULL)
         ORDER BY
           CASE WHEN test_id = $2 THEN 0 ELSE 1 END,
           expiry_date ASC,
           remaining_tests ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1`,
        [tenantId, testId]
      );
      const row = lot.rows[0];
      if (!row) {
        return { reagent: null, deducted: false, purchaseOrder: null };
      }

      const next = Number(row.remaining_tests) - 1;
      await client.query(`UPDATE reagents SET remaining_tests = $2, updated_at = NOW() WHERE id = $1`, [
        row.id,
        next
      ]);
      await client.query(
        `INSERT INTO reagent_deductions (id, tenant_id, reagent_id, lab_result_id, test_id, deducted_count)
         VALUES ($1,$2,$3,$4,$5,1)
         ON CONFLICT (tenant_id, lab_result_id) DO NOTHING`,
        [randomUUID(), tenantId, row.id, labResultId, testId]
      );
      await client.query(`UPDATE lab_results SET reagent_lot_id = $3 WHERE tenant_id = $1 AND id = $2`, [
        tenantId,
        labResultId,
        row.id
      ]);

      const reagent = mapReagent({ ...row, remaining_tests: next });
      let purchaseOrder: PurchaseOrder | null = null;

      if (next <= Number(row.reorder_level) && !row.low_stock_alerted_at) {
        await client.query(`UPDATE reagents SET low_stock_alerted_at = NOW() WHERE id = $1`, [row.id]);
        purchaseOrder = await draftPurchaseOrder(client, tenantId, row, next, Number(row.reorder_level));
        void inventoryAlertService.sendLowStockAlert({
          tenantId,
          reagentName: row.name,
          lotNumber: row.lot_number,
          remainingTests: next,
          reorderLevel: Number(row.reorder_level),
          purchaseOrderNumber: purchaseOrder.poNumber
        });
      }

      return { reagent, deducted: true, purchaseOrder };
    });
  }
};
