import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Building2, PackagePlus, Wallet } from "lucide-react";
import { b2bApi, B2BFranchisee } from "../b2b/b2b.service";
import { money } from "./dashboard.service";
import { useDashboardRealtime } from "./useDashboardRealtime";
import { NumberField } from "../../components/NumberField";

export const B2BFranchiseeDashboard = (): JSX.Element => {
  const qc = useQueryClient();
  const [franchiseeId, setFranchiseeId] = useState("");
  const [rechargeRupees, setRechargeRupees] = useState(2000);
  const [msg, setMsg] = useState("");

  useDashboardRealtime(["b2b-franchisees", "b2b-wallet"]);

  const {
    data: franchisees = [],
    isLoading,
    isError
  } = useQuery({
    queryKey: ["b2b-franchisees"],
    queryFn: () => b2bApi.list()
  });

  useEffect(() => {
    if (!franchiseeId && franchisees[0]) setFranchiseeId(franchisees[0].id);
  }, [franchiseeId, franchisees]);

  const selected: B2BFranchisee | null = franchisees.find((f) => f.id === franchiseeId) ?? null;

  const { data: wallet } = useQuery({
    queryKey: ["b2b-wallet", franchiseeId],
    queryFn: () => b2bApi.wallet(franchiseeId),
    enabled: Boolean(franchiseeId)
  });

  const rechargeMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Select franchisee");
      const amountMinor = Math.round(rechargeRupees * 100);
      const session = await b2bApi.recharge(selected.id, amountMinor, "STRIPE");
      return b2bApi.confirmRecharge(selected.id, {
        amountMinor,
        gateway: "STRIPE",
        gatewayRef: session.paymentIntentId ?? `dash_${Date.now()}`
      });
    },
    onSuccess: async () => {
      setMsg("Wallet recharged.");
      await qc.invalidateQueries({ queryKey: ["b2b-wallet"] });
      await qc.invalidateQueries({ queryKey: ["b2b-franchisees"] });
    },
    onError: (err: any) => setMsg(err?.response?.data?.message ?? "Recharge failed")
  });

  const onRecharge = (e: FormEvent): void => {
    e.preventDefault();
    rechargeMutation.mutate();
  };

  return (
    <section className="page-shell dash-shell">
      <div className="page-head">
        <h1 className="page-title">B2B franchisee dashboard</h1>
        <p className="page-subtitle">Wallet balance, dispatches, and quick batch booking.</p>
      </div>

      {isLoading ? (
        <div className="card">
          <p className="text-muted">Loading franchisees…</p>
        </div>
      ) : isError ? (
        <div className="card banner-error">
          <p>Could not load franchisees. Check your connection and try again.</p>
        </div>
      ) : franchisees.length === 0 ? (
        <div className="b2b-empty-card card">
          <div className="b2b-empty-card__icon" aria-hidden>
            <Building2 size={28} />
          </div>
          <h2 className="b2b-empty-card__title">No B2B franchisees yet</h2>
          <p className="b2b-empty-card__text">
            Add a franchisee partner on the B2B portal to see wallet balance, quick actions, and dispatch activity
            here.
          </p>
          <Link className="btn btn-primary" to="/b2b">Open B2B portal</Link>
        </div>
      ) : (
        <>
          <div className="form-grid card card-toolbar">
            <label className="form-label">
              Franchisee
              <select value={franchiseeId} onChange={(e) => setFranchiseeId(e.target.value)}>
                {franchisees.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.code} · {f.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selected ? (
            <>
              <div className="kpi-grid kpi-grid--duo">
                <article className="kpi-card kpi-card--tile">
                  <div className="kpi-card__head">
                    <div className="kpi-icon kpi-icon--teal" aria-hidden>
                      <Wallet size={20} />
                    </div>
                    <span className="kpi-label">Wallet balance</span>
                  </div>
                  <div className="kpi-card__body">
                    <div className="kpi-value">
                      {money(wallet?.franchisee.walletBalanceMinor ?? selected.walletBalanceMinor)}
                    </div>
                    <div className="kpi-sub">Credit limit {money(selected.creditLimitMinor)}</div>
                  </div>
                </article>
                <article className="kpi-card kpi-card--tile">
                  <div className="kpi-card__head">
                    <div className="kpi-icon kpi-icon--blue" aria-hidden>
                      <PackagePlus size={20} />
                    </div>
                    <span className="kpi-label">Quick actions</span>
                  </div>
                  <div className="kpi-card__body kpi-actions">
                    <Link className="btn btn-primary btn-sm" to="/b2b">
                      Book B2B sample batch
                    </Link>
                    <Link className="btn btn-secondary btn-sm" to="/orders">
                      Order booking
                    </Link>
                  </div>
                </article>
              </div>

              <form className="card" onSubmit={onRecharge}>
                <h2 className="card-title">Recharge wallet</h2>
                <div className="form-grid">
                  <label className="form-label">
                    Amount (₹)
                    <NumberField
                      min={100}
                      value={rechargeRupees}
                      onValueChange={setRechargeRupees}
                    />
                  </label>
                </div>
                <button type="submit" className="btn btn-primary mt-2" disabled={rechargeMutation.isPending}>
                  Recharge wallet
                </button>
                {msg ? <p className="text-muted">{msg}</p> : null}
              </form>

              <div className="card table-scroll">
                <h2 className="card-title">Recent wallet / dispatch activity</h2>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Balance after</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(wallet?.transactions ?? []).slice(0, 12).map((tx) => (
                      <tr key={tx.id}>
                        <td>{tx.type}</td>
                        <td>{money(tx.amountMinor)}</td>
                        <td>{money(tx.balanceAfterMinor)}</td>
                        <td>{new Date(tx.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(wallet?.transactions ?? []).length === 0 ? (
                  <p className="text-muted">No wallet activity yet.</p>
                ) : null}
              </div>
            </>
          ) : null}
        </>
      )}
    </section>
  );
};
