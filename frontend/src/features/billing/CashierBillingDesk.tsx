import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, FileText, Plus, Search } from "lucide-react";
import { CatalogTest, ordersApi } from "../orders/orders.service";
import {
  billingApi,
  CashierPaymentMethod,
  InvoiceListItem,
  OrderBill,
  TenderLine
} from "./billing.service";
import { useAuth } from "../../modules/auth/auth.context";
import { maxDiscountPercentForRole } from "../../modules/auth/permissions";
import { useTenant } from "../../modules/tenant/tenant.context";
import { defaultFinance } from "../../modules/tenant/tenant.types";
import { DiscountInput } from "../../components/DiscountInput";
import { NumberField } from "../../components/NumberField";
import { computeDiscountMinor, computeReferralCommissionMinor, discountPercentOfSubtotal } from "../../utils/discount";
import type { DiscountType } from "../../utils/discount";
import { ReferralDoctorSelect } from "../orders/ReferralDoctorSelect";
import { referralDoctorsApi, SELF_DOCTOR_CODE, type ReferralDoctor } from "../orders/referralDoctors.service";

const money = (minor: number): string =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "INR" }).format(minor / 100);

const emptyTender = (): TenderLine => ({ amountRupees: 0, method: "CASH" });

type DeskMode = "collect" | "history";

type SettledReceipt = {
  orderId: string;
  orderNumber: string;
  invoiceNumber: string;
  patientName: string;
  netAmountMinor: number;
  message: string;
};

const paymentStatusLabel = (status: string): string => {
  if (status === "PENDING_APPROVAL") return "Pending approval";
  if (status === "UNPAID") return "Unpaid";
  if (status === "PARTIAL" || status === "PARTIALLY_PAID") return "Partial";
  return status.replace(/_/g, " ");
};

const billReferralDoctor = (bill: OrderBill): ReferralDoctor | null => {
  if (!bill.referralDoctorId) return null;
  return {
    id: bill.referralDoctorId,
    tenantId: "",
    doctorCode: bill.referralDoctorCode ?? "",
    name: bill.referredDoctor ?? "",
    clinicName: null,
    specialization: null,
    mobile: null,
    whatsappNumber: null,
    commissionPercentage: bill.referralCommissionPercentage,
    isActive: true,
    usageCount: 0,
    createdAt: ""
  };
};

export const CashierBillingDesk = (): JSX.Element => {
  const { user } = useAuth();
  const { config } = useTenant();
  const tenantDefaultGst = config?.finance?.defaultGstPercent ?? defaultFinance().defaultGstPercent;
  const role = user?.role ?? "STAFF";
  const maxPct = maxDiscountPercentForRole(role);
  const canApprove = role === "MANAGER" || role === "TENANT_ADMIN" || role === "SUPER_ADMIN" || role === "LAB_MANAGER";
  const canForceRemoveItems =
    role === "SUPER_ADMIN" || role === "LAB_MANAGER" || role === "MANAGER" || role === "TENANT_ADMIN";
  const qc = useQueryClient();

  const [selectedId, setSelectedId] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType>("amount");
  const [discountValue, setDiscountValue] = useState(0);
  const [referralDoctor, setReferralDoctor] = useState<ReferralDoctor | null>(null);
  const [taxExempt, setTaxExempt] = useState(false);
  const [gstPercent, setGstPercent] = useState(tenantDefaultGst);
  const [tenders, setTenders] = useState<TenderLine[]>([emptyTender()]);
  const [catalogQ, setCatalogQ] = useState("");
  const [msg, setMsg] = useState("");
  const [tests, setTests] = useState<CatalogTest[]>([]);
  const [walkInOpen, setWalkInOpen] = useState(false);

  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [cart, setCart] = useState<Array<{ testId: string; name: string; priceMinor: number }>>([]);
  const [deskMode, setDeskMode] = useState<DeskMode>("collect");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState("");
  const [historyOrderId, setHistoryOrderId] = useState("");
  const [settledReceipt, setSettledReceipt] = useState<SettledReceipt | null>(null);

  const { data: queue = [], isLoading } = useQuery({
    queryKey: ["cashier-queue"],
    queryFn: () => billingApi.queue()
  });

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ["cashier-invoices", invoiceSearch, invoiceStatusFilter],
    queryFn: () =>
      billingApi.listInvoices({
        ...(invoiceSearch.trim() ? { q: invoiceSearch.trim() } : {}),
        ...(invoiceStatusFilter ? { status: invoiceStatusFilter } : {})
      }),
    enabled: deskMode === "history"
  });

  const { data: historyBill, isLoading: historyBillLoading } = useQuery({
    queryKey: ["cashier-bill", historyOrderId],
    queryFn: () => billingApi.getBill(historyOrderId),
    enabled: deskMode === "history" && Boolean(historyOrderId)
  });

  const selected = useMemo(
    () => (selectedId ? queue.find((o) => o.orderId === selectedId) : null) ?? null,
    [queue, selectedId]
  );

  useEffect(() => {
    if (!selectedId && queue[0] && !walkInOpen) {
      setSelectedId(queue[0].orderId);
    }
  }, [queue, selectedId, walkInOpen]);

  useEffect(() => {
    if (queue.length === 0) setWalkInOpen(true);
  }, [queue.length]);

  useEffect(() => {
    if (!selected) {
      setGstPercent(tenantDefaultGst);
      return;
    }
    const pct = discountPercentOfSubtotal(selected.subtotalMinor, selected.discountMinor);
    setDiscountType("percent");
    setDiscountValue(Math.round(Math.min(maxPct, pct) * 10) / 10);
    setTaxExempt(selected.taxRatePercent === 0);
    // Prefer rate stored on the bill; otherwise tenant finance default (never force 18%).
    setGstPercent(
      selected.taxRatePercent === 0
        ? 0
        : selected.taxRatePercent > 0
          ? selected.taxRatePercent
          : tenantDefaultGst
    );
    setMsg("");

    const fromBill = billReferralDoctor(selected);
    if (fromBill) {
      setReferralDoctor(fromBill);
    } else if (selected.referredDoctor?.trim()) {
      void referralDoctorsApi.search(selected.referredDoctor.trim()).then((docs) => {
        setReferralDoctor(docs[0] ?? null);
      });
    } else {
      setReferralDoctor(null);
    }
  }, [selected?.orderId, tenantDefaultGst]);

  useEffect(() => {
    void ordersApi
      .catalog()
      .then((c) => setTests(c.tests))
      .catch(() => setTests([]));
  }, []);

  const filteredTests = useMemo(() => {
    const n = catalogQ.trim().toLowerCase();
    if (!n) return tests.slice(0, 12);
    return tests
      .filter((t) => t.name.toLowerCase().includes(n) || (t.code ?? "").toLowerCase().includes(n))
      .slice(0, 12);
  }, [tests, catalogQ]);

  const liveSubtotal = selected
    ? selected.items.reduce((s, item) => s + item.priceMinor, 0)
    : cart.reduce((s, c) => s + c.priceMinor, 0);
  const discountMinor = computeDiscountMinor(
    liveSubtotal,
    discountType,
    discountType === "percent" ? Math.min(maxPct, discountValue) : discountValue
  );
  const discountPct = discountPercentOfSubtotal(liveSubtotal, discountMinor);
  const needsApproval = discountPct > maxPct + 0.001;
  const taxable = Math.max(0, liveSubtotal - discountMinor);
  const taxRate = taxExempt ? 0 : gstPercent;
  const taxMinor = Math.round((taxable * taxRate) / 100);
  const netMinor = taxable + taxMinor;
  const referralCommissionMinor = computeReferralCommissionMinor(
    taxable,
    referralDoctor && referralDoctor.doctorCode !== SELF_DOCTOR_CODE ? referralDoctor.commissionPercentage : 0
  );
  const tenderTotalMinor = tenders.reduce((s, t) => s + Math.round(t.amountRupees * 100), 0);
  const tenderMismatch = !needsApproval && tenderTotalMinor !== netMinor && netMinor > 0;

  const syncSingleTender = (amountRupees: number): void => {
    setTenders((prev) => {
      const line = prev[0];
      if (prev.length !== 1 || !line) return prev;
      return [{ ...line, amountRupees, method: line.method }];
    });
  };

  useEffect(() => {
    syncSingleTender(netMinor / 100);
  }, [netMinor, selectedId]);

  const applyBill = (bill: OrderBill): void => {
    qc.setQueryData<OrderBill[]>(["cashier-queue"], (prev = []) => {
      const idx = prev.findIndex((o) => o.orderId === bill.orderId);
      if (idx < 0) return [bill, ...prev];
      const next = [...prev];
      next[idx] = bill;
      return next;
    });
    setSelectedId(bill.orderId);
    const sub = bill.items.reduce((sum, item) => sum + item.priceMinor, 0);
    const pct = discountPercentOfSubtotal(sub || bill.subtotalMinor, bill.discountMinor);
    setDiscountType("percent");
    setDiscountValue(Math.round(Math.min(maxPct, pct) * 10) / 10);
    setTaxExempt(bill.taxRatePercent === 0);
  };

  const refresh = async (bill?: OrderBill): Promise<void> => {
    if (bill) applyBill(bill);
  };

  const addTestMutation = useMutation({
    mutationFn: async (testId: string) => {
      if (!selected) throw new Error("No order");
      return billingApi.adjust(selected.orderId, {
        addItems: [{ itemType: "TEST", testId, quantity: 1 }],
        taxRatePercent: taxExempt ? 0 : gstPercent
      });
    },
    onSuccess: async (bill) => {
      setMsg("Test added.");
      await refresh(bill);
    },
    onError: (err: any) => setMsg(err?.response?.data?.message ?? "Add failed")
  });

  const removeMutation = useMutation({
    mutationFn: async (itemId: string) => {
      if (!selected) throw new Error("No order");
      return billingApi.adjust(selected.orderId, {
        removeItemIds: [itemId],
        taxRatePercent: taxExempt ? 0 : gstPercent
      });
    },
    onSuccess: async (bill) => {
      setMsg("Test removed from bill.");
      await refresh(bill);
    },
    onError: (err: any) => setMsg(err?.response?.data?.message ?? "Remove failed")
  });

  const settleMutation = useMutation({
    mutationFn: async () => {
      // Prefer exact paise total for a single tender to avoid float drift (₹ × 100).
      const payments =
        tenders.length === 1 && tenders[0]
          ? [
              {
                amountMinor: netMinor,
                method: tenders[0].method,
                tpaInsurer: tenders[0].method === "TPA" ? tenders[0].tpaInsurer || null : null,
                tpaClaimId: tenders[0].method === "TPA" ? tenders[0].tpaClaimId || null : null,
                transactionReference: tenders[0].transactionReference || null
              }
            ].filter((t) => t.amountMinor > 0)
          : tenders
              .filter((t) => t.amountRupees > 0)
              .map((t) => ({
                amountMinor: Math.round(t.amountRupees * 100),
                method: t.method,
                tpaInsurer: t.method === "TPA" ? t.tpaInsurer || null : null,
                tpaClaimId: t.method === "TPA" ? t.tpaClaimId || null : null,
                transactionReference: t.transactionReference || null
              }));

      if (selected) {
        return billingApi.createBillingInvoice({
          orderId: selected.orderId,
          discountMinor,
          taxExempt,
          taxRatePercent: taxExempt ? 0 : gstPercent,
          referredDoctor: referralDoctor?.name ?? null,
          referralDoctorId: referralDoctor?.id ?? null,
          payments: needsApproval ? [] : payments
        });
      }

      if (!patientName.trim() || cart.length === 0) {
        throw new Error("Patient name and at least one test required");
      }
      const walkPatient: { name: string; phone?: string; mobile?: string } = { name: patientName.trim() };
      if (patientPhone.trim()) {
        walkPatient.phone = patientPhone.trim();
        walkPatient.mobile = patientPhone.trim();
      }
      return billingApi.createBillingInvoice({
        patient: walkPatient,
        items: cart.map((c) => ({ itemType: "TEST" as const, testId: c.testId, quantity: 1 })),
        discountMinor,
        taxExempt,
        taxRatePercent: taxExempt ? 0 : gstPercent,
        referredDoctor: referralDoctor?.name ?? null,
        referralDoctorId: referralDoctor?.id ?? null,
        payments: needsApproval ? [] : payments
      });
    },
    onSuccess: async (data) => {
      const paidOff =
        data.alreadySettled ||
        data.bill.paymentStatus === "PAID" ||
        data.bill.paymentStatus === "WALLET_SETTLED" ||
        data.bill.invoice?.status === "PAID" ||
        (data.bill.invoice?.dueAmountMinor ?? 1) <= 0;

      setCart([]);
      setPatientName("");
      setPatientPhone("");
      setWalkInOpen(false);

      if (paidOff) {
        qc.setQueryData<OrderBill[]>(["cashier-queue"], (prev = []) =>
          prev.filter((o) => o.orderId !== data.bill.orderId)
        );
        setSelectedId("");
        setSettledReceipt({
          orderId: data.bill.orderId,
          orderNumber: data.bill.orderNumber,
          invoiceNumber: data.invoice.invoiceNumber,
          patientName: data.bill.patientName,
          netAmountMinor: data.bill.netAmountMinor,
          message: data.message
        });
      } else {
        applyBill(data.bill);
        setMsg(data.message);
        setSettledReceipt(null);
      }

      await qc.invalidateQueries({ queryKey: ["cashier-queue"] });
      await qc.invalidateQueries({ queryKey: ["cashier-invoices"] });
    },
    onError: (err: any) => {
      const code = err?.response?.data?.code as string | undefined;
      if (code === "ALREADY_PAID") {
        setMsg("This bill was already collected. Open View bills to reprint the invoice.");
        void qc.invalidateQueries({ queryKey: ["cashier-queue"] });
        void qc.invalidateQueries({ queryKey: ["cashier-invoices"] });
        setSelectedId("");
        return;
      }
      if (code === "OVERPAY") {
        setMsg("Payment is higher than the amount due. Match the tender to net payable, then try again.");
        syncSingleTender(netMinor / 100);
        return;
      }
      setMsg(err?.response?.data?.message ?? "Settle failed");
    }
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("No order");
      return billingApi.approveDiscount(selected.orderId);
    },
    onSuccess: async (data) => {
      setMsg("Discount approved by manager.");
      await refresh(data.bill);
    },
    onError: (err: any) => setMsg(err?.response?.data?.message ?? "Approve failed")
  });

  const downloadPdf = async (orderId?: string): Promise<void> => {
    const id = orderId ?? selected?.orderId ?? historyOrderId;
    if (!id) return;
    try {
      const blob = await billingApi.downloadInvoicePdf(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const label =
        selected?.orderNumber ??
        historyBill?.orderNumber ??
        settledReceipt?.orderNumber ??
        id;
      a.download = `${label}-invoice.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setMsg("Generate invoice first, then print.");
    }
  };

  const onSettle = (e: FormEvent): void => {
    e.preventDefault();
    if (settleMutation.isPending) return;
    setSettledReceipt(null);
    setMsg("");
    settleMutation.mutate();
  };

  const openInvoiceFromHistory = (row: InvoiceListItem): void => {
    setHistoryOrderId(row.orderId);
    setSettledReceipt(null);
  };

  const switchDeskMode = (mode: DeskMode): void => {
    setDeskMode(mode);
    setMsg("");
    if (mode === "collect") {
      setHistoryOrderId("");
    } else {
      setWalkInOpen(false);
    }
  };

  const updateTender = (idx: number, patch: Partial<TenderLine>): void => {
    setTenders((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  };

  const addTestToBill = (t: CatalogTest): void => {
    if (selected) {
      addTestMutation.mutate(t.id);
      return;
    }
    if (cart.some((c) => c.testId === t.id)) {
      setCart((c) => c.filter((row) => row.testId !== t.id));
      return;
    }
    setCart((c) => [...c, { testId: t.id, name: t.name, priceMinor: t.priceMinor }]);
  };

  const pending = selected?.invoice?.status === "PENDING_APPROVAL";
  const itemsLocked = Boolean(selected && selected.canRemoveItems === false && !canForceRemoveItems);
  const billItems = selected?.items ?? [];
  const walkInItems = cart.map((c, i) => ({
    id: `${c.testId}-${i}`,
    name: c.name,
    quantity: 1,
    priceMinor: c.priceMinor,
    isWalkIn: true as const,
    index: i
  }));

  const displayItems = selected
    ? billItems.map((item) => ({ ...item, isWalkIn: false as const }))
    : walkInItems;

  return (
    <section className="page-shell page-shell--fluid">
      <div className="page-head">
        <h1 className="page-title">Billing &amp; payments</h1>
        <p className="page-subtitle">
          Collect payment on unpaid orders, or look up any invoice to reprint. Max discount for your role: {maxPct}%.
        </p>
      </div>

      <div className="billing-desk-tabs" role="tablist" aria-label="Billing desk mode">
        <button
          type="button"
          role="tab"
          aria-selected={deskMode === "collect"}
          className={deskMode === "collect" ? "billing-desk-tab is-active" : "billing-desk-tab"}
          onClick={() => switchDeskMode("collect")}
        >
          Collect payment
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={deskMode === "history"}
          className={deskMode === "history" ? "billing-desk-tab is-active" : "billing-desk-tab"}
          onClick={() => switchDeskMode("history")}
        >
          <FileText size={16} aria-hidden />
          View bills
        </button>
      </div>

      {msg ? <p className="status-banner billing-status-banner">{msg}</p> : null}

      {settledReceipt ? (
        <div className="billing-settle-success" role="status">
          <div>
            <strong>{settledReceipt.message}</strong>
            <p>
              {settledReceipt.patientName} · {settledReceipt.orderNumber} · Invoice{" "}
              <span className="mono">{settledReceipt.invoiceNumber}</span> · {money(settledReceipt.netAmountMinor)}
            </p>
          </div>
          <div className="billing-settle-success__actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void downloadPdf(settledReceipt.orderId)}>
              Print invoice PDF
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setHistoryOrderId(settledReceipt.orderId);
                switchDeskMode("history");
              }}
            >
              Open in View bills
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSettledReceipt(null)}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {deskMode === "history" ? (
        <div className="billing-desk-layout pathologist-layout">
          <aside className="card billing-desk-queue">
            <div className="billing-desk-queue-head">
              <h2 className="card-title">Invoices</h2>
              <span className="billing-queue-count">{invoices.length}</span>
            </div>
            <label className="form-label billing-catalog-search">
              Search bills
              <div className="billing-catalog-search-row">
                <Search size={16} className="billing-catalog-search-icon" aria-hidden />
                <input
                  className="form-control"
                  value={invoiceSearch}
                  onChange={(e) => setInvoiceSearch(e.target.value)}
                  placeholder="Patient, invoice no., order no., phone…"
                />
              </div>
            </label>
            <label className="form-label">
              Status
              <select
                className="form-control"
                value={invoiceStatusFilter}
                onChange={(e) => setInvoiceStatusFilter(e.target.value)}
              >
                <option value="">All</option>
                <option value="PAID">Paid</option>
                <option value="UNPAID">Unpaid</option>
                <option value="PARTIALLY_PAID">Partial</option>
                <option value="PENDING_APPROVAL">Pending approval</option>
              </select>
            </label>
            {invoicesLoading ? <p className="text-muted billing-queue-loading">Loading invoices…</p> : null}
            <ul className="billing-queue-list">
              {invoices.map((inv) => {
                const isActive = historyOrderId === inv.orderId;
                return (
                  <li key={inv.invoiceId}>
                    <button
                      type="button"
                      className={isActive ? "billing-queue-item is-active" : "billing-queue-item"}
                      aria-current={isActive ? "true" : undefined}
                      onClick={() => openInvoiceFromHistory(inv)}
                    >
                      {isActive ? <span className="billing-queue-selected-tag">Selected</span> : null}
                      <div className="billing-queue-item__row">
                        <span className="billing-queue-item__order">{inv.invoiceNumber}</span>
                        <span className="billing-queue-item__amount">{money(inv.netAmountMinor)}</span>
                      </div>
                      <div className="billing-queue-item__row billing-queue-item__row--meta">
                        <span className="billing-queue-item__patient">
                          {inv.patientName} · {inv.orderNumber}
                        </span>
                        <span className={`billing-status-pill billing-status-pill--${inv.status.toLowerCase()}`}>
                          {paymentStatusLabel(inv.status)}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
            {!invoicesLoading && invoices.length === 0 ? (
              <p className="billing-queue-empty">No invoices match this search.</p>
            ) : null}
          </aside>

          <div className="card billing-desk-main">
            <header className="billing-desk-main-head">
              <div>
                <div className="billing-desk-main-headline">
                  <h2 className="billing-desk-main-title">
                    {historyBill?.patientName ?? (historyOrderId ? "Loading bill…" : "Select an invoice")}
                  </h2>
                  {historyBill?.invoice ? (
                    <span className="billing-viewing-badge">{historyBill.invoice.invoiceNumber}</span>
                  ) : null}
                </div>
                <p className="billing-desk-main-sub">
                  {historyBill
                    ? `${historyBill.orderNumber} · ${paymentStatusLabel(historyBill.invoice?.status ?? historyBill.paymentStatus)}`
                    : "Search and open any collected or pending bill"}
                </p>
              </div>
              {historyBill ? (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => void downloadPdf(historyBill.orderId)}>
                  Print PDF
                </button>
              ) : null}
            </header>

            {historyBillLoading ? <p className="text-muted">Loading bill details…</p> : null}

            {historyBill ? (
              <div className="billing-desk-body">
                <div className="billing-desk-col billing-desk-col--items">
                  <section className="billing-section">
                    <h3 className="billing-section-title">Bill items</h3>
                    {historyBill.items.length === 0 ? (
                      <p className="billing-empty-hint">No line items on this invoice.</p>
                    ) : (
                      <ul className="billing-line-list">
                        {historyBill.items.map((item) => (
                          <li key={item.id} className="billing-line-item">
                            <div className="billing-line-item__info">
                              <strong>{item.name}</strong>
                              <span className="text-muted">Qty {item.quantity}</span>
                            </div>
                            <span className="billing-line-item__price">{money(item.priceMinor)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
                <div className="billing-desk-col billing-desk-col--checkout">
                  <div className="billing-summary">
                    <div className="billing-summary-row">
                      <span>Subtotal</span>
                      <span>{money(historyBill.subtotalMinor)}</span>
                    </div>
                    <div className="billing-summary-row">
                      <span>Discount</span>
                      <span>−{money(historyBill.discountMinor)}</span>
                    </div>
                    <div className="billing-summary-row">
                      <span>GST ({historyBill.taxRatePercent}%)</span>
                      <span>{money(historyBill.taxMinor)}</span>
                    </div>
                    <div className="billing-summary-row billing-summary-row--net">
                      <span>Net</span>
                      <strong>{money(historyBill.netAmountMinor)}</strong>
                    </div>
                    {historyBill.invoice ? (
                      <>
                        <div className="billing-summary-row">
                          <span>Paid</span>
                          <span>{money(historyBill.invoice.paidAmountMinor)}</span>
                        </div>
                        <div className="billing-summary-row">
                          <span>Due</span>
                          <span>{money(historyBill.invoice.dueAmountMinor)}</span>
                        </div>
                      </>
                    ) : null}
                  </div>
                  {historyBill.paymentStatus === "UNPAID" || historyBill.paymentStatus === "PARTIALLY_PAID" ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        setSelectedId(historyBill.orderId);
                        switchDeskMode("collect");
                      }}
                    >
                      Open in Collect payment
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
      <div className="billing-desk-layout pathologist-layout">
        <aside className={walkInOpen ? "card billing-desk-queue is-walkin-open" : "card billing-desk-queue"}>
          <div className="billing-desk-queue-head">
            <h2 className="card-title">Unpaid queue</h2>
            <span className="billing-queue-count">{queue.length}</span>
          </div>

          {isLoading ? <p className="text-muted billing-queue-loading">Loading bills…</p> : null}

          <ul className="billing-queue-list">
            {queue.map((o) => {
              const status = o.invoice?.status ?? o.paymentStatus;
              const isActive = selectedId === o.orderId;
              return (
                <li key={o.orderId}>
                  <button
                    type="button"
                    className={isActive ? "billing-queue-item is-active" : "billing-queue-item"}
                    aria-current={isActive ? "true" : undefined}
                    onClick={() => {
                      setSelectedId(o.orderId);
                      setWalkInOpen(false);
                    }}
                  >
                    {isActive ? <span className="billing-queue-selected-tag">Selected</span> : null}
                    <div className="billing-queue-item__row">
                      <span className="billing-queue-item__order">{o.orderNumber}</span>
                      <span className="billing-queue-item__amount">{money(o.netAmountMinor)}</span>
                    </div>
                    <div className="billing-queue-item__row billing-queue-item__row--meta">
                      <span className="billing-queue-item__patient">{o.patientName}</span>
                      <span className={`billing-status-pill billing-status-pill--${status.toLowerCase()}`}>
                        {paymentStatusLabel(status)}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          {queue.length === 0 && !isLoading ? (
            <p className="billing-queue-empty">No unpaid bills in queue.</p>
          ) : null}

          <button
            type="button"
            className={
              walkInOpen && !selectedId ? "billing-walkin-toggle is-active" : "billing-walkin-toggle"
            }
            aria-expanded={walkInOpen}
            onClick={() => {
              if (walkInOpen) {
                setWalkInOpen(false);
                if (!selectedId && queue[0]) setSelectedId(queue[0].orderId);
              } else {
                setWalkInOpen(true);
                setSelectedId("");
                setReferralDoctor(null);
                setDiscountType("amount");
                setDiscountValue(0);
              }
            }}
          >
            <span>New walk-in bill</span>
            {walkInOpen ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
          </button>

          {walkInOpen ? (
            <div className="billing-walkin-panel">
              <div className="billing-walkin-fields">
                <label className="form-label">
                  Patient name
                  <input
                    className="form-control"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    placeholder="Full name"
                  />
                </label>
                <label className="form-label">
                  Phone
                  <input
                    className="form-control"
                    value={patientPhone}
                    onChange={(e) => setPatientPhone(e.target.value)}
                    placeholder="Mobile"
                  />
                </label>
              </div>
              <label className="form-label billing-catalog-search">
                Quick add test
                <div className="billing-catalog-search-row">
                  <Search size={16} className="billing-catalog-search-icon" aria-hidden />
                  <input
                    className="form-control"
                    value={catalogQ}
                    onChange={(e) => setCatalogQ(e.target.value)}
                    placeholder="Search tests…"
                  />
                </div>
              </label>
              <div className="billing-test-chips">
                {filteredTests.map((t) => {
                  const inCart = cart.some((c) => c.testId === t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={inCart ? "billing-test-chip is-in-cart" : "billing-test-chip"}
                      onClick={() => addTestToBill(t)}
                    >
                      <Plus size={12} aria-hidden />
                      <span className="billing-test-chip__name">{t.name}</span>
                      <span className="billing-test-chip__price">{inCart ? "Remove" : money(t.priceMinor)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </aside>

        <div className="card billing-desk-main">
          <header className="billing-desk-main-head">
            <div>
              <div className="billing-desk-main-headline">
                <h2 className="billing-desk-main-title">
                  {selected ? selected.patientName : patientName.trim() || "New walk-in"}
                </h2>
                {selected ? <span className="billing-viewing-badge">Viewing bill</span> : null}
                {walkInOpen && !selectedId ? <span className="billing-viewing-badge billing-viewing-badge--walkin">Walk-in</span> : null}
              </div>
              <p className="billing-desk-main-sub">
                {selected
                  ? selected.orderNumber
                  : walkInOpen
                    ? "Create a new walk-in bill"
                    : "Select a bill from the queue"}
              </p>
            </div>
            {selected && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void downloadPdf()}>
                Print PDF
              </button>
            )}
          </header>

          {pending ? (
            <p className="billing-alert billing-alert--warn">Discount pending manager approval — payment is blocked.</p>
          ) : null}

          <div className="billing-desk-body">
            <div className="billing-desk-col billing-desk-col--items">
              <section className="billing-section">
                <h3 className="billing-section-title">Bill items</h3>
                {selected?.removeItemsBlockedReason ? (
                  <p className="billing-alert billing-alert--warn" role="status">
                    {selected.removeItemsBlockedReason}
                    {canForceRemoveItems
                      ? " Your role can still remove a test if the lab confirms the work should be cancelled."
                      : ""}
                  </p>
                ) : null}
                {displayItems.length === 0 ? (
                  <p className="billing-empty-hint">
                    {selected ? "No line items on this order." : "Add tests from the walk-in panel or select a queued bill."}
                  </p>
                ) : (
                  <ul className="billing-line-list">
                    {displayItems.map((item) => (
                      <li key={item.id} className="billing-line-item">
                        <div className="billing-line-item__info">
                          <strong>{item.name}</strong>
                          <span className="text-muted">Qty {item.quantity}</span>
                        </div>
                        <span className="billing-line-item__price">{money(item.priceMinor)}</span>
                        <button
                          type="button"
                          className="billing-line-remove"
                          aria-label={`Remove ${item.name} from bill`}
                          title={
                            itemsLocked
                              ? selected?.removeItemsBlockedReason ?? "Removal locked"
                              : `Remove ${item.name}`
                          }
                          disabled={item.isWalkIn ? false : removeMutation.isPending || itemsLocked}
                          onClick={() => {
                            if (item.isWalkIn) {
                              setCart((prev) => prev.filter((_, j) => j !== item.index));
                              return;
                            }
                            removeMutation.mutate(item.id);
                          }}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {selected ? (
                  <div className="billing-add-tests">
                    <input
                      className="form-control billing-add-tests-input"
                      value={catalogQ}
                      onChange={(e) => setCatalogQ(e.target.value)}
                      placeholder="Search to add another test…"
                    />
                    <div className="billing-test-chips billing-test-chips--inline">
                      {filteredTests.slice(0, 6).map((t) => {
                        const onBill = billItems.some((item) => item.testId === t.id);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            className={onBill ? "billing-test-chip is-in-cart" : "billing-test-chip"}
                            onClick={() => {
                              if (onBill) {
                                if (itemsLocked) return;
                                const line = billItems.find((item) => item.testId === t.id);
                                if (line) removeMutation.mutate(line.id);
                                return;
                              }
                              addTestToBill(t);
                            }}
                            disabled={
                              addTestMutation.isPending ||
                              removeMutation.isPending ||
                              (onBill && itemsLocked)
                            }
                          >
                            <Plus size={12} aria-hidden />
                            {onBill ? (itemsLocked ? `On bill · ${t.name}` : `Remove ${t.name}`) : t.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="billing-section billing-section--adjust">
                <h3 className="billing-section-title">Adjustments</h3>
                <div className="billing-adjust-grid">
                  <DiscountInput
                    subtotalMinor={liveSubtotal}
                    type={discountType}
                    value={discountValue}
                    onTypeChange={setDiscountType}
                    onValueChange={setDiscountValue}
                    maxPercent={maxPct}
                  />
                  <ReferralDoctorSelect value={referralDoctor} onChange={setReferralDoctor} />
                </div>
              </section>
            </div>

            <div className="billing-desk-col billing-desk-col--checkout">
              <div className="billing-summary">
                <div className="billing-summary-row">
                  <span>Subtotal</span>
                  <span>{money(liveSubtotal)}</span>
                </div>
                <div className="billing-summary-row">
                  <span>Discount</span>
                  <span>−{money(discountMinor)}</span>
                </div>
                <label className="billing-tax-exempt billing-tax-exempt--summary">
                  <input
                    type="checkbox"
                    checked={taxExempt}
                    onChange={(e) => {
                      const exempt = e.target.checked;
                      setTaxExempt(exempt);
                      if (!selected) return;
                      void billingApi
                        .adjust(selected.orderId, {
                          taxRatePercent: exempt ? 0 : gstPercent
                        })
                        .then((bill) => applyBill(bill))
                        .catch((err: { response?: { data?: { message?: string } } }) =>
                          setMsg(err.response?.data?.message ?? "Could not update tax")
                        );
                    }}
                  />
                  <span>Tax exempt (0% GST)</span>
                </label>
                {!taxExempt ? (
                  <label className="form-label billing-gst-rate">
                    GST %
                    <input
                      type="number"
                      min={0}
                      max={40}
                      step={0.01}
                      value={gstPercent}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        setGstPercent(Number.isFinite(next) ? next : tenantDefaultGst);
                      }}
                      onBlur={() => {
                        if (!selected || taxExempt) return;
                        void billingApi
                          .adjust(selected.orderId, { taxRatePercent: gstPercent })
                          .then((bill) => applyBill(bill))
                          .catch((err: { response?: { data?: { message?: string } } }) =>
                            setMsg(err.response?.data?.message ?? "Could not update GST rate")
                          );
                      }}
                    />
                    <span className="text-muted" style={{ fontSize: 11 }}>
                      Tenant default: {tenantDefaultGst}%
                    </span>
                  </label>
                ) : null}
                <div className="billing-summary-row">
                  <span>GST ({taxRate}%)</span>
                  <span>{money(taxMinor)}</span>
                </div>
                {referralCommissionMinor > 0 ? (
                  <div className="billing-summary-row billing-summary-row--commission">
                    <span>Referral commission ({referralDoctor?.commissionPercentage}%)</span>
                    <span>{money(referralCommissionMinor)}</span>
                  </div>
                ) : null}
                <div className="billing-summary-row billing-summary-row--net">
                  <span>Net payable</span>
                  <strong>{money(netMinor)}</strong>
                </div>
              </div>

              <form className="billing-payment" onSubmit={onSettle}>
                <h3 className="billing-section-title">Payment</h3>
                {tenders.map((t, idx) => (
                  <div key={idx} className="billing-tender-block">
                    <div className="billing-tender-row">
                      <div className="billing-field">
                        <label className="billing-field-label" htmlFor={`tender-amount-${idx}`}>Amount (₹)</label>
                        <NumberField
                          id={`tender-amount-${idx}`}
                          className="form-control"
                          min={0}
                          step={0.01}
                          value={t.amountRupees}
                          onValueChange={(amountRupees) => updateTender(idx, { amountRupees })}
                        />
                      </div>
                      <div className="billing-field">
                        <label className="billing-field-label" htmlFor={`tender-mode-${idx}`}>Mode</label>
                        <select
                          id={`tender-mode-${idx}`}
                          className="form-control"
                          value={t.method}
                          onChange={(e) => updateTender(idx, { method: e.target.value as CashierPaymentMethod })}
                        >
                          <option value="CASH">Cash</option>
                          <option value="UPI">UPI / QR</option>
                          <option value="CARD">Card</option>
                          <option value="TPA">TPA Insurance</option>
                          <option value="ONLINE">Online</option>
                        </select>
                      </div>
                      <div className="billing-field">
                        <label className="billing-field-label" htmlFor={`tender-ref-${idx}`}>Reference</label>
                        <input
                          id={`tender-ref-${idx}`}
                          className="form-control"
                          value={t.transactionReference ?? ""}
                          onChange={(e) => updateTender(idx, { transactionReference: e.target.value })}
                          placeholder="UTR / auth code"
                        />
                      </div>
                    </div>
                    {t.method === "TPA" ? (
                      <div className="billing-tender-row billing-tender-row--tpa">
                        <div className="billing-field">
                          <label className="billing-field-label" htmlFor={`tender-insurer-${idx}`}>Insurer</label>
                          <input
                            id={`tender-insurer-${idx}`}
                            className="form-control"
                            value={t.tpaInsurer ?? ""}
                            onChange={(e) => updateTender(idx, { tpaInsurer: e.target.value })}
                            required
                          />
                        </div>
                        <div className="billing-field">
                          <label className="billing-field-label" htmlFor={`tender-claim-${idx}`}>Claim ID</label>
                          <input
                            id={`tender-claim-${idx}`}
                            className="form-control"
                            value={t.tpaClaimId ?? ""}
                            onChange={(e) => updateTender(idx, { tpaClaimId: e.target.value })}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}

                <p className={tenderMismatch ? "billing-hint billing-hint--danger billing-payment-hint" : "billing-hint billing-payment-hint"}>
                  Tender total {money(tenderTotalMinor)} · net {money(netMinor)}
                  {tenderMismatch ? " · amounts must match to collect" : ""}
                </p>

                <div className="billing-desk-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setTenders((prev) => [...prev, emptyTender()])}
                  >
                    Split payment
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={
                      settleMutation.isPending ||
                      pending ||
                      displayItems.length === 0 ||
                      (!needsApproval && tenderMismatch)
                    }
                  >
                    {settleMutation.isPending
                      ? "Processing…"
                      : needsApproval
                        ? "Submit for approval"
                        : "Collect & create invoice"}
                  </button>
                  {canApprove && pending ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => approveMutation.mutate()}
                      disabled={approveMutation.isPending}
                    >
                      {approveMutation.isPending ? "Approving…" : "Approve discount"}
                    </button>
                  ) : null}
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
      )}
    </section>
  );
};

/** @deprecated use CashierBillingDesk */
export const CashierDesk = CashierBillingDesk;
