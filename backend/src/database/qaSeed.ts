import { randomUUID } from "crypto";
import { db } from "./postgres";
import { seedQaCatalog } from "./qaCatalog.seed";
import { logger } from "../common/logger/logger";

/** 1×1 PNG data URL — offline-safe pathologist e-signature for QA. */
export const QA_PATHOLOGIST_SIGNATURE_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJgyF8H0v8Y8AAAAABJRU5ErkJggg==";

const WALLET_50K_MINOR = 5_000_000;

export const seedQaB2BFranchisee = async (tenantId: string): Promise<string> => {
  const id = randomUUID();
  await db.query(
    `INSERT INTO b2b_franchisees (id, tenant_id, code, name, contact_name, phone, email, wallet_balance_minor, credit_limit_minor, is_active)
     VALUES ($1,$2,'QA-FRANCHISE','QA Franchisee Hub','QA Contact','9999900000','b2b@demo.local',$3,0,TRUE)
     ON CONFLICT (tenant_id, code) DO UPDATE SET
       name = EXCLUDED.name, email = EXCLUDED.email,
       wallet_balance_minor = GREATEST(b2b_franchisees.wallet_balance_minor, EXCLUDED.wallet_balance_minor),
       updated_at = NOW()`,
    [id, tenantId, WALLET_50K_MINOR]
  );
  const row = (
    await db.query(`SELECT id FROM b2b_franchisees WHERE tenant_id = $1 AND code = 'QA-FRANCHISE' LIMIT 1`, [tenantId])
  ).rows[0] as { id: string };

  await db.query(
    `INSERT INTO b2b_wallet_transactions (id, tenant_id, franchisee_id, type, amount_minor, balance_after_minor, note)
     SELECT $1,$2,$3,'ADJUSTMENT',$4,$4,'QA seed ₹50,000 wallet'
     WHERE NOT EXISTS (
       SELECT 1 FROM b2b_wallet_transactions WHERE tenant_id = $2 AND franchisee_id = $3 AND note = 'QA seed ₹50,000 wallet'
     )`,
    [randomUUID(), tenantId, row.id, WALLET_50K_MINOR]
  );

  return row.id;
};

export const seedQaPathologistProfile = async (
  tenantId: string,
  pathologistUserId: string
): Promise<void> => {
  await db.query(
    `INSERT INTO pathologist_profiles (user_id, tenant_id, full_name, medical_license_number, digital_signature_url)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (tenant_id, user_id) DO UPDATE SET
       full_name = EXCLUDED.full_name,
       medical_license_number = EXCLUDED.medical_license_number,
       digital_signature_url = EXCLUDED.digital_signature_url,
       updated_at = NOW()`,
    [pathologistUserId, tenantId, "Dr. QA Pathologist", "MCI-QA-12345", QA_PATHOLOGIST_SIGNATURE_URL]
  );
};

export const runQaDatabaseSeed = async (
  tenantId: string,
  pathologistUserId?: string
): Promise<void> => {
  await seedQaCatalog(tenantId);
  await seedQaB2BFranchisee(tenantId);
  if (pathologistUserId) {
    await seedQaPathologistProfile(tenantId, pathologistUserId);
  }
  logger.info({ tenantId }, "QA database seed complete");
};
