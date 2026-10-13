import { randomInt } from "crypto";
import { db } from "../../database/postgres";
import { env } from "../../config/env";
import {
  BarcodeStickerPayload,
  OrderBooking,
  OrderPipelineStatus,
  OrderPipelineStep,
  Sample
} from "./orders.types";

export const buildBarcodeStickerPayloads = (
  order: OrderBooking,
  samples: Sample[],
  patient: { name: string; uhid?: string | null } | null
): BarcodeStickerPayload[] =>
  samples.map((s) => ({
    barcode: s.barcode,
    format: "CODE128",
    sampleType: s.sampleType,
    tubeColor: s.tubeColor,
    patientName: patient?.name ?? "Patient",
    patientUhid: patient?.uhid ?? null,
    orderNumber: order.orderNumber,
    labelSize: "2x1",
    widthInches: 2,
    heightInches: 1
  }));

export const generateReportPasscode = (): string => String(randomInt(100000, 999999));

export const reportViewUrl = (passcode: string): string =>
  `${env.publicWebBaseUrl.replace(/\/$/, "")}/report-view/${passcode}`;

export const getOrderPipelineStatus = async (tenantId: string, orderId: string): Promise<OrderPipelineStatus> => {
  const orderRow = (
    await db.query(
      `SELECT o.*, p.name AS patient_name
       FROM order_bookings o
       JOIN patients p ON p.id = o.patient_id
       WHERE o.tenant_id = $1 AND o.id = $2 LIMIT 1`,
      [tenantId, orderId]
    )
  ).rows[0];
  if (!orderRow) {
    throw new Error("ORDER_NOT_FOUND");
  }

  const samples = (
    await db.query(`SELECT * FROM samples WHERE tenant_id = $1 AND order_id = $2`, [tenantId, orderId])
  ).rows;
  const labResults = (
    await db.query(`SELECT status, updated_at, verified_at FROM lab_results WHERE tenant_id = $1 AND order_id = $2`, [
      tenantId,
      orderId
    ])
  ).rows;

  const activeSamples = samples.filter((s: { status: string }) => s.status !== "REJECTED");
  const allCollected =
    activeSamples.length > 0 &&
    activeSamples.every((s: { status: string }) =>
      ["COLLECTED", "IN_TRANSIT", "RECEIVED_IN_LAB"].includes(s.status)
    );
  const allInLab =
    activeSamples.length > 0 && activeSamples.every((s: { status: string }) => s.status === "RECEIVED_IN_LAB");
  const anyProcessing = labResults.some((lr: { status: string }) =>
    ["PROCESSING", "DRAFT", "TECHNICIAN_APPROVED"].includes(lr.status)
  );
  const allVerified =
    labResults.length > 0 && labResults.every((lr: { status: string }) => lr.status === "PATHOLOGIST_VERIFIED");
  const dispatched = Boolean(orderRow.report_dispatched_at);

  const collectedAt = activeSamples
    .map((s: { collected_at: Date | null }) => s.collected_at)
    .filter(Boolean)
    .sort()[0];
  const receivedAt = activeSamples
    .map((s: { received_at: Date | null }) => s.received_at)
    .filter(Boolean)
    .sort()[0];
  const processingAt = labResults
    .filter((lr: { status: string }) => lr.status !== "PENDING")
    .map((lr: { updated_at: Date }) => lr.updated_at)
    .sort()[0];
  const verifiedAt = labResults
    .map((lr: { verified_at: Date | null }) => lr.verified_at)
    .filter(Boolean)
    .sort()
    .pop();

  const steps: OrderPipelineStep[] = [
    {
      id: "BOOKED",
      label: "Booked",
      complete: true,
      current: !allCollected,
      at: new Date(orderRow.created_at).toISOString()
    },
    {
      id: "COLLECTED",
      label: "Collected",
      complete: allCollected,
      current: allCollected && !allInLab,
      at: collectedAt ? new Date(collectedAt).toISOString() : null
    },
    {
      id: "IN_LAB",
      label: "In Lab",
      complete: allInLab,
      current: allInLab && !anyProcessing && !allVerified,
      at: receivedAt ? new Date(receivedAt).toISOString() : null
    },
    {
      id: "PROCESSING",
      label: "Processing",
      complete: anyProcessing || allVerified,
      current: anyProcessing && !allVerified,
      at: processingAt ? new Date(processingAt).toISOString() : null
    },
    {
      id: "VERIFIED",
      label: "Verified",
      complete: allVerified,
      current: allVerified && !dispatched,
      at: verifiedAt ? new Date(verifiedAt).toISOString() : null
    },
    {
      id: "DISPATCHED",
      label: "Dispatched",
      complete: dispatched,
      current: dispatched,
      at: orderRow.report_dispatched_at ? new Date(orderRow.report_dispatched_at).toISOString() : null
    }
  ];

  const completeCount = steps.filter((s) => s.complete).length;
  return {
    orderId,
    orderNumber: orderRow.order_number,
    patientName: orderRow.patient_name,
    steps,
    percentComplete: Math.round((completeCount / steps.length) * 100)
  };
};

export const finalizeOrderVerification = async (
  tenantId: string,
  orderId: string
): Promise<{ passcode: string; reportViewUrl: string } | null> => {
  const pending = (
    await db.query(
      `SELECT COUNT(*)::int AS c FROM lab_results
       WHERE tenant_id = $1 AND order_id = $2 AND status NOT IN ('PATHOLOGIST_VERIFIED', 'REJECTED')`,
      [tenantId, orderId]
    )
  ).rows[0]?.c as number;
  if (pending > 0) return null;

  const existing = (
    await db.query(`SELECT report_passcode FROM order_bookings WHERE tenant_id = $1 AND id = $2`, [tenantId, orderId])
  ).rows[0];
  let passcode = existing?.report_passcode as string | null;
  if (!passcode) {
    passcode = generateReportPasscode();
    await db.query(
      `UPDATE order_bookings SET report_passcode = $3, status = 'COMPLETED', updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, orderId, passcode]
    );
  } else {
    await db.query(
      `UPDATE order_bookings SET status = 'COMPLETED', updated_at = NOW() WHERE tenant_id = $1 AND id = $2`,
      [tenantId, orderId]
    );
  }
  return { passcode, reportViewUrl: reportViewUrl(passcode) };
};

export const markReportDispatched = async (tenantId: string, orderId: string): Promise<void> => {
  await db.query(
    `UPDATE order_bookings SET report_dispatched_at = COALESCE(report_dispatched_at, NOW()), updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, orderId]
  );
};

export const resolveOrderByPasscode = async (
  passcode: string
): Promise<{ tenantId: string; orderId: string; orderNumber: string; patientName: string } | null> => {
  const row = (
    await db.query(
      `SELECT o.tenant_id, o.id, o.order_number, p.name AS patient_name
       FROM order_bookings o
       JOIN patients p ON p.id = o.patient_id
       WHERE o.report_passcode = $1 AND o.status = 'COMPLETED'
       LIMIT 1`,
      [passcode.trim()]
    )
  ).rows[0];
  if (!row) return null;
  return {
    tenantId: row.tenant_id,
    orderId: row.id,
    orderNumber: row.order_number,
    patientName: row.patient_name
  };
};
