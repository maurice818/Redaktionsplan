import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");
const migrationsDir = join(root, "supabase", "migrations");

export type Role = "anon" | "authenticated" | "service_role";

export interface TestDb {
  db: PGlite;
  /** Führt eine Abfrage als angegebene Rolle bzw. angegebener Nutzer aus (wie PostgREST). */
  as<T = Record<string, unknown>>(
    who: { role: Role; userId?: string | null },
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
  /** Superuser-Abfrage (Testaufbau). */
  sql<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  createUser(role: "admin" | "redaktion" | "freigabe" | "mitarbeit", name?: string): Promise<string>;
  close(): Promise<void>;
}

export function listMigrations(): string[] {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

export async function createTestDb(): Promise<TestDb> {
  const db = new PGlite();
  await db.exec(readFileSync(join(__dirname, "supabase-shim.sql"), "utf8"));
  for (const file of listMigrations()) {
    const content = readFileSync(join(migrationsDir, file), "utf8");
    try {
      await db.exec(content);
    } catch (error) {
      throw new Error(`Migration ${file} fehlgeschlagen: ${(error as Error).message}`);
    }
  }

  const sql: TestDb["sql"] = async (text, params) => {
    const res = await db.query(text, params ?? []);
    return res.rows as never;
  };

  const as: TestDb["as"] = async (who, text, params) => {
    return db.transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [who.userId ?? ""]);
      await tx.query("select set_config('request.jwt.claim.role', $1, true)", [who.role]);
      await tx.exec(`set local role ${who.role}`);
      const res = await tx.query(text, params ?? []);
      return res.rows as never;
    });
  };

  let counter = 0;
  const createUser: TestDb["createUser"] = async (role, name) => {
    counter += 1;
    const email = `${role}${counter}@test.local`;
    const [{ id }] = await sql<{ id: string }>(
      "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
      [email, JSON.stringify({ full_name: name ?? `${role} ${counter}` })],
    );
    await sql("update public.profiles set role = $2, is_active = true where id = $1", [id, role]);
    return id;
  };

  return { db, as, sql, createUser, close: () => db.close() };
}
