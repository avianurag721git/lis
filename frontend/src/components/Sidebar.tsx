import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../modules/auth/auth.context";
import { cn } from "../lib/utils";
import { TenantBranchSwitcher } from "./sidebar/TenantBranchSwitcher";
import { SIDEBAR_NAV_GROUPS, type SidebarBadgeKey, type SidebarNavItem } from "./sidebar/sidebarNav.config";
import { useSidebarBadges } from "./sidebar/useSidebarBadges";

const EXPANDED_STORAGE_KEY = "diaglab_sidebar_groups";

type Props = {
  onOpenCommand?: () => void;
  onNavigate?: () => void;
};

const parsePath = (to: string): { pathname: string; search: string } => {
  const [pathname = "", query = ""] = to.split("?");
  return { pathname, search: query ? `?${query}` : "" };
};

const isItemActive = (item: SidebarNavItem, pathname: string, search: string): boolean => {
  const paths = [item.to, ...(item.matchPaths ?? [])];
  return paths.some((p) => {
    const parsed = parsePath(p);
    if (parsed.search) {
      return pathname === parsed.pathname && search === parsed.search;
    }
    if (item.end || p === "/") {
      return pathname === parsed.pathname;
    }
    return pathname === parsed.pathname || pathname.startsWith(`${parsed.pathname}/`);
  });
};

const NavBadge = ({
  badgeKey,
  badges
}: {
  badgeKey: SidebarBadgeKey;
  badges: ReturnType<typeof useSidebarBadges>;
}): JSX.Element | null => {
  const badge = badges[badgeKey];
  if (!badge) return null;

  const display = badge.label ?? (badge.count && badge.count > 0 ? String(badge.count) : null);
  if (!display) return null;

  return (
    <span
      className={cn(
        "ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none",
        badge.tone === "danger" && "bg-rose-500/15 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300",
        badge.tone === "warning" && "bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
        (!badge.tone || badge.tone === "default") && "bg-slate-200/80 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
      )}
    >
      {display}
    </span>
  );
};

export const Sidebar = ({ onOpenCommand, onNavigate }: Props): JSX.Element => {
  const { user, hasPermission } = useAuth();
  const location = useLocation();
  const badges = useSidebarBadges();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  const canSeeItem = useCallback(
    (item: SidebarNavItem): boolean => {
      if (item.superAdminOnly && !isSuperAdmin) return false;
      if (!item.requiredPermission) return true;
      const perms = Array.isArray(item.requiredPermission) ? item.requiredPermission : [item.requiredPermission];
      return perms.some((perm) => hasPermission(perm));
    },
    [hasPermission, isSuperAdmin]
  );

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(EXPANDED_STORAGE_KEY);
      if (raw) return JSON.parse(raw) as Record<string, boolean>;
    } catch {
      /* ignore */
    }
    return Object.fromEntries(SIDEBAR_NAV_GROUPS.map((g) => [g.id, g.defaultOpen !== false]));
  });

  useEffect(() => {
    localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(expanded));
  }, [expanded]);

  const toggleGroup = useCallback((groupId: string) => {
    setExpanded((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  }, []);

  const visibleGroups = useMemo(
    () =>
      SIDEBAR_NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => canSeeItem(item))
      })).filter((group) => group.items.length > 0),
    [canSeeItem]
  );

  // Auto-expand group containing active route
  useEffect(() => {
    const { pathname, search } = location;
    for (const group of visibleGroups) {
      if (group.items.some((item) => isItemActive(item, pathname, search))) {
        setExpanded((prev) => (prev[group.id] ? prev : { ...prev, [group.id]: true }));
      }
    }
  }, [location, visibleGroups]);

  return (
    <aside className="sidebar sidebar-v2">
      <TenantBranchSwitcher />

      <nav
        className={cn(
          "sidebar-nav sidebar-nav-v2 flex-1 overflow-y-auto overflow-x-hidden",
          "[&::-webkit-scrollbar]:w-1.5",
          "[&::-webkit-scrollbar-track]:bg-transparent",
          "[&::-webkit-scrollbar-thumb]:rounded-full",
          "[&::-webkit-scrollbar-thumb]:bg-slate-300",
          "dark:[&::-webkit-scrollbar-thumb]:bg-slate-700",
          "hover:[&::-webkit-scrollbar-thumb]:bg-slate-400",
          "dark:hover:[&::-webkit-scrollbar-thumb]:bg-slate-600"
        )}
        aria-label="Main navigation"
      >
        {visibleGroups.map((group) => {
          const isOpen = expanded[group.id] !== false;
          const hasActive = group.items.some((item) => isItemActive(item, location.pathname, location.search));

          return (
            <section key={group.id} className="mb-3">
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                className={cn(
                  "mb-1 flex w-full items-center gap-1.5 rounded-md px-3 py-1.5 text-left transition-colors",
                  "hover:bg-slate-100/80 dark:hover:bg-slate-800/50",
                  hasActive && "text-slate-600 dark:text-slate-300"
                )}
                aria-expanded={isOpen}
              >
                <ChevronRight
                  size={12}
                  className={cn("shrink-0 text-slate-400 transition-transform", isOpen && "rotate-90")}
                  aria-hidden
                />
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{group.title}</span>
              </button>

              {isOpen ? (
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const { pathname, search } = parsePath(item.to);
                    const active = isItemActive(item, location.pathname, location.search);
                    const Icon = item.icon;

                    return (
                      <li key={`${group.id}-${item.label}`}>
                        <NavLink
                          to={search ? { pathname, search } : pathname}
                          {...(item.end !== undefined ? { end: item.end } : {})}
                          onClick={() => onNavigate?.()}
                          className={cn(
                            "sidebar-nav-link group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                            "border-l-2 border-transparent text-slate-600 dark:text-slate-400",
                            "hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800/70 dark:hover:text-slate-100",
                            active &&
                              "sidebar-nav-link--active border-cyan-500 bg-gradient-to-r from-cyan-500/10 to-transparent text-cyan-700 dark:text-cyan-300"
                          )}
                        >
                          <Icon
                            size={16}
                            className={cn(
                              "shrink-0 opacity-70 transition-opacity group-hover:opacity-100",
                              active && "text-cyan-500 opacity-100 dark:text-cyan-400"
                            )}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1 truncate leading-snug">{item.label}</span>
                          {item.badgeKey ? <NavBadge badgeKey={item.badgeKey} badges={badges} /> : null}
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </section>
          );
        })}
      </nav>

      <div className="sidebar-footer sidebar-footer-v2">
        <button
          type="button"
          onClick={() => onOpenCommand?.()}
          className="sidebar-search-btn"
          aria-label="Open search"
        >
          <Search size={14} className="sidebar-search-btn__icon" aria-hidden />
          <span className="sidebar-search-btn__text">Search orders, patients, samples…</span>
          <kbd>⌘K</kbd>
        </button>
      </div>
    </aside>
  );
};
