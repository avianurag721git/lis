import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { authService } from "./auth.service";
import { AuthUser, LoginResponse } from "./auth.types";
import { hasPermission as checkPermission, Permission, resolveEffectivePermissions } from "./permissions";
import { tokenService } from "./token.service";
import { SESSION_EXPIRED_EVENT } from "../../services/http";

type LoginInput = {
  email: string;
  password: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** True while a stored session is being restored on page load. */
  isRestoring: boolean;
  isLoggingOut: boolean;
  hasPermission: (perm: Permission) => boolean;
  login: (payload: LoginInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const mapLoginUser = (response: LoginResponse): AuthUser => ({
  userId: response.user.id,
  tenantId: response.user.tenantId,
  email: response.user.email,
  name: response.user.name,
  role: response.user.role,
  customPermissions: response.user.customPermissions ?? [],
  effectivePermissions:
    response.user.effectivePermissions ??
    resolveEffectivePermissions({
      role: response.user.role,
      customPermissions: response.user.customPermissions ?? []
    })
});

type Props = {
  children: React.ReactNode;
};

export const AuthProvider = ({ children }: Props): JSX.Element => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isRestoring, setIsRestoring] = useState<boolean>(() => Boolean(tokenService.getAccessToken()));
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const refreshProfile = useCallback(async (): Promise<void> => {
    if (!tokenService.getAccessToken()) {
      setUser(null);
      setIsRestoring(false);
      return;
    }
    try {
      const { user: profile } = await authService.me();
      setUser({
        userId: profile.userId ?? profile.id,
        tenantId: profile.tenantId,
        email: profile.email,
        role: profile.role as any,
        customPermissions: (profile.customPermissions ?? []) as any[],
        effectivePermissions: (profile.effectivePermissions ?? []) as any[],
        ...(profile.name ? { name: profile.name } : {})
      });
    } catch {
      tokenService.clear();
      setUser(null);
    } finally {
      setIsRestoring(false);
    }
  }, []);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  useEffect(() => {
    const onSessionExpired = (): void => {
      setUser(null);
      if (window.location.pathname !== "/login") {
        window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      }
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
  }, []);

  const hasPermission = useCallback(
    (perm: Permission): boolean => {
      if (!user) return false;
      return checkPermission({ role: user.role, customPermissions: user.customPermissions }, perm);
    },
    [user]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user && tokenService.getAccessToken()),
      isRestoring,
      isLoggingOut,
      hasPermission,
      async login(payload: LoginInput) {
        const response = await authService.login(payload);
        tokenService.setTokens({
          accessToken: response.accessToken,
          ...(response.refreshToken ? { refreshToken: response.refreshToken } : {})
        });
        const mapped = mapLoginUser(response);
        setUser(mapped);
        return mapped;
      },
      async logout() {
        if (isLoggingOut) return;
        setIsLoggingOut(true);
        try {
          await authService.logout();
        } finally {
          tokenService.clear();
          setUser(null);
          setIsLoggingOut(false);
        }
      },
      refreshProfile
    }),
    [user, isRestoring, isLoggingOut, hasPermission, refreshProfile]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {isLoggingOut ? (
        <div className="logout-overlay" role="status" aria-live="polite" aria-busy="true">
          <div className="logout-overlay__card">
            <Loader2 className="spin" size={22} aria-hidden />
            <span>Signing out…</span>
          </div>
        </div>
      ) : null}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
