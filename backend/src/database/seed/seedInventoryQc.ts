import { randomUUID } from "crypto";
import { db } from "../postgres";
import { seedLog } from "./seedLogger";
import { INSTRUMENT_SYSMEX_ID, REAGENT_ROCHE_ID, REAGENT_SYSMEX_ID, CONTROL_VALUES } from "./productionSeed.constants";

const CONTROL_VALUES_LOCAL = CONTROL_VALUES;

export const seedProductionInventoryQc = async (tenantId: string, techUserId: string): Promise<void> => {
  seedLog.header("Reagent Inventory & QC L-J Charts");

  await db.query(
    `INSERT INTO reagents
     (id, tenant_id, name, lot_number, expiry_date, vial_capacity, remaining_tests, reorder_level, instrument_code, is_active)
     VALUES ($1,$2,'Sysmex Cellpack Diluent','LOT-98412','2027-12-31',500,420,100,'SYSMEX-XN550',TRUE)`,
    [REAGENT_SYSMEX_ID, tenantId]
  );
  await db.query(
    `INSERT INTO reagents
     (id, tenant_id, name, lot_number, expiry_date, vial_capacity, remaining_tests, reorder_level, instrument_code, is_active)
     VALUES ($1,$2,'Roche Cobas Creatinine Enzymatic','LOT-77120','2026-09-15',200,45,100,'ROCHE-COBAS',TRUE)`,
    [REAGENT_ROCHE_ID, tenantId]
  );
  seedLog.step("Sysmex Cellpack Diluent", "LOT-98412 · 420 tests remaining");
  seedLog.step("Roche Cobas Creatinine", "LOT-77120 · 45 tests · LOW STOCK WARNING");

  await db.query(
    `INSERT INTO lab_instruments (id, tenant_id, code, name, status, last_calibration_at)
     VALUES ($1,$2,'SYSMEX-XN550','Sysmex XN-550 Hematology Analyzer','IN_CALIBRATION',NOW())
     ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name`,
    [INSTRUMENT_SYSMEX_ID, tenantId]
  );

  const targetMean = 14.0;
  const targetSd = 0.3;
  let runCount = 0;

  for (let i = 0; i < CONTROL_VALUES_LOCAL.length; i++) {
    const observed = CONTROL_VALUES_LOCAL[i]!;
    const zScore = (observed - targetMean) / targetSd;
    let status: "PASSED" | "WARNING" | "REJECTED" = "PASSED";
    let violatedRule: string | null = null;
    let westgardFlags: string[] = [];

    if (i === 13) {
      status = "WARNING";
      violatedRule = "1-2s";
      westgardFlags = ["1-2s"];
    } else if (i === 14) {
      status = "REJECTED";
      violatedRule = "1-3s";
      westgardFlags = ["1-3s"];
    }

    const runDate = new Date();
    runDate.setDate(runDate.getDate() - (14 - i));

    await db.query(
      `INSERT INTO control_sample_results
       (id, tenant_id, reagent_id, instrument_code, control_level, parameter_name, target_mean, target_sd,
        observed_value, run_date, z_score, westgard_flags, is_reject, status, violated_rule, created_by_user_id)
       VALUES ($1,$2,$3,'SYSMEX-XN550','LEVEL_1_NORMAL','Hemoglobin',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        randomUUID(),
        tenantId,
        REAGENT_SYSMEX_ID,
        targetMean,
        targetSd,
        observed,
        runDate.toISOString(),
        zScore,
        westgardFlags,
        status === "REJECTED",
        status,
        violatedRule,
        techUserId
      ]
    );
    runCount += 1;
  }

  seedLog.step("QC control runs", "15 daily runs · Westgard 1-2s WARNING · 1-3s REJECTED");
  seedLog.count("ReagentBatch", 2);
  seedLog.count("ControlSampleRun", runCount);
};
