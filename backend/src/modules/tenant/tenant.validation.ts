import { z } from "zod";

export const createTenantSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(120),
    subdomain: z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/),
    configuration: z.object({
      brandingName: z.string().trim().min(2).max(120),
      logoUrl: z.string().trim().url().nullable(),
      reportTemplate: z.enum(["STANDARD", "DETAILED"])
    })
  })
});

export const updateTenantConfigSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(120).optional(),
    brandingName: z.string().trim().min(1).max(120).optional(),
    logoUrl: z.union([z.string().trim().url(), z.literal(""), z.null()]).optional(),
    reportTemplate: z.enum(["STANDARD", "DETAILED"]).optional(),
    branding: z
      .object({
        logoUrl: z.union([z.string().trim().url(), z.literal(""), z.null()]).optional(),
        primaryColor: z.string().trim().min(4).max(32).optional(),
        secondaryColor: z.string().trim().min(4).max(32).optional(),
        labHeaderAddress: z.string().trim().max(500).optional(),
        nablRegNo: z.string().trim().max(80).optional()
      })
      .optional(),
    settings: z
      .object({
        maxUsers: z.number().int().min(1).max(10000).optional(),
        maxBranches: z.number().int().min(1).max(1000).optional(),
        enabledModules: z.array(z.string().trim().min(1)).optional()
      })
      .optional(),
    finance: z
      .object({
        defaultGstPercent: z.number().min(0).max(40).optional(),
        labGstin: z.string().trim().max(32).optional(),
        currencyCode: z.string().trim().min(3).max(3).optional(),
        invoicePrefix: z.string().trim().min(1).max(16).optional(),
        placeOfSupply: z.string().trim().max(80).optional()
      })
      .optional()
  })
});
