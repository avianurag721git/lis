import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, ScanLine, Search, User, UserPlus, X } from "lucide-react";
import { patientsApi, Patient } from "../../modules/patients/patients.service";
import {
  CatalogPackage,
  CatalogTest,
  CollectionType,
  OrderBookingDto,
  ordersApi,
  SampleDto
} from "./orders.service";
import { BarcodeStickerModal } from "../samples/BarcodeStickerModal";
import { OrderPipelineTracker } from "../../components/OrderPipelineTracker";
import { ButtonSpinner } from "../../components/ButtonSpinner";
import { DiscountInput } from "../../components/DiscountInput";
import { Modal } from "../../components/Modal";
import { NumberField } from "../../components/NumberField";
import { PatientAgeFields } from "../../components/PatientAgeFields";
import { ReferralDoctorSelect } from "./ReferralDoctorSelect";
import { type ReferralDoctor, SELF_DOCTOR_CODE } from "./referralDoctors.service";
import { computeDiscountMinor, computeReferralCommissionMinor } from "../../utils/discount";
import type { DiscountType } from "../../utils/discount";
import { formatPatientAge, type AgeUnit } from "../../utils/patientAge";
import { b2bApi, B2BFranchisee } from "../b2b/b2b.service";
import { PrescriptionOcrCapture } from "./PrescriptionOcrCapture";
import { PrescriptionOcrMatch } from "./ocr.service";
import { useTenant } from "../../modules/tenant/tenant.context";
import { defaultFinance } from "../../modules/tenant/tenant.types";

const money = (minor: number): string =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "INR" }).format(minor / 100);

const tubeCss: Record<string, string> = {
  PURPLE: "#6b21a8",
  LAVENDER: "#7c3aed",
  RED: "#b91c1c",
  GOLD: "#ca8a04",
  YELLOW: "#ca8a04",
  GREEN: "#15803d",
  BLUE: "#1d4ed8",
  GREY: "#4b5563",
  GRAY: "#4b5563"
};
type CartLine =
  | { key: string; itemType: "TEST"; testId: string; name: string; priceMinor: number }
  | { key: string; itemType: "PACKAGE"; packageId: string; name: string; priceMinor: number };

export const OrderBookingForm = (): JSX.Element => {
  const { config } = useTenant();
  const tenantDefaultGst = config?.finance?.defaultGstPercent ?? defaultFinance().defaultGstPercent;

  const [q, setQ] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState("");
  const [newName, setNewName] = useState("");
  const [newMobile, setNewMobile] = useState("");
  const [newGender, setNewGender] = useState<"MALE" | "FEMALE" | "OTHER" | "">("");
  const [newDob, setNewDob] = useState("");
  const [newAge, setNewAge] = useState("");
  const [newAgeUnit, setNewAgeUnit] = useState<AgeUnit>("YEARS");

  const [tests, setTests] = useState<CatalogTest[]>([]);
  const [packages, setPackages] = useState<CatalogPackage[]>([]);
  const [catalogQ, setCatalogQ] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);

  const [collectionType, setCollectionType] = useState<CollectionType>("WALK_IN");
  const [franchiseeId, setFranchiseeId] = useState("");
  const [franchisees, setFranchisees] = useState<B2BFranchisee[]>([]);
  const [referralDoctor, setReferralDoctor] = useState<ReferralDoctor | null>(null);
  const [ocrDoctorName, setOcrDoctorName] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType>("amount");
  const [discountValue, setDiscountValue] = useState(0);
  const [taxRate, setTaxRate] = useState(tenantDefaultGst);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const [lastOrder, setLastOrder] = useState<OrderBookingDto | null>(null);
  const [lastSamples, setLastSamples] = useState<SampleDto[]>([]);
  const [lastPatient, setLastPatient] = useState<Patient | null>(null);
  const [showStickers, setShowStickers] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [patientSearchLoading, setPatientSearchLoading] = useState(false);
  const [selectedPatientSnapshot, setSelectedPatientSnapshot] = useState<Patient | null>(null);
  const patientResultsRef = useRef<HTMLDivElement>(null);
  const lastFocusedQueryRef = useRef("");
  const newNameInputRef = useRef<HTMLInputElement>(null);
  const [patientMatchesDismissed, setPatientMatchesDismissed] = useState(false);

  useEffect(() => {
    setTaxRate(tenantDefaultGst);
  }, [tenantDefaultGst]);

  useEffect(() => {
    void (async () => {
      try {
        const catalog = await ordersApi.catalog();
        setTests(catalog.tests);
        setPackages(catalog.packages);
      } catch {
        setTests([]);
        setPackages([]);
      }
    })();
    void b2bApi
      .list()
      .then(setFranchisees)
      .catch(() => setFranchisees([]));
  }, []);

  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setPatients([]);
      setPatientSearchLoading(false);
      return;
    }

    setPatientSearchLoading(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const rows = await patientsApi.list(trimmed);
          setPatients(rows);
        } catch {
          setPatients([]);
        } finally {
          setPatientSearchLoading(false);
        }
      })();
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [q]);

  const trimmedPatientQuery = q.trim();
  const showPatientMatches =
    trimmedPatientQuery.length >= 2 &&
    !patientSearchLoading &&
    patients.length > 0 &&
    !patientId &&
    !patientMatchesDismissed;

  const selectedPatient = selectedPatientSnapshot ?? patients.find((p) => p.id === patientId) ?? null;

  useEffect(() => {
    setPatientMatchesDismissed(false);
  }, [trimmedPatientQuery]);

  useEffect(() => {
    if (trimmedPatientQuery.length < 2) {
      lastFocusedQueryRef.current = "";
    }
  }, [trimmedPatientQuery]);

  useEffect(() => {
    if (patientMatchesDismissed && !patientId) {
      newNameInputRef.current?.focus();
    }
  }, [patientMatchesDismissed, patientId]);

  useEffect(() => {
    if (!showPatientMatches) return;
    if (lastFocusedQueryRef.current === trimmedPatientQuery) return;
    lastFocusedQueryRef.current = trimmedPatientQuery;

    const panel = patientResultsRef.current;
    if (!panel) return;

    panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const first = panel.querySelector<HTMLButtonElement>(".patient-match-item");
    first?.focus();
  }, [showPatientMatches, trimmedPatientQuery, patients]);

  const selectExistingPatient = (id: string): void => {
    const match = patients.find((p) => p.id === id);
    if (match) setSelectedPatientSnapshot(match);
    setPatientId(id);
    setPatientMatchesDismissed(true);
    lastFocusedQueryRef.current = "";
  };

  const clearSelectedPatient = (): void => {
    setPatientId("");
    setSelectedPatientSnapshot(null);
    setPatientMatchesDismissed(false);
    lastFocusedQueryRef.current = "";
  };

  const chooseRegisterNewPatient = (): void => {
    setPatientId("");
    setSelectedPatientSnapshot(null);
    setPatientMatchesDismissed(true);
    lastFocusedQueryRef.current = "";

    const trimmed = trimmedPatientQuery;
    if (/^\d{6,}$/.test(trimmed) && !newMobile) {
      setNewMobile(trimmed);
    } else if (trimmed && !/^\d+$/.test(trimmed) && !newName) {
      setNewName(trimmed);
    }
  };

  const filteredTests = useMemo(() => {
    const needle = catalogQ.trim().toLowerCase();
    if (!needle) return tests;
    return tests.filter((t) => t.name.toLowerCase().includes(needle) || (t.code ?? "").toLowerCase().includes(needle));
  }, [tests, catalogQ]);

  const filteredPackages = useMemo(() => {
    const needle = catalogQ.trim().toLowerCase();
    if (!needle) return packages;
    return packages.filter((p) => p.name.toLowerCase().includes(needle) || (p.code ?? "").toLowerCase().includes(needle));
  }, [packages, catalogQ]);

  const subtotal = cart.reduce((s, c) => s + c.priceMinor, 0);
  const discountMinor = computeDiscountMinor(subtotal, discountType, discountValue);
  const taxable = Math.max(0, subtotal - discountMinor);
  const tax = Math.round((taxable * taxRate) / 100);
  const net = taxable + tax;
  const referralCommissionMinor = computeReferralCommissionMinor(
    taxable,
    referralDoctor && referralDoctor.doctorCode !== SELF_DOCTOR_CODE ? referralDoctor.commissionPercentage : 0
  );

  const addTest = (t: CatalogTest): void => {
    setCart((prev) => {
      if (prev.some((x) => x.itemType === "TEST" && x.testId === t.id)) return prev;
      return [...prev, { key: `T-${t.id}`, itemType: "TEST", testId: t.id, name: t.name, priceMinor: t.priceMinor }];
    });
  };

  const addPackage = (p: CatalogPackage): void => {
    setCart((prev) => {
      if (prev.some((x) => x.itemType === "PACKAGE" && x.packageId === p.id)) return prev;
      return [...prev, { key: `P-${p.id}`, itemType: "PACKAGE", packageId: p.id, name: p.name, priceMinor: p.priceMinor }];
    });
  };

  const removeCartKey = (key: string): void => {
    setCart((prev) => prev.filter((x) => x.key !== key));
  };

  const toggleTest = (t: CatalogTest): void => {
    const existing = cart.find((x) => x.itemType === "TEST" && x.testId === t.id);
    if (existing) {
      removeCartKey(existing.key);
      return;
    }
    addTest(t);
  };

  const togglePackage = (p: CatalogPackage): void => {
    const existing = cart.find((x) => x.itemType === "PACKAGE" && x.packageId === p.id);
    if (existing) {
      removeCartKey(existing.key);
      return;
    }
    addPackage(p);
  };

  const applyOcr = (result: PrescriptionOcrMatch): void => {
    if (result.extracted.patientName) setNewName(result.extracted.patientName);
    if (result.extracted.age != null) setNewAge(String(result.extracted.age));
    if (result.extracted.gender) setNewGender(result.extracted.gender);
    if (result.extracted.doctorName) setOcrDoctorName(result.extracted.doctorName);
    setPatientId("");
    for (const match of result.matchedTests) {
      const test = tests.find((t) => t.id === match.testId);
      if (test) addTest(test);
    }
    setStatus(
      `OCR: matched ${result.matchedTests.length} test(s)` +
        (result.unmatchedTests.length ? ` · unmatched: ${result.unmatchedTests.join(", ")}` : "")
    );
    setScanOpen(false);
  };

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const bookPayload: Parameters<typeof ordersApi.book>[0] = {
        collectionType,
        franchiseeId: collectionType === "B2B_FRANCHISEE" ? franchiseeId || null : null,
        referredDoctor: referralDoctor?.name ?? null,
        referralDoctorId: referralDoctor?.id ?? null,
        discountMinor,
        taxRatePercent: taxRate,
        items: cart.map((c) =>
          c.itemType === "TEST"
            ? { itemType: "TEST" as const, testId: c.testId, quantity: 1 }
            : { itemType: "PACKAGE" as const, packageId: c.packageId, quantity: 1 }
        )
      };
      if (patientId) {
        bookPayload.patientId = patientId;
      } else {
        bookPayload.patient = {
          name: newName,
          mobile: newMobile,
          gender: newGender || null,
          dateOfBirth: newDob.trim() || null,
          ageValue: newAge.trim() ? Number(newAge) : null,
          ageUnit: newAge.trim() || newDob.trim() ? newAgeUnit : null,
          ageYears: !newDob.trim() && newAgeUnit === "YEARS" && newAge.trim() ? Number(newAge) : null
        };
      }
      const result = await ordersApi.book(bookPayload);
      setLastOrder(result.order);
      setLastSamples(result.samples);
      setLastPatient(result.patient);
      setShowStickers(true);
      setStatus(`Order ${result.order.orderNumber} booked · ${result.samples.length} tube sticker(s) ready`);
      // Clear booking form for the next patient; keep last order/stickers for reprint.
      setCart([]);
      setQ("");
      setPatients([]);
      setPatientId("");
      setSelectedPatientSnapshot(null);
      setPatientMatchesDismissed(false);
      setNewName("");
      setNewMobile("");
      setNewGender("");
      setNewDob("");
      setNewAge("");
      setNewAgeUnit("YEARS");
      setCollectionType("WALK_IN");
      setFranchiseeId("");
      setReferralDoctor(null);
      setOcrDoctorName("");
      setDiscountType("amount");
      setDiscountValue(0);
      setTaxRate(tenantDefaultGst);
      setCatalogQ("");
    } catch {
      setError("Booking failed. Check patient + at least one test/package.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page-shell page-shell--fluid">
      <div className="page-head">
        <div className="page-head__row">
          <h1 className="page-title">Order booking</h1>
          <button
            type="button"
            className="btn btn-secondary btn-sm order-booking-scan-btn"
            onClick={() => setScanOpen(true)}
          >
            <ScanLine size={16} aria-hidden />
            Scan prescription
          </button>
        </div>
        <p className="page-subtitle">Register or find a patient, add tests or packages, then book and print tube barcodes.</p>
      </div>

      {error ? <p className="status-error">{error}</p> : null}
      {status ? <p className="status-muted status-banner">{status}</p> : null}

      {lastOrder ? <OrderPipelineTracker orderId={lastOrder.id} className="mb-4" /> : null}

      <Modal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        title="Scan prescription"
        size="lg"
      >
        <PrescriptionOcrCapture tests={tests} onApply={applyOcr} />
      </Modal>

      <form className="order-booking-form" onSubmit={(e) => void submit(e)}>
        <div className="order-booking-layout">
          <div className="order-booking-stack">
            <div className="card">
              <h2 className="card-title">1. Patient</h2>
              <label className="form-label order-booking-field">
                Find existing patient
                <div className="patient-search-row patient-search-row--live">
                  <Search size={16} className="patient-search-icon" aria-hidden />
                  <input
                    className="form-control"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Type mobile, UHID, or name…"
                    aria-label="Search patients"
                    autoComplete="off"
                  />
                  {patientSearchLoading ? (
                    <span className="patient-search-status" aria-live="polite">
                      Searching…
                    </span>
                  ) : null}
                </div>
                <span className="order-booking-hint text-muted">
                  {q.trim().length < 2
                    ? "Start typing — matches appear automatically (min 2 characters)."
                    : patientMatchesDismissed && !patientId
                      ? "Register new patient using the form below."
                      : patients.length > 0
                        ? `${patients.length} match${patients.length === 1 ? "" : "es"} — select a match or register new.`
                        : patientSearchLoading
                          ? "Looking up patients…"
                          : "No matches — register as new patient below."}
                </span>
              </label>

              {selectedPatient ? (
                <div className="patient-selected-card">
                  <div className="patient-selected-card__main">
                    <Check size={16} className="patient-selected-card__icon" aria-hidden />
                    <div>
                      <strong>{selectedPatient.name}</strong>
                      <span className="text-muted">
                        {(selectedPatient.uhid ?? selectedPatient.patientCode) ?? "—"}
                        {selectedPatient.phone ? ` · ${selectedPatient.phone}` : ""}
                        {formatPatientAge(selectedPatient) ? ` · ${formatPatientAge(selectedPatient)}` : ""}
                      </span>
                    </div>
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={clearSelectedPatient}>
                    <X size={14} aria-hidden />
                    Change
                  </button>
                </div>
              ) : null}

              {showPatientMatches ? (
                <div
                  ref={patientResultsRef}
                  className="patient-match-dropdown"
                  role="listbox"
                  aria-label="Matching patients"
                >
                  <div className="patient-match-dropdown__head">
                    <strong>
                      {patients.length} patient match{patients.length === 1 ? "" : "es"}
                    </strong>
                    <span className="patient-match-dropdown__hint">Click to select</span>
                  </div>

                  <ul className="patient-match-list">
                    {patients.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          role="option"
                          className="patient-match-item"
                          onClick={() => selectExistingPatient(p.id)}
                        >
                          <span className="patient-match-item__avatar" aria-hidden>
                            <User size={16} />
                          </span>
                          <span className="patient-match-item__body">
                            <span className="patient-match-item__name">{p.name}</span>
                            <span className="patient-match-item__meta">
                              UHID {(p.uhid ?? p.patientCode) ?? "—"}
                              {p.phone ? ` · ${p.phone}` : ""}
                              {formatPatientAge(p) ? ` · ${formatPatientAge(p)}` : ""}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>

                  <div className="patient-match-footer">
                    <button type="button" className="patient-match-new-btn" onClick={chooseRegisterNewPatient}>
                      <UserPlus size={16} aria-hidden />
                      Register as new patient below
                    </button>
                  </div>
                </div>
              ) : null}

              {patientMatchesDismissed && !patientId && trimmedPatientQuery.length >= 2 ? (
                <p className="patient-register-banner">
                  Registering as a <strong>new patient</strong> — complete the details below.{" "}
                  <button type="button" className="patient-register-banner__link" onClick={() => setPatientMatchesDismissed(false)}>
                    Show matches again
                  </button>
                </p>
              ) : null}

              {!patientId ? (
                <div className="patient-fields-grid">
                  <label className="form-label">
                    Full name
                    <input
                      ref={newNameInputRef}
                      className="form-control"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      required={!patientId}
                      placeholder="Patient name"
                    />
                  </label>
                  <label className="form-label">
                    Mobile
                    <input
                      className="form-control"
                      value={newMobile}
                      onChange={(e) => setNewMobile(e.target.value)}
                      required={!patientId}
                      placeholder="10-digit mobile"
                    />
                  </label>
                  <label className="form-label">
                    Gender
                    <select
                      className="form-control"
                      value={newGender}
                      onChange={(e) => setNewGender(e.target.value as typeof newGender)}
                    >
                      <option value="">Select</option>
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </label>
                  <PatientAgeFields
                    dateOfBirth={newDob}
                    ageValue={newAge}
                    ageUnit={newAgeUnit}
                    onDateOfBirthChange={setNewDob}
                    onAgeValueChange={setNewAge}
                    onAgeUnitChange={setNewAgeUnit}
                  />
                </div>
              ) : (
                <p className="text-muted order-booking-hint">Using saved patient record — clear selection above to register someone new.</p>
              )}
            </div>

            <div className="card">
              <h2 className="card-title">3. Collection &amp; pricing</h2>
              <div className="form-grid order-booking-pricing-grid">
                <label className="form-label">
                  Collection type
                  <select
                    className="form-control"
                    value={collectionType}
                    onChange={(e) => setCollectionType(e.target.value as CollectionType)}
                  >
                    <option value="WALK_IN">Walk-in</option>
                    <option value="HOME_COLLECTION">Home collection</option>
                    <option value="B2B_FRANCHISEE">B2B franchisee</option>
                  </select>
                </label>
                {collectionType === "B2B_FRANCHISEE" ? (
                  <label className="form-label">
                    Franchisee
                    <select
                      className="form-control"
                      value={franchiseeId}
                      onChange={(e) => setFranchiseeId(e.target.value)}
                      required
                    >
                      <option value="">— Select franchisee —</option>
                      {franchisees.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.code} · {f.name} ({money(f.walletBalanceMinor)})
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <ReferralDoctorSelect
                  value={referralDoctor}
                  onChange={setReferralDoctor}
                  prefillName={ocrDoctorName}
                />
              </div>

              <div className="order-pricing-fields">
                <DiscountInput
                  subtotalMinor={subtotal}
                  type={discountType}
                  value={discountValue}
                  onTypeChange={setDiscountType}
                  onValueChange={setDiscountValue}
                />
                <label className="form-label order-pricing-tax">
                  Tax rate
                  <div className="order-pricing-tax__wrap">
                    <NumberField
                      className="form-control"
                      min={0}
                      max={40}
                      value={taxRate}
                      onValueChange={setTaxRate}
                      aria-label="Tax rate percent"
                    />
                    <span className="order-pricing-tax__suffix">%</span>
                  </div>
                </label>
              </div>

              <div className="order-booking-actions">
                <button type="submit" className="btn btn-primary" disabled={busy || cart.length === 0}>
                  <ButtonSpinner
                    label="Book order & generate barcodes"
                    loadingLabel="Booking…"
                    loading={busy}
                  />
                </button>
                {lastOrder ? (
                  <button type="button" className="btn btn-secondary" onClick={() => setShowStickers(true)}>
                    Re-open stickers
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <aside className="card order-cart-card">
            <h2 className="card-title">Cart</h2>
            <p className="text-muted order-cart-meta">
              {cart.length} item{cart.length === 1 ? "" : "s"}
            </p>
            {cart.length === 0 ? (
              <p className="order-cart-empty">Add tests or packages from the catalog below.</p>
            ) : (
              <ul className="order-cart-list">
                {cart.map((c) => (
                  <li key={c.key} className="order-cart-item">
                    <div className="order-cart-item__main">
                      <strong>{c.name}</strong>
                      <span className="order-cart-item__type">{c.itemType}</span>
                    </div>
                    <span className="order-cart-item__price">{money(c.priceMinor)}</span>
                    <button
                      type="button"
                      className="order-cart-remove"
                      onClick={() => removeCartKey(c.key)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="order-cart-totals">
              <div className="order-cart-totals__row">
                <span>Subtotal</span>
                <span>{money(subtotal)}</span>
              </div>
              {discountMinor > 0 ? (
                <div className="order-cart-totals__row order-cart-totals__row--discount">
                  <span>Discount</span>
                  <span>−{money(discountMinor)}</span>
                </div>
              ) : null}
              <div className="order-cart-totals__row">
                <span>Tax ({taxRate}%)</span>
                <span>{money(tax)}</span>
              </div>
              {referralCommissionMinor > 0 ? (
                <div className="order-cart-totals__row order-cart-totals__row--muted">
                  <span>Referral commission ({referralDoctor?.commissionPercentage}%)</span>
                  <span>{money(referralCommissionMinor)}</span>
                </div>
              ) : null}
              <div className="order-cart-totals__net">
                <span>Net payable</span>
                <strong>{money(net)}</strong>
              </div>
            </div>
          </aside>
        </div>

        <div className="card order-catalog-card">
          <div className="order-catalog-head">
            <h2 className="card-title">2. Tests &amp; packages</h2>
            <input
              className="form-control order-catalog-filter"
              value={catalogQ}
              onChange={(e) => setCatalogQ(e.target.value)}
              placeholder="Filter catalog by name or code…"
              aria-label="Filter catalog"
            />
          </div>

          <div className="order-catalog-split">
            <div className="order-catalog-column">
              <div className="order-catalog-column-head">Tests ({filteredTests.length})</div>
              <ul className="order-catalog-list">
                {filteredTests.length === 0 ? (
                  <li className="order-catalog-empty">No tests match your filter.</li>
                ) : (
                  filteredTests.map((t) => {
                    const inCart = cart.some((x) => x.itemType === "TEST" && x.testId === t.id);
                    const accent = tubeCss[t.tubeColor.toUpperCase()] ?? "#64748b";
                    return (
                      <li key={t.id} className="order-catalog-item">
                        <div className="order-catalog-item__info">
                          <span className="order-catalog-item__name">{t.name}</span>
                          <span className="order-catalog-item__meta" style={{ color: accent }}>
                            {t.tubeColor} · {t.sampleType}
                          </span>
                        </div>
                        <span className="order-catalog-item__price">{money(t.priceMinor)}</span>
                        <button
                          type="button"
                          className={inCart ? "btn btn-sm btn-secondary order-catalog-add is-in-cart" : "btn btn-sm btn-secondary order-catalog-add"}
                          onClick={() => toggleTest(t)}
                        >
                          {inCart ? "Remove" : (
                            <>
                              <Plus size={14} aria-hidden />
                              Add
                            </>
                          )}
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>

            <div className="order-catalog-column">
              <div className="order-catalog-column-head">Packages ({filteredPackages.length})</div>
              <ul className="order-catalog-list">
                {filteredPackages.length === 0 ? (
                  <li className="order-catalog-empty">No packages in catalog yet.</li>
                ) : (
                  filteredPackages.map((p) => {
                    const inCart = cart.some((x) => x.itemType === "PACKAGE" && x.packageId === p.id);
                    return (
                      <li key={p.id} className="order-catalog-item">
                        <div className="order-catalog-item__info">
                          <span className="order-catalog-item__name">{p.name}</span>
                          {p.code ? <span className="order-catalog-item__meta text-muted">{p.code}</span> : null}
                        </div>
                        <span className="order-catalog-item__price">{money(p.priceMinor)}</span>
                        <button
                          type="button"
                          className={inCart ? "btn btn-sm btn-secondary order-catalog-add is-in-cart" : "btn btn-sm btn-secondary order-catalog-add"}
                          onClick={() => togglePackage(p)}
                        >
                          {inCart ? "Remove" : (
                            <>
                              <Plus size={14} aria-hidden />
                              Add
                            </>
                          )}
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          </div>
        </div>
      </form>

      <BarcodeStickerModal
        open={showStickers}
        onClose={() => setShowStickers(false)}
        patient={lastPatient}
        samples={lastSamples}
        orderNumber={lastOrder?.orderNumber}
      />
    </section>
  );
};
