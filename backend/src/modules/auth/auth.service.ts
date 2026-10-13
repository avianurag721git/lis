import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { StringValue } from "ms";
import { AppError } from "../../common/errors/AppError";
import { HTTP_STATUS } from "../../common/constants/httpStatus";
import { logger } from "../../common/logger/logger";
import { env } from "../../config/env";
import { tokenBlacklist } from "../../common/security/tokenBlacklist";
import { runQaDatabaseSeed } from "../../database/qaSeed";
import { JwtPayload, PublicUser, RegisterRole, User, UserRole } from "./auth.types";
import {
  normalizeRole,
  Permission,
  resolveEffectivePermissions,
  ROLE_DEFAULT_PERMISSIONS,
  LabUserRole
} from "./permissions";
import {
  hydrateAuthUsersFromDatabase,
  loadPersistedAuthUsersFromFile,
  persistAuthUsersToFile,
  upsertAuthUserInDatabase
} from "./auth.userStore";

type RegisterInput = {
  tenantId: string;
  name: string;
  email: string;
  password: string;
  role: RegisterRole;
};

type LoginInput = {
  tenantId: string;
  email: string;
  password: string;
};

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: string;
};

type AuthResult = AuthTokens & {
  user: PublicUser;
};

type AccessClaims = JwtPayload & { jti: string; exp?: number };
type RefreshClaims = JwtPayload & { jti: string; typ: "refresh"; exp?: number };

const users = new Map<string, User>();
const usersByEmailAndTenant = new Map<string, string>();
const emailTenantKey = (tenantId: string, email: string): string => `${tenantId}:${email.toLowerCase()}`;

const rememberUser = (user: User): void => {
  users.set(user.id, user);
  usersByEmailAndTenant.set(emailTenantKey(user.tenantId, user.email), user.id);
  // Sync JSON backup; durable Postgres write is best-effort async
  persistAuthUsersToFile(users.values());
  void upsertAuthUserInDatabase(user).catch((err) => {
    logger.warn({ err, userId: user.id }, "Failed to upsert auth user in Postgres");
  });
};

/** Cold-start from JSON until `initAuthUserCache()` hydrates from Postgres. */
for (const user of loadPersistedAuthUsersFromFile()) {
  users.set(user.id, user);
  usersByEmailAndTenant.set(emailTenantKey(user.tenantId, user.email), user.id);
}
if (users.size > 0) {
  logger.info({ count: users.size }, "Loaded persisted auth users (file)");
}

/**
 * Replace in-memory cache with Postgres (migrating JSON → PG when the table is empty).
 * Call after `ensureLabOpsSchema()` so `auth_users` exists.
 */
export const initAuthUserCache = async (): Promise<void> => {
  const hydrated = await hydrateAuthUsersFromDatabase();
  users.clear();
  usersByEmailAndTenant.clear();
  for (const user of hydrated) {
    users.set(user.id, user);
    usersByEmailAndTenant.set(emailTenantKey(user.tenantId, user.email), user.id);
  }
  if (hydrated.length > 0) {
    logger.info({ count: hydrated.length }, "Auth user cache hydrated from durable store");
  }
};

const toPublicUser = (user: User): PublicUser => {
  const effectivePermissions = resolveEffectivePermissions(user);
  return {
    id: user.id,
    tenantId: user.tenantId,
    name: user.name,
    email: user.email,
    role: user.role,
    customPermissions: user.customPermissions,
    effectivePermissions,
    createdAt: user.createdAt
  };
};

const defaultPermissionsForRole = (role: RegisterRole | UserRole): Permission[] => {
  const labRole = normalizeRole(role);
  return [...ROLE_DEFAULT_PERMISSIONS[labRole]];
};

const issueTokens = (payload: JwtPayload): AuthTokens => {
  const accessJti = randomUUID();
  const refreshJti = randomUUID();
  const accessToken = jwt.sign({ ...payload, jti: accessJti }, env.jwtAccessSecret, {
    expiresIn: env.jwtAccessExpiresIn as StringValue
  });
  const refreshToken = jwt.sign({ ...payload, jti: refreshJti, typ: "refresh" }, env.jwtRefreshSecret, {
    expiresIn: env.jwtRefreshExpiresIn as StringValue
  });

  return { accessToken, refreshToken, accessExpiresIn: env.jwtAccessExpiresIn };
};

const hashRefreshToken = async (refreshToken: string): Promise<string> => bcrypt.hash(refreshToken, 10);

const getUserByEmail = (tenantId: string, email: string): User | undefined => {
  const userId = usersByEmailAndTenant.get(emailTenantKey(tenantId, email));
  return userId ? users.get(userId) : undefined;
};

export const getUserIdByEmail = (tenantId: string, email: string): string | undefined =>
  getUserByEmail(tenantId, email)?.id;

const getUserById = (id: string): User | undefined => users.get(id);

export { getUserById };

export const registerUser = async (input: RegisterInput): Promise<AuthResult> => {
  const normalizedEmail = input.email.toLowerCase();
  if (getUserByEmail(input.tenantId, normalizedEmail)) {
    throw new AppError("Email already in use", HTTP_STATUS.CONFLICT, "EMAIL_EXISTS");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user: User = {
    id: randomUUID(),
    tenantId: input.tenantId,
    name: input.name.trim(),
    email: normalizedEmail,
    passwordHash,
    role: input.role,
    customPermissions: defaultPermissionsForRole(input.role),
    refreshTokenHash: null,
    createdAt: new Date().toISOString()
  };

  const effectivePermissions = resolveEffectivePermissions(user);
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
    permissions: effectivePermissions
  };
  const tokens = issueTokens(payload);
  user.refreshTokenHash = await hashRefreshToken(tokens.refreshToken);
  rememberUser(user);

  return { user: toPublicUser(user), ...tokens };
};

export const loginUser = async (input: LoginInput): Promise<AuthResult> => {
  const user = getUserByEmail(input.tenantId, input.email);
  if (!user) {
    throw new AppError("Invalid credentials", HTTP_STATUS.UNAUTHORIZED, "INVALID_CREDENTIALS");
  }

  const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordMatches) {
    throw new AppError("Invalid credentials", HTTP_STATUS.UNAUTHORIZED, "INVALID_CREDENTIALS");
  }

  const effectivePermissions = resolveEffectivePermissions(user);
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
    permissions: effectivePermissions
  };
  const tokens = issueTokens(payload);
  user.refreshTokenHash = await hashRefreshToken(tokens.refreshToken);
  rememberUser(user);

  return { user: toPublicUser(user), ...tokens };
};

export const refreshAccessToken = async (refreshToken: string): Promise<AuthTokens> => {
  let decoded: RefreshClaims;
  try {
    decoded = jwt.verify(refreshToken, env.jwtRefreshSecret) as RefreshClaims;
  } catch {
    throw new AppError("Invalid refresh token", HTTP_STATUS.UNAUTHORIZED, "INVALID_REFRESH_TOKEN");
  }

  if (decoded.jti && (await tokenBlacklist.isRevoked(decoded.jti))) {
    throw new AppError("Refresh token revoked", HTTP_STATUS.UNAUTHORIZED, "REFRESH_TOKEN_REVOKED");
  }
  if (await tokenBlacklist.isRevoked(tokenBlacklist.hashToken(refreshToken))) {
    throw new AppError("Refresh token revoked", HTTP_STATUS.UNAUTHORIZED, "REFRESH_TOKEN_REVOKED");
  }

  const user = getUserById(decoded.sub);
  if (!user || !user.refreshTokenHash) {
    throw new AppError("Refresh token not recognized", HTTP_STATUS.UNAUTHORIZED, "REFRESH_TOKEN_REVOKED");
  }

  const refreshMatches = await bcrypt.compare(refreshToken, user.refreshTokenHash);
  if (!refreshMatches) {
    throw new AppError("Refresh token mismatch", HTTP_STATUS.UNAUTHORIZED, "REFRESH_TOKEN_MISMATCH");
  }

  // Rotate: blacklist previous refresh jti
  if (decoded.jti && decoded.exp) {
    await tokenBlacklist.revoke(decoded.jti, decoded.exp);
  }

  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
    permissions: resolveEffectivePermissions(user)
  };
  const tokens = issueTokens(payload);
  user.refreshTokenHash = await hashRefreshToken(tokens.refreshToken);
  rememberUser(user);
  return tokens;
};

export const logoutUser = async (
  userId: string,
  opts?: { accessToken?: string | null; refreshToken?: string | null }
): Promise<void> => {
  const user = getUserById(userId);
  if (user) {
    user.refreshTokenHash = null;
    rememberUser(user);
  }

  if (opts?.accessToken) {
    try {
      const decoded = jwt.decode(opts.accessToken) as AccessClaims | null;
      if (decoded?.jti && decoded.exp) {
        await tokenBlacklist.revoke(decoded.jti, decoded.exp);
      }
    } catch {
      /* ignore */
    }
  }

  if (opts?.refreshToken) {
    try {
      const decoded = jwt.decode(opts.refreshToken) as RefreshClaims | null;
      if (decoded?.jti && decoded.exp) {
        await tokenBlacklist.revoke(decoded.jti, decoded.exp);
      } else {
        const hash = tokenBlacklist.hashToken(opts.refreshToken);
        await tokenBlacklist.revoke(hash, Math.floor(Date.now() / 1000) + 7 * 24 * 3600);
      }
    } catch {
      /* ignore */
    }
  }
};

export const assertAccessTokenNotRevoked = async (token: string): Promise<JwtPayload> => {
  const decoded = jwt.verify(token, env.jwtAccessSecret) as AccessClaims;
  if (decoded.jti && (await tokenBlacklist.isRevoked(decoded.jti))) {
    throw new AppError("Token revoked", HTTP_STATUS.UNAUTHORIZED, "TOKEN_REVOKED");
  }
  return decoded;
};

/** Seed platform SUPER_ADMIN for SaaS management portal (dev/Docker only). */
export const seedSuperAdminIfEnabled = async (): Promise<void> => {
  if (!env.authSeedDemoUser) return;
  const email = "superadmin@platform.local".toLowerCase();
  const tenantId = "platform";
  if (getUserByEmail(tenantId, email)) return;

  const passwordHash = await bcrypt.hash(env.authSeedPassword, 12);
  const user: User = {
    id: randomUUID(),
    tenantId,
    name: "Platform Super Admin",
    email,
    passwordHash,
    role: "SUPER_ADMIN",
    customPermissions: defaultPermissionsForRole("SUPER_ADMIN"),
    refreshTokenHash: null,
    createdAt: new Date().toISOString()
  };
  rememberUser(user);
  logger.info({ email, tenantId }, "SUPER_ADMIN seed ready for SaaS portal");
};

/** In-memory auth has no migration; optional seed for local/Docker login. */
export const upsertDemoUser = async (input: RegisterInput): Promise<PublicUser> => {
  return upsertSeedUser(input);
};

/** Idempotent seed user — creates or refreshes password hash for QA/production scripts. */
export const upsertSeedUser = async (input: RegisterInput): Promise<PublicUser> => {
  const normalizedEmail = input.email.toLowerCase();
  const existing = getUserByEmail(input.tenantId, normalizedEmail);
  const passwordHash = await bcrypt.hash(input.password, 12);
  if (existing) {
    existing.passwordHash = passwordHash;
    existing.name = input.name.trim();
    existing.role = input.role;
    existing.customPermissions = defaultPermissionsForRole(input.role);
    rememberUser(existing);
    return toPublicUser(existing);
  }
  const user: User = {
    id: randomUUID(),
    tenantId: input.tenantId,
    name: input.name.trim(),
    email: normalizedEmail,
    passwordHash,
    role: input.role,
    customPermissions: defaultPermissionsForRole(input.role),
    refreshTokenHash: null,
    createdAt: new Date().toISOString()
  };
  rememberUser(user);
  return toPublicUser(user);
};

export const listTenantUsers = (tenantId: string): PublicUser[] =>
  [...users.values()].filter((u) => u.tenantId === tenantId).map(toPublicUser);

export const updateUserPermissions = async (userId: string, permissions: Permission[]): Promise<PublicUser> => {
  const user = getUserById(userId);
  if (!user) {
    throw new AppError("User not found", HTTP_STATUS.NOT_FOUND, "USER_NOT_FOUND");
  }
  user.customPermissions = [...permissions];
  rememberUser(user);
  return toPublicUser(user);
};

export const loadTenantPermissionOverrides = async (tenantId: string): Promise<void> => {
  const { userPermissionsRepository } = await import("../users/userPermissions.repository");
  const map = await userPermissionsRepository.loadAllForTenant(tenantId);
  let changed = false;
  for (const [userId, permissions] of map.entries()) {
    const user = getUserById(userId);
    if (user) {
      user.customPermissions = permissions;
      users.set(userId, user);
      changed = true;
    }
  }
  if (changed) {
    persistAuthUsersToFile(users.values());
    for (const userId of map.keys()) {
      const user = getUserById(userId);
      if (user) {
        void upsertAuthUserInDatabase(user).catch((err) => {
          logger.warn({ err, userId }, "Failed to sync permission override to Postgres");
        });
      }
    }
  }
};

export const upsertSuperAdminUser = async (input: {
  email: string;
  password: string;
  name: string;
  tenantId?: string;
}): Promise<PublicUser> => {
  const tenantId = input.tenantId ?? "platform";
  const normalizedEmail = input.email.toLowerCase();
  const existing = getUserByEmail(tenantId, normalizedEmail);
  const passwordHash = await bcrypt.hash(input.password, 12);
  if (existing) {
    existing.passwordHash = passwordHash;
    existing.name = input.name.trim();
    existing.role = "SUPER_ADMIN";
    rememberUser(existing);
    return toPublicUser(existing);
  }
  const user: User = {
    id: randomUUID(),
    tenantId,
    name: input.name.trim(),
    email: normalizedEmail,
    passwordHash,
    role: "SUPER_ADMIN",
    customPermissions: defaultPermissionsForRole("SUPER_ADMIN"),
    refreshTokenHash: null,
    createdAt: new Date().toISOString()
  };
  rememberUser(user);
  return toPublicUser(user);
};

export type QaDemoUserKey = "admin" | "receptionist" | "labtech" | "pathologist" | "phlebotomist" | "b2b";

export const QA_DEMO_USERS: Array<{
  key: QaDemoUserKey;
  name: string;
  email: string;
  role: RegisterRole;
}> = [
  { key: "admin", name: "Demo Admin", email: "admin@demo.local", role: "LAB_MANAGER" },
  { key: "receptionist", name: "Demo Receptionist", email: "receptionist@demo.local", role: "RECEPTIONIST" },
  { key: "labtech", name: "QA Lab Technician", email: "labtech@demo.local", role: "LAB_TECH" },
  { key: "pathologist", name: "Dr. QA Pathologist", email: "pathologist@demo.local", role: "PATHOLOGIST" },
  { key: "phlebotomist", name: "QA Phlebotomist", email: "phlebo@demo.local", role: "PHLEBOTOMIST" },
  { key: "b2b", name: "QA B2B Franchisee", email: "b2b@demo.local", role: "B2B_FRANCHISEE" }
];

export const seedQaDemoUsers = async (tenantId: string, password: string): Promise<Record<QaDemoUserKey, string>> => {
  const ids = {} as Record<QaDemoUserKey, string>;
  for (const spec of QA_DEMO_USERS) {
    const user = await upsertDemoUser({
      tenantId,
      name: spec.name,
      email: spec.email,
      password,
      role: spec.role
    });
    ids[spec.key] = user.id;
  }
  return ids;
};

export const seedDemoAuthUserIfEnabled = async (): Promise<void> => {
  if (!env.authSeedDemoUser) {
    return;
  }
  try {
    const ids = await seedQaDemoUsers(env.authSeedTenantId, env.authSeedPassword);
    await runQaDatabaseSeed(env.authSeedTenantId, ids.pathologist);
    logger.info(
      { tenantId: env.authSeedTenantId, users: Object.keys(ids) },
      "AUTH_SEED_DEMO_USER: QA demo accounts and B2B seed ready"
    );
  } catch (err) {
    if (err instanceof AppError && err.code === "EMAIL_EXISTS") {
      logger.debug("AUTH_SEED_DEMO_USER: demo accounts already exist");
      try {
        await runQaDatabaseSeed(env.authSeedTenantId);
        logger.info({ tenantId: env.authSeedTenantId }, "AUTH_SEED_DEMO_USER: QA B2B seed refreshed");
      } catch (seedErr) {
        logger.error({ err: seedErr }, "AUTH_SEED_DEMO_USER: QA B2B seed failed");
      }
      return;
    }
    throw err;
  }
};

// silence unused import if role tree-shaken
void (null as unknown as UserRole);
