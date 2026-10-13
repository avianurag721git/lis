import { randomUUID } from "crypto";
import { db } from "../../database/postgres";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { ReferralDoctor, SELF_DOCTOR_CODE, SELF_DOCTOR_NAME } from "./referralDoctors.types";

const ensurePg = (): void => {
  if (!env.databaseUrl) {
    throw new AppError("Database not configured", HTTP_STATUS.INTERNAL_SERVER_ERROR, "DB_NOT_CONFIGURED");
  }
};

const mapRow = (r: Record<string, unknown>): ReferralDoctor => ({
  id: r.id as string,
  tenantId: r.tenant_id as string,
  doctorCode: (r.doctor_code as string) ?? SELF_DOCTOR_CODE,
  name: r.name as string,
  clinicName: (r.clinic_name as string | null) ?? null,
  specialization: (r.specialty as string | null) ?? null,
  mobile: (r.phone as string | null) ?? null,
  whatsappNumber: (r.whatsapp_number as string | null) ?? null,
  commissionPercentage: Number(r.commission_percentage ?? 0),
  isActive: Boolean(r.is_active ?? true),
  usageCount: Number(r.usage_count ?? 0),
  createdAt: new Date(r.created_at as string).toISOString()
});

export const referralDoctorsService = {
  async ensureDefaultDoctor(tenantId: string): Promise<ReferralDoctor> {
    ensurePg();
    const existing = (
      await db.query(
        `SELECT * FROM referral_doctors WHERE tenant_id = $1 AND doctor_code = $2 LIMIT 1`,
        [tenantId, SELF_DOCTOR_CODE]
      )
    ).rows[0];
    if (existing) return mapRow(existing);

    const id = randomUUID();
    const inserted = await db.query(
      `INSERT INTO referral_doctors
       (id, tenant_id, doctor_code, name, clinic_name, specialty, phone, commission_percentage, is_active, usage_count)
       VALUES ($1,$2,$3,$4,NULL,'General','Walk-in',0,TRUE,0)
       RETURNING *`,
      [id, tenantId, SELF_DOCTOR_CODE, SELF_DOCTOR_NAME]
    );
    return mapRow(inserted.rows[0]);
  },

  async search(tenantId: string, q: string, limit = 20): Promise<ReferralDoctor[]> {
    ensurePg();
    await this.ensureDefaultDoctor(tenantId);
    const needle = q.trim();
    if (!needle) {
      return this.frequent(tenantId, limit);
    }

    const like = `%${needle.replace(/[%_]/g, "")}%`;
    const result = await db.query(
      `SELECT * FROM referral_doctors
       WHERE tenant_id = $1 AND is_active = TRUE
         AND (
           name ILIKE $2 OR doctor_code ILIKE $2 OR phone ILIKE $2
           OR clinic_name ILIKE $2 OR specialty ILIKE $2
         )
       ORDER BY usage_count DESC, name ASC
       LIMIT $3`,
      [tenantId, like, limit]
    );
    return result.rows.map(mapRow);
  },

  async frequent(tenantId: string, limit = 5): Promise<ReferralDoctor[]> {
    ensurePg();
    await this.ensureDefaultDoctor(tenantId);
    const result = await db.query(
      `SELECT * FROM referral_doctors
       WHERE tenant_id = $1 AND is_active = TRUE
       ORDER BY usage_count DESC, name ASC
       LIMIT $2`,
      [tenantId, limit]
    );
    return result.rows.map(mapRow);
  },

  async getById(tenantId: string, id: string): Promise<ReferralDoctor | null> {
    ensurePg();
    const row = (
      await db.query(`SELECT * FROM referral_doctors WHERE tenant_id = $1 AND id = $2 LIMIT 1`, [tenantId, id])
    ).rows[0];
    return row ? mapRow(row) : null;
  },

  async getByCode(tenantId: string, doctorCode: string): Promise<ReferralDoctor | null> {
    ensurePg();
    const row = (
      await db.query(`SELECT * FROM referral_doctors WHERE tenant_id = $1 AND doctor_code = $2 LIMIT 1`, [
        tenantId,
        doctorCode
      ])
    ).rows[0];
    return row ? mapRow(row) : null;
  },

  async nextDoctorCode(tenantId: string): Promise<string> {
    ensurePg();
    const result = await db.query(
      `SELECT COALESCE(MAX(CAST(NULLIF(REGEXP_REPLACE(doctor_code, '[^0-9]', '', 'g'), '') AS INT)), 0) AS max_num
       FROM referral_doctors WHERE tenant_id = $1`,
      [tenantId]
    );
    const maxNum = Number(result.rows[0]?.max_num ?? 0);
    const next = Math.max(maxNum + 1, 1);
    return `DOC-${String(next).padStart(3, "0")}`;
  },

  async quickAdd(
    tenantId: string,
    input: { name: string; mobile?: string | null; clinicName?: string | null }
  ): Promise<ReferralDoctor> {
    ensurePg();
    const id = randomUUID();
    const doctorCode = await this.nextDoctorCode(tenantId);
    const inserted = await db.query(
      `INSERT INTO referral_doctors
       (id, tenant_id, doctor_code, name, clinic_name, specialty, phone, is_active, usage_count)
       VALUES ($1,$2,$3,$4,$5,'General',$6,TRUE,0)
       RETURNING *`,
      [id, tenantId, doctorCode, input.name.trim(), input.clinicName?.trim() ?? null, input.mobile?.trim() ?? null]
    );
    return mapRow(inserted.rows[0]);
  },

  async recordUsage(tenantId: string, doctorId: string | null): Promise<void> {
    if (!doctorId) return;
    ensurePg();
    await db.query(
      `UPDATE referral_doctors SET usage_count = usage_count + 1, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, doctorId]
    );
  }
};
