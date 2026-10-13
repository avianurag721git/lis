export type PaymentByDateRow = {
  date: string;
  paymentCount: number;
  amountMinor: number;
};

export type ActivityRow = {
  kind: "PAYMENT" | "REFUND";
  id: string;
  amountMinor: number;
  createdAt: string;
  invoiceId: string;
  status: string;
  relatedId: string | null;
};

export type AnalyticsDashboard = {
  totalRevenueMinor: number;
  refundTotalMinor: number;
  patientCount: number;
  paymentsByDate: PaymentByDateRow[];
  recentActivity: ActivityRow[];
  range: {
    from: string;
    to: string;
  };
  cachedAt?: string;
};
