import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Save, Search } from "lucide-react";
import { usersService, type TenantStaffUser } from "../../modules/users/users.service";
import {
  LAB_ROLES,
  PERMISSIONS,
  PERMISSION_LABELS,
  type Permission,
  type LabUserRole,
  normalizeRole
} from "../../modules/auth/permissions";
import { formatRoleLabel } from "../../utils/roleLabels";
import { cn } from "../../lib/utils";

const ROLE_FILTER_OPTIONS = LAB_ROLES.filter((r) => r !== "SUPER_ADMIN" && r !== "PATIENT");

export const RolePermissionMatrix = (): JSX.Element => {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [drafts, setDrafts] = useState<Record<string, Permission[]>>({});
  const [msg, setMsg] = useState("");

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["tenant-staff"],
    queryFn: () => usersService.listStaff()
  });

  const saveMutation = useMutation({
    mutationFn: ({ userId, permissions }: { userId: string; permissions: Permission[] }) =>
      usersService.updatePermissions(userId, permissions),
    onSuccess: async () => {
      setMsg("Permissions saved and audit log recorded.");
      await qc.invalidateQueries({ queryKey: ["tenant-staff"] });
    },
    onError: () => setMsg("Failed to save permissions.")
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      const roleOk = roleFilter === "ALL" || normalizeRole(u.role) === roleFilter;
      const searchOk =
        !q ||
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        formatRoleLabel(u.role).toLowerCase().includes(q);
      return roleOk && searchOk;
    });
  }, [users, search, roleFilter]);

  const permissionsFor = (user: TenantStaffUser): Permission[] =>
    drafts[user.id] ?? user.effectivePermissions;

  const togglePermission = (user: TenantStaffUser, perm: Permission): void => {
    const current = new Set(permissionsFor(user));
    if (current.has(perm)) current.delete(perm);
    else current.add(perm);
    setDrafts((prev) => ({ ...prev, [user.id]: [...current] }));
  };

  const resetRoleDefaults = async (role: LabUserRole): Promise<void> => {
    const defaults = await usersService.roleDefaults(role);
    const nextDrafts = { ...drafts };
    for (const user of users.filter((u) => normalizeRole(u.role) === role)) {
      nextDrafts[user.id] = defaults;
    }
    setDrafts(nextDrafts);
    setMsg(`Loaded ${formatRoleLabel(role)} default permissions — click Save per user to persist.`);
  };

  const saveUser = (user: TenantStaffUser): void => {
    saveMutation.mutate({ userId: user.id, permissions: permissionsFor(user) });
  };

  return (
    <section className="page-shell">
      <div className="page-head">
        <h1 className="page-title">Role & Permission Matrix</h1>
        <p className="page-subtitle">Assign granular access for each staff member. Changes are audit-logged.</p>
      </div>

      <div className="card mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm dark:border-slate-700 dark:bg-slate-900"
              placeholder="Search staff by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="ALL">All roles</option>
            {ROLE_FILTER_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {formatRoleLabel(role)}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {(["RECEPTIONIST", "PHLEBOTOMIST", "LAB_TECH", "PATHOLOGIST", "B2B_FRANCHISEE"] as LabUserRole[]).map(
            (role) => (
              <button key={role} type="button" className="btn btn-secondary btn-sm" onClick={() => void resetRoleDefaults(role)}>
                <RotateCcw size={12} aria-hidden />
                Reset {formatRoleLabel(role)} Defaults
              </button>
            )
          )}
        </div>
      </div>

      {msg ? <p className="mb-3 text-sm text-slate-500">{msg}</p> : null}
      {isLoading ? <p className="text-muted">Loading staff…</p> : null}

      <div className="space-y-4">
        {filtered.map((user) => (
          <div key={user.id} className="card overflow-x-auto">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <strong>{user.name}</strong>
                <p className="text-sm text-slate-500">
                  {user.email} · {formatRoleLabel(user.role)}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={saveMutation.isPending}
                onClick={() => saveUser(user)}
              >
                <Save size={14} aria-hidden />
                Save permissions
              </button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {PERMISSIONS.map((perm) => {
                const checked = permissionsFor(user).includes(perm);
                return (
                  <label
                    key={perm}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm",
                      checked
                        ? "border-cyan-500/40 bg-cyan-500/5"
                        : "border-slate-200 dark:border-slate-700"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePermission(user, perm)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium">{perm}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{PERMISSION_LABELS[perm]}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
