import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { motion, useReducedMotion } from "framer-motion";
import { useAuth } from "../modules/auth/auth.context";
import { useTenant } from "../modules/tenant/tenant.context";
import { fetchLoginTenantsWithRetry } from "../modules/tenant/loginTenants";
import { env } from "../utils/env";
import { PublicTenantBranding, resolveSubdomain } from "../modules/tenant/tenant.types";
import { ThemeModeSelect } from "../components/ThemeToggle";
import { ButtonSpinner } from "../components/ButtonSpinner";
import { resolveHomePath } from "../modules/auth/homePath";

type TenantOption = {
  id: string;
  label: string;
};

const brandEase = [0.22, 1, 0.36, 1] as const;

export const LoginPage = (): JSX.Element => {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const { login } = useAuth();
  const { setTenantId, branding } = useTenant();
  const [tenantId, setTenantIdInput] = useState<string>("");
  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState<boolean>(true);
  const [tenantsError, setTenantsError] = useState<string | null>(null);
  const [labTitle, setLabTitle] = useState<string>("DiagLab");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const sub = resolveSubdomain();
    if (!sub) return;

    void axios
      .get<PublicTenantBranding>(`${env.apiUrl}/saas-admin/branding/${sub}`)
      .then(({ data }) => {
        setLabTitle(data.brandingName || data.name);
        setLogoUrl(data.branding.logoUrl);
        if (data.tenantId) {
          setTenantIdInput(data.tenantId);
          setTenantId(data.tenantId);
        }
      })
      .catch(() => undefined);
  }, [setTenantId]);

  useEffect(() => {
    let cancelled = false;

    const loadTenantOptions = async (): Promise<void> => {
      setTenantsLoading(true);
      setTenantsError(null);
      try {
        const options = await fetchLoginTenantsWithRetry();
        if (cancelled) return;
        setTenantOptions(options);
        const firstTenant = options.at(0);
        if (!tenantId && firstTenant) {
          setTenantIdInput(firstTenant.id);
        }
      } catch (err) {
        if (cancelled) return;
        setTenantOptions([]);
        if (axios.isAxiosError(err) && !err.response) {
          setTenantsError(
            "Cannot reach the API server. Wait until the backend shows “API server listening” in the terminal, then click Retry."
          );
        } else {
          setTenantsError("Could not load organizations. Check your connection and try again.");
        }
      } finally {
        if (!cancelled) setTenantsLoading(false);
      }
    };

    void loadTenantOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  const retryLoadTenants = (): void => {
    setTenantsLoading(true);
    setTenantsError(null);
    void fetchLoginTenantsWithRetry(3, 1000)
      .then((options) => {
        setTenantOptions(options);
        const firstTenant = options.at(0);
        if (!tenantId && firstTenant) {
          setTenantIdInput(firstTenant.id);
        }
      })
      .catch((err) => {
        setTenantOptions([]);
        if (axios.isAxiosError(err) && !err.response) {
          setTenantsError("API server is still not reachable. Confirm the backend is running, then retry.");
        } else {
          setTenantsError("Could not load organizations. Please try again.");
        }
      })
      .finally(() => setTenantsLoading(false));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (submitting || tenantsLoading) return;
    if (!tenantId) {
      setError("Select an organization before signing in.");
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      const { tokenService } = await import("../modules/auth/token.service");
      tokenService.clear();
      setTenantId(tenantId);
      const session = await login({ email, password });
      navigate(resolveHomePath(session), { replace: true });
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const apiMsg = (err.response?.data as { message?: string } | undefined)?.message;
        const apiCode = (err.response?.data as { code?: string } | undefined)?.code;
        if (err.response?.status === 401 || apiCode === "INVALID_CREDENTIALS") {
          setError(
            apiMsg && apiMsg !== "Refresh token required"
              ? apiMsg
              : "Invalid email or password for this organization. Check that the account belongs to the selected lab."
          );
        } else if (err.code === "ECONNABORTED") {
          setError("Sign-in timed out. The API may be slow or unreachable — try again.");
        } else if (!err.response) {
          setError("Cannot reach the API server. Is the backend running?");
        } else {
          setError(apiMsg ?? "Sign-in failed. Please try again.");
        }
      } else {
        setError("Sign-in failed. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const displayLogo = logoUrl ?? branding.logoUrl;
  const formLocked = tenantsLoading || submitting;
  const canSubmit = !formLocked && Boolean(tenantId) && tenantOptions.length > 0;
  const brandName = labTitle || "DiagLab";

  const fadeUp = (delay: number) =>
    reduceMotion
      ? { initial: false as const, animate: { opacity: 1 } }
      : {
          initial: { opacity: 0, y: 18 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.55, delay, ease: brandEase }
        };

  return (
    <div className="login-shell">
      <div className="login-shell__theme">
        <ThemeModeSelect />
      </div>

      <section className="login-brand" aria-label="Product">
        <div className="login-brand__atmosphere" aria-hidden>
          <div className="login-brand__grid" />
          <div className="login-brand__orb login-brand__orb--a" />
          <div className="login-brand__orb login-brand__orb--b" />
          <div className="login-brand__scan" />
        </div>

        <motion.div
          className="login-brand__content"
          initial={reduceMotion ? false : { opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: brandEase }}
        >
          <div className="login-brand__mark">
            {displayLogo ? (
              <img src={displayLogo} alt="" className="login-logo" />
            ) : (
              <span className="login-logo-placeholder" aria-hidden>
                {brandName.charAt(0)}
              </span>
            )}
            {branding.nablRegNo ? <span className="login-nabl-badge">NABL {branding.nablRegNo}</span> : null}
          </div>

          <p className="login-brand__kicker">Laboratory information system</p>
          <h1 className="login-brand__title">{brandName}</h1>
          <p className="login-brand__lede">
            Book orders, track samples, verify results, and settle billing — one workspace for your entire lab floor.
          </p>
          {branding.labHeaderAddress ? <p className="login-address">{branding.labHeaderAddress}</p> : null}
        </motion.div>
      </section>

      <section className="login-panel">
        <motion.form
          className="login-card"
          onSubmit={(e: FormEvent<HTMLFormElement>) => void handleSubmit(e)}
          aria-busy={submitting}
          initial={reduceMotion ? false : { opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.12, ease: brandEase }}
        >
          <motion.div className="login-card__header" {...fadeUp(0.18)}>
            <h2 className="login-card__title">Sign in</h2>
            <p className="login-card__hint">
              Use your lab organization, email, and password.{" "}
              <Link to="/signup">Start a free trial</Link>
            </p>
          </motion.div>

          {error ? (
            <motion.p className="login-error-banner" role="alert" {...fadeUp(0)}>
              {error}
            </motion.p>
          ) : null}
          {tenantsError ? (
            <motion.div className="login-error-banner login-error-banner--with-action" role="alert" {...fadeUp(0)}>
              <span>{tenantsError}</span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={retryLoadTenants}
                disabled={tenantsLoading}
              >
                <ButtonSpinner label="Retry" loadingLabel="Retrying…" loading={tenantsLoading} size={14} />
              </button>
            </motion.div>
          ) : null}

          <motion.div className="login-field-group" {...fadeUp(0.26)}>
            <label htmlFor="tenantId">Organization</label>
            <select
              id="tenantId"
              className="login-field"
              value={tenantId}
              onChange={(event) => setTenantIdInput(event.target.value)}
              required
              disabled={formLocked}
            >
              {tenantsLoading ? (
                <option value="">Loading organizations…</option>
              ) : tenantOptions.length === 0 ? (
                <option value="">No organizations available</option>
              ) : (
                tenantOptions.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.label}
                  </option>
                ))
              )}
            </select>
          </motion.div>

          <motion.div className="login-field-group" {...fadeUp(0.34)}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className="login-field"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@yourlab.com"
              required
              autoComplete="email"
              disabled={formLocked}
            />
          </motion.div>

          <motion.div className="login-field-group" {...fadeUp(0.42)}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              className="login-field"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
              disabled={formLocked}
            />
          </motion.div>

          <motion.div {...fadeUp(0.5)}>
            <button type="submit" className="login-submit" disabled={!canSubmit} aria-busy={submitting}>
              <ButtonSpinner label="Sign in" loadingLabel="Signing in…" loading={submitting} />
            </button>
          </motion.div>
        </motion.form>
      </section>
    </div>
  );
};
