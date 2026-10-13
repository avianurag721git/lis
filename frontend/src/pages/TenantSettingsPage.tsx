import { FormEvent, useEffect, useState } from "react";
import { useTenant } from "../modules/tenant/tenant.context";
import { tenantConfigApi } from "../modules/tenant/tenantConfig.api";
import { defaultBranding, defaultFinance } from "../modules/tenant/tenant.types";
import { formatLabelKey } from "../utils/formatLabel";

export const TenantSettingsPage = (): JSX.Element => {
  const { tenantId, config, saas, branding, refreshConfig } = useTenant();
  const finance = config?.finance ?? defaultFinance();
  const brand = branding ?? defaultBranding();

  const [brandingName, setBrandingName] = useState(config?.brandingName ?? "");
  const [labAddress, setLabAddress] = useState(brand.labHeaderAddress);
  const [nablRegNo, setNablRegNo] = useState(brand.nablRegNo);
  const [primaryColor, setPrimaryColor] = useState(brand.primaryColor);
  const [secondaryColor, setSecondaryColor] = useState(brand.secondaryColor);
  const [logoUrl, setLogoUrl] = useState(brand.logoUrl ?? "");
  const [reportTemplate, setReportTemplate] = useState<"STANDARD" | "DETAILED">(
    config?.reportTemplate ?? "STANDARD"
  );

  const [defaultGstPercent, setDefaultGstPercent] = useState(finance.defaultGstPercent);
  const [labGstin, setLabGstin] = useState(finance.labGstin);
  const [currencyCode, setCurrencyCode] = useState(finance.currencyCode);
  const [invoicePrefix, setInvoicePrefix] = useState(finance.invoicePrefix);
  const [placeOfSupply, setPlaceOfSupply] = useState(finance.placeOfSupply);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!config) return;
    setBrandingName(config.brandingName ?? "");
    setReportTemplate(config.reportTemplate ?? "STANDARD");
    const b = config.branding ?? defaultBranding();
    setLabAddress(b.labHeaderAddress);
    setNablRegNo(b.nablRegNo);
    setPrimaryColor(b.primaryColor);
    setSecondaryColor(b.secondaryColor);
    setLogoUrl(b.logoUrl ?? "");
    const f = config.finance ?? defaultFinance();
    setDefaultGstPercent(f.defaultGstPercent);
    setLabGstin(f.labGstin);
    setCurrencyCode(f.currencyCode);
    setInvoicePrefix(f.invoicePrefix);
    setPlaceOfSupply(f.placeOfSupply);
  }, [config]);

  const onSave = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await tenantConfigApi.update({
        brandingName: brandingName.trim() || "Lab",
        logoUrl: logoUrl.trim() || null,
        reportTemplate,
        branding: {
          logoUrl: logoUrl.trim() || null,
          primaryColor,
          secondaryColor,
          labHeaderAddress: labAddress,
          nablRegNo
        },
        finance: {
          defaultGstPercent: Number(defaultGstPercent) || 0,
          labGstin: labGstin.trim(),
          currencyCode: currencyCode.trim().toUpperCase() || "INR",
          invoicePrefix: invoicePrefix.trim().toUpperCase() || "INV",
          placeOfSupply: placeOfSupply.trim()
        }
      });
      await refreshConfig();
      setMessage("Tenant configuration saved. New bills will use these finance defaults.");
    } catch {
      setError("Could not save configuration. You need Manager / Tenant Admin access.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page-shell">
      <div className="page-head">
        <h1 className="page-title">Tenant configuration</h1>
        <p className="page-subtitle">
          Organization branding, GST / finance defaults, and subscription — ERP-style settings for this lab.
        </p>
      </div>

      <div className="card">
        <h2 className="card-title">Organization</h2>
        <dl className="kv-grid">
          <dt>Organization ID</dt>
          <dd>
            <code className="mono">{tenantId ?? "—"}</code>
          </dd>
          {saas ? (
            <>
              <dt>Plan</dt>
              <dd>
                <span className="badge badge-plan">{saas.plan}</span>
              </dd>
              <dt>Status</dt>
              <dd>
                <span className={`badge badge-sub badge-sub--${saas.subscriptionStatus.toLowerCase()}`}>
                  {saas.subscriptionStatus}
                </span>
              </dd>
            </>
          ) : null}
        </dl>
      </div>

      <form onSubmit={(e) => void onSave(e)}>
        <div className="card">
          <h2 className="card-title">Finance &amp; GST</h2>
          <p className="text-muted" style={{ marginTop: 0 }}>
            Default GST applies to new orders and bills when a rate is not set on the invoice. Existing bills keep
            their stored rate.
          </p>
          <div className="form-grid">
            <label className="form-label">
              Default GST %
              <input
                type="number"
                min={0}
                max={40}
                step={0.01}
                value={defaultGstPercent}
                onChange={(e) => setDefaultGstPercent(Number(e.target.value))}
                required
              />
            </label>
            <label className="form-label">
              Lab GSTIN
              <input value={labGstin} onChange={(e) => setLabGstin(e.target.value)} placeholder="27AABCT1332L000" />
            </label>
            <label className="form-label">
              Currency
              <input value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)} maxLength={3} />
            </label>
            <label className="form-label">
              Invoice prefix
              <input value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value)} maxLength={16} />
            </label>
            <label className="form-label">
              Place of supply
              <input
                value={placeOfSupply}
                onChange={(e) => setPlaceOfSupply(e.target.value)}
                placeholder="State / UT"
              />
            </label>
          </div>
        </div>

        <div className="card">
          <h2 className="card-title">Branding &amp; reports</h2>
          <div className="form-grid">
            <label className="form-label">
              Branding / display name
              <input value={brandingName} onChange={(e) => setBrandingName(e.target.value)} required />
            </label>
            <label className="form-label">
              Logo URL
              <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" />
            </label>
            <label className="form-label">
              Lab header address
              <input value={labAddress} onChange={(e) => setLabAddress(e.target.value)} />
            </label>
            <label className="form-label">
              NABL registration no.
              <input value={nablRegNo} onChange={(e) => setNablRegNo(e.target.value)} />
            </label>
            <label className="form-label">
              Primary color
              <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} />
            </label>
            <label className="form-label">
              Secondary color
              <input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} />
            </label>
            <label className="form-label">
              Report template
              <select
                value={reportTemplate}
                onChange={(e) => setReportTemplate(e.target.value as "STANDARD" | "DETAILED")}
              >
                <option value="STANDARD">Standard</option>
                <option value="DETAILED">Detailed</option>
              </select>
            </label>
          </div>
        </div>

        {error ? <p className="status-error">{error}</p> : null}
        {message ? <p className="text-success">{message}</p> : null}

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save configuration"}
        </button>
      </form>

      {saas ? (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 className="card-title">Entitlements</h2>
          <ul className="feature-flag-list">
            {(Object.entries(saas.features) as [keyof typeof saas.features, boolean][]).map(([key, on]) => (
              <li key={key}>
                <span>{formatLabelKey(key)}</span>
                <span className={on ? "text-success" : "text-muted"}>{on ? "On" : "Off"}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
};
