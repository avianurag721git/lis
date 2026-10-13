export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "LOGIN"
  | "REPORT_GENERATED"
  | "PAYMENT_ACTION"
  | "PAYMENT_ADDED"
  | "PAYMENT_FAILED"
  | "INVOICE_CLOSED"
  | "REFUND_ISSUED";

export type AuditLog = {
  id: string;
  userId: string | null;
  tenantId: string;
  action: AuditAction;
  entity: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  timestamp: string;
};
