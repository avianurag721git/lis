import fs from "fs";
import path from "path";
import type { User, Permission, UserRole } from "./auth.types";
import { logger } from "../../common/logger/logger";
import { env } from "../../config/env";
import { db } from "../../database/postgres";

const STORE_PATH = path.join(process.cwd(), ".data", "auth-users.json");

type PersistedAuthStore = {
  version: 1;
  users: User[];
};

const isValidUser = (u: unknown): u is User => {
  if (!u || typeof u !== "object") return false;
  const row = u as User;
  return (
    typeof row.id === "string" &&
    typeof row.tenantId === "string" &&
    typeof row.email === "string" &&
    typeof row.passwordHash === "string"
  );
};

export const loadPersistedAuthUsersFromFile = (): User[] => {
  try {
    if (!fs.existsSync(STORE_PATH)) return [];
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as PersistedAuthStore;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.users)) return [];
    return parsed.users.filter(isValidUser);
  } catch (err) {
    logger.warn({ err }, "Failed to load persisted auth users; starting empty");
    return [];
  }
};

/** @deprecated Prefer loadPersistedAuthUsersFromFile + hydrateAuthUsersFromDatabase */
export const loadPersistedAuthUsers = (): User[] => loadPersistedAuthUsersFromFile();

export const persistAuthUsersToFile = (users: Iterable<User>): void => {
  try {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const payload: PersistedAuthStore = {
      version: 1,
      users: [...users]
    };
    fs.writeFileSync(STORE_PATH, JSON.stringify(payload, null, 2), "utf8");
  } catch (err) {
    logger.warn({ err }, "Failed to persist auth users to file");
  }
};

/** @deprecated Prefer persistAuthUsersDurable */
export const persistAuthUsers = (users: Iterable<User>): void => {
  persistAuthUsersToFile(users);
  void persistAuthUsersToDatabase([...users]).catch((err) => {
    logger.warn({ err }, "Failed to persist auth users to database");
  });
};

const rowToUser = (row: Record<string, unknown>): User => {
  const perms = Array.isArray(row.custom_permissions)
    ? (row.custom_permissions as Permission[])
    : typeof row.custom_permissions === "string"
      ? (JSON.parse(row.custom_permissions) as Permission[])
      : [];
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    role: row.role as UserRole,
    customPermissions: perms,
    refreshTokenHash: row.refresh_token_hash ? String(row.refresh_token_hash) : null,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at ?? new Date().toISOString())
  };
};

export const loadAuthUsersFromDatabase = async (): Promise<User[]> => {
  if (!env.databaseUrl) return [];
  try {
    const result = await db.query(
      `SELECT id, tenant_id, name, email, password_hash, role, custom_permissions, refresh_token_hash, created_at
       FROM auth_users`
    );
    return result.rows.map((row) => rowToUser(row as Record<string, unknown>));
  } catch (err) {
    logger.warn({ err }, "Failed to load auth_users from database");
    return [];
  }
};

export const persistAuthUsersToDatabase = async (users: User[]): Promise<void> => {
  if (!env.databaseUrl || users.length === 0) return;
  await db.transaction(async (client) => {
    for (const user of users) {
      await client.query(
        `INSERT INTO auth_users (
           id, tenant_id, name, email, password_hash, role, custom_permissions, refresh_token_hash, created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::timestamptz,NOW())
         ON CONFLICT (id) DO UPDATE SET
           tenant_id = EXCLUDED.tenant_id,
           name = EXCLUDED.name,
           email = EXCLUDED.email,
           password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           custom_permissions = EXCLUDED.custom_permissions,
           refresh_token_hash = EXCLUDED.refresh_token_hash,
           updated_at = NOW()`,
        [
          user.id,
          user.tenantId,
          user.name,
          user.email.toLowerCase(),
          user.passwordHash,
          user.role,
          JSON.stringify(user.customPermissions ?? []),
          user.refreshTokenHash,
          user.createdAt
        ]
      );
    }
  });
};

export const upsertAuthUserInDatabase = async (user: User): Promise<void> => {
  if (!env.databaseUrl) return;
  await db.query(
    `INSERT INTO auth_users (
       id, tenant_id, name, email, password_hash, role, custom_permissions, refresh_token_hash, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::timestamptz,NOW())
     ON CONFLICT (id) DO UPDATE SET
       tenant_id = EXCLUDED.tenant_id,
       name = EXCLUDED.name,
       email = EXCLUDED.email,
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role,
       custom_permissions = EXCLUDED.custom_permissions,
       refresh_token_hash = EXCLUDED.refresh_token_hash,
       updated_at = NOW()`,
    [
      user.id,
      user.tenantId,
      user.name,
      user.email.toLowerCase(),
      user.passwordHash,
      user.role,
      JSON.stringify(user.customPermissions ?? []),
      user.refreshTokenHash,
      user.createdAt
    ]
  );
};

/**
 * Prefer Postgres when configured. If the table is empty, migrate from the JSON file once.
 * Returns the authoritative user list to hydrate the in-memory cache.
 */
export const hydrateAuthUsersFromDatabase = async (): Promise<User[]> => {
  if (!env.databaseUrl) {
    return loadPersistedAuthUsersFromFile();
  }

  let dbUsers = await loadAuthUsersFromDatabase();
  if (dbUsers.length === 0) {
    const fileUsers = loadPersistedAuthUsersFromFile();
    if (fileUsers.length > 0) {
      try {
        await persistAuthUsersToDatabase(fileUsers);
        logger.info({ count: fileUsers.length }, "Migrated auth users from JSON file to Postgres");
        dbUsers = fileUsers;
      } catch (err) {
        logger.warn({ err }, "Auth JSON→Postgres migration failed; using file users");
        return fileUsers;
      }
    }
  } else {
    // Keep file as cold backup for disaster recovery
    persistAuthUsersToFile(dbUsers);
  }

  return dbUsers;
};

/** Durable write: Postgres primary (when available) + JSON backup. */
export const persistAuthUsersDurable = async (users: Iterable<User>): Promise<void> => {
  const list = [...users];
  persistAuthUsersToFile(list);
  try {
    await persistAuthUsersToDatabase(list);
  } catch (err) {
    logger.warn({ err }, "Failed to persist auth users to database");
  }
};
