import { useEffect, useRef, useState } from "react";
import { Building2, ChevronDown, GitBranch, MapPin } from "lucide-react";
import { httpClient } from "../../services/http";
import { useTenant } from "../../modules/tenant/tenant.context";
import { useAuth } from "../../modules/auth/auth.context";
import { normalizeRole } from "../../modules/auth/permissions";
import { cn } from "../../lib/utils";

type TenantOption = { id: string; label: string };

const BRANCHES = [
  { id: "main", label: "Main Branch" },
  { id: "satellite", label: "Satellite Lab" },
  { id: "b2b-hub", label: "B2B Collection Hub" }
] as const;

const BRANCH_STORAGE_KEY = "diaglab_active_branch";

export const TenantBranchSwitcher = (): JSX.Element => {
  const { tenantId, config, setTenantId } = useTenant();
  const { user } = useAuth();
  const isSuperAdmin = Boolean(user && normalizeRole(user.role) === "SUPER_ADMIN");
  const [open, setOpen] = useState(false);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [activeBranch, setActiveBranch] = useState<string>(() => localStorage.getItem(BRANCH_STORAGE_KEY) ?? "main");
  const ref = useRef<HTMLDivElement>(null);

  const currentTenantLabel = tenants.find((t) => t.id === tenantId)?.label.replace(/\s*\([^)]*\)$/, "");
  const labName = config?.brandingName || currentTenantLabel || tenantId || "Laboratory";
  const branchLabel = BRANCHES.find((b) => b.id === activeBranch)?.label ?? "Main Branch";

  useEffect(() => {
    void httpClient
      .get<{ tenants: TenantOption[] }>("/tenants")
      .then(({ data }) => setTenants(data.tenants ?? []))
      .catch(() => setTenants([]));
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const switchBranch = (branchId: string): void => {
    setActiveBranch(branchId);
    localStorage.setItem(BRANCH_STORAGE_KEY, branchId);
    setOpen(false);
  };

  const switchTenant = (nextTenantId: string): void => {
    if (nextTenantId === tenantId) {
      setOpen(false);
      return;
    }
    setTenantId(nextTenantId);
    setOpen(false);
    window.location.reload();
  };

  return (
    <div ref={ref} className="relative border-b border-slate-200 px-3 py-3 dark:border-slate-800">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors",
          "hover:bg-slate-100 dark:hover:bg-slate-800/80",
          open && "bg-slate-100 dark:bg-slate-800/80"
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <div
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white"
          style={{ background: "linear-gradient(135deg, var(--primary-color, #0284c7), var(--secondary-color, #6366f1))" }}
        >
          <Building2 size={15} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight text-slate-900 dark:text-slate-100">{labName}</p>
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500 dark:text-slate-400">
            <GitBranch size={11} aria-hidden />
            {branchLabel}
            <ChevronDown size={12} className={cn("ml-auto shrink-0 transition-transform", open && "rotate-180")} />
          </p>
        </div>
      </button>

      {open ? (
        <div
          className={cn(
            "absolute left-3 right-3 top-[calc(100%-4px)] z-50 overflow-hidden rounded-xl border",
            "border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
          )}
          role="listbox"
        >
          <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-800">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Switch branch</p>
          </div>
          <ul className="max-h-36 overflow-y-auto py-1">
            {BRANCHES.map((branch) => (
              <li key={branch.id}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800",
                    activeBranch === branch.id && "bg-cyan-50 font-medium text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300"
                  )}
                  onClick={() => switchBranch(branch.id)}
                >
                  <MapPin size={13} className="shrink-0 opacity-60" />
                  {branch.label}
                </button>
              </li>
            ))}
          </ul>

          {isSuperAdmin && tenants.length > 1 ? (
            <>
              <div className="border-t border-slate-100 px-3 py-2 dark:border-slate-800">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Switch tenant</p>
              </div>
              <ul className="max-h-36 overflow-y-auto py-1">
                {tenants.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800",
                        tenantId === t.id && "bg-cyan-50 font-medium text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300"
                      )}
                      onClick={() => switchTenant(t.id)}
                    >
                      <Building2 size={13} className="shrink-0 opacity-60" />
                      {t.label}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
