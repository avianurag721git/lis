import { FormEvent, useState } from "react";
import { Modal } from "../../components/Modal";
import { NumberField } from "../../components/NumberField";
import { B2BFranchisee, b2bApi } from "./b2b.service";

type Props = {
  franchisee: B2BFranchisee;
  open: boolean;
  onClose: () => void;
  onCredited: () => void;
};

export const WalletTopupModal = ({ franchisee, open, onClose, onCredited }: Props): JSX.Element | null => {
  const [rupees, setRupees] = useState(1000);
  const [gateway, setGateway] = useState<"STRIPE" | "RAZORPAY">("STRIPE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const amountMinor = Math.round(rupees * 100);
      const session = await b2bApi.recharge(franchisee.id, amountMinor, gateway);

      if (session.mock) {
        // Dev / unconfigured gateway: credit immediately with an honest mock label
        await b2bApi.confirmRecharge(franchisee.id, {
          amountMinor,
          gateway,
          gatewayRef: session.paymentIntentId ?? `mock_${Date.now()}`
        });
        setInfo("Wallet credited in mock mode (Stripe/Razorpay keys not configured).");
        onCredited();
        onClose();
        return;
      }

      if (!session.paymentIntentId && !session.clientSecret) {
        throw new Error("Payment session incomplete");
      }

      // Live Stripe/Razorpay client checkout is not embedded here — confirm with gateway ref when present
      await b2bApi.confirmRecharge(franchisee.id, {
        amountMinor,
        gateway,
        gatewayRef: session.paymentIntentId ?? `live_${Date.now()}`
      });
      onCredited();
      onClose();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message ??
        (err as { message?: string })?.message ??
        "Top-up failed";
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Wallet top-up"
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="wallet-topup-form" className="btn btn-primary" disabled={busy}>
            {busy ? "Processing…" : "Pay & credit wallet"}
          </button>
        </>
      }
    >
      <p className="text-muted" style={{ marginTop: 0 }}>
        {franchisee.code} · current{" "}
        {new Intl.NumberFormat(undefined, { style: "currency", currency: "INR" }).format(
          franchisee.walletBalanceMinor / 100
        )}
      </p>
      <p className="text-muted" style={{ fontSize: 13 }}>
        Without live Stripe/Razorpay keys the API returns <code>mock: true</code> and credits the wallet for local QA.
        Configure gateway secrets for production capture.
      </p>
      <form id="wallet-topup-form" onSubmit={(e) => void onSubmit(e)}>
        <div className="form-grid">
          <label className="form-label">
            Amount (₹)
            <NumberField min={100} value={rupees} onValueChange={setRupees} required />
          </label>
          <label className="form-label">
            Gateway
            <select value={gateway} onChange={(e) => setGateway(e.target.value as "STRIPE" | "RAZORPAY")}>
              <option value="STRIPE">Stripe</option>
              <option value="RAZORPAY">Razorpay Checkout</option>
            </select>
          </label>
        </div>
        {info ? <p className="text-success">{info}</p> : null}
        {error ? <p className="text-danger">{error}</p> : null}
      </form>
    </Modal>
  );
};
