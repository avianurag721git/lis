import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { tokenService } from "../../modules/auth/token.service";
import { tenantService } from "../../modules/tenant/tenant.service";
import { saasAdminApi } from "./saasAdmin.service";

type Step = 1 | 2 | 3 | 4;

const PLANS = [
  { id: "STARTER" as const, label: "Starter", price: "$99/mo", desc: "1 branch · 10 users" },
  { id: "PRO" as const, label: "Pro", price: "$299/mo", desc: "5 branches · 50 users" },
  { id: "ENTERPRISE" as const, label: "Enterprise", price: "$799/mo", desc: "Unlimited scale" }
];

export const OnboardingWizard = (): JSX.Element => {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [labName, setLabName] = useState("");
  const [labAddress, setLabAddress] = useState("");
  const [nablRegNo, setNablRegNo] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [subAvailable, setSubAvailable] = useState<boolean | null>(null);
  const [plan, setPlan] = useState<(typeof PLANS)[number]["id"]>("STARTER");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [primaryColor, setPrimaryColor] = useState("#0b5cab");
  const [secondaryColor, setSecondaryColor] = useState("#b91c1c");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (subdomain.length < 2) {
      setSubAvailable(null);
      return;
    }
    const timer = setTimeout(() => {
      void saasAdminApi.checkSubdomain(subdomain).then(setSubAvailable).catch(() => setSubAvailable(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [subdomain]);

  const next = (): void => setStep((s) => Math.min(4, s + 1) as Step);
  const back = (): void => setStep((s) => Math.max(1, s - 1) as Step);

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await saasAdminApi.onboard({
        labName,
        subdomain,
        plan,
        adminName,
        adminEmail,
        adminPassword,
        labAddress,
        nablRegNo,
        primaryColor,
        secondaryColor
      });
      tenantService.setTenantId(result.tenant.id);
      tokenService.setTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
      setDone(true);
      setTimeout(() => navigate("/"), 1500);
    } catch {
      setError("Sign-up failed. Subdomain may be taken or server unavailable.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="onboard-success">
        <CheckCircle2 size={48} color="var(--primary-color)" />
        <h2>{labName} is live!</h2>
        <p>Redirecting to your pre-configured LIS…</p>
      </div>
    );
  }

  return (
    <div className="onboard-wizard">
      <div className="onboard-steps">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={`onboard-step ${step >= n ? "onboard-step--active" : ""}`}>
            {n}
          </span>
        ))}
      </div>

      <form className="auth-card auth-card--wide onboard-form" onSubmit={handleSubmit}>
        {step === 1 ? (
          <>
            <h2>Your lab details</h2>
            <label>
              Lab name
              <input value={labName} onChange={(e) => setLabName(e.target.value)} required />
            </label>
            <label>
              Lab address (shown on reports)
              <input value={labAddress} onChange={(e) => setLabAddress(e.target.value)} />
            </label>
            <label>
              NABL registration no.
              <input value={nablRegNo} onChange={(e) => setNablRegNo(e.target.value)} />
            </label>
            <div className="onboard-colors">
              <label>
                Primary color
                <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} />
              </label>
              <label>
                Secondary color
                <input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} />
              </label>
            </div>
            <button type="button" className="btn btn-primary login-submit" onClick={next} disabled={!labName.trim()}>
              Next
            </button>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <h2>Choose your subdomain</h2>
            <p className="login-hint">
              Your lab portal: <strong>{subdomain || "yourlab"}.yourplatform.com</strong>
            </p>
            <label>
              Subdomain
              <input
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                pattern="[a-z0-9-]+"
                required
              />
            </label>
            {subAvailable === true ? <p className="status-ok">Available</p> : null}
            {subAvailable === false ? <p className="status-error">Already taken</p> : null}
            <div className="onboard-nav">
              <button type="button" onClick={back}>
                Back
              </button>
              <button type="button" className="btn btn-primary login-submit" onClick={next} disabled={!subdomain || subAvailable === false}>
                Next
              </button>
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <h2>Pick a plan</h2>
            <div className="plan-grid">
              {PLANS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`plan-card ${plan === p.id ? "plan-card--selected" : ""}`}
                  onClick={() => setPlan(p.id)}
                >
                  <strong>{p.label}</strong>
                  <span>{p.price}</span>
                  <small>{p.desc}</small>
                </button>
              ))}
            </div>
            <div className="onboard-nav">
              <button type="button" onClick={back}>
                Back
              </button>
              <button type="button" className="btn btn-primary login-submit" onClick={next}>
                Next
              </button>
            </div>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <h2>Admin account</h2>
            <label>
              Your name
              <input value={adminName} onChange={(e) => setAdminName(e.target.value)} required />
            </label>
            <label>
              Work email
              <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required />
            </label>
            <label htmlFor="signup-admin-password">
              Password
              <div className="password-field">
                <input
                  id="signup-admin-password"
                  type={showPassword ? "text" : "password"}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
                  <span className="password-toggle__text">{showPassword ? "Hide" : "Show"}</span>
                </button>
              </div>
            </label>
            {error ? <p className="status-error">{error}</p> : null}
            <div className="onboard-nav">
              <button type="button" onClick={back}>
                Back
              </button>
              <button type="submit" className="btn btn-primary login-submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="spin" size={18} aria-hidden /> Launching…
                  </>
                ) : (
                  "Launch my LIS"
                )}
              </button>
            </div>
          </>
        ) : null}
      </form>
    </div>
  );
};
