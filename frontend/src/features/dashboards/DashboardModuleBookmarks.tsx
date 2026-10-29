import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  Beaker,
  Bookmark,
  Building2,
  ClipboardList,
  FileText,
  FlaskConical,
  KeyRound,
  Microscope,
  Pin,
  PinOff,
  Stethoscope,
  Wallet
} from "lucide-react";
import { useAuth } from "../../modules/auth/auth.context";
import { normalizeRole, type Permission } from "../../modules/auth/permissions";

type ModuleDef = {
  id: string;
  label: string;
  hint: string;
  to: string;
  icon: typeof ClipboardList;
  permission: Permission | Permission[];
};

const ALL_MODULES: ModuleDef[] = [
  {
    id: "orders",
    label: "Orders & patients",
    hint: "Register & book",
    to: "/orders",
    icon: ClipboardList,
    permission: ["PATIENT_MANAGE", "ORDER_CREATE"]
  },
  {
    id: "billing",
    label: "Billing",
    hint: "Invoices & payments",
    to: "/billing",
    icon: Wallet,
    permission: "BILLING_CREATE"
  },
  {
    id: "receiving",
    label: "Lab receiving",
    hint: "Sample intake",
    to: "/lab-receiving",
    icon: Beaker,
    permission: "SAMPLE_RECEIVE"
  },
  {
    id: "results",
    label: "Result entry",
    hint: "Technician grid",
    to: "/lab-results",
    icon: FlaskConical,
    permission: "RESULT_ENTRY"
  },
  {
    id: "pathologist",
    label: "Pathologist approval",
    hint: "Verify & sign",
    to: "/pathologist",
    icon: Stethoscope,
    permission: "PATHOLOGIST_VERIFY"
  },
  {
    id: "reports",
    label: "PDF reports",
    hint: "NABL & WhatsApp",
    to: "/pathologist",
    icon: FileText,
    permission: "PATHOLOGIST_VERIFY"
  },
  {
    id: "b2b",
    label: "B2B wallet",
    hint: "Franchisee balance",
    to: "/b2b",
    icon: Building2,
    permission: "B2B_WALLET_MANAGE"
  },
  {
    id: "analytics",
    label: "Referral analytics",
    hint: "Doctor performance",
    to: "/analytics/referrals",
    icon: BarChart3,
    permission: "ANALYTICS_VIEW"
  },
  {
    id: "inventory",
    label: "Reagent inventory",
    hint: "Stock & QC",
    to: "/inventory-qc?tab=inventory",
    icon: Microscope,
    permission: "REAGENT_MANAGE"
  },
  {
    id: "report-layout",
    label: "Report layout",
    hint: "Tenant branding",
    to: "/settings/tenant",
    icon: Building2,
    permission: "SETTINGS_MANAGE"
  },
  {
    id: "permissions",
    label: "Roles & access",
    hint: "Permission packs",
    to: "/settings/permissions",
    icon: KeyRound,
    permission: "SETTINGS_MANAGE"
  }
];

const DEFAULT_PINS: Record<string, string[]> = {
  SUPER_ADMIN: ["orders", "billing", "pathologist", "analytics", "report-layout", "permissions"],
  LAB_MANAGER: ["orders", "billing", "receiving", "results", "pathologist", "report-layout"],
  PATHOLOGIST: ["pathologist", "reports", "results", "analytics"],
  RECEPTIONIST: ["orders", "billing"],
  LAB_TECH: ["receiving", "results", "inventory"],
  PHLEBOTOMIST: [],
  B2B_FRANCHISEE: ["b2b", "orders"],
  PATIENT: []
};

const storageKey = (userId: string): string => `dlms_dash_pins_${userId}`;

const canSee = (hasPermission: (p: Permission) => boolean, perm: Permission | Permission[]): boolean => {
  const list = Array.isArray(perm) ? perm : [perm];
  return list.some((p) => hasPermission(p));
};

export const DashboardModuleBookmarks = (): JSX.Element | null => {
  const { user, hasPermission } = useAuth();
  const role = normalizeRole(user?.role ?? "PATIENT");
  const userId = user?.userId ?? "anon";

  const available = useMemo(
    () => ALL_MODULES.filter((m) => canSee(hasPermission, m.permission)),
    [hasPermission]
  );

  const [pinnedIds, setPinnedIds] = useState<string[]>(() => DEFAULT_PINS[role] ?? []);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(userId));
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPinnedIds(parsed.filter((id) => typeof id === "string"));
          return;
        }
      }
    } catch {
      /* ignore */
    }
    setPinnedIds(DEFAULT_PINS[role] ?? []);
  }, [userId, role]);

  const persist = useCallback(
    (next: string[]) => {
      setPinnedIds(next);
      try {
        localStorage.setItem(storageKey(userId), JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [userId]
  );

  const togglePin = (id: string): void => {
    if (pinnedIds.includes(id)) {
      persist(pinnedIds.filter((x) => x !== id));
    } else {
      persist([...pinnedIds, id]);
    }
  };

  const pinned = available.filter((m) => pinnedIds.includes(m.id));
  const show = pinned.length > 0 ? pinned : available.slice(0, 6);

  if (available.length === 0) return null;

  return (
    <div className="card dash-bookmarks">
      <div className="dash-bookmarks__head">
        <div>
          <h2 className="card-title" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <Bookmark size={18} aria-hidden />
            Bookmarks
          </h2>
          <p className="text-muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
            Jump to your most-used modules. Pin what you need for this role.
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => setEditMode((v) => !v)}>
          {editMode ? "Done" : "Customize"}
        </button>
      </div>

      <div className="dash-bookmarks__grid">
        {show.map((mod) => {
          const Icon = mod.icon;
          return (
            <Link key={mod.id} to={mod.to} className="dash-bookmark-tile">
              <span className="dash-bookmark-tile__icon" aria-hidden>
                <Icon size={20} />
              </span>
              <span className="dash-bookmark-tile__body">
                <span className="dash-bookmark-tile__label">{mod.label}</span>
                <span className="dash-bookmark-tile__hint">{mod.hint}</span>
              </span>
              {editMode ? (
                <button
                  type="button"
                  className="dash-bookmark-tile__pin"
                  aria-label={pinnedIds.includes(mod.id) ? `Unpin ${mod.label}` : `Pin ${mod.label}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    togglePin(mod.id);
                  }}
                >
                  {pinnedIds.includes(mod.id) ? <PinOff size={16} /> : <Pin size={16} />}
                </button>
              ) : null}
            </Link>
          );
        })}
      </div>

      {editMode ? (
        <div className="dash-bookmarks__catalog">
          <p className="text-muted" style={{ fontSize: 12, marginBottom: 8 }}>
            Available modules for your permissions
          </p>
          <div className="dash-bookmarks__chips">
            {available.map((mod) => {
              const on = pinnedIds.includes(mod.id);
              return (
                <button
                  key={mod.id}
                  type="button"
                  className={on ? "dash-bookmark-chip is-on" : "dash-bookmark-chip"}
                  onClick={() => togglePin(mod.id)}
                >
                  {on ? <Pin size={12} /> : <PinOff size={12} />}
                  {mod.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
};
