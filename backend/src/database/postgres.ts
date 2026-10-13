import { Pool, QueryResult } from "pg";
import { env } from "../config/env";

export type DbClient = {
  query: (text: string, params?: unknown[]) => Promise<QueryResult<any>>;
};

const pool = new Pool({
  connectionString: env.databaseUrl || undefined
});

export const db = {
  query(text: string, params: unknown[] = []): Promise<QueryResult<any>> {
    return pool.query(text, params);
  },
  async transaction<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
};
