import { FormEvent, useState } from "react";
import {
  InvoiceDto,
  ManualPaymentMethod,
  PaymentTransactionDto,
  paymentApi
} from "../modules/payment/payment.service";
import { RefundDto, refundApi } from "../modules/payment/refund.service";
import { useTenant } from "../modules/tenant/tenant.context";
import { NumberField } from "../components/NumberField";

type PayMode = "manual" | "online";

const formatMoney = (n: number): string =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "INR" }).format(n);

export const PaymentPage = (): JSX.Element => {
  const { hasFeature } = useTenant();
  const refundsEnabled = hasFeature("refunds");
  const [patientId, setPatientId] = useState<string>("PAT-001");
  const [totalAmount, setTotalAmount] = useState<number>(1200);
  const [invoiceIdInput, setInvoiceIdInput] = useState<string>("");
  const [invoice, setInvoice] = useState<InvoiceDto | null>(null);
  const [history, setHistory] = useState<PaymentTransactionDto[]>([]);
  const [refunds, setRefunds] = useState<RefundDto[]>([]);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMode, setPayMode] = useState<PayMode>("manual");
  const [method, setMethod] = useState<ManualPaymentMethod>("CASH");
  const [transactionReference, setTransactionReference] = useState<string>("");
  const [gatewayOrderId, setGatewayOrderId] = useState<string>("");
  const [paymentIntentId, setPaymentIntentId] = useState<string>("");
  const [clientSecret, setClientSecret] = useState<string>("");
  const [refundTxId, setRefundTxId] = useState<string>("");
  const [refundAmount, setRefundAmount] = useState<number>(0);
  const [refundReason, setRefundReason] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const syncInvoice = async (invoiceId: string): Promise<void> => {
    const [invoiceData, historyData, refundData] = await Promise.all([
      paymentApi.getInvoice(invoiceId),
      paymentApi.getPaymentHistory(invoiceId),
      refundsEnabled
        ? refundApi.listByInvoice(invoiceId).catch(() => ({ refunds: [] as RefundDto[] }))
        : Promise.resolve({ refunds: [] as RefundDto[] })
    ]);
    setInvoice(invoiceData.invoice);
    setHistory(historyData.transactions);
    setRefunds(refundData.refunds);
    setPayAmount(invoiceData.invoice.dueAmount);
  };

  const createInvoice = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError("");
    setStatus("");
    setBusy(true);
    try {
      const data = await paymentApi.createInvoice({ patientId, totalAmount });
      setInvoiceIdInput(data.invoice.id);
      await syncInvoice(data.invoice.id);
      setStatus("Invoice created.");
    } catch {
      setError("Unable to create invoice");
    } finally {
      setBusy(false);
    }
  };

  const loadInvoice = async (): Promise<void> => {
    setError("");
    if (!invoiceIdInput.trim()) return;
    setBusy(true);
    try {
      await syncInvoice(invoiceIdInput.trim());
      setStatus("Invoice loaded.");
    } catch {
      setError("Unable to load invoice");
    } finally {
      setBusy(false);
    }
  };

  const submitPayment = async (): Promise<void> => {
    setError("");
    setStatus("");
    if (!invoice) return;
    if (payAmount <= 0 || payAmount > invoice.dueAmount) {
      setError("Amount must be greater than 0 and not exceed due amount");
      return;
    }
    setBusy(true);
    try {
      if (payMode === "online") {
        const data = await paymentApi.createPaymentOrder({ invoiceId: invoice.id, amount: payAmount });
        setGatewayOrderId(data.gatewayOrderId);
        setClientSecret(data.clientSecret);
        setPaymentIntentId(data.gatewayOrderId);
        setStatus("Online payment initiated. Complete payment in the gateway, then verify below.");
        await syncInvoice(invoice.id);
        return;
      }

      await paymentApi.addPayment({
        invoiceId: invoice.id,
        amount: payAmount,
        method,
        ...(transactionReference ? { transactionReference } : {})
      });
      await syncInvoice(invoice.id);
      setTransactionReference("");
      setStatus("Payment recorded.");
    } catch {
      setError("Unable to process payment");
    } finally {
      setBusy(false);
    }
  };

  const verifyOnlinePayment = async (): Promise<void> => {
    setError("");
    if (!invoice || !gatewayOrderId || !paymentIntentId) {
      setError("Gateway order and payment intent are required");
      return;
    }
    setBusy(true);
    try {
      const data = await paymentApi.verify({ gatewayOrderId, paymentIntentId });
      setStatus(data.status === "SUCCESS" ? "Online payment verified." : "Gateway reported failure.");
      await syncInvoice(invoice.id);
    } catch {
      setError("Payment verification failed");
    } finally {
      setBusy(false);
    }
  };

  const submitRefund = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError("");
    setStatus("");
    if (!invoice) {
      setError("Load an invoice first.");
      return;
    }
    if (!refundTxId.trim()) {
      setError("Payment transaction ID is required.");
      return;
    }
    if (refundAmount <= 0) {
      setError("Refund amount must be positive.");
      return;
    }
    setBusy(true);
    try {
      await refundApi.createRefund({
        transactionId: refundTxId.trim(),
        amount: refundAmount,
        ...(refundReason.trim() ? { reason: refundReason.trim() } : {})
      });
      setRefundReason("");
      setStatus("Refund issued.");
      await syncInvoice(invoice.id);
    } catch {
      setError("Refund failed (check transaction is SUCCESS and amount is refundable).");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page-shell">
      <div className="page-head">
        <h1 className="page-title">Billing, payments &amp; refunds</h1>
        <p className="page-subtitle">
          Create invoices, record payments, and issue partial or full refunds against successful transactions.
        </p>
      </div>

      <div className="card">
        <h2 className="card-title">New invoice</h2>
        <form className="form-grid" onSubmit={createInvoice}>
          <label className="form-label">
            Patient ID
            <input value={patientId} onChange={(e) => setPatientId(e.target.value)} required />
          </label>
          <label className="form-label">
            Total bill (INR)
            <NumberField
              value={totalAmount}
              onValueChange={setTotalAmount}
              min={1}
              step={0.01}
              required
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Creating…" : "Create invoice"}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2 className="card-title">Open existing invoice</h2>
        <div className="form-row">
          <label className="form-label flex-1">
            Invoice ID
            <input
              value={invoiceIdInput}
              onChange={(e) => setInvoiceIdInput(e.target.value)}
              placeholder="Invoice ID"
              className="mono"
            />
          </label>
          <button type="button" className="btn btn-secondary align-end" onClick={() => void loadInvoice()} disabled={busy}>
            {busy ? "Loading…" : "Load"}
          </button>
        </div>
      </div>

      {invoice ? (
        <>
          <div className="card card-highlight">
            <h2 className="card-title">Invoice summary</h2>
            <div className="invoice-summary-grid">
              <div>
                <span className="text-muted">ID</span>
                <p className="mono wrap">{invoice.id}</p>
              </div>
              <div>
                <span className="text-muted">Patient</span>
                <p>{invoice.patientId}</p>
              </div>
              <div>
                <span className="text-muted">Status</span>
                <p>
                  <span className={`badge badge-status badge-status--${invoice.status.toLowerCase()}`}>{invoice.status}</span>
                </p>
              </div>
              <div>
                <span className="text-muted">Total</span>
                <p className="amount">{formatMoney(invoice.totalAmount)}</p>
              </div>
              <div>
                <span className="text-muted">Paid</span>
                <p className="amount">{formatMoney(invoice.paidAmount)}</p>
              </div>
              <div>
                <span className="text-muted">Due</span>
                <p className="amount accent">{formatMoney(invoice.dueAmount)}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="card-title">Record payment</h2>
            <div className="form-grid">
              <label className="form-label">
                Amount (INR)
                <NumberField value={payAmount} onValueChange={setPayAmount} min={0.01} step={0.01} />
              </label>
              <label className="form-label">
                Mode
                <select value={payMode} onChange={(e) => setPayMode(e.target.value as PayMode)}>
                  <option value="manual">Cash / UPI / Card</option>
                  <option value="online">Online payment</option>
                </select>
              </label>
              {payMode === "manual" ? (
                <>
                  <label className="form-label">
                    Method
                    <select value={method} onChange={(e) => setMethod(e.target.value as ManualPaymentMethod)}>
                      <option value="CASH">CASH</option>
                      <option value="UPI">UPI</option>
                      <option value="CARD">CARD</option>
                    </select>
                  </label>
                  {method !== "CASH" ? (
                    <label className="form-label">
                      Reference (optional)
                      <input value={transactionReference} onChange={(e) => setTransactionReference(e.target.value)} />
                    </label>
                  ) : null}
                </>
              ) : null}
              <div className="form-actions">
                <button type="button" className="btn btn-primary" onClick={() => void submitPayment()} disabled={busy}>
                  {busy
                    ? "Processing…"
                    : payMode === "online"
                      ? "Create payment order"
                      : "Add payment"}
                </button>
              </div>
            </div>

            {payMode === "online" && gatewayOrderId ? (
              <div className="stripe-box">
                <p className="text-muted">Gateway order ID</p>
                <code className="mono block">{gatewayOrderId}</code>
                {clientSecret ? (
                  <>
                    <p className="text-muted mt-8">Payment reference (for gateway integration)</p>
                    <code className="mono block small">{clientSecret}</code>
                  </>
                ) : null}
                <label className="form-label mt-8">
                  Payment intent ID (often same as order ID)
                  <input value={paymentIntentId} onChange={(e) => setPaymentIntentId(e.target.value)} className="mono" />
                </label>
                <button type="button" className="btn btn-secondary mt-8" onClick={() => void verifyOnlinePayment()} disabled={busy}>
                  {busy ? "Verifying…" : "Verify payment"}
                </button>
              </div>
            ) : null}
          </div>

          {refundsEnabled ? (
            <div className="card">
              <h2 className="card-title">Refunds</h2>
              <p className="text-muted mb-16">
                Refund against a successful payment. Use the transaction ID from the table below.
              </p>
              <form className="form-grid" onSubmit={submitRefund}>
                <label className="form-label">
                  Transaction ID
                  <input value={refundTxId} onChange={(e) => setRefundTxId(e.target.value)} placeholder="Transaction ID" className="mono" required />
                </label>
                <label className="form-label">
                  Amount (INR)
                  <NumberField
                    value={refundAmount}
                    onValueChange={setRefundAmount}
                    min={0.01}
                    step={0.01}
                    required
                  />
                </label>
                <label className="form-label">
                  Reason (optional)
                  <input value={refundReason} onChange={(e) => setRefundReason(e.target.value)} maxLength={2000} />
                </label>
                <div className="form-actions">
                  <button type="submit" className="btn btn-danger" disabled={busy}>
                    {busy ? "Issuing…" : "Issue refund"}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="card">
              <h2 className="card-title">Refunds</h2>
              <p className="text-muted">
                Refunds are available on Pro and Enterprise plans. You can still record payments and invoices on Basic.
              </p>
            </div>
          )}

          <div className="card">
            <h2 className="card-title">Payment transactions</h2>
            {history.length === 0 ? (
              <p className="text-muted">No transactions yet.</p>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Method</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Reference / gateway</th>
                      {refundsEnabled ? <th /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((tx) => (
                      <tr key={tx.id}>
                        <td>{new Date(tx.createdAt).toLocaleString()}</td>
                        <td>{tx.method}</td>
                        <td>{formatMoney(tx.amount)}</td>
                        <td>
                          <span className={`badge badge-tx badge-tx--${tx.status.toLowerCase()}`}>{tx.status}</span>
                        </td>
                        <td className="mono small">
                          {tx.transactionReference ?? tx.gatewayOrderId ?? "—"}
                        </td>
                        {refundsEnabled ? (
                          <td>
                            {tx.status === "SUCCESS" ? (
                              <button
                                type="button"
                                className="btn btn-text"
                                onClick={() => {
                                  setRefundTxId(tx.id);
                                  setRefundAmount(tx.amount);
                                }}
                              >
                                Use for refund
                              </button>
                            ) : null}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {refundsEnabled ? (
            <div className="card">
              <h2 className="card-title">Refund history</h2>
              {refunds.length === 0 ? (
                <p className="text-muted">No refunds for this invoice.</p>
              ) : (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Amount</th>
                        <th>Transaction</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {refunds.map((r) => (
                        <tr key={r.id}>
                          <td>{new Date(r.createdAt).toLocaleString()}</td>
                          <td>{formatMoney(r.amount)}</td>
                          <td className="mono small">{r.transactionId}</td>
                          <td>{r.reason ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </>
      ) : null}

      {status ? <p className="banner banner-success">{status}</p> : null}
      {error ? <p className="banner banner-error">{error}</p> : null}
    </section>
  );
};
