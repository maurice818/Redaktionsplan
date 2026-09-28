import { describe, expect, it } from "vitest";
import { calendarStatus } from "@/lib/domain/calendar-status";
import { findConflicts } from "@/lib/domain/conflicts";
import { deliverableProgress, summarizeGroup, type ProgressKey } from "@/lib/domain/deliverable-progress";
import { formatRatio, validateContent, validateMedia } from "@/lib/domain/format-validation";
import { publishReadiness, type ReadinessItem } from "@/lib/domain/readiness";
import type { FormatRule, MediaInfo } from "@/lib/domain/types";
import { dossierWorkflow } from "@/lib/domain/workflow";

function rule(partial: Partial<FormatRule>): FormatRule {
  return {
    id: "r", channel: "instagram", post_format: "feed_bild", media_kind: "bild", label: "Instagram Feed-Bild",
    media_required: true, allowed_mime_types: ["image/jpeg"], max_file_size_mb: 8, min_width: 320, max_width: 1440,
    max_pixels: null, recommended_width: 1080, recommended_height: 1350, min_aspect_ratio: 0.8, max_aspect_ratio: 1.91,
    min_duration_seconds: null, max_duration_seconds: null, min_items: 1, max_items: 1, caption_max_length: 2200,
    hashtags_max: 30, api_supported: true, notes: null, source_url: null, verified_at: "2026-09-24", is_active: true,
    created_at: "", updated_at: "", updated_by: null, ...partial,
  };
}

const jpeg = (w: number, h: number, extra: Partial<MediaInfo> = {}): MediaInfo => ({
  id: `m${w}x${h}`, kind: "bild", mime_type: "image/jpeg", size_bytes: 500_000, width: w, height: h,
  duration_seconds: null, status: "final", file_name: `bild-${w}x${h}.jpg`, ...extra,
});

describe("Formatprüfung", () => {
  const ig = rule({});

  it("akzeptiert ein 4:5-JPEG ohne Hinweise", () => {
    expect(validateMedia(jpeg(1080, 1350), ig)).toEqual([]);
  });

  it("meldet ungeeignetes Seitenverhältnis als Fehler", () => {
    const issues = validateMedia(jpeg(1080, 1920), ig);
    expect(issues.map((i) => i.code)).toContain("seitenverhaeltnis");
    expect(issues[0].level).toBe("error");
  });

  it("meldet PNG für Instagram als Fehler (API akzeptiert nur JPEG)", () => {
    const issues = validateMedia(jpeg(1080, 1350, { mime_type: "image/png" }), ig);
    expect(issues.find((i) => i.code === "typ")?.level).toBe("error");
  });

  it("meldet Abweichung von der Empfehlung nur als Warnung", () => {
    const issues = validateMedia(jpeg(1080, 1080), ig);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ level: "warning", code: "empfehlung" });
  });

  it("markiert Links ohne Maße als nicht prüfbar", () => {
    const issues = validateMedia({ ...jpeg(1, 1), width: null, height: null, source: "link" }, ig);
    expect(issues.map((i) => i.code)).toContain("masse_unbekannt");
    expect(issues.every((i) => i.level !== "error")).toBe(true);
  });

  it("warnt vor veralteten Medien und zu großen Dateien", () => {
    const issues = validateMedia(jpeg(1080, 1350, { status: "veraltet", size_bytes: 12 * 1024 * 1024 }), ig);
    expect(issues.map((i) => i.code).sort()).toEqual(["groesse", "veraltet"]);
  });

  it("prüft Medienanzahl, Medienart und Textlänge im Zusammenhang", () => {
    const reel = rule({ post_format: "reel", media_kind: "video", allowed_mime_types: ["video/mp4"], label: "Instagram Reel",
      min_aspect_ratio: 0.01, max_aspect_ratio: 10, recommended_width: 1080, recommended_height: 1920, min_width: null,
      max_width: 1920, max_file_size_mb: 300, min_duration_seconds: 3, max_duration_seconds: 900 });
    const issues = validateContent(
      { kind: "social", channel: "instagram", post_format: "reel", caption: "x".repeat(2300), hashtags: [] },
      [jpeg(1080, 1920)],
      [reel],
    );
    expect(issues.map((i) => i.code)).toEqual(expect.arrayContaining(["medienart", "text_lang"]));
  });

  it("formatiert Seitenverhältnisse lesbar", () => {
    expect(formatRatio(0.8)).toBe("4:5");
    expect(formatRatio(1080 / 1920)).toBe("9:16");
  });
});

describe("Veröffentlichungsvoraussetzungen", () => {
  const base: ReadinessItem = {
    kind: "social", channel: "instagram", status: "freigegeben", title: "Post", caption: "Text", hashtags: [],
    body_html: null, post_format: "feed_bild", schedule_status: "verbindlich", scheduled_at: "2026-10-01T08:00:00Z",
    auto_publish: true, platform_account_id: "acc", requires_internal_approval: true, requires_client_approval: true,
    internal_ok: true, client_ok: true,
  };
  const account = { platform: "instagram", api_enabled: true, connection_status: "verbunden" };

  it("ist bereit, wenn alles vorliegt", () => {
    const r = publishReadiness(base, [jpeg(1080, 1350)], [rule({})], account, true);
    expect(r.ready).toBe(true);
    expect(r.readyForApi).toBe(true);
  });

  it("blockiert ohne Kundenfreigabe", () => {
    const r = publishReadiness({ ...base, client_ok: false }, [jpeg(1080, 1350)], [rule({})], account, true);
    expect(r.ready).toBe(false);
    expect(r.blockers).toContain("Kundenfreigabe der aktuellen Fassung");
  });

  it("erlaubt manuelle Veröffentlichung, wenn die API nicht freigeschaltet ist", () => {
    const r = publishReadiness(base, [jpeg(1080, 1350)], [rule({})], { ...account, api_enabled: false }, true);
    expect(r.ready).toBe(true);
    expect(r.readyForApi).toBe(false);
  });
});

describe("Kalenderstatus", () => {
  const now = new Date("2026-09-24T10:00:00Z");
  const base = { status: "freigegeben", schedule_status: "verbindlich", scheduled_at: "2026-09-30T08:00:00Z", approvals_complete: true, published_at: null };

  it("unterscheidet vorläufig, freigegeben, verbindlich und veröffentlicht", () => {
    expect(calendarStatus({ ...base, status: "entwurf", schedule_status: "vorlaeufig", approvals_complete: false }, null, now).key).toBe("vorlaeufig");
    expect(calendarStatus({ ...base, schedule_status: "vorlaeufig" }, null, now).key).toBe("freigegeben");
    expect(calendarStatus(base, "geplant", now).key).toBe("verbindlich");
    expect(calendarStatus({ ...base, status: "veroeffentlicht", published_at: "2026-09-30T08:00:00Z" }, null, now).key).toBe("veroeffentlicht");
  });

  it("zeigt blockierte Inhalte mit Begründung", () => {
    const failed = calendarStatus(base, "fehlgeschlagen", now);
    expect(failed.key).toBe("blockiert");
    expect(failed.reasons).toContain("Veröffentlichung fehlgeschlagen");
    const soon = calendarStatus({ ...base, schedule_status: "vorlaeufig", approvals_complete: false, status: "beim_kunden", scheduled_at: "2026-09-25T08:00:00Z" }, null, now);
    expect(soon.key).toBe("blockiert");
  });
});

describe("Leistungsfortschritt", () => {
  it("fasst Artikel wie gefordert zusammen", () => {
    const keys: ProgressKey[] = ["veroeffentlicht", "veroeffentlicht", "wartet_auf_freigabe", "ohne_thema"];
    expect(summarizeGroup(keys, "magazinartikel", "MICE-Magazin-Fachartikel"))
      .toBe("2 von 4 Artikeln veröffentlicht; 1 wartet auf Freigabe; 1 noch ohne Thema");
  });

  it("formuliert Einzahl und Leistungen ohne Redaktionseinheit korrekt", () => {
    expect(summarizeGroup(["veroeffentlicht"], "magazinartikel", "Artikel")).toBe("1 von 1 Artikel veröffentlicht");
    expect(summarizeGroup(["offen"], null, "Firmenprofil")).toBe("Firmenprofil: offen");
    expect(summarizeGroup(["erbracht", "offen", "entfallen"], null, "MeetUps")).toBe("1 von 2 Leistungen erbracht; 1 offen; 1 entfallen");
  });

  it("leitet den Fortschritt aus verknüpften Inhalten ab", () => {
    expect(deliverableProgress({ status: "offen", content_kind: "magazinartikel", hasDossier: false, contents: [] })).toBe("ohne_thema");
    expect(deliverableProgress({ status: "in_arbeit", content_kind: "magazinartikel", hasDossier: true, materialPending: true, contents: [] })).toBe("wartet_auf_material");
    expect(deliverableProgress({ status: "in_arbeit", content_kind: "magazinartikel", hasDossier: true,
      contents: [{ status: "beim_kunden", schedule_status: "vorlaeufig", published_at: null }] })).toBe("wartet_auf_freigabe");
    expect(deliverableProgress({ status: "erbracht", content_kind: "magazinartikel", hasDossier: true,
      contents: [{ status: "veroeffentlicht", schedule_status: "verbindlich", published_at: "2026-09-01T08:00:00Z" }] })).toBe("veroeffentlicht");
  });
});

describe("Ablauf der Beitragsakte", () => {
  it("leitet die 15 Schritte aus den Daten ab", () => {
    const steps = dossierWorkflow({
      kind: "kunde", ownerId: "u", periodStart: "2026-10-01", periodEnd: null,
      materialRequests: [{ status: "geprueft", revoked_at: null }],
      contents: [{
        kind: "magazinartikel", status: "beim_kunden", body_html: "<p>x</p>", caption: null,
        requires_internal_approval: true, requires_client_approval: true, internal_ok: true, client_ok: false,
        schedule_status: "vorlaeufig", published_at: null, published_url: null, mediaCount: 1, finalMediaCount: 1, needsMedia: true,
      }],
      graphicTasksOpen: 0,
      previews: [{ status: "versendet", sent_at: "2026-09-20T08:00:00Z" }],
      deliverables: [{ status: "in_arbeit" }],
    });
    expect(steps).toHaveLength(15);
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s.state]));
    expect(byKey.material_geprueft).toBe("done");
    expect(byKey.intern).toBe("done");
    expect(byKey.vorschau).toBe("done");
    expect(byKey.kundenfreigabe).toBe("open");
    expect(byKey.veroeffentlicht).toBe("open");
  });
});

describe("Terminkonflikte", () => {
  it("warnt vor zu vielen Beiträgen am Tag und zu dichten Terminen je Kanal", () => {
    const w = findConflicts([
      { id: "1", title: "A", channel: "instagram", scheduled_at: "2026-10-01T07:00:00Z" },
      { id: "2", title: "B", channel: "instagram", scheduled_at: "2026-10-01T07:30:00Z" },
      { id: "3", title: "C", channel: "linkedin", scheduled_at: "2026-10-01T09:00:00Z" },
      { id: "4", title: "D", channel: "facebook", scheduled_at: "2026-10-01T12:00:00Z" },
    ], 3, 60);
    expect(w.map((x) => x.kind).sort()).toEqual(["ueberlastung", "ueberschneidung"]);
  });
});
