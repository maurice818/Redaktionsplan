import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./harness";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t?.close();
});

describe("Migrationen", () => {
  it("laufen vollständig durch und legen die Basiskonfiguration an", async () => {
    const templates = await t.sql<{ key: string }>("select key from public.package_templates order by sort_order");
    expect(templates.map((r) => r.key)).toEqual(["membership_plus", "membership_professional", "venue_circle"]);
    const rules = await t.sql<{ n: number }>("select count(*)::int as n from public.format_rules");
    expect(rules[0].n).toBeGreaterThan(10);
    const forms = await t.sql<{ n: number }>("select count(*)::int as n from public.material_forms where is_default");
    expect(forms[0].n).toBe(1);
  });

  it("aktiviert RLS auf allen Tabellen im Schema public", async () => {
    const rows = await t.sql<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows).toEqual([]);
  });

  it("gibt anon keinerlei Tabellenrechte", async () => {
    const rows = await t.sql<{ table_name: string }>(
      `select table_name from information_schema.role_table_grants
        where grantee = 'anon' and table_schema = 'public'`,
    );
    expect(rows).toEqual([]);
  });

  it("erlaubt anon nur die öffentlichen Kundenfunktionen", async () => {
    const rows = await t.sql<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute')
        order by 1`,
    );
    expect(rows.every((r) => r.proname.startsWith("public_"))).toBe(true);
    expect(rows.length).toBe(7);
  });

  it("sperrt Hintergrundfunktionen für angemeldete Nutzer", async () => {
    const rows = await t.sql<{ ok: boolean }>(
      `select has_function_privilege('authenticated', 'public.claim_due_publish_jobs(uuid, integer)', 'execute') as ok`,
    );
    expect(rows[0].ok).toBe(false);
    const secrets = await t.sql<{ ok: boolean }>(
      `select has_table_privilege('authenticated', 'public.platform_credentials', 'select') as ok`,
    );
    expect(secrets[0].ok).toBe(false);
  });
});
