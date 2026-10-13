import { z } from "zod";
import { SUBSCRIPTION_PLANS, SUBSCRIPTION_STATUSES } from "../saas/saas.types";

export const createTenantAdminSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(120),
    subdomain: z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/),
    plan: z.enum(SUBSCRIPTION_PLANS).default("STARTER"),
    customDomain: z.string().trim().max(253).nullable().optional()
  })
});

export const updateTenantAdminSchema = z.object({
  params: z.object({ tenantId: z.string().min(1) }),
  body: z.object({
    plan: z.enum(SUBSCRIPTION_PLANS).optional(),
    subscriptionStatus: z.enum(SUBSCRIPTION_STATUSES).optional(),
    enabledModules: z.array(z.string()).optional(),
    suspend: z.boolean().optional()
  })
});

export const onboardSchema = z.object({
  body: z.object({
    labName: z.string().trim().min(2).max(120),
    subdomain: z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/),
    plan: z.enum(SUBSCRIPTION_PLANS).default("STARTER"),
    adminName: z.string().trim().min(2).max(120),
    adminEmail: z.string().trim().email(),
    adminPassword: z.string().min(8).max(128),
    labAddress: z.string().trim().max(500).optional(),
    nablRegNo: z.string().trim().max(80).optional(),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional()
  })
});

export const publicBrandingSchema = z.object({
  params: z.object({ subdomain: z.string().min(1) })
});
