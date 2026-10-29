import { randomUUID } from "crypto";
import { db } from "../../database/postgres";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  hashIdentifier,
  maskNationalId
} from "../../common/crypto/phiEncryption";
import { AgeUnit, ageResolveErrorCode, coerceIsoDate, resolvePatientAge } from "../../common/age/patientAge";
import { NationalIdType, Patient, PatientGender, UpsertPatientInput } from "./patients.types";

const ensurePg = (): void => {
  if (!env.databaseUrl) {
    throw new AppError("Database not configured", HTTP_STATUS.INTERNAL_SERVER_ERROR, "DB_NOT_CONFIGURED");
  }
};

const isoDate = (value: Date | string | null | undefined): string | null => coerceIsoDate(value);

const resolveAgeOrThrow = (input: {
  dateOfBirth?: string | null;
  ageValue?: number | null;
  ageUnit?: AgeUnit | null;
  ageYears?: number | null;
}) => {
  try {
    return resolvePatientAge(input);
  } catch (err) {
    const code = ageResolveErrorCode(err);
    throw new AppError((err as Error).message || "Invalid age", HTTP_STATUS.BAD_REQUEST, code ?? "INVALID_AGE");
  }
};

const mapRow = (
  r: {
    id: string;
    patient_code: string;
    uhid: string | null;
    name: string;
    phone: string | null;
    gender: string | null;
    date_of_birth?: Date | string | null;
    age_value?: number | null;
    age_unit?: string | null;
    age_days?: number | null;
    age_years: number | null;
    national_id_encrypted?: string | null;
    national_id_type?: string | null;
    created_at: Date;
    updated_at: Date;
  },
  opts?: { revealNationalId?: boolean }
): Patient => {
  let nationalIdMasked: string | null = null;
  let nationalId: string | null | undefined = undefined;
  if (r.national_id_encrypted) {
    try {
      const plain = aesGcmDecrypt(r.national_id_encrypted);
      nationalIdMasked = maskNationalId(plain);
      if (opts?.revealNationalId) nationalId = plain;
    } catch {
      nationalIdMasked = "****";
    }
  }
  const liveAge = (() => {
    try {
      return resolvePatientAge({
        dateOfBirth: isoDate(r.date_of_birth),
        ageValue: r.age_value ?? null,
        ageUnit: (r.age_unit as AgeUnit | null) ?? null,
        ageYears: r.age_years
      });
    } catch {
      return resolvePatientAge({ ageYears: r.age_years });
    }
  })();
  const patient: Patient = {
    id: r.id,
    patientCode: r.patient_code,
    uhid: r.uhid ?? r.patient_code,
    name: r.name,
    phone: r.phone,
    gender: (r.gender as PatientGender | null) ?? null,
    dateOfBirth: liveAge.dateOfBirth,
    ageValue: liveAge.ageValue,
    ageUnit: liveAge.ageUnit,
    ageDays: liveAge.ageDays,
    ageYears: liveAge.ageYears,
    ageDisplay: liveAge.ageDisplay,
    ageCompact: liveAge.ageCompact,
    nationalIdMasked,
    nationalIdType: (r.national_id_type as NationalIdType | null) ?? null,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString()
  };
  if (opts?.revealNationalId) {
    patient.nationalId = nationalId ?? null;
  }
  return patient;
};

const nextUhid = async (tenantId: string): Promise<string> => {
  const result = await db.query(`SELECT COUNT(*)::int AS c FROM patients WHERE tenant_id = $1`, [tenantId]);
  const count = (result.rows[0]?.c as number | undefined) ?? 0;
  const seq = String(count + 1).padStart(6, "0");
  return `UHID-${seq}`;
};

const selectCols = `id, patient_code, COALESCE(uhid, patient_code) AS uhid, name, phone, gender,
  date_of_birth, age_value, age_unit, age_days, age_years,
  national_id_encrypted, national_id_type, created_at, updated_at`;

export const patientsRepository = {
  async list(tenantId: string, q?: string): Promise<Patient[]> {
    ensurePg();
    const query = q?.trim() ? `%${q.trim()}%` : null;
    const result = await db.query(
      query
        ? `SELECT ${selectCols}
           FROM patients
           WHERE tenant_id = $1 AND (
             patient_code ILIKE $2 OR COALESCE(uhid, '') ILIKE $2 OR name ILIKE $2 OR COALESCE(phone, '') ILIKE $2
           )
           ORDER BY updated_at DESC
           LIMIT 200`
        : `SELECT ${selectCols}
           FROM patients
           WHERE tenant_id = $1
           ORDER BY updated_at DESC
           LIMIT 200`,
      query ? [tenantId, query] : [tenantId]
    );
    return result.rows.map((r) => mapRow(r));
  },

  async getById(tenantId: string, id: string, revealNationalId = false): Promise<Patient | null> {
    ensurePg();
    const result = await db.query(
      `SELECT ${selectCols} FROM patients WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, id]
    );
    const row = result.rows[0];
    return row ? mapRow(row, { revealNationalId }) : null;
  },

  async findByMobileOrUhid(tenantId: string, mobile?: string | null, uhid?: string | null): Promise<Patient | null> {
    ensurePg();
    if (uhid?.trim()) {
      const byUhid = await db.query(
        `SELECT ${selectCols}
         FROM patients
         WHERE tenant_id = $1 AND (uhid = $2 OR patient_code = $2)
         LIMIT 1`,
        [tenantId, uhid.trim()]
      );
      if (byUhid.rows[0]) return mapRow(byUhid.rows[0]);
    }
    if (mobile?.trim()) {
      const byPhone = await db.query(
        `SELECT ${selectCols}
         FROM patients
         WHERE tenant_id = $1 AND phone = $2
         LIMIT 1`,
        [tenantId, mobile.trim()]
      );
      if (byPhone.rows[0]) return mapRow(byPhone.rows[0]);
    }
    return null;
  },

  async createOrFind(tenantId: string, input: UpsertPatientInput): Promise<{ patient: Patient; created: boolean }> {
    ensurePg();
    const mobile = (input.mobile ?? input.phone)?.trim() || null;
    const requestedUhid = (input.uhid ?? input.patientCode)?.trim() || null;

    if (input.nationalId?.trim()) {
      const hash = hashIdentifier(input.nationalId);
      const byId = await db.query(
        `SELECT ${selectCols} FROM patients WHERE tenant_id = $1 AND national_id_hash = $2 LIMIT 1`,
        [tenantId, hash]
      );
      if (byId.rows[0]) return { patient: mapRow(byId.rows[0]), created: false };
    }

    const existing = await this.findByMobileOrUhid(tenantId, mobile, requestedUhid);
    if (existing) {
      return { patient: existing, created: false };
    }

    if (!input.name?.trim()) {
      throw new AppError("name is required for new patient registration", HTTP_STATUS.BAD_REQUEST, "NAME_REQUIRED");
    }

    const id = randomUUID();
    const uhid = requestedUhid || (await nextUhid(tenantId));
    const gender = input.gender ?? null;
    const age = resolveAgeOrThrow({
      dateOfBirth: input.dateOfBirth ?? null,
      ageValue: input.ageValue ?? null,
      ageUnit: input.ageUnit ?? null,
      ageYears: input.ageYears ?? null
    });
    const nationalPlain = input.nationalId?.trim() || null;
    const nationalEnc = nationalPlain ? aesGcmEncrypt(nationalPlain) : null;
    const nationalHash = nationalPlain ? hashIdentifier(nationalPlain) : null;
    const nationalType = nationalPlain ? (input.nationalIdType ?? "OTHER") : null;

    const result = await db.query(
      `INSERT INTO patients
       (id, tenant_id, patient_code, uhid, name, phone, gender, date_of_birth, age_value, age_unit, age_days, age_years, national_id_encrypted, national_id_hash, national_id_type)
       VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING ${selectCols}`,
      [
        id,
        tenantId,
        uhid,
        input.name.trim(),
        mobile,
        gender,
        age.dateOfBirth,
        age.ageValue,
        age.ageUnit,
        age.ageDays,
        age.ageYears,
        nationalEnc,
        nationalHash,
        nationalType
      ]
    );
    return { patient: mapRow(result.rows[0]), created: true };
  },

  async create(
    tenantId: string,
    input: {
      patientCode: string;
      name: string;
      phone?: string | null;
      gender?: PatientGender | null;
      dateOfBirth?: string | null;
      ageValue?: number | null;
      ageUnit?: AgeUnit | null;
      ageYears?: number | null;
      nationalId?: string | null;
      nationalIdType?: NationalIdType | null;
    }
  ): Promise<Patient> {
    const upsert: UpsertPatientInput = {
      patientCode: input.patientCode,
      uhid: input.patientCode,
      name: input.name,
      phone: input.phone ?? null
    };
    if (input.gender !== undefined) upsert.gender = input.gender;
    if (input.dateOfBirth !== undefined) upsert.dateOfBirth = input.dateOfBirth;
    if (input.ageValue !== undefined) upsert.ageValue = input.ageValue;
    if (input.ageUnit !== undefined) upsert.ageUnit = input.ageUnit;
    if (input.ageYears !== undefined) upsert.ageYears = input.ageYears;
    if (input.nationalId !== undefined) upsert.nationalId = input.nationalId;
    if (input.nationalIdType !== undefined) upsert.nationalIdType = input.nationalIdType;
    const { patient } = await this.createOrFind(tenantId, upsert);
    return patient;
  },

  async update(
    tenantId: string,
    id: string,
    patch: {
      patientCode?: string;
      name?: string;
      phone?: string | null;
      gender?: PatientGender | null;
      dateOfBirth?: string | null;
      ageValue?: number | null;
      ageUnit?: AgeUnit | null;
      ageYears?: number | null;
      nationalId?: string | null;
      nationalIdType?: NationalIdType | null;
    }
  ): Promise<Patient> {
    ensurePg();
    const existing = await db.query(
      `SELECT id, patient_code, uhid, name, phone, gender, date_of_birth, age_value, age_unit, age_days, age_years,
              national_id_encrypted, national_id_hash, national_id_type, created_at, updated_at
       FROM patients WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, id]
    );
    const row = existing.rows[0] as any;
    if (!row) {
      throw new AppError("Patient not found", HTTP_STATUS.NOT_FOUND, "PATIENT_NOT_FOUND");
    }

    const nextPatientCode = patch.patientCode != null ? patch.patientCode.trim() : (row.patient_code as string);
    const nextName = patch.name != null ? patch.name.trim() : (row.name as string);
    const nextPhone =
      patch.phone !== undefined ? (patch.phone?.trim() ? patch.phone.trim() : null) : (row.phone as string | null);
    const nextGender = patch.gender !== undefined ? patch.gender : (row.gender as PatientGender | null);
    const ageTouched =
      patch.dateOfBirth !== undefined ||
      patch.ageValue !== undefined ||
      patch.ageUnit !== undefined ||
      patch.ageYears !== undefined;
    const nextAge = ageTouched
      ? resolveAgeOrThrow({
          dateOfBirth: patch.dateOfBirth !== undefined ? patch.dateOfBirth : isoDate(row.date_of_birth),
          ageValue: patch.ageValue !== undefined ? patch.ageValue : (row.age_value as number | null),
          ageUnit: patch.ageUnit !== undefined ? patch.ageUnit : ((row.age_unit as AgeUnit | null) ?? null),
          ageYears: patch.ageYears !== undefined ? patch.ageYears : (row.age_years as number | null)
        })
      : resolvePatientAge({
          dateOfBirth: isoDate(row.date_of_birth),
          ageValue: row.age_value,
          ageUnit: row.age_unit,
          ageYears: row.age_years
        });

    let nextEnc = row.national_id_encrypted as string | null;
    let nextHash = row.national_id_hash as string | null;
    let nextType = row.national_id_type as string | null;
    if (patch.nationalId !== undefined) {
      if (patch.nationalId?.trim()) {
        const plain = patch.nationalId.trim();
        nextEnc = aesGcmEncrypt(plain);
        nextHash = hashIdentifier(plain);
        nextType = patch.nationalIdType ?? nextType ?? "OTHER";
      } else {
        nextEnc = null;
        nextHash = null;
        nextType = null;
      }
    }

    const updated = await db.query(
      `UPDATE patients
       SET patient_code = $3, uhid = COALESCE(uhid, $3), name = $4, phone = $5, gender = $6,
           date_of_birth = $7, age_value = $8, age_unit = $9, age_days = $10, age_years = $11,
           national_id_encrypted = $12, national_id_hash = $13, national_id_type = $14, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2
       RETURNING ${selectCols}`,
      [
        tenantId,
        id,
        nextPatientCode,
        nextName,
        nextPhone,
        nextGender,
        nextAge.dateOfBirth,
        nextAge.ageValue,
        nextAge.ageUnit,
        nextAge.ageDays,
        nextAge.ageYears,
        nextEnc,
        nextHash,
        nextType
      ]
    );
    return mapRow(updated.rows[0]);
  }
};
