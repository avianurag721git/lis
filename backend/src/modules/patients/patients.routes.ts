import { Router } from "express";
import { authenticate } from "../../common/middleware/auth.middleware";
import { attachUserPermissions, requirePermission } from "../../common/middleware/permission.middleware";
import { requireTenant } from "../../common/middleware/tenant.middleware";
import { validate } from "../../common/middleware/validate.middleware";
import {
  createOrSearchPatient,
  createPatient,
  getLongitudinalHistory,
  getPatient,
  listPatients,
  updatePatient
} from "./patients.controller";
import { createPatientSchema, listPatientsQuery, patientIdParams, updatePatientSchema } from "./patients.validation";

const patientsRouter = Router();
const authed = [authenticate, attachUserPermissions, requireTenant] as const;

patientsRouter.get("/", ...authed, requirePermission("PATIENT_MANAGE"), validate(listPatientsQuery), listPatients);
patientsRouter.get(
  "/:patientId/longitudinal-history",
  ...authed,
  requirePermission("PATIENT_MANAGE"),
  validate(patientIdParams),
  getLongitudinalHistory
);
patientsRouter.get("/:patientId", ...authed, requirePermission("PATIENT_MANAGE"), validate(patientIdParams), getPatient);
patientsRouter.post("/", ...authed, requirePermission("PATIENT_MANAGE"), validate(createPatientSchema), createOrSearchPatient);
patientsRouter.post("/register", ...authed, requirePermission("PATIENT_MANAGE"), validate(createPatientSchema), createPatient);
patientsRouter.put(
  "/:patientId",
  ...authed,
  requirePermission("PATIENT_MANAGE"),
  validate(patientIdParams),
  validate(updatePatientSchema),
  updatePatient
);

export { patientsRouter };
