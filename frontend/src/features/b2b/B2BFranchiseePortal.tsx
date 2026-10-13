import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { B2BFranchisee, B2BPriceRow, b2bApi } from "./b2b.service";
import { WalletTopupModal } from "./WalletTopupModal";
import { NumberField } from "../../components/NumberField";

const money = (minor: number): string =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "INR" }).format(minor / 100);

export const B2BFranchiseePortal = (): JSX.Element => {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [creditLimit, setCreditLimit] = useState(0);
  const [csv, setCsv] = useState("patient_name,phone,test_code\nRahul Sharma,9999999999,CBC\n");
  const [rateQ, setRateQ] = useState("");
  const [rateCard, setRateCard] = useState<{ tests: B2BPriceRow[]; packages: B2BPriceRow[] } | null>(null);
  const [msg, setMsg] = useState("");
  const [topupOpen, setTopupOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: franchisees = [] } = useQuery({
    queryKey: ["b2b-franchisees"],
    queryFn: () => b2bApi.list()
  });

  const selected: B2BFranchisee | null = franchisees.find((f) => f.id === selectedId) ?? franchisees[0] ?? null;

  useEffect(() => {
    if (!selectedId && franchisees[0]) setSelectedId(franchisees[0].id);
  }, [franchisees, selectedId]);

  const { data: wallet } = useQuery({
    queryKey: ["b2b-wallet", selected?.id, from, to],
    queryFn: () => b2bApi.wallet(selected!.id, from && to ? { from, to } : {}),
    enabled: Boolean(selected?.id)
  });

  const { data: ledger } = useQuery({
    queryKey: ["b2b-ledger", selected?.id, from, to],
    queryFn: () => b2bApi.ledger(selected!.id, from && to ? { from, to } : {}),
    enabled: Boolean(selected?.id)
  });

  useEffect(() => {
    if (!selected?.id) {
      setRateCard(null);
      return;
    }
    void b2bApi
      .rateCard(selected.id)
      .then(setRateCard)
      .catch(() => setRateCard(null));
  }, [selected?.id]);

  const filteredRates = useMemo(() => {
    const q = rateQ.trim().toLowerCase();
    const tests = rateCard?.tests ?? [];
    if (!q) return tests.slice(0, 30);
    return tests.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 30);
  }, [rateCard, rateQ]);

  const createMutation = useMutation({
    mutationFn: () =>
      b2bApi.upsert({
        code,
        name,
        phone: phone || null,
        creditLimitMinor: creditLimit
      }),
    onSuccess: async (f) => {
      setMsg(`Franchisee ${f.code} saved.`);
      setSelectedId(f.id);
      await qc.invalidateQueries({ queryKey: ["b2b-franchisees"] });
    },
    onError: (err: any) => setMsg(err?.response?.data?.message ?? "Save failed")
  });

  const bulkMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Select franchisee");
      return b2bApi.bulkOrders(selected.id, csv);
    },
    onSuccess: async (r) => {
      setMsg(`Bulk upload: ${r.created} created${r.errors.length ? `, ${r.errors.length} errors` : ""}.`);
      await qc.invalidateQueries({ queryKey: ["b2b-wallet"] });
      await qc.invalidateQueries({ queryKey: ["b2b-ledger"] });
    },
    onError: (err: any) => setMsg(err?.response?.data?.message ?? "Bulk upload failed")
  });

  const onCreate = (e: FormEvent): void => {
    e.preventDefault();
    createMutation.mutate();
  };

  const onCsvFile = async (file: File | null): Promise<void> => {
    if (!file) return;
    const text = await file.text();
    setCsv(text);
  };

  const exportLedger = async (format: "csv" | "pdf"): Promise<void> => {
    if (!selected) return;
    try {
      const blob = await b2bApi.exportLedger(selected.id, from && to ? { from, to, format } : { format });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selected.code}-ledger.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setMsg(err?.response?.data?.message ?? "Export failed");
    }
  };

  const balance = wallet?.franchisee.walletBalanceMinor ?? selected?.walletBalanceMinor ?? 0;

  return (
    <section className="page-shell">
      <div className="page-head">
        <h1 className="page-title">B2B franchisee portal</h1>
        <p className="page-subtitle">
          Prepaid wallet, wholesale rate card, bulk CSV orders, and financial ledger export.
        </p>
      </div>

      {msg ? <p className="text-muted">{msg}</p> : null}

      <form className="card" onSubmit={onCreate}>
        <h2 className="card-title">Register / update franchisee</h2>
        <div className="form-grid">
          <label className="form-label">
            Code
            <input value={code} onChange={(e) => setCode(e.target.value)} required placeholder="CC-NORTH" />
          </label>
          <label className="form-label">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="form-label">
            Phone
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="form-label">
            Credit limit (paise)
            <NumberField
              min={0}
              value={creditLimit}
              onValueChange={setCreditLimit}
            />
          </label>
        </div>
        <button type="submit" style={{ marginTop: 8 }} disabled={createMutation.isPending}>
          {createMutation.isPending ? "Saving…" : "Save franchisee"}
        </button>
      </form>

      <div className="pathologist-layout">
        <div className="card">
          <h2 className="card-title">Franchisees</h2>
          <ul className="pathologist-queue-list">
            {franchisees.map((f) => (
              <li
                key={f.id}
                className={f.id === selected?.id ? "pathologist-queue-item is-active" : "pathologist-queue-item"}
              >
                <button type="button" className="linkish" onClick={() => setSelectedId(f.id)}>
                  <strong>
                    {f.code} · {f.name}
                  </strong>
                  <span className="text-muted">Wallet {money(f.walletBalanceMinor)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          {!selected ? (
            <p className="text-muted">Create a franchisee to manage wallet &amp; rates.</p>
          ) : (
            <>
              <div className="wallet-badge-row">
                <div className="wallet-badge" key={balance}>
                  <span className="wallet-badge-label">Wallet</span>
                  <strong className="wallet-badge-amount">{money(balance)}</strong>
                </div>
                <button type="button" className="btn btn-primary wallet-topup-btn" onClick={() => setTopupOpen(true)}>
                  Top up
                </button>
              </div>
              <p className="text-muted">Credit limit {money(selected.creditLimitMinor)}</p>

              <h3 className="card-title" style={{ fontSize: 15, marginTop: 16 }}>
                Wholesale rate card
              </h3>
              <label className="form-label">
                Search
                <input value={rateQ} onChange={(e) => setRateQ(e.target.value)} placeholder="CBC, lipid…" />
              </label>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Test</th>
                      <th>Retail</th>
                      <th>B2B</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRates.map((t) => (
                      <tr key={t.testId}>
                        <td>{t.name}</td>
                        <td>{money(t.retailPriceMinor)}</td>
                        <td>{money(t.wholesalePriceMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3 className="card-title" style={{ fontSize: 15, marginTop: 20 }}>
                Bulk CSV / Excel order upload
              </h3>
              <p className="text-muted" style={{ fontSize: 12 }}>
                Columns: patient_name, phone, test_code, package_code — wallet deducted per row (atomic).
              </p>
              <div
                className="csv-dropzone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void onCsvFile(e.dataTransfer.files?.[0] ?? null);
                }}
              >
                <p>Drop CSV here or paste below</p>
                <input
                  type="file"
                  accept=".csv,text/csv,application/vnd.ms-excel"
                  onChange={(e) => void onCsvFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <textarea rows={5} value={csv} onChange={(e) => setCsv(e.target.value)} style={{ width: "100%" }} />
              <button
                type="button"
                style={{ marginTop: 8 }}
                onClick={() => bulkMutation.mutate()}
                disabled={bulkMutation.isPending}
              >
                Upload batch
              </button>

              <h3 className="card-title" style={{ fontSize: 15, marginTop: 20 }}>
                Financial ledger
              </h3>
              <div className="form-grid">
                <label className="form-label">
                  From
                  <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </label>
                <label className="form-label">
                  To
                  <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, margin: "8px 0", flexWrap: "wrap" }}>
                <button type="button" onClick={() => void exportLedger("pdf")}>
                  Export PDF
                </button>
                <button type="button" onClick={() => void exportLedger("csv")}>
                  Export CSV
                </button>
              </div>
              {ledger ? (
                <p className="text-muted" style={{ fontSize: 12 }}>
                  Opening {money(ledger.openingBalanceMinor)} → Closing {money(ledger.closingBalanceMinor)}
                </p>
              ) : null}
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Balance</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(ledger?.transactions ?? wallet?.transactions ?? []).slice(0, 40).map((tx) => (
                      <tr key={tx.id}>
                        <td>{new Date(tx.createdAt).toLocaleString()}</td>
                        <td>{tx.type}</td>
                        <td>{money(tx.amountMinor)}</td>
                        <td>{money(tx.balanceAfterMinor)}</td>
                        <td>{tx.note ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {selected ? (
        <WalletTopupModal
          franchisee={wallet?.franchisee ?? selected}
          open={topupOpen}
          onClose={() => setTopupOpen(false)}
          onCredited={async () => {
            setMsg("Wallet credited.");
            await qc.invalidateQueries({ queryKey: ["b2b-wallet"] });
            await qc.invalidateQueries({ queryKey: ["b2b-franchisees"] });
            await qc.invalidateQueries({ queryKey: ["b2b-ledger"] });
          }}
        />
      ) : null}
    </section>
  );
};

/** @deprecated use B2BFranchiseePortal */
export const B2BPortal = B2BFranchiseePortal;
