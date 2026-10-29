# Diagnostic Lab LIS — Knowledge Transfer Guide

**Audience:** developers who need to explain or work on this application  
**Purpose:** understand the product, module map, and end-to-end flow so you can give a KT session without reading every file  
**Codebase:** `diagnostic-lab-management-system` (npm workspaces: `backend` + `frontend`)

---

## 1. What this application is

This is a **multi-tenant Laboratory Information System (LIS)** for diagnostic labs.

A lab (tenant) uses it to:

1. Register patients (UHID)
2. Book tests / packages
3. Collect samples and print barcodes
4. Receive samples in the lab
5. Enter / auto-ingest results
6. Get a pathologist to verify
7. Generate a NABL-style PDF report
8. Dispatch the report (WhatsApp / magic link / QR verify)
9. Collect money (cash, UPI, card, TPA, Stripe) or debit a B2B franchisee wallet

It is **SaaS**: one codebase serves many labs. Each request is scoped by `tenant_id`. Super admins manage tenants; lab staff work inside one tenant.

---

## 2. How to explain it in 60 seconds

> Patient walks in (or books home collection / B2B). Reception books an order. The system auto-creates sample tubes with Code128 barcodes. Phlebotomist collects. Lab receiving scans the barcode. Technician (or analyzer via HL7/ASTM) enters results. Pathologist verifies with digital signature. PDF is generated. Patient opens a passcode/magic link and can also verify authenticity via QR. Cashier bills in parallel. Franchisees use a prepaid wallet.

That sentence is the whole product. Everything else is a module around that pipeline.

---

## 3. High-level architecture

```
Browser (React + Vite, port 5173)
        |  HTTP + cookies + Bearer JWT
        |  x-tenant-id header
        |  Socket.IO (live sample / pipeline / dashboard)
        v
Express API (TypeScript, port 5000)     TCP 5055 (HL7/ASTM analyzers)
        |
        +--> PostgreSQL  (source of truth — patients, orders, samples, results, billing)
        +--> Redis       (rate limit, cache, token blacklist)
        +--> MongoDB     (optional document models; not required for core LIS)
        +--> Stripe      (online payments, B2B wallet recharge)
        +--> Twilio      (WhatsApp / SMS report dispatch)
        +--> S3          (optional presigned report download)
```

**Production stack** (`docker-compose.yml`): Nginx (HTTPS) → Node API → PostgreSQL + Redis.

**Local dev:** `npm run dev` at repo root starts backend (`tsx watch`) and frontend (Vite). Vite proxies API to `:5000` when `VITE_API_URL` is empty.

---

## 4. Repository map (where to look)

```
proj/
├── backend/
│   ├── src/
│   │   ├── server.ts          # process start: listen, Mongo, seed, Socket.IO, cron
│   │   ├── app.ts             # Express app: middleware + ALL route mounts
│   │   ├── config/env.ts      # environment
│   │   ├── common/            # auth, tenant, RBAC, errors, logger, redis
│   │   ├── database/          # postgres.ts, mongo.ts, SQL schema apply, Mongoose models
│   │   ├── modules/           # one folder per domain (see §8)
│   │   └── realtime/          # Socket.IO events
│   └── database/              # *.sql schema files (also applied on boot)
├── frontend/
│   └── src/
│       ├── main.tsx           # providers: Query, Auth, Tenant, Router
│       ├── routes/AppRoutes.tsx
│       ├── pages/             # thin route wrappers
│       ├── features/          # actual UI for each workflow
│       ├── modules/           # auth, tenant, catalog, users, audit
│       ├── components/        # sidebar, layout, pipeline tracker
│       └── services/http.ts   # axios + JWT + tenant header + refresh
├── nginx / docker-compose.yml
└── e2e / playwright.config.ts
```

**Backend module convention (almost every domain):**

| File | Job |
|------|-----|
| `*.routes.ts` | URL + middleware (auth, tenant, permission, Zod validate) |
| `*.controller.ts` | HTTP in/out, emit Socket.IO |
| `*.service.ts` | business logic + SQL |
| `*.validation.ts` | Zod schemas |
| `*.types.ts` | TypeScript types |

**Frontend convention:**

| Layer | Job |
|-------|-----|
| `pages/*Page.tsx` | route shell (often one line) |
| `features/<domain>/*` | screens + API service for that workflow |
| `modules/auth`, `modules/tenant` | global login + tenant context |

---

## 5. Request lifecycle (every API call)

Read `backend/src/app.ts` top to bottom. Order matters.

```
1. Helmet / CORS / cookie-parser
2. Stripe + B2B wallet webhooks  (raw body, mounted BEFORE express.json)
3. express.json
4. Pino HTTP logging
5. subdomainTenantMiddleware     host → tenant slug
6. tenantContext                 x-tenant-id | subdomain | JWT tenantId
                                 blocks SUSPENDED/CANCELED tenants
7. saasContextMiddleware         plan / entitlements
8. apiRateLimiter                Redis-backed
9. Route handler
      authenticate  → JWT, not revoked
      attachUserPermissions
      requireTenant
      requirePermission(...)     RBAC
      validate(zod)
      controller → service → PostgreSQL
10. 404
11. errorHandler                 AppError → { message, code }
```

**Frontend counterpart** (`frontend/src/services/http.ts`):

- Adds `Authorization: Bearer <accessToken>`
- Adds `x-tenant-id`
- On 401, posts `/auth/refresh` and retries once

If a KT question is “why is my API 403?”, the answer is almost always: wrong tenant, missing permission, or suspended subscription.

---

## 6. Multi-tenancy (how one app serves many labs)

A **tenant** is one lab organization (example id: `demo`, `apollo`).

Resolved from, in order:

1. Header `x-tenant-id` (what the SPA sends after login)
2. Host / subdomain (`labname.yourdomain.com`) or custom domain
3. JWT claim `tenantId`

Almost every SQL table has `tenant_id`. Queries always filter by it.

**SaaS admin** (`SUPER_ADMIN`) creates tenants, sets branding, subscription status. Staff never see other labs’ data.

Login page loads public tenant list from `GET /tenants`, user picks a lab, then posts `/auth/login` with that tenant.

---

## 7. Auth, roles, and permissions

### 7.1 Login flow

1. User picks tenant + email + password (`LoginPage`)
2. `POST /auth/login` → access JWT (short) + refresh token (cookie / body)
3. `AuthProvider` stores user; `GET /auth/me` on reload
4. Sidebar and routes hide screens the role cannot use

### 7.2 Roles (canonical)

Defined in `backend/src/modules/auth/permissions.ts`. Legacy names (`TENANT_ADMIN`, `STAFF`, `CLERK`, `MANAGER`) are mapped to these.

| Role | Default access | Typical person |
|------|----------------|----------------|
| `SUPER_ADMIN` | all permissions | platform operator |
| `LAB_MANAGER` | all permissions | lab owner / admin |
| `RECEPTIONIST` | patients, orders, billing | front desk |
| `PHLEBOTOMIST` | sample collect | collection staff |
| `LAB_TECH` | receive, result entry, reagents, QC | technician |
| `PATHOLOGIST` | verify, analytics, result entry | doctor |
| `B2B_FRANCHISEE` | wallet + order create | collection centre |
| `PATIENT` | none in staff app | portal via public links |

Lab managers can **override per-user permissions** (`/settings/permissions` → `PATCH /users/:id/permissions`).

### 7.3 Permission → screen map

| Permission | Backend modules | Frontend route |
|------------|-----------------|----------------|
| `PATIENT_MANAGE` | patients | `/patients`, `/orders` |
| `ORDER_CREATE` | orders | `/orders` |
| `SAMPLE_COLLECT` | samples, logistics | `/phlebotomy` |
| `SAMPLE_RECEIVE` | samples | `/lab-receiving` |
| `RESULT_ENTRY` | lab-results | `/lab-results` |
| `PATHOLOGIST_VERIFY` | pathologist, reports | `/pathologist`, `/reports` |
| `BILLING_CREATE` | billing, cashier, payments | `/billing`, `/payments` |
| `DISCOUNT_APPROVE_HIGH` | billing approve | high discount |
| `B2B_WALLET_MANAGE` | b2b | `/b2b` |
| `REAGENT_MANAGE` | inventory | `/inventory-qc?tab=inventory` |
| `QC_MANAGE` | inventory QC, HL7 | `/inventory-qc?tab=qc` |
| `ANALYTICS_VIEW` | analytics | `/`, `/analytics/referrals` |
| `SETTINGS_MANAGE` | catalog, users, audit, tenant | `/settings/*`, `/audit-logs` |

Frontend: `PermissionRoute` in `AppRoutes.tsx`. Backend: `requirePermission(...)` on each router.

---

## 8. The golden path — clinical order pipeline

This is the most important diagram for KT.

```
BOOKED → COLLECTED → IN_LAB → PROCESSING → VERIFIED → DISPATCHED
```

Computed in `backend/src/modules/orders/orderLifecycle.util.ts` (`getOrderPipelineStatus`). The UI component is `OrderPipelineTracker`.

### Step-by-step

| Pipeline step | Who | What happens in code |
|---------------|-----|----------------------|
| **1. Booked** | Receptionist | `POST /orders/book`. Creates `order_bookings` + `order_items` + one `samples` row per unique (sample_type, tube_color). Status `PENDING_COLLECTION`. Returns Code128 sticker payloads. |
| **2. Collected** | Phlebotomist | `POST /samples/collect` (or `/rapid-scan`). Sample → `COLLECTED`. Home collection can go `IN_TRANSIT`. |
| **3. In Lab** | Lab tech | `POST /samples/receive`. Sample → `RECEIVED_IN_LAB`. Rapid-scan also **activates** `lab_results` rows so they appear in the result grid. |
| **4. Processing** | Lab tech / analyzer | `POST /lab-results/save-draft` then `/technician-approve`. Status `DRAFT` → `TECHNICIAN_APPROVED`. Formulas, reference ranges, panic flags run here. HL7/ASTM can write values automatically. |
| **5. Verified** | Pathologist | `POST /pathologist/verify-single` (or batch). Status `PATHOLOGIST_VERIFIED` + signature/license. When **all** results for the order are verified, order becomes `COMPLETED` and a 6-digit `report_passcode` is generated. |
| **6. Dispatched** | Pathologist / system | `POST /api/reports/generate/:orderId` then `/distribute/:orderId`. Encrypted NABL PDF. WhatsApp/SMS/email with magic link `/report-view/:passcode`. Sets `report_dispatched_at`. |

**Money is parallel, not a pipeline step.** Walk-in: cashier invoices after/during booking (`UNPAID` → paid). B2B: wallet is debited at book time (`WALLET_SETTLED`).

### Sample status machine

```
PENDING_COLLECTION → COLLECTED → IN_TRANSIT (optional) → RECEIVED_IN_LAB
                                                          ↘ REJECTED (with reason)
```

### Lab result status machine

```
PENDING → DRAFT → TECHNICIAN_APPROVED → PATHOLOGIST_VERIFIED
                     ↘ RERUN_REQUESTED (pathologist reject) → back to entry
```

---

## 9. Module-wise backend + frontend map

Use this table during KT. For each module: **why it exists, main APIs, UI, key files.**

---

### 9.1 Auth & Users

**Why:** login, JWT, logout/blacklist, role permission matrix.

| | Path |
|--|------|
| Backend | `modules/auth`, `modules/users` |
| Routes | `/auth/login`, `/auth/refresh`, `/auth/me`, `/auth/logout`, `/users`, `/users/:id/permissions` |
| Frontend | `modules/auth/*`, `pages/LoginPage.tsx`, `pages/SignupPage.tsx`, `pages/RolePermissionsPage.tsx` |

Seed: on boot, demo users or production Apollo users (`AUTH_SEED_TENANT_ID`).

---

### 9.2 Tenant & SaaS Admin

**Why:** many labs on one deployment; branding, subdomain, subscription.

| | Path |
|--|------|
| Backend | `modules/tenant`, `modules/saas`, `modules/saas-admin` |
| Routes | `GET /tenants`, `GET /tenants/config`, `/saas-admin/onboard`, `/saas-admin/tenants` |
| Frontend | `modules/tenant/*`, `pages/SaasAdminPage.tsx`, `pages/SignupPage.tsx`, `pages/TenantSettingsPage.tsx` |

Public: onboarding + branding by subdomain (no auth). Super-admin portal is `superAdminOnly` in the sidebar.

---

### 9.3 Catalog & Test Studio

**Why:** departments → tests → parameters → reference ranges + formulas. Booking and result entry both depend on this.

Hierarchy:

```
Department  (Hematology, Biochemistry, …)
  └── Test  (CBC, LFT, …)  + price, sample_type, tube_color
        └── Parameters  (Hemoglobin, WBC, …)
              └── Ranges (by gender/age)
              └── Formula (e.g. Indirect Bilirubin = Total - Direct)
```

| | Path |
|--|------|
| Backend | `modules/catalog` |
| Routes | `/catalog/departments`, `/catalog/tests/:id/studio`, `/catalog/parameters/...` |
| Frontend | `pages/CatalogPage.tsx`, `pages/TestStudioPage.tsx`, `features/test-studio/` |

Permission: `SETTINGS_MANAGE`.

---

### 9.4 Patients

**Why:** unique UHID per tenant; search by name/phone; longitudinal history for the smart report.

| | Path |
|--|------|
| Backend | `modules/patients` |
| Routes | `POST /patients` (create-or-search), `GET /patients`, `GET /patients/:id/longitudinal-history` |
| Frontend | `pages/PatientsPage.tsx`, `features/patient-portal/LongitudinalTrajectory.tsx` |

Booking can create a patient inline (no separate register step required).

---

### 9.5 Orders (booking)

**Why:** the start of the pipeline. One transaction creates order + line items + samples + barcodes.

Collection types:

- `WALK_IN` — front desk
- `HOME_COLLECTION` — phlebotomist goes to patient
- `B2B_FRANCHISEE` — collection centre; wholesale rate card; wallet debit

| | Path |
|--|------|
| Backend | `modules/orders` (`orders.service.ts` is the core) |
| Routes | `POST /orders/book`, `GET /orders/catalog`, `GET /orders/:id/pipeline`, `GET /orders/home-collection` |
| Frontend | `pages/OrderBookingPage.tsx` → `features/orders/OrderBookingForm.tsx` |

Also: prescription OCR (`POST /api/ocr/parse-prescription`) to pre-fill tests from a doctor slip photo.

Order number format: `ORD-YYYYMMDD-0001`. Barcode: `{orderNumber}-{TUBE}-{seq}` (Code128).

---

### 9.6 Samples, Phlebotomy, Lab receiving

**Why:** physical tubes must be tracked. `samplesService` lives in `orders.service.ts` (same file, exported separately). HTTP is `modules/samples`.

| Action | API | UI |
|--------|-----|-----|
| List | `GET /samples?status=` | Lab receiving queue |
| Collect | `POST /samples/collect` | Phlebotomy |
| Transit | `POST /samples/transit` | Home collection |
| Receive | `POST /samples/receive` | Lab receiving |
| Rapid scan | `POST /samples/rapid-scan` | barcode gun — collect or receive in one shot; activates lab results |

Socket events: `sample:updated`, `order:pipeline-update`, `lab-result:queue-update`.

Frontend: `features/samples/PhlebotomistMobileView.tsx`, `LabReceivingDesk.tsx`, `BarcodeStickerModal.tsx`.

---

### 9.7 Logistics (live tracking)

**Why:** home collection GPS for patient + ops.

| | Path |
|--|------|
| Backend | `modules/logistics`, `realtime/phlebotomistTracking.ts` |
| Auth APIs | `POST /api/logistics/trips/start`, complete, list active |
| Public | `GET /api/logistics/track/:bookingId` — **no login** |
| Frontend | `/phlebotomy` map, public `/track-phleb/:bookingId` |

---

### 9.8 Lab results (technician grid)

**Why:** parameter-level entry with calculation engine, abnormal/critical flags, delta check vs previous visit, panic alerts.

| | Path |
|--|------|
| Backend | `modules/lab-results` |
| Routes | `/lab-results/pending`, `/save-draft`, `/technician-approve`, `/rerun-request` |
| Frontend | `pages/LabResultsPage.tsx` → `features/results/ResultEntryGrid.tsx`, `VoiceResultDictation.tsx` |

Voice dictation is a UI helper on top of the same save-draft API.

---

### 9.9 Pathologist

**Why:** legally the report is not valid until a pathologist verifies.

| | Path |
|--|------|
| Backend | `modules/pathologist` (and overlapping endpoints on lab-results) |
| Routes | `/pathologist/review-queue`, `/verify-single`, `/verify-batch`, `/reject-rerun`, `/profile` |
| Frontend | `pages/PathologistPage.tsx` → `features/pathologist/PathologistPortal.tsx` |

Profile stores name, medical license, digital signature URL — stamped on the PDF.

**AI Co-Pathologist** (`modules/ai-pathologist`): optional LLM comments (`POST /api/ai/analyze-result`). Assistive only; does not replace verify.

---

### 9.10 PDF engine & report dispatch

**Why:** NABL-style encrypted PDF + patient delivery + QR authenticity.

| | Path |
|--|------|
| Backend | `modules/pdf-engine`, `modules/report` |
| Generate | `POST /api/reports/generate/:orderId` |
| Download | `GET /api/reports/download/:orderId` (auth) |
| Distribute | `POST /api/reports/distribute/:orderId` channels: WHATSAPP, SMS, EMAIL, WEBHOOK |
| Public verify | `GET /verify/:orderId` and `/api/reports/verify/:orderId` |
| Public view | `GET /api/reports/view/:passcode` |

Frontend: `/reports`, `/verify/:orderId`, `/report-view/:passcode`, `/r/:token` (kiosk magic report).

After all results verified, `finalizeOrderVerification` writes `report_passcode` and sets order `COMPLETED`.

---

### 9.11 Billing, cashier, payments

**Two layers (do not confuse them):**

1. **Cashier desk** (`modules/cashier`) — day-to-day: queue unpaid orders, adjust items/discount, GST invoice PDF, collect CASH/UPI/CARD/TPA. UI: `/billing` → `CashierBillingDesk`.
2. **Billing create-invoice** (`modules/billing`) — create invoice from order or ad-hoc items; high-discount approval.
3. **Payments** (`modules/payment`) — Stripe (or similar) online order, webhook, refunds, reconciliation cron.

Amounts are **minor units** (paise): `50000` = ₹500.00.

Discount caps: receptionist ~10%, pathologist/high-approver ~25%, lab manager 100% (`maxDiscountPercentForRole`).

---

### 9.12 B2B franchisees

**Why:** collection centres book at wholesale prices from a prepaid wallet.

| | Path |
|--|------|
| Backend | `modules/b2b` |
| Routes | franchisees CRUD, rate-card, wallet recharge (Stripe/Razorpay), ledger, bulk CSV orders, `POST /b2b/orders/create` |
| Frontend | `pages/B2BPage.tsx`, `features/b2b/WalletTopupModal.tsx` |

At book time, if `collectionType === B2B_FRANCHISEE`, `ordersService` resolves wholesale price and `debitWallet` in the same DB transaction.

---

### 9.13 Referral doctors

**Why:** track which doctor sent the patient; analytics; commission-style reporting.

| | Path |
|--|------|
| Backend | `modules/referral-doctors` |
| Routes | search, frequent, quick-add |
| Frontend | `ReferralDoctorSelect` on order form; `/analytics/referrals` |

---

### 9.14 Inventory & QC

**Why:** reagents (lot, expiry, remaining tests, reorder) + Westgard-style QC (control runs, Levey–Jennings chart, QC holds that can block processing).

| | Path |
|--|------|
| Backend | `modules/inventory` |
| Routes | `/inventory/reagents`, `/purchase-orders`, `/qc/controls`, `/qc/levey-jennings`, `/qc/holds`, `/qc/instruments` |
| Frontend | `/inventory-qc` tabs: inventory, QC, machine interfacing |

---

### 9.15 HL7 / ASTM machine interfacing

**Why:** auto-fill results from analyzers instead of typing.

- TCP server on port **5055** (started in `server.ts` via `startAnalyzerSocketServer`)
- HTTP debug: `POST /hl7-astm/ingest`
- Protocols: HL7 v2 MLLP, ASTM E1394
- Ingest maps instrument output → `lab_results` / entries for the matching barcode

---

### 9.16 Analytics & dashboards

| | Path |
|--|------|
| Backend | `modules/analytics` (feature flag `analytics`) |
| Routes | `/analytics/dashboard`, `/executive-summary`, `/tat-metrics`, `/sample-rejections`, `/live-pipeline`, `/referral-doctors` |
| Frontend | `/` → `RoleBasedDashboard` (Executive / Lab ops / Pathologist / B2B tabs) |

Redis cache TTL for dashboard (`ANALYTICS_CACHE_TTL_SEC`). Socket event `dashboard:stats-update` refreshes live numbers.

---

### 9.17 Audit

Immutable log. `GET /audit-logs` for managers. POST/PUT/PATCH/DELETE on audit routes are **rejected** on purpose.

Frontend: `pages/AuditLogsPage.tsx`.

---

### 9.18 WhatsApp bot

`POST/GET /api/whatsapp/webhook` — Cloud API / Twilio. Patients can request report status; outbound used by report distribution.

---

### 9.19 Kiosk / BYOD (bring your own device)

Public, no staff login:

- `GET /api/kiosk/catalog`
- `POST /api/kiosk/book`
- `POST /api/kiosk/confirm-payment`
- `GET /api/kiosk/magic-report/:token`

Frontend: `/byod-kiosk`. Staff can mint a magic link: `POST /api/kiosk/magic-link/:orderId`.

This is the “tablet in lobby / phone in waiting area” path so labs do not need a dedicated kiosk machine.

---

### 9.20 OCR

`POST /api/ocr/parse-prescription` — image of doctor slip → suggested tests for the booking form (`PrescriptionOcrCapture.tsx`).

---

### 9.21 Health & operations

- `GET /health` — liveness
- `/operations/*` — placeholder ops console (feature-flagged), not the main lab workflow

---

## 10. Database (what lives where)

**PostgreSQL is the source of truth.** Schema files in `backend/database/*.sql` are applied:

- on first Docker Postgres init (mounted into `docker-entrypoint-initdb.d`)
- again on API boot via `ensureLabOpsSchema()` (idempotent `CREATE IF NOT EXISTS` / `ALTER ADD COLUMN`)

Important tables (all tenant-scoped):

| Area | Tables |
|------|--------|
| Catalog | `departments`, `tests`, `parameters`, `test_packages`, `test_package_items` |
| Clinical | `patients`, `order_bookings`, `order_items`, `samples`, `lab_results`, `lab_result_entries`, `panic_alerts` |
| Reports | `order_reports`, `pathologist_profiles` |
| Money | invoices / payments (billing.sql), `franchisee` wallet tables |
| QC | reagents, control runs, QC holds |
| SaaS | tenants, subscriptions, branding |
| Audit | immutable audit table |

**MongoDB** (`backend/src/database/models/`): optional Mongoose models (Patient, Order, Sample, …). Core booking/result flow uses Postgres. Boot logs a warning and continues if Mongo is down.

**Redis:** rate limiting, analytics cache, JWT blacklist.

Money columns: `*_minor` = integer paise.

---

## 11. Realtime (Socket.IO)

Initialized in `server.ts` → `initRealtime(server)`.

Clients join `tenant:{tenantId}` or `order:{orderId}`.

| Event | When |
|-------|------|
| `sample:updated` | collect / transit / receive |
| `order:pipeline-update` | sample or processing change |
| `lab-result:queue-update` | results activated after receive |
| `dashboard:stats-update` | any of the above |
| phlebotomist GPS events | live map |

---

## 12. Public pages (no staff login)

These are patient-facing. Do not require JWT.

| Route | Purpose |
|-------|---------|
| `/login`, `/signup` | staff / onboarding |
| `/verify/:orderId` | QR authenticity check |
| `/report-view/:passcode` | open completed report |
| `/r/:token` | kiosk/WhatsApp magic report |
| `/track-phleb/:bookingId` | live phlebotomist map |
| `/byod-kiosk` | self booking |

---

## 13. Frontend screen → feature file (cheat sheet)

| URL | Page | Real UI |
|-----|------|---------|
| `/` | DashboardPage | `features/dashboards/RoleBasedDashboard.tsx` |
| `/orders` | OrderBookingPage | `features/orders/OrderBookingForm.tsx` |
| `/patients` | PatientsPage | patients feature |
| `/phlebotomy` | PhlebotomyPage | `PhlebotomistMobileView` + logistics map |
| `/lab-receiving` | LabReceivingPage | `LabReceivingDesk.tsx` |
| `/lab-results` | LabResultsPage | `ResultEntryGrid.tsx` |
| `/pathologist` | PathologistPage | `PathologistPortal.tsx` |
| `/billing` | BillingPage | `CashierBillingDesk.tsx` |
| `/b2b` | B2BPage | b2b feature |
| `/inventory-qc` | InventoryQcPage | `QcInventoryPortal.tsx` |
| `/reports` | ReportPage | PDF + WhatsApp distribute |
| `/settings/catalog` | CatalogPage | catalog |
| `/settings/test-studio` | TestStudioPage | `TestParameterStudio.tsx` |
| `/settings/permissions` | RolePermissionsPage | `RolePermissionMatrix.tsx` |
| `/saas-admin` | SaasAdminPage | tenant table + onboarding wizard |

Providers wrap the app in `main.tsx`:

`QueryClient` → `Theme` → `AuthProvider` → `TenantProvider` → `BrowserRouter` → `App` (routes + command palette).

---

## 14. Role walkthrough (use this in a live KT demo)

Walk one order through the UI as different users.

1. **LAB_MANAGER** — `/settings/catalog` confirm tests exist; `/settings/permissions` show matrix.
2. **RECEPTIONIST** — `/orders` register/search patient, pick tests, referral doctor, print barcodes. `/billing` take cash/UPI.
3. **PHLEBOTOMIST** — `/phlebotomy` scan barcode, collect, (home) start trip.
4. **LAB_TECH** — `/lab-receiving` scan receive; `/lab-results` enter values, technician approve; `/inventory-qc` if QC hold.
5. **PATHOLOGIST** — `/pathologist` verify or reject-rerun; `/reports` generate + WhatsApp.
6. **Patient** — open `/report-view/{passcode}` or scan QR `/verify/{orderId}`.
7. **B2B_FRANCHISEE** — `/b2b` wallet + bulk orders.

Sidebar badges (pathologist queue, receiving, low reagents, result entry) come from `useSidebarBadges.ts`.

---

## 15. How to run locally (for KT setup)

Prerequisites: Node 18+, Docker (Postgres + Redis) or local Postgres.

```bash
# from repo root
docker compose up -d postgres redis    # or full stack
# backend/.env  → DATABASE_URL, REDIS_URL, JWT secrets (see .env.example)
npm install
npm run seed                           # optional catalog/demo data
npm run dev                            # API :5000 + Vite :5173
```

Open `http://localhost:5173` → pick tenant → login with seeded demo user.

Production-like: `docker compose up -d --build` then `https://localhost`.

---

## 16. Common KT questions (short answers)

**Q: Why are there both `/orders` and `/api/orders`?**  
A: Aliases in `app.ts`. Same router. Frontend may use either; prefer `/api/*` for new work.

**Q: Postgres vs Mongo?**  
A: Postgres is required. Mongo is optional for some document models. Do not design new clinical features on Mongo.

**Q: Where is the “status” of an order?**  
A: `order_bookings.status` is coarse (`BOOKED` / `IN_PROGRESS` / `COMPLETED`). The 6-step pipeline is **derived** from samples + lab_results + `report_dispatched_at`.

**Q: Who creates lab_result rows?**  
A: When the sample is received / rapid-scanned, the service activates pending lab results for that order’s tests so the tech grid is not empty.

**Q: Can a receptionist see pathologist screens?**  
A: No, unless custom permissions were granted. Routes and APIs both check permissions.

**Q: What is a “minor” amount?**  
A: Integer paise. Divide by 100 for rupees in the UI.

**Q: Where do I add a new API?**  
A: New folder under `backend/src/modules/<name>/`, export router, `app.use` in `app.ts`, add permission, add `features/` + route in `AppRoutes.tsx` and sidebar config.

**Q: Webhooks?**  
A: Stripe payment webhook and B2B wallet webhook are mounted **before** `express.json` so the raw body can be signature-verified.

---

## 17. Suggested KT session agenda (45–60 min)

| Time | Topic |
|------|--------|
| 5 min | Product + architecture diagram (§2–3) |
| 5 min | Repo tour + request middleware (§4–5) |
| 5 min | Tenant + roles (§6–7) |
| 20 min | Golden path live demo (§8 + §14) |
| 10 min | Adjacent modules: billing, B2B, QC, HL7, reports (§9) |
| 5 min | DB, realtime, public links (§10–12) |
| 5 min | Q&A using §16 |

Keep this file as the handout. Point people at `app.ts` (API map) and `AppRoutes.tsx` (UI map) as the two indexes of the system.

---

## 18. File indexes (bookmark these)

| If you need… | Open |
|--------------|------|
| Every HTTP mount | `backend/src/app.ts` |
| Process boot | `backend/src/server.ts` |
| Role/permission source of truth | `backend/src/modules/auth/permissions.ts` |
| Order + sample business logic | `backend/src/modules/orders/orders.service.ts` |
| Pipeline math | `backend/src/modules/orders/orderLifecycle.util.ts` |
| UI routes | `frontend/src/routes/AppRoutes.tsx` |
| Sidebar | `frontend/src/components/sidebar/sidebarNav.config.ts` |
| Axios/JWT | `frontend/src/services/http.ts` |
| SQL schemas | `backend/database/*.sql` |
