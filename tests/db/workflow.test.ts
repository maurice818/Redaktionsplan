import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./harness";

const PLUS = "00000000-0000-4000-8000-000000000101";

let t: TestDb;
let admin: string;
let redaktion: string;
let freigabe: string;

const R = () => ({ role: "authenticated" as const, userId: redaktion });
const F = () => ({ role: "authenticated" as const, userId: freigabe });
const ANON = { role: "anon" as const };
const SYS = { role: "service_role" as const };

function token() {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: createHash("sha256").update(raw, "utf8").digest("hex") };
}

beforeAll(async () => {
  t = await createTestDb();
  admin = await t.createUser("admin");
  redaktion = await t.createUser("redaktion");
  freigabe = await t.createUser("freigabe");
});

afterAll(async () => {
  await t?.close();
});

interface Setup {
  client: string;
  contract: string;
  dossier: string;
  article: string;
  social: string;
  articleDeliverable: string;
}

async function setup(): Promise<Setup> {
  const [c] = await t.as<{ id: string }>(R(), "insert into public.clients (name) values ('Kunde') returning id");
  const [k] = await t.as<{ id: string }>(R(),
    "select public.book_membership($1, $2, '2026-01-01', '2026-12-31') as id", [c.id, PLUS]);
  const [del] = await t.sql<{ id: string }>(
    "select id from public.deliverables where contract_id = $1 and content_kind = 'magazinartikel'", [k.id]);
  const [socialDel] = await t.sql<{ id: string }>(
    "select id from public.deliverables where contract_id = $1 and content_kind = 'social'", [k.id]);
  const [d] = await t.as<{ id: string }>(R(),
    "insert into public.dossiers (title, kind, client_id, contract_id, deliverable_id, owner_id) values ('Akte', 'kunde', $1, $2, $3, $4) returning id",
    [c.id, k.id, del.id, redaktion]);
  const [a] = await t.as<{ id: string }>(R(),
    `insert into public.content_items (dossier_id, kind, channel, deliverable_id, title, body_html)
     values ($1, 'magazinartikel', 'magazin', $2, 'Artikel', '<p>Text</p>') returning id`, [d.id, del.id]);
  const [s] = await t.as<{ id: string }>(R(),
    `insert into public.content_items (dossier_id, kind, channel, parent_id, deliverable_id, title, caption, post_format)
     values ($1, 'social', 'linkedin', $2, $3, 'LinkedIn', 'Post-Text', 'text') returning id`, [d.id, a.id, socialDel.id]);
  return { client: c.id, contract: k.id, dossier: d.id, article: a.id, social: s.id, articleDeliverable: del.id };
}

async function item(id: string) {
  const [row] = await t.sql<{
    status: string; internal_ok: boolean; client_ok: boolean; approvals_complete: boolean;
    schedule_status: string; auto_publish: boolean; requires_client_approval: boolean;
    published_url: string | null; fingerprint: string;
  }>("select * from public.content_items where id = $1", [id]);
  return row;
}

async function approveInternally(id: string) {
  await t.as(R(), "select public.request_internal_review($1)", [id]);
  await t.as(F(), "select public.decide_internal_review($1, 'freigegeben')", [id]);
}

async function sendPreview(s: Setup, ids: string[]) {
  const tk = token();
  const [p] = await t.as<{ id: string }>(R(),
    `select public.create_preview($1, $2::uuid[], 'Kundin', 'kundin@example.com', null, null, $3, null, now() + interval '7 days') as id`,
    [s.dossier, `{${ids.join(",")}}`, tk.hash]);
  return { previewId: p.id, token: tk.raw };
}

async function customerDecides(tok: string, decisions: { item_id: string; decision: string; comment?: string }[]) {
  const [res] = await t.as<{ r: Record<string, unknown> }>(ANON,
    "select public.public_submit_preview_decisions($1, $2::jsonb, 'Kundin Beispiel', 'kundin@example.com', 'Marketing', true) as r",
    [tok, JSON.stringify(decisions)]);
  return res.r;
}

async function previewItems(tok: string) {
  const [res] = await t.as<{ r: { items: { id: string; kind: string; version_no: number }[]; error?: string } }>(ANON,
    "select public.public_get_preview($1) as r", [tok]);
  return res.r;
}

describe("Interne Prüfung", () => {
  it("nur Freigabe/Leitung darf intern freigeben", async () => {
    const s = await setup();
    await t.as(R(), "select public.request_internal_review($1)", [s.article]);
    await expect(t.as(R(), "select public.decide_internal_review($1, 'freigegeben')", [s.article]))
      .rejects.toThrow(/Nur Freigabe/);
    await t.as(F(), "select public.decide_internal_review($1, 'freigegeben')", [s.article]);
    const a = await item(s.article);
    expect(a.status).toBe("intern_freigegeben");
    expect(a.internal_ok).toBe(true);
    expect(a.approvals_complete).toBe(false); // Kundenfreigabe fehlt
  });

  it("Status „Freigegeben“ lässt sich nicht ohne gültige Freigaben setzen", async () => {
    const s = await setup();
    // direkt über die API: gar nicht
    await expect(t.as(R(), "update public.content_items set status = 'freigegeben' where id = $1", [s.article]))
      .rejects.toThrow(/ergibt sich aus Prüfung/);
    // auch intern (ohne API-Sperre) nur mit gültigen Freigaben
    await expect(t.sql("update public.content_items set status = 'freigegeben' where id = $1", [s.article]))
      .rejects.toThrow(/Freigaben/);
  });

  it("Freigabefelder lassen sich nicht direkt setzen; fremde Freigaben zählen nicht", async () => {
    const s = await setup();
    await approveInternally(s.article);
    const [appr] = await t.sql<{ id: string }>(
      "select id from public.approvals where content_item_id = $1 and kind = 'intern'", [s.article]);
    await expect(t.as(R(), "update public.content_items set internal_approval_id = $2 where id = $1", [s.social, appr.id]))
      .rejects.toThrow(/nur über den Ablauf/);
    await expect(t.as(R(), "update public.content_items set requires_client_approval = false where id = $1", [s.article]))
      .rejects.toThrow(/nur über den Ablauf/);
    await expect(t.as(R(), "update public.content_items set published_url = 'https://x.example' where id = $1", [s.article]))
      .rejects.toThrow(/nur über den Ablauf/);
    // Selbst wenn eine fremde Freigabe eingetragen würde, gilt sie nicht für diesen Inhalt
    await t.sql("update public.content_items set internal_approval_id = $2 where id = $1", [s.social, appr.id]);
    expect((await item(s.social)).internal_ok).toBe(false);
  });

  it("interne Änderungswünsche heben eine frühere interne Freigabe auf", async () => {
    const s = await setup();
    await approveInternally(s.article);
    expect((await item(s.article)).internal_ok).toBe(true);
    await t.as(F(), "select public.decide_internal_review($1, 'aenderung_gewuenscht', 'Bitte kürzen')", [s.article]);
    const a = await item(s.article);
    expect(a.internal_ok).toBe(false);
    expect(a.status).toBe("entwurf");
    await expect(sendPreview(s, [s.article])).rejects.toThrow(/nicht intern freigegeben/);
  });

  it("eigene Beiträge benötigen keine Kundenfreigabe", async () => {
    const [d] = await t.as<{ id: string }>(R(),
      "insert into public.dossiers (title, kind) values ('SUMMIT', 'eigen') returning id");
    const [c] = await t.as<{ id: string }>(R(),
      "insert into public.content_items (dossier_id, kind, channel, title, caption, post_format) values ($1, 'social', 'instagram', 'Post', 'Text', 'feed_bild') returning id",
      [d.id]);
    expect((await item(c.id)).requires_client_approval).toBe(false);
    await approveInternally(c.id);
    const row = await item(c.id);
    expect(row.status).toBe("freigegeben");
    expect(row.approvals_complete).toBe(true);
  });
});

describe("Kundenvorschau und Freigabe", () => {
  it("Vorschau nur mit interner Freigabe; Kunde sieht nur die zugesandten Fassungen", async () => {
    const s = await setup();
    await expect(sendPreview(s, [s.article])).rejects.toThrow(/nicht intern freigegeben/);
    await approveInternally(s.article);
    const { token: tok } = await sendPreview(s, [s.article]);
    const data = await previewItems(tok);
    expect(data.items).toHaveLength(1);
    expect(data.items[0].kind).toBe("magazinartikel");
    expect((await item(s.article)).status).toBe("beim_kunden");
  });

  it("ungültige, widerrufene und abgelaufene Links werden abgewiesen", async () => {
    const s = await setup();
    await approveInternally(s.article);
    expect((await previewItems("falsch")).error).toBe("ungueltig");
    const { previewId, token: tok } = await sendPreview(s, [s.article]);
    await t.as(R(), "select public.revoke_preview($1)", [previewId]);
    expect((await previewItems(tok)).error).toBe("widerrufen");

    await approveInternally(s.social);
    const second = await sendPreview(s, [s.social]);
    await t.sql("update public.previews set expires_at = now() - interval '1 minute' where id = $1", [second.previewId]);
    expect((await previewItems(second.token)).error).toBe("abgelaufen");
  });

  it("Freigabe gilt getrennt je Inhalt und speichert Identität, Zeitpunkt und Version", async () => {
    const s = await setup();
    await approveInternally(s.article);
    await approveInternally(s.social);
    const { token: tok } = await sendPreview(s, [s.article, s.social]);
    const data = await previewItems(tok);
    const articleItem = data.items.find((i) => i.kind === "magazinartikel")!;
    const socialItem = data.items.find((i) => i.kind === "social")!;

    const res = await customerDecides(tok, [
      { item_id: articleItem.id, decision: "freigegeben" },
      { item_id: socialItem.id, decision: "aenderung_gewuenscht", comment: "Bitte Hashtags ergänzen" },
    ]);
    expect(res.ok).toBe(true);

    expect((await item(s.article)).status).toBe("freigegeben");
    expect((await item(s.social)).status).toBe("aenderung_gewuenscht");

    const approvals = await t.sql<{ kind: string; decision: string; approver_email: string; version_no: number }>(
      `select a.kind, a.decision, a.approver_email, v.version_no
         from public.approvals a join public.content_versions v on v.id = a.content_version_id
        where a.content_item_id = $1 and a.kind = 'kunde'`, [s.article]);
    expect(approvals).toEqual([{ kind: "kunde", decision: "freigegeben", approver_email: "kundin@example.com", version_no: 1 }]);

    const tasks = await t.sql<{ task_type: string }>(
      "select task_type from public.tasks where content_item_id = $1 and status = 'offen'", [s.social]);
    expect(tasks.map((x) => x.task_type)).toContain("aenderungen");

    // Doppelte Absendung ist folgenlos
    const again = await customerDecides(tok, [{ item_id: articleItem.id, decision: "freigegeben" }]);
    expect(again.decided).toBe(0);
  });

  it("Änderung nach Freigabe macht die Freigabe ungültig und stoppt die verbindliche Planung", async () => {
    const s = await setup();
    await approveInternally(s.article);
    const { token: tok } = await sendPreview(s, [s.article]);
    const [it1] = (await previewItems(tok)).items;
    await customerDecides(tok, [{ item_id: it1.id, decision: "freigegeben" }]);

    const future = new Date(Date.now() + 3 * 86400_000).toISOString();
    await expect(t.as(R(), "select public.schedule_content($1, 'verbindlich', $2::timestamptz)", [s.article, future]))
      .rejects.toThrow(/Freigabe\/Leitung/);
    await t.as(F(), "select public.schedule_content($1, 'verbindlich', $2::timestamptz)", [s.article, future]);
    expect((await item(s.article)).schedule_status).toBe("verbindlich");
    const [job] = await t.sql<{ status: string; method: string }>(
      "select status, method from public.publish_jobs where content_item_id = $1", [s.article]);
    expect(job).toEqual({ status: "manuell_offen", method: "manuell" }); // Magazin: keine Schnittstelle

    // Nachträgliche inhaltliche Änderung
    await t.as(R(), "update public.content_items set body_html = '<p>Neuer Text</p>' where id = $1", [s.article]);
    const after = await item(s.article);
    expect(after.status).toBe("entwurf");
    expect(after.client_ok).toBe(false);
    expect(after.approvals_complete).toBe(false);
    expect(after.schedule_status).toBe("vorlaeufig");
    const [jobAfter] = await t.sql<{ status: string }>(
      "select status from public.publish_jobs where content_item_id = $1", [s.article]);
    expect(jobAfter.status).toBe("abgebrochen");
    const [log] = await t.sql<{ n: number }>(
      "select count(*)::int as n from public.audit_log where entity_id = $1 and action = 'freigabe_ungueltig'", [s.article]);
    expect(log.n).toBe(1);
  });

  it("nicht inhaltliche Änderungen (z. B. Zuständigkeit) lassen die Freigabe bestehen", async () => {
    const s = await setup();
    await approveInternally(s.article);
    const { token: tok } = await sendPreview(s, [s.article]);
    const [it1] = (await previewItems(tok)).items;
    await customerDecides(tok, [{ item_id: it1.id, decision: "freigegeben" }]);
    await t.as(R(), "update public.content_items set assignee_id = $2, notes = 'intern' where id = $1", [s.article, admin]);
    expect((await item(s.article)).status).toBe("freigegeben");
  });

  it("Freigabe einer veralteten Version gilt nicht für die aktuelle Fassung", async () => {
    const s = await setup();
    await approveInternally(s.article);
    const { token: tok } = await sendPreview(s, [s.article]);
    await t.as(R(), "update public.content_items set teaser = 'geändert' where id = $1", [s.article]);
    const [it1] = (await previewItems(tok)).items;
    await customerDecides(tok, [{ item_id: it1.id, decision: "freigegeben" }]);
    const a = await item(s.article);
    expect(a.client_ok).toBe(false);
    expect(a.status).toBe("entwurf");
  });

  it("Änderungswunsch in einer späteren Runde hebt die Kundenfreigabe auf und stoppt die Planung", async () => {
    const s = await setup();
    await approveInternally(s.article);
    const first = await sendPreview(s, [s.article]);
    await customerDecides(first.token, [{ item_id: (await previewItems(first.token)).items[0].id, decision: "freigegeben" }]);
    await t.as(F(), "select public.schedule_content($1, 'verbindlich', $2::timestamptz)", [s.article, new Date(Date.now() + 86400_000).toISOString()]);
    expect((await item(s.article)).approvals_complete).toBe(true);

    const second = await sendPreview(s, [s.article]);
    await customerDecides(second.token, [{ item_id: (await previewItems(second.token)).items[0].id, decision: "aenderung_gewuenscht", comment: "Doch lieber anders" }]);
    const a = await item(s.article);
    expect(a.status).toBe("aenderung_gewuenscht");
    expect(a.client_ok).toBe(false);
    expect(a.approvals_complete).toBe(false);
    expect(a.schedule_status).toBe("vorlaeufig");
    const active = await t.sql<{ n: number }>(
      "select count(*)::int as n from public.publish_jobs where content_item_id = $1 and status <> 'abgebrochen'", [s.article]);
    expect(active[0].n).toBe(0);
  });

  it("ersetzte oder widerrufene Vorschau lässt nicht erneut gesendete Inhalte nicht „beim Kunden“ hängen", async () => {
    const s = await setup();
    await approveInternally(s.article);
    await approveInternally(s.social);
    await sendPreview(s, [s.article, s.social]);
    const second = await sendPreview(s, [s.social]);
    expect((await item(s.article)).status).toBe("intern_freigegeben");
    expect((await item(s.social)).status).toBe("beim_kunden");
    await t.as(R(), "select public.revoke_preview($1)", [second.previewId]);
    expect((await item(s.social)).status).toBe("intern_freigegeben");
  });
});

describe("Materialformular", () => {
  it("zwischenspeichern, Pflichtfelder prüfen, einreichen", async () => {
    const s = await setup();
    const tk = token();
    const [req] = await t.as<{ id: string }>(R(),
      `insert into public.material_requests (dossier_id, client_id, form_snapshot, recipient_email, token_hash, expires_at)
       select $1, $2, jsonb_build_object('name', name, 'fields', fields), 'kunde@example.com', $3, now() + interval '7 days'
         from public.material_forms where is_default returning id`,
      [s.dossier, s.client, tk.hash]);

    const [open] = await t.as<{ r: { request: { editable: boolean; fields: unknown[] } } }>(ANON,
      "select public.public_get_material_request($1) as r", [tk.raw]);
    expect(open.r.request.editable).toBe(true);
    expect(open.r.request.fields.length).toBeGreaterThan(10);

    const [draft] = await t.as<{ r: { ok: boolean } }>(ANON,
      "select public.public_save_material_response($1, $2::jsonb, false, '', '') as r", [tk.raw, JSON.stringify({ thema: "Tagung" })]);
    expect(draft.r.ok).toBe(true);

    const [missing] = await t.as<{ r: { error: string; missing: string[] } }>(ANON,
      "select public.public_save_material_response($1, $2::jsonb, true, 'Max', 'max@example.com') as r",
      [tk.raw, JSON.stringify({ thema: "Tagung" })]);
    expect(missing.r.error).toBe("pflichtfelder");
    expect(missing.r.missing).toContain("Gewünschte Kernaussage");

    const answers = {
      unternehmen: "Kunde", ansprechpartner: "Max", thema: "Tagung", aussage: "Wir sind toll",
      fakten: ["a", "b", "c"], bildrechte: "Eigene Fotos",
    };
    const [ok] = await t.as<{ r: { ok: boolean; submitted: boolean } }>(ANON,
      "select public.public_save_material_response($1, $2::jsonb, true, 'Max', 'max@example.com') as r",
      [tk.raw, JSON.stringify(answers)]);
    expect(ok.r.submitted).toBe(true);

    const [state] = await t.sql<{ status: string }>("select status from public.material_requests where id = $1", [req.id]);
    expect(state.status).toBe("eingereicht");
    const tasks = await t.sql<{ task_type: string; assignee_id: string }>(
      "select task_type, assignee_id from public.tasks where dossier_id = $1 and task_type = 'material_pruefen'", [s.dossier]);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].assignee_id).toBe(redaktion);
    const notes = await t.sql<{ n: number }>(
      "select count(*)::int as n from public.notifications where recipient_id = $1 and kind = 'material_eingegangen'", [redaktion]);
    expect(notes[0].n).toBe(1);

    // Nach dem Einreichen gesperrt
    const [locked] = await t.as<{ r: { error: string } }>(ANON,
      "select public.public_save_material_response($1, '{}'::jsonb, false, '', '') as r", [tk.raw]);
    expect(locked.r.error).toBe("bereits_eingereicht");
  });

  it("Kunden-Uploads nur im eigenen Pfad", async () => {
    const s = await setup();
    const tk = token();
    const [req] = await t.as<{ id: string }>(R(),
      `insert into public.material_requests (dossier_id, client_id, form_snapshot, token_hash, expires_at)
       values ($1, $2, '{"fields":[]}', $3, now() + interval '7 days') returning id`, [s.dossier, s.client, tk.hash]);
    const [bad] = await t.as<{ r: { error: string } }>(ANON,
      "select public.public_register_material_file($1, 'material/andere-id/x.jpg', 'x.jpg', 'image/jpeg', 100) as r", [tk.raw]);
    expect(bad.r.error).toBe("ungueltiger_pfad");
    const [good] = await t.as<{ r: { ok: boolean } }>(ANON,
      "select public.public_register_material_file($1, $2, 'x.jpg', 'image/jpeg', 100) as r", [tk.raw, `material/${req.id}/a.jpg`]);
    expect(good.r.ok).toBe(true);
  });

  it("Rückfrage-Aufgabe schließt sich bei erneuter Einreichung", async () => {
    const s = await setup();
    const tk = token();
    const [req] = await t.as<{ id: string }>(R(),
      `insert into public.material_requests (dossier_id, client_id, form_snapshot, token_hash, expires_at)
       values ($1, $2, '{"fields":[]}', $3, now() + interval '7 days') returning id`, [s.dossier, s.client, tk.hash]);
    const submit = () => t.as(ANON, "select public.public_save_material_response($1, '{}'::jsonb, true, 'Max', 'max@example.com')", [tk.raw]);
    await submit();
    await t.as(R(), "select public.review_material_request($1, 'rueckfrage', 'Bitte Logo nachreichen')", [req.id]);
    const waiting = () => t.sql<{ n: number }>(
      "select count(*)::int as n from public.tasks where auto_key like $1 and status = 'wartet_auf_kunde'", [`material_warten:${req.id}%`]);
    expect((await waiting())[0].n).toBe(1);
    await submit();
    expect((await waiting())[0].n).toBe(0);
  });
});

describe("Veröffentlichung", () => {
  async function approvedOwnPost(channel = "instagram") {
    const [d] = await t.as<{ id: string }>(R(),
      "insert into public.dossiers (title, kind, owner_id) values ('Eigen', 'eigen', $1) returning id", [redaktion]);
    const [acc] = await t.sql<{ id: string }>(
      `insert into public.platform_accounts (platform, display_name, external_id, api_enabled, connection_status)
       values ($1, 'MEET GERMANY', '123', true, 'verbunden') returning id`, [channel]);
    const [c] = await t.as<{ id: string }>(R(),
      `insert into public.content_items (dossier_id, kind, channel, title, caption, post_format, platform_account_id)
       values ($1, 'social', $2, 'Post', 'Text', 'feed_bild', $3) returning id`, [d.id, channel, acc.id]);
    await approveInternally(c.id);
    return { dossier: d.id, content: c.id, account: acc.id };
  }

  it("automatische Veröffentlichung erfordert verbindliche Planung", async () => {
    const p = await approvedOwnPost();
    await expect(t.as(R(), "update public.content_items set auto_publish = true where id = $1", [p.content]))
      .rejects.toThrow(/über die Planung/);
    await expect(t.sql("update public.content_items set auto_publish = true where id = $1", [p.content]))
      .rejects.toThrow(/verbindliche Planung/);
  });

  it("API-Veröffentlichung abgeschaltet → Auftrag wird manuell mit Aufgabe (auch während eines Laufs)", async () => {
    const p = await approvedOwnPost();
    const soon = new Date(Date.now() + 60_000).toISOString();
    await t.as(F(), "select public.schedule_content($1, 'verbindlich', $2::timestamptz, true)", [p.content, soon]);
    await t.as(R(), "update public.content_items set auto_publish = false where id = $1", [p.content]);
    const jobs = await t.sql<{ method: string; status: string }>(
      "select method, status from public.publish_jobs where content_item_id = $1 and status <> 'abgebrochen'", [p.content]);
    expect(jobs).toEqual([{ method: "manuell", status: "manuell_offen" }]);
    const tasks = await t.sql<{ n: number }>(
      "select count(*)::int as n from public.tasks where content_item_id = $1 and task_type = 'manuelle_veroeffentlichung' and status = 'offen'", [p.content]);
    expect(tasks[0].n).toBe(1);

    // Während eines laufenden Versuchs: der Hintergrundprozess bricht ab und stellt auf manuell um
    const q = await approvedOwnPost();
    await t.as(F(), "select public.schedule_content($1, 'verbindlich', $2::timestamptz, true)", [q.content, soon]);
    await t.sql("update public.publish_jobs set scheduled_at = now() - interval '1 minute' where content_item_id = $1", [q.content]);
    const run = "66666666-6666-4666-8666-666666666666";
    const [claimed] = await t.as<{ id: string }>(SYS, "select id from public.claim_due_publish_jobs($1, 5)", [run]);
    await t.as(R(), "update public.content_items set auto_publish = false where id = $1", [q.content]);
    await t.as(SYS, "select public.finish_publish_job($1, $2, 'abgebrochen', null, null, null, null, null, 'Aktivierung fehlt')", [claimed.id, run]);
    const after = await t.sql<{ method: string; status: string }>(
      "select method, status from public.publish_jobs where content_item_id = $1 and status <> 'abgebrochen'", [q.content]);
    expect(after).toEqual([{ method: "manuell", status: "manuell_offen" }]);
  });

  it("Archivieren stoppt offene Aufträge und Aufgaben", async () => {
    const s = await setup();
    await approveInternally(s.article);
    const { token: tok } = await sendPreview(s, [s.article]);
    const [it1] = (await previewItems(tok)).items;
    await customerDecides(tok, [{ item_id: it1.id, decision: "freigegeben" }]);
    await t.as(F(), "select public.schedule_content($1, 'verbindlich', $2::timestamptz)", [s.article, new Date(Date.now() + 86400_000).toISOString()]);
    await t.as(R(), "update public.content_items set status = 'archiviert', schedule_status = 'ohne_termin', auto_publish = false where id = $1", [s.article]);
    const jobs = await t.sql<{ status: string }>("select status from public.publish_jobs where content_item_id = $1", [s.article]);
    expect(jobs.map((j) => j.status)).toEqual(["abgebrochen"]);
    const open = await t.sql<{ n: number }>(
      "select count(*)::int as n from public.tasks where content_item_id = $1 and status in ('offen', 'in_arbeit', 'wartet_auf_kunde')", [s.article]);
    expect(open[0].n).toBe(0);
  });

  it("manuelle Bestätigung während eines laufenden API-Versuchs wird klar abgewiesen", async () => {
    const p = await approvedOwnPost("linkedin");
    await t.as(F(), "select public.schedule_content($1, 'verbindlich', $2::timestamptz, true)", [p.content, new Date(Date.now() + 60_000).toISOString()]);
    await t.sql("update public.publish_jobs set scheduled_at = now() - interval '1 minute' where content_item_id = $1", [p.content]);
    await t.as(SYS, "select id from public.claim_due_publish_jobs($1, 5)", ["77777777-7777-4777-8777-777777777777"]);
    await expect(t.as(R(), "select public.confirm_manual_publication($1, 'https://linkedin.com/x', now())", [p.content]))
      .rejects.toThrow(/läuft gerade/);
  });

  it("Aufträge werden nur einmal reserviert; fremde Läufe können nicht abschließen", async () => {
    const p = await approvedOwnPost();
    const soon = new Date(Date.now() + 60_000).toISOString();
    const [res] = await t.as<{ r: { method: string } }>(F(),
      "select public.schedule_content($1, 'verbindlich', $2::timestamptz, true) as r", [p.content, soon]);
    expect(res.r.method).toBe("api");
    await t.sql("update public.publish_jobs set scheduled_at = now() - interval '1 minute' where content_item_id = $1", [p.content]);

    const run1 = "11111111-1111-4111-8111-111111111111";
    const run2 = "22222222-2222-4222-8222-222222222222";
    const first = await t.as<{ id: string }>(SYS, "select id from public.claim_due_publish_jobs($1, 5)", [run1]);
    const second = await t.as<{ id: string }>(SYS, "select id from public.claim_due_publish_jobs($1, 5)", [run2]);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);

    const [foreign] = await t.as<{ ok: boolean }>(SYS,
      "select public.finish_publish_job($1, $2, 'veroeffentlicht', 'x', 'https://x') as ok", [first[0].id, run2]);
    expect(foreign.ok).toBe(false);

    await expect(t.as(SYS, "select public.finish_publish_job($1, $2, 'veroeffentlicht') as ok", [first[0].id, run1]))
      .rejects.toThrow(/ohne Plattform-ID/);

    const [ok] = await t.as<{ ok: boolean }>(SYS,
      "select public.finish_publish_job($1, $2, 'veroeffentlicht', '1789', 'https://instagram.com/p/abc') as ok", [first[0].id, run1]);
    expect(ok.ok).toBe(true);
    const c = await item(p.content);
    expect(c.status).toBe("veroeffentlicht");
    expect(c.published_url).toBe("https://instagram.com/p/abc");

    // Kein zweiter aktiver Auftrag möglich
    await expect(t.sql(
      `insert into public.publish_jobs (content_item_id, dossier_id, channel, method, status, scheduled_at)
       values ($1, $2, 'instagram', 'api', 'geplant', now())`, [p.content, p.dossier]))
      .rejects.toThrow(/duplicate key/);
  });

  it("hängende Aufträge werden als unklar markiert und nicht automatisch wiederholt", async () => {
    const p = await approvedOwnPost("facebook");
    const soon = new Date(Date.now() + 60_000).toISOString();
    await t.as(F(), "select public.schedule_content($1, 'verbindlich', $2::timestamptz, true)", [p.content, soon]);
    await t.sql("update public.publish_jobs set scheduled_at = now() - interval '1 minute' where content_item_id = $1", [p.content]);
    const run = "33333333-3333-4333-8333-333333333333";
    const [job] = await t.as<{ id: string }>(SYS, "select id from public.claim_due_publish_jobs($1, 5)", [run]);
    await t.sql("update public.publish_jobs set locked_at = now() - interval '30 minutes' where id = $1", [job.id]);
    const [n] = await t.as<{ n: number }>(SYS, "select public.mark_stale_publish_jobs(15) as n");
    expect(n.n).toBe(1);
    const again = await t.as(SYS, "select id from public.claim_due_publish_jobs($1, 5)", [run]);
    expect(again).toHaveLength(0);
    await expect(t.as(R(), "select public.retry_publish_job($1)", [job.id])).rejects.toThrow(/NICHT erschienen/);
    await t.as(R(), "select public.retry_publish_job($1, true)", [job.id]);
    const [state] = await t.sql<{ status: string }>("select status from public.publish_jobs where id = $1", [job.id]);
    expect(state.status).toBe("geplant");
  });

  it("manuelle Veröffentlichung braucht Link und markiert die Leistung als erbracht", async () => {
    const s = await setup();
    await approveInternally(s.article);
    const { token: tok } = await sendPreview(s, [s.article]);
    const [it1] = (await previewItems(tok)).items;
    await customerDecides(tok, [{ item_id: it1.id, decision: "freigegeben" }]);
    const future = new Date(Date.now() + 86400_000).toISOString();
    await t.as(F(), "select public.schedule_content($1, 'verbindlich', $2::timestamptz)", [s.article, future]);
    const manualTasks = await t.sql<{ n: number }>(
      "select count(*)::int as n from public.tasks where content_item_id = $1 and task_type = 'manuelle_veroeffentlichung' and status = 'offen'",
      [s.article]);
    expect(manualTasks[0].n).toBe(1);

    await expect(t.as(R(), "update public.content_items set status = 'veroeffentlicht' where id = $1", [s.article]))
      .rejects.toThrow(/ergibt sich aus Prüfung/);
    await expect(t.sql("update public.content_items set status = 'veroeffentlicht' where id = $1", [s.article]))
      .rejects.toThrow(/Veröffentlichungszeitpunkt/);
    await expect(t.as(R(), "select public.confirm_manual_publication($1, 'kein-link', now())", [s.article]))
      .rejects.toThrow(/Link/);

    await t.as(R(), "select public.confirm_manual_publication($1, 'https://mice-magazin.example/artikel', now())", [s.article]);
    const a = await item(s.article);
    expect(a.status).toBe("veroeffentlicht");
    const [d] = await t.sql<{ status: string; evidence_url: string }>(
      "select status, evidence_url from public.deliverables where id = $1", [s.articleDeliverable]);
    expect(d).toEqual({ status: "erbracht", evidence_url: "https://mice-magazin.example/artikel" });
    const open = await t.sql<{ n: number }>(
      "select count(*)::int as n from public.tasks where content_item_id = $1 and task_type = 'manuelle_veroeffentlichung' and status = 'offen'",
      [s.article]);
    expect(open[0].n).toBe(0);
  });

  it("Termin verschieben zieht Auftrag und Aufgabe nach", async () => {
    const s = await setup();
    await approveInternally(s.article);
    const { token: tok } = await sendPreview(s, [s.article]);
    const [it1] = (await previewItems(tok)).items;
    await customerDecides(tok, [{ item_id: it1.id, decision: "freigegeben" }]);
    await t.as(F(), "select public.schedule_content($1, 'verbindlich', '2030-05-01 08:00:00+00')", [s.article]);
    await t.as(F(), "select public.schedule_content($1, 'verbindlich', '2030-05-08 08:00:00+00')", [s.article]);
    const [task] = await t.sql<{ due_date: string }>(
      "select due_date::text from public.tasks where content_item_id = $1 and task_type = 'manuelle_veroeffentlichung'", [s.article]);
    expect(task.due_date).toBe("2030-05-08");
    const jobs = await t.sql<{ status: string }>("select status from public.publish_jobs where content_item_id = $1", [s.article]);
    expect(jobs).toEqual([{ status: "manuell_offen" }]);
  });
});

describe("Medien", () => {
  it("verwendete Medien können nicht einzeln gelöscht werden, die ganze Akte schon", async () => {
    const s = await setup();
    const [m] = await t.as<{ id: string }>(R(),
      `insert into public.media_assets (dossier_id, kind, source, external_url, file_name) values ($1, 'bild', 'link', 'https://drive.example/x', 'x.jpg') returning id`,
      [s.dossier]);
    await t.as(R(), "insert into public.content_media (content_item_id, media_asset_id) values ($1, $2)", [s.social, m.id]);
    await expect(t.as(R(), "delete from public.media_assets where id = $1", [m.id])).rejects.toThrow(/foreign key/);
    await t.as({ role: "authenticated", userId: admin }, "delete from public.dossiers where id = $1", [s.dossier]);
    const [left] = await t.sql<{ n: number }>("select count(*)::int as n from public.media_assets where id = $1", [m.id]);
    expect(left.n).toBe(0);
  });

  it("Medienzuordnung ändert den Fingerprint und macht Freigaben ungültig", async () => {
    const s = await setup();
    await approveInternally(s.social);
    const before = (await item(s.social)).fingerprint;
    const [m] = await t.as<{ id: string }>(R(),
      `insert into public.media_assets (dossier_id, kind, source, external_url, file_name) values ($1, 'bild', 'link', 'https://drive.example/y', 'y.jpg') returning id`,
      [s.dossier]);
    await t.as(R(), "insert into public.content_media (content_item_id, media_asset_id) values ($1, $2)", [s.social, m.id]);
    const after = await item(s.social);
    expect(after.fingerprint).not.toBe(before);
    expect(after.internal_ok).toBe(false);
    expect(after.status).toBe("entwurf");
  });

  it("nur Medien der eigenen Akte und nur Pfade im Ordner der Akte", async () => {
    const s = await setup();
    const other = await setup();
    const [foreign] = await t.as<{ id: string }>(R(),
      `insert into public.media_assets (dossier_id, kind, source, external_url, file_name) values ($1, 'bild', 'link', 'https://drive.example/f', 'f.jpg') returning id`,
      [other.dossier]);
    await expect(t.as(R(), "insert into public.content_media (content_item_id, media_asset_id) values ($1, $2)", [s.social, foreign.id]))
      .rejects.toThrow(/gehört nicht zu dieser Beitragsakte/);
    await expect(t.as(R(),
      `insert into public.media_assets (dossier_id, kind, source, storage_bucket, storage_path, file_name) values ($1, 'bild', 'upload', 'media', $2, 'x.jpg')`,
      [s.dossier, `dossiers/${other.dossier}/x.jpg`])).rejects.toThrow(/Speicherpfad/);
    await t.as(R(),
      `insert into public.media_assets (dossier_id, kind, source, storage_bucket, storage_path, file_name) values ($1, 'bild', 'upload', 'media', $2, 'x.jpg')`,
      [s.dossier, `dossiers/${s.dossier}/x.jpg`]);
  });
});

describe("Zugriffsschutz", () => {
  it("Mitarbeit kann sich über eine eigene Aufgabe oder die Akte keinen fremden Zugriff verschaffen", async () => {
    const mitarbeit = await t.createUser("mitarbeit");
    const M = { role: "authenticated" as const, userId: mitarbeit };
    const own = await setup();
    const foreign = await setup();
    await t.as(R(), "update public.dossiers set owner_id = $2 where id = $1", [own.dossier, mitarbeit]);

    const [task] = await t.as<{ id: string }>(M,
      "insert into public.tasks (title, assignee_id) values ('Privat', $1) returning id", [mitarbeit]);
    await expect(t.as(M, "update public.tasks set dossier_id = $2 where id = $1", [task.id, foreign.dossier]))
      .rejects.toThrow(/Keine Berechtigung/);
    const visible = await t.as(M, "select id from public.dossiers where id = $1", [foreign.dossier]);
    expect(visible).toHaveLength(0);

    await expect(t.as(M, "update public.dossiers set client_id = $2 where id = $1", [own.dossier, foreign.client]))
      .rejects.toThrow(/legt die Redaktion fest/);
    await expect(t.as(M, "update public.content_items set deliverable_id = $2 where id = $1", [own.article, foreign.articleDeliverable]))
      .rejects.toThrow(/gehört nicht zum Kunden/);
    // Normale Arbeit an der eigenen Akte bleibt möglich
    await t.as(M, "update public.content_items set teaser = 'Mein Teaser' where id = $1", [own.article]);
  });

  it("je Leistung höchstens eine Beitragsakte", async () => {
    const s = await setup();
    await expect(t.as(R(),
      "insert into public.dossiers (title, kind, client_id, deliverable_id) values ('Doppelt', 'kunde', $1, $2)",
      [s.client, s.articleDeliverable])).rejects.toThrow(/duplicate key/);
  });

  it("Nutzerkonten lassen sich löschen, obwohl die Person Freigaben und Versionen erzeugt hat", async () => {
    const leaving = await t.createUser("freigabe", "Ehemalige Leitung");
    const s = await setup();
    await t.as(R(), "select public.request_internal_review($1)", [s.article]);
    await t.as({ role: "authenticated", userId: leaving }, "select public.decide_internal_review($1, 'freigegeben')", [s.article]);
    await t.sql("delete from auth.users where id = $1", [leaving]);
    const [appr] = await t.sql<{ decided_by: string | null }>(
      "select decided_by from public.approvals where content_item_id = $1 and kind = 'intern'", [s.article]);
    expect(appr.decided_by).toBeNull();
    const [log] = await t.sql<{ n: number }>(
      "select count(*)::int as n from public.audit_log where actor_label = 'Ehemalige Leitung'");
    expect(log.n).toBeGreaterThan(0);
    // Inhaltliche Änderungen an unveränderlichen Datensätzen bleiben verboten
    await expect(t.sql("update public.approvals set comment = 'x' where content_item_id = $1", [s.article]))
      .rejects.toThrow(/unveränderlich/);
  });
});

describe("Grafikaufgaben", () => {
  it("werden erledigt, sobald ein finales Medium zugeordnet ist", async () => {
    const s = await setup();
    await t.as(R(), "update public.content_items set post_format = 'feed_bild' where id = $1", [s.social]);
    await t.as(R(), "insert into public.tasks (title, task_type, content_item_id, dossier_id, origin, auto_key) values ('Grafik', 'grafik', $1, $2, 'ablauf', $3)", [s.social, s.dossier, `grafik:${s.social}`]);
    const [m] = await t.as<{ id: string }>(R(),
      `insert into public.media_assets (dossier_id, kind, source, external_url, file_name, status) values ($1, 'bild', 'link', 'https://drive.example/z', 'z.jpg', 'entwurf') returning id`,
      [s.dossier]);
    await t.as(R(), "insert into public.content_media (content_item_id, media_asset_id) values ($1, $2)", [s.social, m.id]);
    const [open] = await t.sql<{ status: string }>("select status from public.tasks where auto_key = $1", [`grafik:${s.social}`]);
    expect(open.status).toBe("offen");
    await t.as(R(), "update public.media_assets set status = 'final' where id = $1", [m.id]);
    const [done] = await t.sql<{ status: string }>("select status from public.tasks where auto_key = $1", [`grafik:${s.social}`]);
    expect(done.status).toBe("erledigt");
  });
});

describe("Notizen & Kennzahlen", () => {
  it("Notizen landen in der Historie; Kennzahlen erst nach Veröffentlichung", async () => {
    const s = await setup();
    await t.as(R(), "select public.add_note($1, null, 'Kunde wünscht Termin im Oktober')", [s.dossier]);
    const [n] = await t.sql<{ summary: string }>(
      "select summary from public.audit_log where dossier_id = $1 and action = 'notiz'", [s.dossier]);
    expect(n.summary).toBe("Kunde wünscht Termin im Oktober");
    await expect(t.as(R(), "select public.record_content_metrics($1, 100, null, 5, null)", [s.article]))
      .rejects.toThrow(/nach der Veröffentlichung/);
  });
});

describe("Erinnerungen & Sperren", () => {
  it("jede Erinnerung wird nur einmal reserviert", async () => {
    const entity = "44444444-4444-4444-8444-444444444444";
    const run = "55555555-5555-4555-8555-555555555555";
    const [a] = await t.as<{ ok: boolean }>(SYS, "select public.claim_reminder('material_ausstehend', $1, 1, $2) as ok", [entity, run]);
    const [b] = await t.as<{ ok: boolean }>(SYS, "select public.claim_reminder('material_ausstehend', $1, 1, $2) as ok", [entity, run]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(false);
  });

  it("parallele Hintergrundläufe werden durch die Sperre verhindert", async () => {
    const [a] = await t.as<{ ok: boolean }>(SYS, "select public.acquire_job_lock('tick', gen_random_uuid(), 300) as ok");
    const [b] = await t.as<{ ok: boolean }>(SYS, "select public.acquire_job_lock('tick', gen_random_uuid(), 300) as ok");
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(false);
  });
});

describe("Demo-Daten", () => {
  it("werden nur auf ausdrückliche Admin-Aktion geladen, sind markiert und vollständig entfernbar", async () => {
    const before = await t.sql<{ n: number }>("select count(*)::int as n from public.clients where is_demo");
    expect(before[0].n).toBe(0);
    await expect(t.as(R(), "select public.admin_load_demo_data()")).rejects.toThrow(/Nur Admins/);
    await t.as({ role: "authenticated", userId: admin }, "select public.admin_load_demo_data()");
    const clients = await t.sql<{ name: string }>("select name from public.clients where is_demo order by name");
    expect(clients).toHaveLength(3);
    expect(clients.every((c) => c.name.startsWith("[DEMO]"))).toBe(true);
    const published = await t.sql<{ n: number }>(
      "select count(*)::int as n from public.content_items c join public.dossiers d on d.id = c.dossier_id where d.is_demo and c.status = 'veroeffentlicht'");
    expect(published[0].n).toBe(1);
    await t.as({ role: "authenticated", userId: admin }, "select public.admin_remove_demo_data()");
    const after = await t.sql<{ n: number }>(
      "select (select count(*) from public.clients where is_demo) + (select count(*) from public.dossiers where is_demo) + (select count(*) from public.tasks where is_demo) as n");
    expect(Number(after[0].n)).toBe(0);
  });
});
