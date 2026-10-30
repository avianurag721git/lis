import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "../../modules/tenant/tenant.context";
import { saasAdminApi, TenantAdminRow } from "./saasAdmin.service";

const LIS_MODULES = [
  "patients",
  "orders",
  "samples",
  "lab_results",
  "billing",
  "b2b",
  "inventory",
  "pathologist",
  "analytics",
  "hl7_astm"
];

const PLANS = ["STARTER", "PRO", "ENTERPRISE"] as const;

const LIVE_STATUSES = new Set(["ACTIVE", "TRIALING"]);

const errorMessage = (err: unknown, fallback: string): string =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

export const TenantManagementTable = (): JSX.Element => {
  const queryClient = useQueryClient();
  const { setTenantId } = useTenant();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [plan, setPlan] = useState<TenantAdminRow["plan"]>("STARTER");
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const {
    data: tenants = [],
    isLoading,
    error: listError,
    refetch
  } = useQuery({
    queryKey: ["saas-tenants"],
    queryFn: () => saasAdminApi.listTenants()
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ["saas-tenants"] });
    void queryClient.invalidateQueries({ queryKey: ["saas-overview"] });
  };

  const createMutation = useMutation({
    mutationFn: () => saasAdminApi.createTenant({ name: name.trim(), subdomain: subdomain.trim(), plan }),
    onSuccess: () => {
      invalidate();
      setNotice({ kind: "ok", text: `Tenant "${name.trim()}" provisioned.` });
      setShowCreate(false);
      setName("");
      setSubdomain("");
      setPlan("STARTER");
    },
    onError: (err) => setNotice({ kind: "error", text: errorMessage(err, "Could not create tenant.") })
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown>; successText: string }) =>
      saasAdminApi.updateTenant(id, body),
    onSuccess: (_data, vars) => {
      invalidate();
      setNotice({ kind: "ok", text: vars.successText });
    },
    onError: (err) => setNotice({ kind: "error", text: errorMessage(err, "Update failed.") })
  });

  const handleCreate = (e: FormEvent): void => {
    e.preventDefault();
    setNotice(null);
    createMutation.mutate();
  };

  const toggleModule = (tenant: TenantAdminRow, mod: string): void => {
    const set = new Set(tenant.enabledModules);
    if (set.has(mod)) set.delete(mod);
    else set.add(mod);
    patchMutation.mutate({
      id: tenant.id,
      body: { enabledModules: Array.from(set) },
      successText: `Modules updated for ${tenant.name}.`
    });
  };

  const suspend = (tenant: TenantAdminRow): void => {
    if (!window.confirm(`Suspend ${tenant.name}? Its users will be blocked until you reactivate it.`)) return;
    patchMutation.mutate({ id: tenant.id, body: { suspend: true }, successText: `${tenant.name} suspended.` });
  };

  const activate = (tenant: TenantAdminRow): void => {
    patchMutation.mutate({
      id: tenant.id,
      body: { subscriptionStatus: "ACTIVE" },
      successText: `${tenant.name} activated.`
    });
  };

  const openLab = (tenant: TenantAdminRow): void => {
    setTenantId(tenant.id);
    window.location.assign("/");
  };

  const busy = patchMutation.isPending;

  return (
    <section className="saas-tenants">
      <div className="saas-tenants__header">
        <h2>Tenant Management</h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "Cancel" : "Create Tenant"}
        </button>
      </div>

      {notice ? (
        <p className={notice.kind === "error" ? "status-error" : "status-success"} role="status">
          {notice.text}
        </p>
      ) : null}

      {showCreate ? (
        <form className="saas-create-form card" onSubmit={handleCreate}>
          <label>
            Lab name
            <input value={name} onChange={(e) => setName(e.target.value)} minLength={2} required />
          </label>
          <label>
            Subdomain
            <input
              value={subdomain}
              onChange={(e) => setSubdomain(e.target.value.toLowerCase())}
              pattern="[a-z0-9-]+"
              title="Lowercase letters, numbers and hyphens only"
              minLength={2}
              required
            />
          </label>
          <label>
            Plan
            <select value={plan} onChange={(e) => setPlan(e.target.value as TenantAdminRow["plan"])}>
              {PLANS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Provisioning…" : "Provision tenant"}
          </button>
        </form>
      ) : null}

      {isLoading ? (
        <p className="muted">Loading tenants…</p>
      ) : listError ? (
        <p className="status-error">
          {errorMessage(listError, "Failed to load tenants.")}{" "}
          <button type="button" className="btn btn-sm" onClick={() => void refetch()}>
            Retry
          </button>
        </p>
      ) : tenants.length === 0 ? (
        <p className="muted">No tenants yet. Use “Create Tenant” to provision the first lab.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Lab</th>
                <th>Subdomain</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Users</th>
                <th>Samples/mo</th>
                <th>MRR</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => {
                const isLive = LIVE_STATUSES.has(t.subscriptionStatus);
                return (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td>
                      <code>{t.subdomain}</code>
                    </td>
                    <td>
                      <select
                        value={t.plan}
                        disabled={busy}
                        aria-label={`Plan for ${t.name}`}
                        onChange={(e) =>
                          patchMutation.mutate({
                            id: t.id,
                            body: { plan: e.target.value },
                            successText: `${t.name} moved to ${e.target.value}.`
                          })
                        }
                      >
                        {PLANS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span className={`badge badge-sub badge-sub--${t.subscriptionStatus.toLowerCase()}`}>
                        {t.subscriptionStatus}
                      </span>
                    </td>
                    <td>{t.activeUsers}</td>
                    <td>{t.sampleVolumeMonth}</td>
                    <td>${t.mrrUsd}</td>
                    <td className="saas-actions">
                      <button type="button" className="btn btn-sm" onClick={() => openLab(t)}>
                        Open lab
                      </button>
                      {isLive ? (
                        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => suspend(t)}>
                          Suspend
                        </button>
                      ) : (
                        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => activate(t)}>
                          Activate
                        </button>
                      )}
                      <details className="saas-modules-popover">
                        <summary>Modules ({t.enabledModules.length})</summary>
                        <div className="saas-modules-list">
                          {LIS_MODULES.map((mod) => (
                            <label key={mod}>
                              <input
                                type="checkbox"
                                checked={t.enabledModules.includes(mod)}
                                disabled={busy}
                                onChange={() => toggleModule(t, mod)}
                              />
                              {mod}
                            </label>
                          ))}
                        </div>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
