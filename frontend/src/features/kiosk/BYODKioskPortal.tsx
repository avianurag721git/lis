import { FormEvent, useEffect, useMemo, useState } from "react";
import { io, Socket } from "socket.io-client";
import { CheckCircle2, QrCode, Smartphone } from "lucide-react";
import { env } from "../../utils/env";
import { kioskApi, QueueToken } from "./kiosk.service";

const money = (minor: number): string =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "INR" }).format(minor / 100);

export const BYODKioskPortal = (): JSX.Element => {
  const [mobile, setMobile] = useState("");
  const [name, setName] = useState("");
  const [tests, setTests] = useState<Array<{ id: string; name: string; priceMinor: number }>>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<"browse" | "pay" | "done">("browse");
  const [upiUri, setUpiUri] = useState("");
  const [token, setToken] = useState<QueueToken | null>(null);
  const [orderNumber, setOrderNumber] = useState("");
  const [amountMinor, setAmountMinor] = useState(0);
  const [paymentRef, setPaymentRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deskAlert, setDeskAlert] = useState("");

  useEffect(() => {
    void kioskApi.catalog().then((c) => setTests(c.tests)).catch(() => setTests([]));
  }, []);

  useEffect(() => {
    const socket: Socket = io(env.apiUrl, { transports: ["websocket", "polling"] });
    socket.emit("join-tenant", new URLSearchParams(window.location.search).get("tenant") ?? "demo");
    socket.on("kiosk:token-created", (payload: { data?: { tokenLabel?: string; patientName?: string } }) => {
      if (payload.data?.tokenLabel) {
        setDeskAlert(`${payload.data.tokenLabel} — ${payload.data.patientName ?? "Patient"}`);
      }
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  const total = useMemo(() => {
    return tests.filter((t) => selected.has(t.id)).reduce((s, t) => s + t.priceMinor, 0);
  }, [tests, selected]);

  const toggleTest = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const book = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (selected.size === 0) {
      setError("Select at least one test.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const trimmedName = name.trim();
      const result = await kioskApi.book({
        mobile,
        ...(trimmedName ? { patientName: trimmedName } : {}),
        testIds: [...selected]
      });
      setToken(result.token);
      setOrderNumber(result.order.orderNumber);
      setAmountMinor(result.order.netAmountMinor);
      setUpiUri(result.upiUri);
      setStep("pay");
    } catch {
      setError("Booking failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const confirmPaid = async (): Promise<void> => {
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      await kioskApi.confirmPayment(token.id, paymentRef.trim() || `UPI-${Date.now()}`);
      setStep("done");
    } catch {
      setError("Payment confirmation failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white">
      <header className="px-4 py-6 text-center border-b border-white/10">
        <div className="flex items-center justify-center gap-2 text-emerald-400 mb-2">
          <QrCode className="h-6 w-6" aria-hidden />
          <span className="text-sm font-medium tracking-wide uppercase">Skip the queue</span>
        </div>
        <h1 className="text-2xl font-bold">Book on your phone</h1>
        <p className="text-sm text-white/60 mt-1 flex items-center justify-center gap-1">
          <Smartphone className="h-4 w-4" aria-hidden /> Scan · Select tests · Pay via UPI · Get token
        </p>
      </header>

      {deskAlert ? (
        <div className="mx-4 mt-4 rounded-lg bg-amber-500/20 border border-amber-400/40 px-4 py-2 text-sm text-amber-100">
          Desk alert: {deskAlert}
        </div>
      ) : null}

      <main className="mx-auto max-w-lg px-4 py-6 space-y-5">
        {step === "browse" ? (
          <form onSubmit={(e) => void book(e)} className="space-y-4">
            <label className="block space-y-1">
              <span className="text-sm text-white/70">Mobile number</span>
              <input
                className="w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-lg"
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 12))}
                inputMode="tel"
                required
                placeholder="10-digit mobile"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-white/70">Name (optional)</span>
              <input
                className="w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            <div className="space-y-2">
              <p className="text-sm font-medium text-white/80">Select tests</p>
              {tests.map((t) => (
                <label
                  key={t.id}
                  className={`flex items-center justify-between rounded-xl px-4 py-3 cursor-pointer border ${
                    selected.has(t.id) ? "border-emerald-400 bg-emerald-500/10" : "border-white/15 bg-white/5"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleTest(t.id)} />
                    {t.name}
                  </span>
                  <span className="text-emerald-300 font-medium">{money(t.priceMinor)}</span>
                </label>
              ))}
            </div>

            <p className="text-right text-lg font-semibold">Total: {money(total || amountMinor)}</p>
            {error ? <p className="text-red-300 text-sm">{error}</p> : null}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-4 text-lg disabled:opacity-60"
            >
              {busy ? "Processing…" : "Continue to UPI payment"}
            </button>
          </form>
        ) : null}

        {step === "pay" && token ? (
          <div className="space-y-4 text-center">
            <p className="text-white/70">Pay {money(amountMinor)} via PhonePe / Google Pay / Paytm</p>
            <div className="rounded-2xl bg-white p-6 text-slate-900">
              <p className="text-sm text-slate-500">UPI QR / Deep link</p>
              <p className="font-mono text-xs break-all mt-2">{upiUri}</p>
              <a
                href={upiUri}
                className="mt-4 inline-block rounded-xl bg-indigo-600 text-white px-6 py-3 font-semibold"
              >
                Open UPI app
              </a>
            </div>
            <label className="block text-left space-y-1">
              <span className="text-sm text-white/70">UPI transaction ID (after payment)</span>
              <input
                className="w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                placeholder="e.g. 1234567890"
              />
            </label>
            {error ? <p className="text-red-300 text-sm">{error}</p> : null}
            <button
              type="button"
              onClick={() => void confirmPaid()}
              disabled={busy}
              className="w-full rounded-xl bg-emerald-500 text-slate-950 font-bold py-4"
            >
              I have paid — get my token
            </button>
          </div>
        ) : null}

        {step === "done" && token ? (
          <div className="text-center space-y-4 py-8">
            <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-400" aria-hidden />
            <p className="text-5xl font-black tracking-tight text-emerald-300">{token.tokenLabel}</p>
            <p className="text-white/70">Show this token at the sample collection desk</p>
            <p className="text-sm text-white/50">Order {orderNumber}</p>
          </div>
        ) : null}
      </main>
    </div>
  );
};
