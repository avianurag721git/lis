export const JOB_TYPES = ["PAYMENT_REVERIFY"] as const;
export type JobType = (typeof JOB_TYPES)[number];

export type BackgroundJob = {
  id: string;
  jobType: JobType;
  dedupeKey: string;
  tenantId: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  nextRunAt: string;
  createdAt: string;
  updatedAt: string;
};

export type PaymentReverifyPayload = {
  gatewayOrderId: string;
  tenantId: string;
};
