import { z } from "zod";

export const departmentIdParams = z.object({
  params: z.object({
    departmentId: z.string().uuid()
  })
});

export const testIdParams = z.object({
  params: z.object({
    testId: z.string().uuid()
  })
});

export const parameterIdParams = z.object({
  params: z.object({
    parameterId: z.string().uuid()
  })
});

export const createDepartmentSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(80)
  })
});

export const createTestSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(120),
    code: z.string().max(30).optional().nullable()
  })
});

export const createParameterSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(120),
    unit: z.string().max(40).optional().nullable(),
    valueType: z.enum(["NUMERIC", "TEXT"]).optional(),
    inputType: z.enum(["NUMERIC", "DROPDOWN", "TEXT", "FORMULA"]).optional(),
    formula: z.string().max(500).optional().nullable(),
    formulaAlias: z.string().max(80).optional().nullable(),
    dropdownOptions: z.array(z.string().max(80)).optional(),
    criticalLow: z.number().nullable().optional(),
    criticalHigh: z.number().nullable().optional(),
    methodology: z.string().max(200).optional().nullable(),
    analyzerCode: z.string().max(80).optional().nullable()
  })
});

const rangeRuleBody = z.object({
  gender: z.enum(["ALL", "MALE", "FEMALE", "OTHER"]),
  ageMin: z.number().min(0).max(120).nullable(),
  ageMax: z.number().min(0).max(120).nullable(),
  normalMin: z.number().nullable(),
  normalMax: z.number().nullable()
});

export const createParameterForTestSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(120),
    unit: z.string().max(40).optional().nullable(),
    inputType: z.enum(["NUMERIC", "DROPDOWN", "TEXT", "FORMULA"]).optional(),
    formula: z.string().max(500).optional().nullable(),
    formulaAlias: z.string().max(80).optional().nullable(),
    dropdownOptions: z.array(z.string().max(80)).optional(),
    criticalLow: z.number().nullable().optional(),
    criticalHigh: z.number().nullable().optional(),
    methodology: z.string().max(200).optional().nullable(),
    analyzerCode: z.string().max(80).optional().nullable(),
    sortIndex: z.number().int().min(0).max(1000).optional(),
    ranges: z.array(rangeRuleBody).optional()
  })
});

export const saveParameterStudioSchema = z.object({
  body: z.object({
    parameter: z
      .object({
        name: z.string().min(1).max(120).optional(),
        unit: z.string().max(40).nullable().optional(),
        inputType: z.enum(["NUMERIC", "DROPDOWN", "TEXT", "FORMULA"]).optional(),
        formula: z.string().max(500).nullable().optional(),
        formulaAlias: z.string().max(80).nullable().optional(),
        dropdownOptions: z.array(z.string().max(80)).optional(),
        criticalLow: z.number().nullable().optional(),
        criticalHigh: z.number().nullable().optional(),
        methodology: z.string().max(200).nullable().optional(),
        analyzerCode: z.string().max(80).nullable().optional()
      })
      .optional(),
    ranges: z.array(rangeRuleBody).optional()
  })
});

export const previewFormulaSchema = z.object({
  body: z.object({
    formula: z.string().min(1).max(500),
    values: z.record(z.number())
  })
});

export const assignParameterSchema = z.object({
  body: z.object({
    parameterId: z.string().uuid(),
    sortIndex: z.number().int().min(0).max(1000).optional()
  })
});

export const replaceRangesSchema = z.object({
  body: z.object({
    rules: z
      .array(
        z.object({
          gender: z.enum(["ALL", "MALE", "FEMALE", "OTHER"]),
          ageMin: z.number().min(0).max(120).nullable(),
          ageMax: z.number().min(0).max(120).nullable(),
          normalMin: z.number().nullable(),
          normalMax: z.number().nullable()
        })
      )
      .min(0)
  })
});

