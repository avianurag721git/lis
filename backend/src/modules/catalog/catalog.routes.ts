import { Router } from "express";
import { authenticate } from "../../common/middleware/auth.middleware";
import { attachUserPermissions, requirePermission } from "../../common/middleware/permission.middleware";
import { requireTenant } from "../../common/middleware/tenant.middleware";
import { validate } from "../../common/middleware/validate.middleware";
import {
  assignParameterToTest,
  createDepartment,
  createParameter,
  createParameterForTest,
  createTest,
  getParameterDetail,
  getTestStudio,
  listAllParameters,
  listDepartments,
  listParametersForTest,
  listRangesForParameter,
  listTestsForDepartment,
  previewFormula,
  replaceRangesForParameter,
  saveParameterStudio,
  unassignParameterFromTest
} from "./catalog.controller";
import {
  assignParameterSchema,
  createDepartmentSchema,
  createParameterForTestSchema,
  createParameterSchema,
  createTestSchema,
  departmentIdParams,
  parameterIdParams,
  previewFormulaSchema,
  replaceRangesSchema,
  saveParameterStudioSchema,
  testIdParams
} from "./catalog.validation";

const catalogRouter = Router();
const authed = [authenticate, attachUserPermissions, requireTenant] as const;
const settings = requirePermission("SETTINGS_MANAGE");

catalogRouter.get("/departments", ...authed, settings, listDepartments);
catalogRouter.post("/departments", ...authed, settings, validate(createDepartmentSchema), createDepartment);
catalogRouter.get("/departments/:departmentId/tests", ...authed, settings, validate(departmentIdParams), listTestsForDepartment);
catalogRouter.post(
  "/departments/:departmentId/tests",
  ...authed,
  settings,
  validate(departmentIdParams),
  validate(createTestSchema),
  createTest
);

catalogRouter.get("/parameters", ...authed, settings, listAllParameters);
catalogRouter.post("/parameters", ...authed, settings, validate(createParameterSchema), createParameter);

catalogRouter.get("/tests/:testId/studio", ...authed, settings, validate(testIdParams), getTestStudio);
catalogRouter.post(
  "/tests/:testId/parameters/studio",
  ...authed,
  settings,
  validate(testIdParams),
  validate(createParameterForTestSchema),
  createParameterForTest
);

catalogRouter.get("/parameters/:parameterId/detail", ...authed, settings, validate(parameterIdParams), getParameterDetail);
catalogRouter.put(
  "/parameters/:parameterId/studio",
  ...authed,
  settings,
  validate(parameterIdParams),
  validate(saveParameterStudioSchema),
  saveParameterStudio
);
catalogRouter.post(
  "/parameters/preview-formula",
  ...authed,
  settings,
  validate(previewFormulaSchema),
  previewFormula
);

catalogRouter.get("/tests/:testId/parameters", ...authed, settings, validate(testIdParams), listParametersForTest);
catalogRouter.post(
  "/tests/:testId/parameters",
  ...authed,
  settings,
  validate(testIdParams),
  validate(assignParameterSchema),
  assignParameterToTest
);
catalogRouter.delete(
  "/tests/:testId/parameters/:parameterId",
  ...authed,
  settings,
  validate(testIdParams),
  validate(parameterIdParams),
  unassignParameterFromTest
);
catalogRouter.get("/parameters/:parameterId/ranges", ...authed, settings, validate(parameterIdParams), listRangesForParameter);
catalogRouter.put(
  "/parameters/:parameterId/ranges",
  ...authed,
  settings,
  validate(parameterIdParams),
  validate(replaceRangesSchema),
  replaceRangesForParameter
);

export { catalogRouter };

