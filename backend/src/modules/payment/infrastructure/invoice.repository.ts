import { randomUUID } from "crypto";
import { AppError } from "../../../common/errors/AppError";
import { HTTP_STATUS } from "../../../common/constants/httpStatus";
import { DbClient, db } from "../../../database/postgres";
import { Invoice } from "../domain/payment.types";

type CreateInvoiceInput = {
  tenantId: string;
  patientId: string;
  totalAmountMinor: number;
};

const mapInvoiceRow = (row: {
  id: string;
  tenant_id: string;
  patient_id: string;
  total_amount_minor: string;
  paid_amount_minor: string;
  due_amount_minor: string;
  status: Invoice["status"];
  created_at: Date;
}): Invoice => ({
  id: row.id,
  tenantId: row.tenant_id,
  patientId: row.patient_id,
  totalAmountMinor: Number(row.total_amount_minor),
  paidAmountMinor: Number(row.paid_amount_minor),
  dueAmountMinor: Number(row.due_amount_minor),
  status: row.status,
  createdAt: row.created_at.toISOString()
});

export const invoiceRepository = {
  async insert(input: CreateInvoiceInput, client: DbClient = db): Promise<Invoice> {
    const invoice: Invoice = {
      id: randomUUID(),
      tenantId: input.tenantId,
      patientId: input.patientId,
      totalAmountMinor: input.totalAmountMinor,
      paidAmountMinor: 0,
      dueAmountMinor: input.totalAmountMinor,
      status: "UNPAID",
      createdAt: new Date().toISOString()
    };
    await client.query(
      `INSERT INTO invoices (id, tenant_id, patient_id, total_amount_minor, paid_amount_minor, due_amount_minor, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        invoice.id,
        invoice.tenantId,
        invoice.patientId,
        invoice.totalAmountMinor,
        invoice.paidAmountMinor,
        invoice.dueAmountMinor,
        invoice.status,
        invoice.createdAt
      ]
    );
    return invoice;
  },

  async findById(tenantId: string, invoiceId: string, client?: DbClient): Promise<Invoice> {
    const q = client ?? db;
    const result = await q.query(`SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2`, [invoiceId, tenantId]);
    if (!result.rows[0]) {
      throw new AppError("Invoice not found", HTTP_STATUS.NOT_FOUND, "INVOICE_NOT_FOUND");
    }
    return mapInvoiceRow(result.rows[0]);
  },

  async lockByIdForUpdate(tenantId: string, invoiceId: string, client: DbClient): Promise<Invoice> {
    const result = await client.query(`SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2 FOR UPDATE`, [
      invoiceId,
      tenantId
    ]);
    if (!result.rows[0]) {
      throw new AppError("Invoice not found", HTTP_STATUS.NOT_FOUND, "INVOICE_NOT_FOUND");
    }
    return mapInvoiceRow(result.rows[0]);
  },

  async updateTotals(invoice: Invoice, client: DbClient): Promise<void> {
    await client.query(
      `UPDATE invoices
       SET paid_amount_minor = $1, due_amount_minor = $2, status = $3
       WHERE id = $4 AND tenant_id = $5`,
      [invoice.paidAmountMinor, invoice.dueAmountMinor, invoice.status, invoice.id, invoice.tenantId]
    );
  }
};
