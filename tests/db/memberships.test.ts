import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./harness";

const PLUS = "00000000-0000-4000-8000-000000000101";
const PROFESSIONAL = "00000000-0000-4000-8000-000000000102";
const CIRCLE = "00000000-0000-4000-8000-000000000103";

let t: TestDb;
let admin: string;
let redaktion: string;
let mitarbeit: string;

beforeAll(async () => {
  t = await createTestDb();
  admin = await t.createUser("admin");
  redaktion = await t.createUser("redaktion");
  mitarbeit = await t.createUser("mitarbeit");
});

afterAll(async () => {
  await t?.close();
});

async function newClient(name: string) {
  const [row] = await t.as<{ id: string }>(
    { role: "authenticated", userId: redaktion },
    "insert into public.clients (name) values ($1) returning id",
    [name],
  );
  return row.id;
}

async function book(clientId: string, template: string, start: string, end: string) {
  const [row] = await t.as<{ id: string }>(
    { role: "authenticated", userId: redaktion },
    "select public.book_membership($1, $2, $3::date, $4::date) as id",
    [clientId, template, start, end],
  );
  return row.id;
}

describe("Membership buchen", () => {
  it("Professional erzeugt 4 Artikel und 4 abgeleitete Social-Beiträge je Vertragsjahr", async () => {
    const client = await newClient("Hotel A");
    const contract = await book(client, PROFESSIONAL, "2026-01-01", "2026-12-31");
    const rows = await t.sql<{ content_kind: string; unit_no: number; unit_count: number; parent: string | null }>(
      `select content_kind, unit_no, unit_count, parent_deliverable_id as parent
         from public.deliverables where contract_id = $1 order by content_kind, unit_no`,
      [contract],
    );
    const articles = rows.filter((r) => r.content_kind === "magazinartikel");
    const socials = rows.filter((r) => r.content_kind === "social");
    expect(articles).toHaveLength(4);
    expect(articles.map((a) => a.unit_no)).toEqual([1, 2, 3, 4]);
    expect(articles.every((a) => a.unit_count === 4)).toBe(true);
    expect(socials).toHaveLength(4);
    expect(socials.every((s) => s.parent !== null)).toBe(true);
  });

  it("Plus erzeugt genau 1 Artikel und 1 abgeleiteten Social-Beitrag", async () => {
    const client = await newClient("Location B");
    const contract = await book(client, PLUS, "2026-03-01", "2027-02-28");
    const rows = await t.sql<{ content_kind: string }>(
      "select content_kind from public.deliverables where contract_id = $1",
      [contract],
    );
    expect(rows.map((r) => r.content_kind).sort()).toEqual(["magazinartikel", "social"]);
  });

  it("Venue Circle erzeugt keine Redaktionseinheiten, aber eine Leistung ohne Stückzahl", async () => {
    const client = await newClient("Kongress C");
    const contract = await book(client, CIRCLE, "2026-01-01", "2026-12-31");
    const rows = await t.sql<{ content_kind: string | null; unit_no: number | null; title: string }>(
      "select content_kind, unit_no, title from public.deliverables where contract_id = $1",
      [contract],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].content_kind).toBeNull();
    expect(rows[0].unit_no).toBeNull();
    expect(rows[0].title).toBe("Circle-Leistungen");
  });

  it("legt bei zwei Jahren Laufzeit zwei Vertragsjahre mit eigenen Leistungen an", async () => {
    const client = await newClient("Hotel D");
    const contract = await book(client, PLUS, "2026-05-15", "2028-05-14");
    const years = await t.sql<{ year_no: number; start_date: string; end_date: string }>(
      "select year_no, start_date::text, end_date::text from public.contract_years where contract_id = $1 order by year_no",
      [contract],
    );
    expect(years).toEqual([
      { year_no: 1, start_date: "2026-05-15", end_date: "2027-05-14" },
      { year_no: 2, start_date: "2027-05-15", end_date: "2028-05-14" },
    ]);
    const count = await t.sql<{ n: number }>(
      "select count(*)::int as n from public.deliverables where contract_id = $1",
      [contract],
    );
    expect(count[0].n).toBe(4);
  });

  it("Vorlagenänderungen verändern gebuchte Verträge nicht rückwirkend", async () => {
    const client = await newClient("Hotel E");
    const contract = await book(client, PLUS, "2026-01-01", "2026-12-31");
    await t.as({ role: "authenticated", userId: admin },
      "update public.package_template_items set quantity = 3 where id = '00000000-0000-4000-8000-000000000201'");
    const [snap] = await t.sql<{ qty: number; revision: number }>(
      `select (package_snapshot -> 'items' -> 0 ->> 'quantity')::int as qty, package_revision as revision
         from public.contracts where id = $1`,
      [contract],
    );
    expect(snap.qty).toBe(1);
    const [tpl] = await t.sql<{ revision: number }>("select revision from public.package_templates where id = $1", [PLUS]);
    expect(tpl.revision).toBeGreaterThan(snap.revision);
    // Verlängerung nutzt weiterhin den gebuchten Stand
    await t.as({ role: "authenticated", userId: redaktion }, "select public.add_contract_year($1)", [contract]);
    const [cnt] = await t.sql<{ n: number }>(
      "select count(*)::int as n from public.deliverables where contract_id = $1 and content_kind = 'magazinartikel'",
      [contract],
    );
    expect(cnt.n).toBe(2);
    await t.as({ role: "authenticated", userId: admin },
      "update public.package_template_items set quantity = 1 where id = '00000000-0000-4000-8000-000000000201'");
  });

  it("der gebuchte Snapshot ist unveränderlich", async () => {
    const client = await newClient("Hotel F");
    const contract = await book(client, PLUS, "2026-01-01", "2026-12-31");
    await expect(
      t.as({ role: "authenticated", userId: admin }, "update public.contracts set package_snapshot = '{}' where id = $1", [contract]),
    ).rejects.toThrow(/unveränderlich/);
  });

  it("Zusatzbuchung und Korrektur erfordern eine Begründung und werden protokolliert", async () => {
    const client = await newClient("Hotel G");
    const contract = await book(client, CIRCLE, "2026-01-01", "2026-12-31");
    await expect(
      t.as({ role: "authenticated", userId: redaktion },
        "select public.add_deliverable($1, $2, null, '00000000-0000-4000-8000-000000000011', 'Extra', 1, 'zusatzbuchung', '')",
        [client, contract]),
    ).rejects.toThrow(/Begründung/);
    await t.as({ role: "authenticated", userId: redaktion },
      "select public.add_deliverable($1, $2, null, '00000000-0000-4000-8000-000000000011', 'Extra-Newsletter', 2, 'zusatzbuchung', 'Vereinbart am Telefon')",
      [client, contract]);
    const extra = await t.sql<{ id: string }>(
      "select id from public.deliverables where contract_id = $1 and source = 'zusatzbuchung' order by unit_no",
      [contract],
    );
    expect(extra).toHaveLength(2);
    await t.as({ role: "authenticated", userId: redaktion },
      "select public.correct_deliverable($1, 'entfallen', null, null, null, null, null, 'Kunde verzichtet', 'Absprache vom 01.09.')",
      [extra[1].id]);
    const [log] = await t.sql<{ reason: string }>(
      "select reason from public.audit_log where entity_type = 'deliverables' and entity_id = $1 and action = 'update' order by id desc limit 1",
      [extra[1].id],
    );
    expect(log.reason).toBe("Absprache vom 01.09.");
  });
});

describe("Berechtigungen", () => {
  it("Mitarbeit sieht Kunden nur über zugewiesene Akten", async () => {
    const client = await newClient("Privat-Kunde");
    const before = await t.as<{ id: string }>({ role: "authenticated", userId: mitarbeit },
      "select id from public.clients where id = $1", [client]);
    expect(before).toHaveLength(0);

    const [d] = await t.as<{ id: string }>({ role: "authenticated", userId: redaktion },
      "insert into public.dossiers (title, kind, client_id) values ('Akte', 'kunde', $1) returning id", [client]);
    await t.as({ role: "authenticated", userId: redaktion },
      "insert into public.tasks (title, assignee_id, dossier_id) values ('Text schreiben', $1, $2)", [mitarbeit, d.id]);

    const after = await t.as<{ id: string }>({ role: "authenticated", userId: mitarbeit },
      "select id from public.clients where id = $1", [client]);
    expect(after).toHaveLength(1);
    const dossiers = await t.as<{ id: string }>({ role: "authenticated", userId: mitarbeit },
      "select id from public.dossiers");
    expect(dossiers.map((x) => x.id)).toEqual([d.id]);
  });

  it("Mitarbeit darf keine Kunden anlegen und keine Memberships buchen", async () => {
    await expect(
      t.as({ role: "authenticated", userId: mitarbeit }, "insert into public.clients (name) values ('X')"),
    ).rejects.toThrow();
    const client = await newClient("Hotel H");
    await expect(
      t.as({ role: "authenticated", userId: mitarbeit },
        "select public.book_membership($1, $2, '2026-01-01', '2026-12-31')", [client, PLUS]),
    ).rejects.toThrow(/Berechtigung/);
  });

  it("inaktive Nutzer haben keinen Zugriff", async () => {
    const inactive = await t.createUser("redaktion");
    await t.sql("update public.profiles set is_active = false where id = $1", [inactive]);
    const rows = await t.as({ role: "authenticated", userId: inactive }, "select id from public.clients");
    expect(rows).toHaveLength(0);
  });

  it("anon kann keine Tabellen lesen", async () => {
    await expect(t.as({ role: "anon" }, "select id from public.clients")).rejects.toThrow(/permission denied/);
    await expect(t.as({ role: "anon" }, "select id from public.previews")).rejects.toThrow(/permission denied/);
  });

  it("Nutzer können ihre eigene Rolle nicht ändern und der letzte Admin bleibt erhalten", async () => {
    await expect(
      t.as({ role: "authenticated", userId: redaktion }, "update public.profiles set role = 'admin' where id = $1", [redaktion]),
    ).rejects.toThrow(/Nur Admins/);
    await expect(
      t.as({ role: "authenticated", userId: admin }, "update public.profiles set role = 'redaktion' where id = $1", [admin]),
    ).rejects.toThrow(/letzte aktive Admin/);
  });

  it("das Audit-Log ist unveränderlich", async () => {
    await expect(t.sql("delete from public.audit_log")).rejects.toThrow(/unveränderlich/);
  });
});
