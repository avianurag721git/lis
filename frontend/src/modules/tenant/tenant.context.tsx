import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { httpClient } from "../../services/http";
import { env } from "../../utils/env";
import { useAuth } from "../auth/auth.context";
import { normalizeRole } from "../auth/permissions";
import { tenantService } from "./tenant.service";
import {
  FeatureKey,
  PublicTenantBranding,
  TenantBootstrapResponse,
  TenantBranding,
  TenantConfig,
  TenantSaas,
  applyBrandingCssVars,
  defaultBranding,
  parseReportLayout,
  resolveSubdomain
} from "./tenant.types";

type TenantContextValue = {
  tenantId: string | null;
  config: TenantConfig | null;
  saas: TenantSaas | null;
  branding: TenantBranding;
  hasFeature: (key: FeatureKey) => boolean;
  hasModule: (module: string) => boolean;
  setTenantId: (tenantId: string) => void;
  refreshConfig: () => Promise<void>;
};

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

type Props = { children: React.ReactNode };

export const TenantProvider = ({ children }: Props): JSX.Element => {
  const { isAuthenticated, user } = useAuth();
  const [tenantId, setTenantIdState] = useState<string | null>(tenantService.getTenantId());

  // Lab users belong to exactly one tenant; undo any stale switch so headers match their token.
  useEffect(() => {
    if (!user?.tenantId || normalizeRole(user.role) === "SUPER_ADMIN") return;
    if (tenantService.getTenantId() !== user.tenantId) {
      tenantService.setTenantId(user.tenantId);
      setTenantIdState(user.tenantId);
    }
  }, [user]);
  const [config, setConfig] = useState<TenantConfig | null>(null);
  const [saas, setSaas] = useState<TenantSaas | null>(null);
  const [publicBranding, setPublicBranding] = useState<TenantBranding | null>(null);

  const loadPublicBranding = useCallback(async (): Promise<void> => {
    const sub = resolveSubdomain();
    if (!sub) return;
    try {
      const { data } = await axios.get<PublicTenantBranding>(`${env.apiUrl}/saas-admin/branding/${sub}`);
      setPublicBranding(data.branding);
      if (data.tenantId && !tenantService.getTenantId()) {
        tenantService.setTenantId(data.tenantId);
        setTenantIdState(data.tenantId);
      }
    } catch {
      /* subdomain not mapped — use defaults */
    }
  }, []);

  const refreshConfig = useCallback(async (): Promise<void> => {
    if (!tenantId || !isAuthenticated) {
      if (publicBranding) {
        applyBrandingCssVars(publicBranding);
      }
      return;
    }
    const { data } = await httpClient.get<TenantBootstrapResponse>("/tenants/config");
    setConfig(data.configuration);
    setSaas(data.saas);
    const branding = data.configuration.branding ?? publicBranding ?? defaultBranding();
    applyBrandingCssVars(branding);
  }, [tenantId, isAuthenticated, publicBranding]);

  useEffect(() => {
    void loadPublicBranding();
  }, [loadPublicBranding]);

  useEffect(() => {
    void refreshConfig();
  }, [refreshConfig]);

  const branding = useMemo(() => {
    const raw = config?.branding ?? publicBranding ?? defaultBranding();
    return {
      ...defaultBranding(),
      ...raw,
      reportLayout: parseReportLayout(raw.reportLayout)
    };
  }, [config, publicBranding]);

  useEffect(() => {
    applyBrandingCssVars(branding);
  }, [branding]);

  const hasFeature = useCallback(
    (key: FeatureKey): boolean => {
      if (!saas) return true;
      return Boolean(saas.features[key]);
    },
    [saas]
  );

  const hasModule = useCallback(
    (module: string): boolean => {
      const modules = config?.settings?.enabledModules;
      if (!modules?.length) return true;
      return modules.includes(module);
    },
    [config]
  );

  const value = useMemo<TenantContextValue>(
    () => ({
      tenantId,
      config,
      saas,
      branding,
      hasFeature,
      hasModule,
      setTenantId(nextTenantId: string) {
        tenantService.setTenantId(nextTenantId);
        setTenantIdState(nextTenantId);
      },
      refreshConfig
    }),
    [tenantId, config, saas, branding, hasFeature, hasModule, refreshConfig]
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
};

export const useTenant = (): TenantContextValue => {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error("useTenant must be used within TenantProvider");
  }
  return context;
};
