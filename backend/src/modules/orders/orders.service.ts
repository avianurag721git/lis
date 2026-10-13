import { randomUUID } from "crypto";
import { db, DbClient } from "../../database/postgres";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { patientsRepository } from "../patients/patients.repository";
import { reportTemplatesRepository } from "../report/reportTemplates.repository";
import {
  BookOrderInput,
  OrderBooking,
  OrderItem,
  Sample,
  TemperatureLogEntry,
  type BarcodeStickerPayload
} from "./orders.types";
import { buildBarcodeStickerPayloads, getOrderPipelineStatus } from "./orderLifecycle.util";
import { resolveTenantDefaultGst } from "../tenant/tenantFinance";

const ensurePg = (): void => {
  if (!env.databaseUrl) {
    throw new AppError("Database not configured", HTTP_STATUS.INTERNAL_SERVER_ERROR, "DB_NOT_CONFIGURED");
  }
};

const mapOrder = (r: any): OrderBooking => ({
  id: r.id,
  orderNumber: r.order_number,
  patientId: r.patient_id,
  collectionType: r.collection_type,
  franchiseeId: r.franchisee_id,
  referredDoctor: r.referred_doctor ?? null,
  paymentStatus: r.payment_status ?? "UNPAID",
  subtotalMinor: Number(r.subtotal_minor),
  taxMinor: Number(r.tax_minor),
  discountMinor: Number(r.discount_minor),
  netAmountMinor: Number(r.net_amount_minor),
  status: r.status,
  createdByUserId: r.created_by_user_id,
  createdAt: new Date(r.created_at).toISOString()
});

const mapItem = (r: any): OrderItem => ({
  id: r.id,
  itemType: r.item_type,
  testId: r.test_id,
  packageId: r.package_id,
  name: r.name,
  priceMinor: Number(r.price_minor),
  quantity: Number(r.quantity)
});

const mapSample = (r: any): Sample => ({
  id: r.id,
  orderId: r.order_id,
  patientId: r.patient_id,
  barcode: r.barcode,
  sampleType: r.sample_type,
  tubeColor: r.tube_color,
  status: r.status,
  collectedAt: r.collected_at ? new Date(r.collected_at).toISOString() : null,
  collectedByUserId: r.collected_by_user_id,
  temperatureLog: Array.isArray(r.temperature_log) ? (r.temperature_log as TemperatureLogEntry[]) : [],
  receivedAt: r.received_at ? new Date(r.received_at).toISOString() : null,
  receivedByUserId: r.received_by_user_id,
  rejectionReason: r.rejection_reason,
  createdAt: new Date(r.created_at).toISOString(),
  updatedAt: new Date(r.updated_at).toISOString()
});

const nextOrderNumber = async (client: DbClient, tenantId: string): Promise<string> => {
  const result = await client.query(`SELECT COUNT(*)::int AS c FROM order_bookings WHERE tenant_id = $1`, [tenantId]);
  const count = (result.rows[0]?.c as number | undefined) ?? 0;
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `ORD-${day}-${String(count + 1).padStart(4, "0")}`;
};

const makeBarcode = (orderNumber: string, tubeColor: string, seq: number): string => {
  // Code128-compatible alphanumeric payload for thermal stickers
  const tube = tubeColor.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 4) || "TUBE";
  return `${orderNumber}-${tube}-${String(seq).padStart(2, "0")}`;
};

type TubeNeed = { sampleType: string; tubeColor: string; testIds: string[] };

const resolveTubeNeeds = async (client: DbClient, tenantId: string, input: BookOrderInput): Promise<{
  lines: Array<{ itemType: "TEST" | "PACKAGE"; testId: string | null; packageId: string | null; name: string; priceMinor: number; quantity: number }>;
  tubes: TubeNeed[];
}> => {
  const lines: Array<{
    itemType: "TEST" | "PACKAGE";
    testId: string | null;
    packageId: string | null;
    name: string;
    priceMinor: number;
    quantity: number;
  }> = [];
  const tubeMap = new Map<string, TubeNeed>();

  const addTestTube = (test: { id: string; sample_type: string; tube_color: string }): void => {
    const key = `${test.sample_type}::${test.tube_color}`;
    const existing = tubeMap.get(key);
    if (existing) {
      if (!existing.testIds.includes(test.id)) existing.testIds.push(test.id);
    } else {
      tubeMap.set(key, { sampleType: test.sample_type, tubeColor: test.tube_color, testIds: [test.id] });
    }
  };

  for (const item of input.items) {
    const qty = item.quantity && item.quantity > 0 ? item.quantity : 1;
    if (item.itemType === "TEST") {
      if (!item.testId) {
        throw new AppError("testId required for TEST items", HTTP_STATUS.BAD_REQUEST, "TEST_ID_REQUIRED");
      }
      const result = await client.query(
        `SELECT id, name, price_minor, sample_type, tube_color FROM tests WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [tenantId, item.testId]
      );
      const test = result.rows[0];
      if (!test) {
        throw new AppError(`Test not found: ${item.testId}`, HTTP_STATUS.NOT_FOUND, "TEST_NOT_FOUND");
      }
      lines.push({
        itemType: "TEST",
        testId: test.id,
        packageId: null,
        name: test.name,
        priceMinor: Number(test.price_minor) * qty,
        quantity: qty
      });
      addTestTube(test);
    } else {
      if (!item.packageId) {
        throw new AppError("packageId required for PACKAGE items", HTTP_STATUS.BAD_REQUEST, "PACKAGE_ID_REQUIRED");
      }
      const pkgResult = await client.query(
        `SELECT id, name, price_minor FROM test_packages WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
        [tenantId, item.packageId]
      );
      const pkg = pkgResult.rows[0];
      if (!pkg) {
        throw new AppError(`Package not found: ${item.packageId}`, HTTP_STATUS.NOT_FOUND, "PACKAGE_NOT_FOUND");
      }
      lines.push({
        itemType: "PACKAGE",
        testId: null,
        packageId: pkg.id,
        name: pkg.name,
        priceMinor: Number(pkg.price_minor) * qty,
        quantity: qty
      });
      const testsResult = await client.query(
        `SELECT t.id, t.sample_type, t.tube_color
         FROM test_package_items i
         JOIN tests t ON t.id = i.test_id
         WHERE i.tenant_id = $1 AND i.package_id = $2`,
        [tenantId, item.packageId]
      );
      for (const t of testsResult.rows) addTestTube(t);
    }
  }

  return { lines, tubes: Array.from(tubeMap.values()) };
};

export const ordersService = {
  async book(tenantId: string, userId: string, input: BookOrderInput): Promise<{
    order: OrderBooking;
    items: OrderItem[];
    samples: Sample[];
    patient: Awaited<ReturnType<typeof patientsRepository.getById>>;
    barcodeStickerPayloads: BarcodeStickerPayload[];
  }> {
    ensurePg();
    if (!input.items?.length) {
      throw new AppError("At least one order item is required", HTTP_STATUS.BAD_REQUEST, "ITEMS_REQUIRED");
    }

    let patientId = input.patientId;
    if (!patientId) {
      const upserted = await patientsRepository.createOrFind(tenantId, input.patient ?? {});
      patientId = upserted.patient.id;
    } else {
      const existing = await patientsRepository.getById(tenantId, patientId);
      if (!existing) {
        throw new AppError("Patient not found", HTTP_STATUS.NOT_FOUND, "PATIENT_NOT_FOUND");
      }
    }

    const booked = await db.transaction(async (client) => {
      const { lines: rawLines, tubes } = await resolveTubeNeeds(client, tenantId, input);
      let lines = rawLines;

      if (input.collectionType === "B2B_FRANCHISEE") {
        if (!input.franchiseeId) {
          throw new AppError("franchiseeId required for B2B booking", HTTP_STATUS.BAD_REQUEST, "FRANCHISEE_REQUIRED");
        }
        const { b2bService } = await import("../b2b/b2b.service");
        const priced: typeof rawLines = [];
        for (const line of rawLines) {
          const catalogId = line.itemType === "TEST" ? line.testId : line.packageId;
          if (!catalogId) continue;
          const unitRetail = Math.round(line.priceMinor / line.quantity);
          const wholesaleUnit = await b2bService.resolveWholesalePrice(
            client,
            tenantId,
            input.franchiseeId,
            line.itemType,
            catalogId,
            unitRetail
          );
          priced.push({
            ...line,
            priceMinor: wholesaleUnit * line.quantity
          });
        }
        lines = priced;
      }

      const subtotalMinor = lines.reduce((sum, l) => sum + l.priceMinor, 0);
      const discountMinor = Math.max(0, input.discountMinor ?? 0);
      const taxRate =
        input.taxRatePercent !== undefined && input.taxRatePercent !== null
          ? Number(input.taxRatePercent)
          : await resolveTenantDefaultGst(tenantId);
      const taxable = Math.max(0, subtotalMinor - discountMinor);
      const taxMinor = Math.round((taxable * taxRate) / 100);
      const netAmountMinor = taxable + taxMinor;

      const orderId = randomUUID();
      const orderNumber = await nextOrderNumber(client, tenantId);
      const paymentStatus = input.collectionType === "B2B_FRANCHISEE" ? "WALLET_SETTLED" : "UNPAID";

      let referredDoctorName = input.referredDoctor ?? null;
      const referralDoctorId = input.referralDoctorId ?? null;
      if (referralDoctorId) {
        const { referralDoctorsService } = await import("../referral-doctors/referralDoctors.service");
        const doc = await referralDoctorsService.getById(tenantId, referralDoctorId);
        if (doc) referredDoctorName = doc.name;
      }

      if (input.collectionType === "B2B_FRANCHISEE" && input.franchiseeId) {
        const { b2bService } = await import("../b2b/b2b.service");
        await b2bService.debitWallet(client, tenantId, input.franchiseeId, netAmountMinor, orderId, userId);
      }

      await client.query(
        `INSERT INTO order_bookings
         (id, tenant_id, order_number, patient_id, collection_type, franchisee_id,
          subtotal_minor, tax_minor, discount_minor, net_amount_minor, status, created_by_user_id,
          referred_doctor, referral_doctor_id, payment_status, tax_rate_percent)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'BOOKED',$11,$12,$13,$14,$15)`,
        [
          orderId,
          tenantId,
          orderNumber,
          patientId,
          input.collectionType,
          input.franchiseeId ?? null,
          subtotalMinor,
          taxMinor,
          discountMinor,
          netAmountMinor,
          userId,
          referredDoctorName,
          referralDoctorId,
          paymentStatus,
          taxRate
        ]
      );

      const items: OrderItem[] = [];
      for (const line of lines) {
        const itemId = randomUUID();
        await client.query(
          `INSERT INTO order_items
           (id, tenant_id, order_id, item_type, test_id, package_id, name, price_minor, quantity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [itemId, tenantId, orderId, line.itemType, line.testId, line.packageId, line.name, line.priceMinor, line.quantity]
        );
        items.push({
          id: itemId,
          itemType: line.itemType,
          testId: line.testId,
          packageId: line.packageId,
          name: line.name,
          priceMinor: line.priceMinor,
          quantity: line.quantity
        });
      }

      // If no tube metadata resolved (empty package), create one default blood/purple sample
      const tubeList = tubes.length > 0 ? tubes : [{ sampleType: "BLOOD", tubeColor: "PURPLE", testIds: [] }];
      const samples: Sample[] = [];
      let seq = 1;
      for (const tube of tubeList) {
        const sampleId = randomUUID();
        const barcode = makeBarcode(orderNumber, tube.tubeColor, seq++);
        const inserted = await client.query(
          `INSERT INTO samples
           (id, tenant_id, order_id, patient_id, barcode, sample_type, tube_color, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING_COLLECTION')
           RETURNING *`,
          [sampleId, tenantId, orderId, patientId, barcode, tube.sampleType, tube.tubeColor]
        );
        samples.push(mapSample(inserted.rows[0]));
      }

      const orderRow = await client.query(`SELECT * FROM order_bookings WHERE id = $1`, [orderId]);
      const patient = await patientsRepository.getById(tenantId, patientId!);
      const order = mapOrder(orderRow.rows[0]);
      return {
        order,
        items,
        samples,
        patient,
        barcodeStickerPayloads: buildBarcodeStickerPayloads(order, samples, patient)
      };
    });

    if (input.referralDoctorId) {
      const { referralDoctorsService } = await import("../referral-doctors/referralDoctors.service");
      await referralDoctorsService.recordUsage(tenantId, input.referralDoctorId);
    }
    return booked;
  },

  async listCatalog(tenantId: string): Promise<{
    tests: Array<{ id: string; departmentId: string; name: string; code: string | null; priceMinor: number; sampleType: string; tubeColor: string }>;
    packages: Array<{ id: string; name: string; code: string | null; priceMinor: number }>;
  }> {
    ensurePg();
    try {
      await reportTemplatesRepository.ensureDefaultCatalogForTenant(tenantId);
    } catch {
      // catalog seed optional if templates already present / schema lag
    }
    await db.query(
      `UPDATE tests SET price_minor = 50000, sample_type = COALESCE(sample_type, 'BLOOD'), tube_color = COALESCE(tube_color, 'PURPLE')
       WHERE tenant_id = $1 AND (price_minor = 0 OR sample_type IS NULL OR tube_color IS NULL)`,
      [tenantId]
    );
    const tests = await db.query(
      `SELECT id, department_id, name, code, price_minor, sample_type, tube_color
       FROM tests WHERE tenant_id = $1 ORDER BY name ASC`,
      [tenantId]
    );
    const packages = await db.query(
      `SELECT id, name, code, price_minor FROM test_packages WHERE tenant_id = $1 ORDER BY name ASC`,
      [tenantId]
    );
    return {
      tests: tests.rows.map((r: any) => ({
        id: r.id,
        departmentId: r.department_id,
        name: r.name,
        code: r.code,
        priceMinor: Number(r.price_minor),
        sampleType: r.sample_type,
        tubeColor: r.tube_color
      })),
      packages: packages.rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        code: r.code,
        priceMinor: Number(r.price_minor)
      }))
    };
  },

  async listHomeCollection(tenantId: string): Promise<
    Array<{
      order: OrderBooking;
      patientName: string;
      patientPhone: string | null;
      collectionAddress: string | null;
      samples: Sample[];
    }>
  > {
    ensurePg();
    const orders = await db.query(
      `SELECT o.*, p.name AS patient_name, p.phone AS patient_phone, o.collection_address
       FROM order_bookings o
       JOIN patients p ON p.id = o.patient_id
       WHERE o.tenant_id = $1 AND o.collection_type = 'HOME_COLLECTION' AND o.status IN ('BOOKED', 'IN_PROGRESS')
       ORDER BY o.created_at DESC
       LIMIT 100`,
      [tenantId]
    );
    const out = [];
    for (const row of orders.rows) {
      const samples = await db.query(`SELECT * FROM samples WHERE tenant_id = $1 AND order_id = $2 ORDER BY created_at ASC`, [
        tenantId,
        row.id
      ]);
      out.push({
        order: mapOrder(row),
        patientName: row.patient_name as string,
        patientPhone: row.patient_phone as string | null,
        collectionAddress: (row.collection_address as string | null) ?? null,
        samples: samples.rows.map(mapSample)
      });
    }
    return out;
  },

  async getPipeline(tenantId: string, orderId: string) {
    ensurePg();
    return getOrderPipelineStatus(tenantId, orderId);
  },

  async listSamplesForOrder(tenantId: string, orderId: string): Promise<Sample[]> {
    ensurePg();
    const result = await db.query(
      `SELECT * FROM samples WHERE tenant_id = $1 AND order_id = $2 ORDER BY created_at ASC`,
      [tenantId, orderId]
    );
    return result.rows.map(mapSample);
  }
};

export const samplesService = {
  async list(tenantId: string, status?: string): Promise<Sample[]> {
    ensurePg();
    const result = status
      ? await db.query(`SELECT * FROM samples WHERE tenant_id = $1 AND status = $2 ORDER BY updated_at DESC LIMIT 200`, [
          tenantId,
          status
        ])
      : await db.query(`SELECT * FROM samples WHERE tenant_id = $1 ORDER BY updated_at DESC LIMIT 200`, [tenantId]);
    return result.rows.map(mapSample);
  },

  async getByBarcode(tenantId: string, barcode: string): Promise<Sample | null> {
    ensurePg();
    const result = await db.query(`SELECT * FROM samples WHERE tenant_id = $1 AND barcode = $2 LIMIT 1`, [
      tenantId,
      barcode.trim()
    ]);
    return result.rows[0] ? mapSample(result.rows[0]) : null;
  },

  async collect(tenantId: string, userId: string, input: { sampleId?: string; barcode?: string }): Promise<Sample> {
    ensurePg();
    const sample = input.sampleId
      ? (
          await db.query(`SELECT * FROM samples WHERE tenant_id = $1 AND id = $2 LIMIT 1`, [tenantId, input.sampleId])
        ).rows[0]
      : (
          await db.query(`SELECT * FROM samples WHERE tenant_id = $1 AND barcode = $2 LIMIT 1`, [
            tenantId,
            input.barcode?.trim()
          ])
        ).rows[0];

    if (!sample) {
      throw new AppError("Sample not found", HTTP_STATUS.NOT_FOUND, "SAMPLE_NOT_FOUND");
    }
    if (sample.status !== "PENDING_COLLECTION" && sample.status !== "COLLECTED") {
      throw new AppError(`Cannot collect sample in status ${sample.status}`, HTTP_STATUS.CONFLICT, "INVALID_SAMPLE_STATUS");
    }

    const updated = await db.query(
      `UPDATE samples
       SET status = 'COLLECTED', collected_at = NOW(), collected_by_user_id = $3, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [tenantId, sample.id, userId]
    );
    await db.query(`UPDATE order_bookings SET status = 'IN_PROGRESS', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`, [
      sample.order_id,
      tenantId
    ]);
    return mapSample(updated.rows[0]);
  },

  async transit(
    tenantId: string,
    userId: string,
    input: { sampleId?: string; barcode?: string; temperatureCelsius: number }
  ): Promise<Sample> {
    ensurePg();
    if (!Number.isFinite(input.temperatureCelsius)) {
      throw new AppError("temperatureCelsius is required", HTTP_STATUS.BAD_REQUEST, "TEMP_REQUIRED");
    }
    const sample = input.sampleId
      ? (await db.query(`SELECT * FROM samples WHERE tenant_id = $1 AND id = $2 LIMIT 1`, [tenantId, input.sampleId])).rows[0]
      : (
          await db.query(`SELECT * FROM samples WHERE tenant_id = $1 AND barcode = $2 LIMIT 1`, [
            tenantId,
            input.barcode?.trim()
          ])
        ).rows[0];

    if (!sample) {
      throw new AppError("Sample not found", HTTP_STATUS.NOT_FOUND, "SAMPLE_NOT_FOUND");
    }
    if (sample.status !== "COLLECTED" && sample.status !== "IN_TRANSIT") {
      throw new AppError(`Cannot mark transit from status ${sample.status}`, HTTP_STATUS.CONFLICT, "INVALID_SAMPLE_STATUS");
    }

    const entry: TemperatureLogEntry = {
      at: new Date().toISOString(),
      celsius: input.temperatureCelsius,
      recordedByUserId: userId
    };
    const updated = await db.query(
      `UPDATE samples
       SET status = 'IN_TRANSIT',
           temperature_log = COALESCE(temperature_log, '[]'::jsonb) || $3::jsonb,
           updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [tenantId, sample.id, JSON.stringify([entry])]
    );
    return mapSample(updated.rows[0]);
  },

  async receive(
    tenantId: string,
    userId: string,
    input: { barcode: string; accept?: boolean; rejectionReason?: string | null }
  ): Promise<Sample> {
    ensurePg();
    const barcode = input.barcode?.trim();
    if (!barcode) {
      throw new AppError("barcode is required", HTTP_STATUS.BAD_REQUEST, "BARCODE_REQUIRED");
    }
    const sample = (await db.query(`SELECT * FROM samples WHERE tenant_id = $1 AND barcode = $2 LIMIT 1`, [tenantId, barcode]))
      .rows[0];
    if (!sample) {
      throw new AppError("Sample not found for barcode", HTTP_STATUS.NOT_FOUND, "SAMPLE_NOT_FOUND");
    }
    if (sample.status === "RECEIVED_IN_LAB" || sample.status === "REJECTED") {
      throw new AppError(`Sample already ${sample.status}`, HTTP_STATUS.CONFLICT, "ALREADY_PROCESSED");
    }
    if (sample.status === "PENDING_COLLECTION") {
      throw new AppError("Sample not yet collected", HTTP_STATUS.CONFLICT, "NOT_COLLECTED");
    }

    const accept = input.accept !== false;
    if (!accept && !input.rejectionReason?.trim()) {
      throw new AppError("rejectionReason required when rejecting", HTTP_STATUS.BAD_REQUEST, "REJECTION_REASON_REQUIRED");
    }

    const updated = accept
      ? await db.query(
          `UPDATE samples
           SET status = 'RECEIVED_IN_LAB', received_at = NOW(), received_by_user_id = $3, rejection_reason = NULL, updated_at = NOW()
           WHERE tenant_id = $1 AND id = $2
           RETURNING *`,
          [tenantId, sample.id, userId]
        )
      : await db.query(
          `UPDATE samples
           SET status = 'REJECTED', received_at = NOW(), received_by_user_id = $3, rejection_reason = $4, updated_at = NOW()
           WHERE tenant_id = $1 AND id = $2
           RETURNING *`,
          [tenantId, sample.id, userId, input.rejectionReason!.trim()]
        );

    return mapSample(updated.rows[0]);
  },

  /**
   * Unified barcode workflow: PENDING_COLLECTION → COLLECTED → RECEIVED_IN_LAB + PROCESSING.
   * Deducts reagent lots and broadcasts technician queue updates.
   */
  async rapidScan(
    tenantId: string,
    userId: string,
    input: { barcode: string }
  ): Promise<{
    sample: Sample;
    action: "COLLECTED" | "RECEIVED_AND_PROCESSING" | "ALREADY_IN_LAB";
    pipeline: Awaited<ReturnType<typeof getOrderPipelineStatus>>;
    labResultsActivated: number;
  }> {
    ensurePg();
    const barcode = input.barcode?.trim();
    if (!barcode) {
      throw new AppError("barcode is required", HTTP_STATUS.BAD_REQUEST, "BARCODE_REQUIRED");
    }

    const existing = await this.getByBarcode(tenantId, barcode);
    if (!existing) {
      throw new AppError("Sample not found for barcode", HTTP_STATUS.NOT_FOUND, "SAMPLE_NOT_FOUND");
    }
    if (existing.status === "REJECTED") {
      throw new AppError("Sample was rejected and cannot be processed", HTTP_STATUS.CONFLICT, "SAMPLE_REJECTED");
    }

    let sample = existing;
    let action: "COLLECTED" | "RECEIVED_AND_PROCESSING" | "ALREADY_IN_LAB";

    if (existing.status === "PENDING_COLLECTION") {
      sample = await this.collect(tenantId, userId, { barcode });
      action = "COLLECTED";
    } else if (existing.status === "COLLECTED" || existing.status === "IN_TRANSIT") {
      sample = await this.receive(tenantId, userId, { barcode, accept: true });
      action = "RECEIVED_AND_PROCESSING";
    } else if (existing.status === "RECEIVED_IN_LAB") {
      sample = existing;
      action = "ALREADY_IN_LAB";
    } else {
      throw new AppError(`Cannot rapid-scan sample in status ${existing.status}`, HTTP_STATUS.CONFLICT, "INVALID_SAMPLE_STATUS");
    }

    const { labResultService } = await import("../lab-results/labResult.service");
    const labResultsActivated =
      action === "RECEIVED_AND_PROCESSING" || action === "ALREADY_IN_LAB"
        ? await labResultService.activateProcessingForOrder(tenantId, sample.orderId, userId)
        : 0;

    const pipeline = await getOrderPipelineStatus(tenantId, sample.orderId);
    return { sample, action, pipeline, labResultsActivated };
  }
};
