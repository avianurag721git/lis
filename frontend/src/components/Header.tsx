import { useEffect, useState } from "react";
import { LogOut, Menu, Search } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { ThemeToggle } from "./ThemeToggle";
import { useAuth } from "../modules/auth/auth.context";
import { useTenant } from "../modules/tenant/tenant.context";
import { formatRoleLabel } from "../utils/roleLabels";
import { hl7Api } from "../features/instruments/hl7.service";

type HeaderProps = {
  onOpenCommand?: () => void;
  onOpenNav?: () => void;
};

export const Header = ({ onOpenCommand, onOpenNav }: HeaderProps): JSX.Element => {
  const { config, saas, branding } = useTenant();
  const { user, logout, isAuthenticated } = useAuth();
  const [analyzerOnline, setAnalyzerOnline] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    const poll = async (): Promise<void> => {
      try {
        const h = await hl7Api.health();
        if (!cancelled) setAnalyzerOnline(Boolean(h.enabled));
      } catch {
        if (!cancelled) setAnalyzerOnline(false);
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 30000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isAuthenticated]);

  const labTitle = config?.brandingName ?? "Diagnostic Lab Management System";
  const logoUrl = branding.logoUrl ?? config?.logoUrl;

  return (
    <header className="app-header">
      <div className="app-header-row">
        <div className="app-header-brand">
          {logoUrl ? (
            <img src={logoUrl} alt={labTitle} className="app-header-logo" />
          ) : (
            <div
              className="app-header-logo-fallback"
              style={
                branding.primaryColor
                  ? { background: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.secondaryColor})` }
                  : undefined
              }
            >
              {labTitle.charAt(0)}
            </div>
          )}
          <div className="app-header-titles">
            <h1>{labTitle}</h1>
            {branding.labHeaderAddress ? <p className="app-header-address">{branding.labHeaderAddress}</p> : null}
          </div>
          {branding.nablRegNo ? (
            <StatusBadge label={`NABL ${branding.nablRegNo}`} variant="success" className="header-nabl-hide-sm" />
          ) : null}
        </div>

        <div className="app-header-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm header-menu-btn"
            onClick={() => onOpenNav?.()}
            aria-label="Open navigation menu"
          >
            <Menu size={16} aria-hidden />
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm header-search-btn header-search-hide-lg"
            onClick={() => onOpenCommand?.()}
          >
            <Search size={14} aria-hidden />
            <span>Search</span>
            <kbd>⌘K</kbd>
          </button>

          {analyzerOnline === null ? null : (
            <StatusBadge
              label={analyzerOnline ? "Analyzer gateway on" : "Analyzer gateway off"}
              variant={analyzerOnline ? "live" : "warning"}
              className="header-hide-md"
            />
          )}

          <ThemeToggle />

          {saas ? (
            <div className="app-header-saas">
              <span className="plan-pill">{saas.plan}</span>
              <StatusBadge
                label={saas.subscriptionStatus}
                variant={saas.subscriptionStatus === "ACTIVE" ? "success" : "warning"}
              />
            </div>
          ) : null}

          {isAuthenticated ? (
            <div className="app-header-user">
              {user ? (
                <div className="app-header-user-text header-hide-sm">
                  <p className="app-header-user-email">{user.email}</p>
                  <p className="app-header-user-role">{formatRoleLabel(user.role)}</p>
                </div>
              ) : null}
              <button
                type="button"
                className="btn btn-secondary btn-sm header-logout"
                onClick={() => void logout()}
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut size={16} aria-hidden />
                <span className="header-logout-label">Sign out</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
};

export { Header as default };
