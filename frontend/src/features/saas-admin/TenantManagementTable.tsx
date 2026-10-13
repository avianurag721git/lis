import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  "analytics"
];

const PLANS = ["STARTER", "PRO", "ENTERPRISE"] as const;

export const TenantManagementTable = (): JSX.Element => {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [subdomain, setSubdomain] = useState("");

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["saas-tenants"],
    queryFn: () => saasAdminApi.listTenants()
  });

  const createMutation = useMutation({
    mutationFn: () => saasAdminApi.createTenant({ name, subdomain, plan: "STARTER" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["saas-tenants"] });
      void queryClient.invalidateQueries({ queryKey: ["saas-overview"] });
      setShowCreate(false);
      setName("");
      setSubdomain("");
    }
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => saasAdminApi.updateTenant(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["saas-tenants"] });
      void queryClient.invalidateQueries({ queryKey: ["saas-overview"] });
    }
  });

  const handleCreate = (e: FormEvent): void => {
    e.preventDefault();
    createMutation.mutate();
  };

  const toggleModule = (tenant: TenantAdminRow, mod: string): void => {
    const set = new Set(tenant.enabledModules);
    if (set.has(mod)) set.delete(mod);
    else set.add(mod);
    patchMutation.mutate({ id: tenant.id, body: { enabledModules: Array.from(set) } });
  };

  if (isLoading) return <p className="muted">Loading tenants…</p>;

  return (
    <section className="saas-tenants">
      <div className="saas-tenants__header">
        <h2>Tenant Management</h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "Cancel" : "Create Tenant"}
        </button>
      </div>

      {showCreate ? (
        <form className="saas-create-form card" onSubmit={handleCreate}>
          <label>
            Lab name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Subdomain
            <input value={subdomain} onChange={(e) => setSubdomain(e.target.value.toLowerCase())} pattern="[a-z0-9-]+" required />
          </label>
          <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
            Provision tenant
          </button>
        </form>
      ) : null}

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
            {tenants.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>
                  <code>{t.subdomain}</code>
                </td>
                <td>
                  <select
                    value={t.plan}
                    onChange={(e) =>
                      patchMutation.mutate({ id: t.id, body: { plan: e.target.value } })
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
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => patchMutation.mutate({ id: t.id, body: { suspend: true } })}
                  >
                    Suspend
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => patchMutation.mutate({ id: t.id, body: { subscriptionStatus: "ACTIVE" } })}
                  >
                    Activate
                  </button>
                  <details className="saas-modules-popover">
                    <summary>Modules</summary>
                    <div className="saas-modules-list">
                      {LIS_MODULES.map((mod) => (
                        <label key={mod}>
                          <input
                            type="checkbox"
                            checked={t.enabledModules.includes(mod)}
                            onChange={() => toggleModule(t, mod)}
                          />
                          {mod}
                        </label>
                      ))}
                    </div>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
