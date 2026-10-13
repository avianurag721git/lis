export const AUDIT_ACTIONS = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "LOGIN",
  "LOGOUT",
  "REPORT_GENERATED",
  "PAYMENT_ACTION",
  "PAYMENT_ADDED",
  "PAYMENT_FAILED",
  "INVOICE_CLOSED",
  "REFUND_ISSUED",
  "PATHOLOGIST_VERIFIED",
  "PATHOLOGIST_REJECTED",
  "REPORT_DISTRIBUTED"
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

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
