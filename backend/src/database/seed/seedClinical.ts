import { randomUUID } from "crypto";
import { db } from "../postgres";
import { seedLog } from "./seedLogger";
import {
  APOLLO_TENANT_ID,
  FRANCHISEE_ID,
  ORDER_IDS,
  PATIENT_IDS,
  PATHOLOGIST_SIGNATURE_URL,
  SAMPLE_IDS
} from "./productionSeed.constants";
import type { CatalogSeedResult } from "./seedCatalog";
import type { ProductionUserIds } from "../../modules/auth/productionUsers.seed";

const rupees = (amount: number): number => amount * 100;

export const seedProductionFranchiseeWallet = async (
  tenantId: string,
  franchiseeUserId: string
): Promise<string> => {
  seedLog.header("B2B Franchisee Wallet");
  const balanceMinor = rupees(45000);
  const creditLimitMinor = rupees(10000);

  await db.query(
    `INSERT INTO b2b_franchisees (id, tenant_id, code, name, contact_name, phone, email, wallet_balance_minor, credit_limit_minor, is_active)
     VALUES ($1,$2,'CARE-FRANCHISE',$3,'Care Diagnostics Franchisee','9876500000','center1@franchisee.com',$4,$5,TRUE)
     ON CONFLICT (tenant_id, code) DO UPDATE SET
       name = EXCLUDED.name,
       wallet_balance_minor = EXCLUDED.wallet_balance_minor,
       credit_limit_minor = EXCLUDED.credit_limit_minor,
       updated_at = NOW()`,
    [FRANCHISEE_ID, tenantId, "Care Diagnostics Franchisee", balanceMinor, creditLimitMinor]
  );

  await db.query(`DELETE FROM b2b_wallet_transactions WHERE tenant_id = $1 AND franchisee_id = $2`, [
    tenantId,
    FRANCHISEE_ID
  ]);

  await db.query(
    `INSERT INTO b2b_wallet_transactions (id, tenant_id, franchisee_id, type, amount_minor, balance_after_minor, gateway, gateway_ref, note, created_by_user_id)
     VALUES ($1,$2,$3,'CREDIT',$4,$5,'RAZORPAY','pay_RZP98412','Initial Credit ₹50,000',$6)`,
    [randomUUID(), tenantId, FRANCHISEE_ID, rupees(50000), rupees(50000), franchiseeUserId]
  );
  await db.query(
    `INSERT INTO b2b_wallet_transactions (id, tenant_id, franchisee_id, type, amount_minor, balance_after_minor, note, created_by_user_id)
     VALUES ($1,$2,$3,'DEBIT',$4,$5,'Order Debit ₹5,000 for batch samples',$6)`,
    [randomUUID(), tenantId, FRANCHISEE_ID, rupees(5000), balanceMinor, franchiseeUserId]
  );

  seedLog.step("Care Diagnostics Franchisee", `Balance ₹45,000 · Credit limit ₹10,000`);
  seedLog.count("WalletTransaction", 2);
  return FRANCHISEE_ID;
};

export const seedProductionPathologist = async (tenantId: string, pathologistUserId: string): Promise<void> => {
  await db.query(
    `INSERT INTO pathologist_profiles (user_id, tenant_id, full_name, medical_license_number, digital_signature_url)
     VALUES ($1,$2,'Dr. Apollo Pathologist','MCI-98412',$3)
     ON CONFLICT (tenant_id, user_id) DO UPDATE SET
       full_name = EXCLUDED.full_name,
       medical_license_number = EXCLUDED.medical_license_number,
       digital_signature_url = EXCLUDED.digital_signature_url`,
    [pathologistUserId, tenantId, PATHOLOGIST_SIGNATURE_URL]
  );
  seedLog.step("Pathologist profile", "MCI-98412 · digital signature attached");
};

const seedPatients = async (tenantId: string): Promise<void> => {
  seedLog.header("Patients");
  const patients = [
    {
      id: PATIENT_IDS.rajesh,
      uhid: "LAB-20260830-1001",
      name: "Rajesh Kumar",
      age: 45,
      gender: "MALE",
      blood: "O+",
      phone: "9876543210",
      notes: null
    },
    {
      id: PATIENT_IDS.sunita,
      uhid: "LAB-20260830-1002",
      name: "Sunita Sharma",
      age: 32,
      gender: "FEMALE",
      blood: "B+",
      phone: "9876543211",
      notes: null
    },
    {
      id: PATIENT_IDS.aarav,
      uhid: "LAB-20260830-1003",
      name: "Master Aarav Singh",
      age: 8,
      gender: "MALE",
      blood: "A+",
      phone: null,
      notes: "Pediatric"
    },
    {
      id: PATIENT_IDS.vikram,
      uhid: "LAB-20260830-1004",
      name: "Vikram Patel",
      age: 62,
      gender: "MALE",
      blood: "AB+",
      phone: "9876543212",
      notes: "Diabetic history"
    },
    {
      id: PATIENT_IDS.anita,
      uhid: "LAB-20260830-1005",
      name: "Anita Roy",
      age: 28,
      gender: "FEMALE",
      blood: null,
      phone: "9876543213",
      notes: "Pregnancy 2nd trimester"
    }
  ];

  const dobForAge = (ageYears: number): string => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - ageYears, 0, 15);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  for (const p of patients) {
    await db.query(
      `INSERT INTO patients (id, tenant_id, patient_code, uhid, name, phone, gender, age_years, date_of_birth, blood_group, clinical_notes)
       VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [p.id, tenantId, p.uhid, p.name, p.phone, p.gender, p.age, dobForAge(p.age), p.blood, p.notes]
    );
    seedLog.step(p.name, p.uhid);
  }
  seedLog.count("Patient", patients.length);
};

const seedOrdersAndSamples = async (
  tenantId: string,
  users: ProductionUserIds,
  franchiseeId: string,
  hba1cTestId: string
): Promise<void> => {
  seedLog.header("Order Bookings & Samples");
  const createdBy = users.manager;

  await db.query(
    `INSERT INTO order_bookings
     (id, tenant_id, order_number, patient_id, collection_type, subtotal_minor, tax_minor, discount_minor,
      net_amount_minor, status, payment_status, created_by_user_id)
     VALUES ($1,$2,'ORD-20260830-001',$3,'WALK_IN',$4,0,0,$4,'COMPLETED','PAID',$5)`,
    [ORDER_IDS.ord1, tenantId, PATIENT_IDS.rajesh, rupees(2500), createdBy]
  );
  await db.query(
    `INSERT INTO order_items (id, tenant_id, order_id, item_type, package_id, name, price_minor, quantity)
     VALUES ($1,$2,$3,'PACKAGE',$4,'Master Health Checkup Package',$5,1)`,
    [randomUUID(), tenantId, ORDER_IDS.ord1, "e5000001-0001-4001-8001-000000000001", rupees(2500)]
  );

  await db.query(
    `INSERT INTO order_bookings
     (id, tenant_id, order_number, patient_id, collection_type, collection_address, subtotal_minor, tax_minor,
      discount_minor, net_amount_minor, status, payment_status, created_by_user_id)
     VALUES ($1,$2,'ORD-20260830-002',$3,'HOME_COLLECTION','12 MG Road, Pune',$4,0,0,$4,'IN_PROGRESS','UNPAID',$5)`,
    [ORDER_IDS.ord2, tenantId, PATIENT_IDS.vikram, rupees(500), createdBy]
  );
  await db.query(
    `INSERT INTO order_items (id, tenant_id, order_id, item_type, test_id, name, price_minor, quantity)
     VALUES ($1,$2,$3,'TEST',$4,'HbA1c Glycated Hemoglobin',$5,1)`,
    [randomUUID(), tenantId, ORDER_IDS.ord2, hba1cTestId, rupees(500)]
  );

  await db.query(
    `INSERT INTO order_bookings
     (id, tenant_id, order_number, patient_id, collection_type, franchisee_id, subtotal_minor, tax_minor,
      discount_minor, net_amount_minor, status, payment_status, created_by_user_id)
     VALUES ($1,$2,'ORD-20260830-003',$3,'B2B_FRANCHISEE',$4,$5,0,0,$5,'IN_PROGRESS','WALLET_SETTLED',$6)`,
    [ORDER_IDS.ord3, tenantId, PATIENT_IDS.sunita, franchiseeId, rupees(800), users.b2bFranchisee]
  );

  await db.query(
    `INSERT INTO order_bookings
     (id, tenant_id, order_number, patient_id, collection_type, subtotal_minor, tax_minor, discount_minor,
      net_amount_minor, status, payment_status, created_by_user_id)
     VALUES ($1,$2,'ORD-20260830-004',$3,'WALK_IN',$4,0,0,$4,'BOOKED','UNPAID',$5)`,
    [ORDER_IDS.ord4, tenantId, PATIENT_IDS.anita, rupees(600), createdBy]
  );

  await db.query(
    `INSERT INTO home_collection_trips (id, tenant_id, order_id, phlebotomist_user_id, status, destination_address)
     VALUES ($1,$2,$3,$4,'ACTIVE','12 MG Road, Pune')`,
    [randomUUID(), tenantId, ORDER_IDS.ord2, users.phlebotomist]
  );

  const samples = [
    {
      id: SAMPLE_IDS.s1,
      orderId: ORDER_IDS.ord1,
      patientId: PATIENT_IDS.rajesh,
      barcode: "BAR10001001",
      type: "EDTA Blood",
      tube: "PURPLE",
      status: "RECEIVED_IN_LAB"
    },
    {
      id: SAMPLE_IDS.s2,
      orderId: ORDER_IDS.ord1,
      patientId: PATIENT_IDS.rajesh,
      barcode: "BAR10001002",
      type: "Serum",
      tube: "RED",
      status: "RECEIVED_IN_LAB"
    },
    {
      id: SAMPLE_IDS.s3,
      orderId: ORDER_IDS.ord2,
      patientId: PATIENT_IDS.vikram,
      barcode: "BAR10001003",
      type: "Fluoride Grey",
      tube: "GREY",
      status: "IN_TRANSIT",
      temp: JSON.stringify([5.2, 4.8])
    },
    {
      id: SAMPLE_IDS.s4,
      orderId: ORDER_IDS.ord4,
      patientId: PATIENT_IDS.anita,
      barcode: "BAR10001004",
      type: "EDTA Blood",
      tube: "PURPLE",
      status: "REJECTED",
      rejection: "Hemolyzed Sample"
    }
  ];

  for (const s of samples) {
    const collectedAt = new Date();
    collectedAt.setHours(collectedAt.getHours() - 4);
    const receivedAt =
      s.status === "RECEIVED_IN_LAB" || s.status === "REJECTED"
        ? new Date(collectedAt.getTime() + 45 * 60 * 1000)
        : null;
    await db.query(
      `INSERT INTO samples
       (id, tenant_id, order_id, patient_id, barcode, sample_type, tube_color, status,
        temperature_log, rejection_reason, collected_at, received_at, collected_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13)`,
      [
        s.id,
        tenantId,
        s.orderId,
        s.patientId,
        s.barcode,
        s.type,
        s.tube,
        s.status,
        s.temp ?? "[]",
        s.rejection ?? null,
        collectedAt.toISOString(),
        receivedAt ? receivedAt.toISOString() : null,
        users.phlebotomist
      ]
    );
    seedLog.step(`Sample ${s.barcode}`, s.status);
  }

  seedLog.count("OrderBooking", 4);
  seedLog.count("Sample", samples.length);
};

const insertResultEntry = async (
  tenantId: string,
  labResultId: string,
  parameterId: string,
  value: number,
  opts: {
    isCalculated?: boolean;
    isAbnormal?: boolean;
    isCritical?: boolean;
    flag?: string;
    refMin?: number | null;
    refMax?: number | null;
    deltaPrev?: number | null;
    deltaPct?: number | null;
  } = {}
): Promise<void> => {
  await db.query(
    `INSERT INTO lab_result_entries
     (id, tenant_id, lab_result_id, parameter_id, value_numeric, is_calculated, is_abnormal, is_critical, flag,
      reference_min, reference_max, delta_previous_value, delta_change_percentage)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      randomUUID(),
      tenantId,
      labResultId,
      parameterId,
      value,
      opts.isCalculated ?? false,
      opts.isAbnormal ?? false,
      opts.isCritical ?? false,
      opts.flag ?? null,
      opts.refMin ?? null,
      opts.refMax ?? null,
      opts.deltaPrev ?? null,
      opts.deltaPct ?? null
    ]
  );
};

const seedLabResults = async (
  tenantId: string,
  catalog: CatalogSeedResult,
  users: ProductionUserIds
): Promise<void> => {
  seedLog.header("Lab Results");
  const { testIds, paramIds, departmentIds } = catalog;
  const pathologistId = users.pathologist;
  const techId = users.labTech;

  const verifiedAt = new Date().toISOString();
  const resultTests = [
    { code: "CBC001", dept: "Hematology" },
    { code: "KFT001", dept: "Biochemistry" },
    { code: "LFT001", dept: "Biochemistry" },
    { code: "LIPID001", dept: "Biochemistry" }
  ];

  for (const t of resultTests) {
    const labResultId = randomUUID();
    await db.query(
      `INSERT INTO lab_results
       (id, tenant_id, order_id, patient_id, test_id, department_id, status,
        approved_by_user_id, approved_at, pathologist_user_id, pathologist_signature_url,
        pathologist_license, pathologist_name, verified_at)
       VALUES ($1,$2,$3,$4,$5,$6,'PATHOLOGIST_VERIFIED',$7,$8,$7,$9,'MCI-98412','Dr. Apollo Pathologist',$8)`,
      [
        labResultId,
        tenantId,
        ORDER_IDS.ord1,
        PATIENT_IDS.rajesh,
        testIds[t.code],
        departmentIds[t.dept],
        pathologistId,
        verifiedAt,
        PATHOLOGIST_SIGNATURE_URL
      ]
    );

    if (t.code === "CBC001") {
      await db.query(
        `UPDATE lab_results SET technician_note = $1 WHERE id = $2 AND tenant_id = $3`,
        [
          "Complete blood count within expected biological reference intervals for adult male. No significant cytosis or cytopenia observed.",
          labResultId,
          tenantId
        ]
      );
      await insertResultEntry(tenantId, labResultId, paramIds["Hemoglobin"]!, 14.5, {
        refMin: 13.5,
        refMax: 17.5
      });
      await insertResultEntry(tenantId, labResultId, paramIds["RBC Count"]!, 4.8, { refMin: 4.2, refMax: 5.4 });
      await insertResultEntry(tenantId, labResultId, paramIds["WBC Total Count"]!, 7200, { refMin: 4000, refMax: 11000 });
      await insertResultEntry(tenantId, labResultId, paramIds["Platelet Count"]!, 2.4, { refMin: 1.5, refMax: 4.5 });
      await insertResultEntry(tenantId, labResultId, paramIds["Neutrophils %"]!, 58, { refMin: 40, refMax: 70 });
      await insertResultEntry(tenantId, labResultId, paramIds["Lymphocytes %"]!, 30, { refMin: 20, refMax: 40 });
      await insertResultEntry(tenantId, labResultId, paramIds["Eosinophils %"]!, 2, { refMin: 1, refMax: 4 });
      await insertResultEntry(tenantId, labResultId, paramIds["Monocytes %"]!, 5, { refMin: 2, refMax: 8 });
    }
    if (t.code === "KFT001") {
      await insertResultEntry(tenantId, labResultId, paramIds["Serum Creatinine"]!, 1.1, { refMin: 0.7, refMax: 1.3 });
      await insertResultEntry(tenantId, labResultId, paramIds["Blood Urea"]!, 28, { refMin: 15, refMax: 40 });
      await insertResultEntry(tenantId, labResultId, paramIds["Uric Acid"]!, 5.4, { refMin: 3.5, refMax: 7.2 });
      await insertResultEntry(tenantId, labResultId, paramIds["Serum Sodium"]!, 140, { refMin: 135, refMax: 145 });
      await insertResultEntry(tenantId, labResultId, paramIds["Serum Potassium"]!, 4.2, { refMin: 3.5, refMax: 5.1 });
      await insertResultEntry(tenantId, labResultId, paramIds["eGFR"]!, 92, {
        isCalculated: true,
        refMin: 60,
        refMax: 120
      });
    }
    if (t.code === "LFT001") {
      await insertResultEntry(tenantId, labResultId, paramIds["Bilirubin Total"]!, 0.9, { refMin: 0.3, refMax: 1.2 });
      await insertResultEntry(tenantId, labResultId, paramIds["Bilirubin Direct"]!, 0.2, { refMin: 0, refMax: 0.3 });
      await insertResultEntry(tenantId, labResultId, paramIds["SGOT/AST"]!, 28, { refMin: 0, refMax: 40 });
      await insertResultEntry(tenantId, labResultId, paramIds["SGPT/ALT"]!, 32, { refMin: 0, refMax: 55 });
      await insertResultEntry(tenantId, labResultId, paramIds["Alkaline Phosphatase"]!, 88, { refMin: 44, refMax: 147 });
      await insertResultEntry(tenantId, labResultId, paramIds["Total Protein"]!, 7.1, { refMin: 6, refMax: 8.3 });
      await insertResultEntry(tenantId, labResultId, paramIds["Albumin"]!, 4.2, { refMin: 3.5, refMax: 5 });
      await insertResultEntry(tenantId, labResultId, paramIds["Bilirubin Indirect"]!, 0.7, {
        isCalculated: true,
        refMin: 0.2,
        refMax: 0.8
      });
      await insertResultEntry(tenantId, labResultId, paramIds["Globulin"]!, 2.9, {
        isCalculated: true,
        refMin: 2,
        refMax: 3.5
      });
      await insertResultEntry(tenantId, labResultId, paramIds["A/G Ratio"]!, 1.4, {
        isCalculated: true,
        refMin: 1,
        refMax: 2.5
      });
    }
    if (t.code === "LIPID001") {
      await insertResultEntry(tenantId, labResultId, paramIds["Total Cholesterol"]!, 240, {
        isAbnormal: true,
        flag: "H",
        refMin: 0,
        refMax: 200
      });
      await insertResultEntry(tenantId, labResultId, paramIds["Triglycerides"]!, 280, {
        isAbnormal: true,
        flag: "H",
        refMin: 0,
        refMax: 150
      });
      await insertResultEntry(tenantId, labResultId, paramIds["HDL Cholesterol"]!, 42, { refMin: 40, refMax: null });
      await insertResultEntry(tenantId, labResultId, paramIds["VLDL"]!, 56, {
        isCalculated: true,
        isAbnormal: true,
        flag: "H",
        refMin: 5,
        refMax: 40
      });
      await insertResultEntry(tenantId, labResultId, paramIds["LDL"]!, 142, {
        isCalculated: true,
        isAbnormal: true,
        flag: "H",
        refMin: 0,
        refMax: 100
      });
    }
    seedLog.step(`Result ${t.code}`, "PATHOLOGIST_VERIFIED");
  }

  const hba1cResultId = randomUUID();
  await db.query(
    `INSERT INTO lab_results
     (id, tenant_id, order_id, patient_id, test_id, department_id, status, approved_by_user_id, approved_at)
     VALUES ($1,$2,$3,$4,$5,$6,'TECHNICIAN_APPROVED',$7,NOW())`,
    [
      hba1cResultId,
      tenantId,
      ORDER_IDS.ord2,
      PATIENT_IDS.vikram,
      testIds["HBA1C001"],
      departmentIds["Biochemistry"],
      techId
    ]
  );
  await insertResultEntry(tenantId, hba1cResultId, paramIds["HbA1c"]!, 9.8, {
    isAbnormal: true,
    isCritical: true,
    flag: "HH",
    refMin: 4,
    refMax: 5.6,
    deltaPrev: 8.2,
    deltaPct: 19.5
  });
  await db.query(
    `INSERT INTO panic_alerts (id, tenant_id, lab_result_id, parameter_id, value_numeric, message, created_by_user_id)
     VALUES ($1,$2,$3,$4,9.8,'CRITICAL HIGH: HbA1c 9.8% (prior 8.2%)',$5)`,
    [randomUUID(), tenantId, hba1cResultId, paramIds["HbA1c"], techId]
  );
  seedLog.step("Result HBA1C001", "TECHNICIAN_APPROVED · CRITICAL HIGH panic alert");

  seedLog.count("LabResult", resultTests.length + 1);
};

const seedBilling = async (tenantId: string, users: ProductionUserIds): Promise<void> => {
  seedLog.header("Billing & PDF Report");
  const invoiceId = randomUUID();
  const netMinor = rupees(2500);

  await db.query(
    `INSERT INTO cashier_invoices
     (id, tenant_id, order_id, invoice_number, patient_id, patient_name, subtotal_minor, taxable_minor,
      net_amount_minor, paid_amount_minor, due_amount_minor, status, created_by_user_id)
     VALUES ($1,$2,$3,'INV-20260830-001',$4,'Rajesh Kumar',$5,$5,$5,$5,0,'PAID',$6)`,
    [invoiceId, tenantId, ORDER_IDS.ord1, PATIENT_IDS.rajesh, netMinor, users.cashier]
  );
  await db.query(
    `INSERT INTO cashier_payments
     (id, tenant_id, invoice_id, order_id, amount_minor, method, transaction_reference, collected_by_user_id)
     VALUES ($1,$2,$3,$4,$5,'UPI','UPI-RZP-ORD001',$6)`,
    [randomUUID(), tenantId, invoiceId, ORDER_IDS.ord1, netMinor, users.cashier]
  );
  await db.query(
    `INSERT INTO order_reports
     (id, tenant_id, order_id, file_path, verify_token, report_url, created_by_user_id)
     VALUES ($1,$2,$3,'/reports/apollo/ORD-20260830-001.pdf','verify-apollo-ord001','https://apollo.yourdomain.com/reports/ORD-20260830-001.pdf',$4)`,
    [randomUUID(), tenantId, ORDER_IDS.ord1, users.pathologist]
  );
  seedLog.step("Invoice INV-20260830-001", "PAID · UPI ₹2,500");
  seedLog.step("PDF Report", "ORD-20260830-001 pathologist-verified");
  seedLog.count("CashierInvoice", 1);
};

export const seedProductionClinical = async (
  tenantId: string,
  catalog: CatalogSeedResult,
  users: ProductionUserIds
): Promise<void> => {
  await seedPatients(tenantId);
  const franchiseeId = await seedProductionFranchiseeWallet(tenantId, users.b2bFranchisee);
  await seedProductionPathologist(tenantId, users.pathologist);

  await seedOrdersAndSamples(tenantId, users, franchiseeId, catalog.testIds["HBA1C001"]!);
  await seedLabResults(tenantId, catalog, users);
  await seedBilling(tenantId, users);

  await db.query(
    `INSERT INTO b2b_package_prices (id, tenant_id, franchisee_id, package_id, price_minor)
     VALUES ($1,$2,$3,$4,$5) ON CONFLICT (tenant_id, franchisee_id, package_id) DO UPDATE SET price_minor = EXCLUDED.price_minor`,
    [randomUUID(), tenantId, franchiseeId, catalog.packageIds.pkg001, rupees(1400)]
  );
  await db.query(
    `INSERT INTO b2b_package_prices (id, tenant_id, franchisee_id, package_id, price_minor)
     VALUES ($1,$2,$3,$4,$5) ON CONFLICT (tenant_id, franchisee_id, package_id) DO UPDATE SET price_minor = EXCLUDED.price_minor`,
    [randomUUID(), tenantId, franchiseeId, catalog.packageIds.pkg002, rupees(900)]
  );
};

export const seedCityLabsMinimal = async (tenantId: string): Promise<void> => {
  seedLog.header(`City Labs (${tenantId}) — minimal tenant`);
  await db.query(
    `INSERT INTO departments (id, tenant_id, name) VALUES ($1,$2,'General') ON CONFLICT (tenant_id, name) DO NOTHING`,
    [randomUUID(), tenantId]
  );
  seedLog.step("City Diagnostic Center", "catalog stub only");
};
