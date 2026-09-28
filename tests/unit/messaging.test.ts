import { describe, expect, it } from "vitest";
import { findPlaceholders, renderEmail } from "@/lib/email/render";
import { answersSchema, parseFields } from "@/lib/material-form";
import { composeSocialText, normalizeHashtag, toLinkedInLittleText } from "@/lib/platforms/text";
import { redact } from "@/lib/platforms/types";
import { dueOccurrence } from "@/lib/jobs/reminders";
import { parseHashtags, safeSearch } from "@/lib/validation";

describe("E-Mail-Vorlagen", () => {
  it("ersetzt Platzhalter und escaped HTML", () => {
    const r = renderEmail(
      { subject: "Freigabe: {{beitrag_titel}}", body: "Hallo {{empfaenger_name}},\n\n{{link}}\n\nGruß" },
      { beitrag_titel: "Tagen <am> Rhein", empfaenger_name: "<script>x</script>", link: "https://app.example/v/abc" },
    );
    expect(r.subject).toBe("Freigabe: Tagen <am> Rhein");
    expect(r.html).not.toContain("<script>x</script>");
    expect(r.html).toContain("&lt;script&gt;");
    expect(r.html).toContain('href="https://app.example/v/abc"');
    expect(r.text).toContain("https://app.example/v/abc");
  });

  it("findet verwendete Platzhalter", () => {
    expect(findPlaceholders("{{a}} und {{ b }} und {{a}}")).toEqual(["a", "b"]);
  });
});

describe("Kanaltexte", () => {
  it("setzt Text, CTA, Link und Hashtags zusammen", () => {
    expect(composeSocialText({ caption: "Text", cta: "Jetzt anfragen", hashtags: ["MICE", "#Tagung"], link_url: "https://x.de", channel: "linkedin", post_format: "text" }))
      .toBe("Text\n\nJetzt anfragen\n\nhttps://x.de\n\n#MICE #Tagung");
    // Instagram: keine klickbaren Links im Text
    expect(composeSocialText({ caption: "Text", cta: null, hashtags: [], link_url: "https://x.de", channel: "instagram", post_format: "feed_bild" })).toBe("Text");
  });

  it("maskiert LinkedIn Little Text und wandelt Hashtags", () => {
    expect(toLinkedInLittleText("Neu (bald) #MICE_Summit")).toBe("Neu \\(bald\\) {hashtag|\\#|MICE\\_Summit}");
    expect(toLinkedInLittleText("a_b @c")).toBe("a\\_b \\@c");
  });

  it("normalisiert Hashtags", () => {
    expect(normalizeHashtag("##Green Meetings")).toBe("#GreenMeetings");
    expect(parseHashtags("#a, b  #a")).toEqual(["#a", "#b"]);
  });

  it("entfernt Tokens aus protokollierten Antworten", () => {
    expect(redact({ access_token: "geheim", data: { id: 1, nested_token: "x" } })).toEqual({ access_token: "[entfernt]", data: { id: 1, nested_token: "[entfernt]" } });
  });
});

describe("Erinnerungen", () => {
  const rule = { days: 5, repeat_days: 4, max_reminders: 2 };
  it("berechnet die fällige Erinnerung", () => {
    expect(dueOccurrence(4, rule)).toBe(0);
    expect(dueOccurrence(5, rule)).toBe(1);
    expect(dueOccurrence(8, rule)).toBe(1);
    expect(dueOccurrence(9, rule)).toBe(2);
    expect(dueOccurrence(40, rule)).toBe(2);
    expect(dueOccurrence(10, { days: 3, repeat_days: null, max_reminders: 1 })).toBe(1);
  });
});

describe("Materialformular", () => {
  const fields = parseFields([
    { key: "thema", label: "Thema", type: "text", required: true },
    { key: "fakten", label: "Fakten", type: "list", count: 3, required: true },
    { key: "drive", label: "Drive", type: "url" },
    { key: "bilder", label: "Bilder", type: "files" },
  ]);

  it("erlaubt unvollständige Entwürfe", () => {
    expect(answersSchema(fields, false).safeParse({ thema: "" }).success).toBe(true);
  });

  it("prüft Pflichtfelder und Links beim Absenden", () => {
    const s = answersSchema(fields, true);
    expect(s.safeParse({ thema: "X", fakten: ["", "", ""] }).success).toBe(false);
    expect(s.safeParse({ thema: "X", fakten: ["a"], drive: "kein-link" }).success).toBe(false);
    expect(s.safeParse({ thema: "X", fakten: ["a"], drive: "https://drive.google.com/x" }).success).toBe(true);
  });

  it("verwirft unbekannte Felder", () => {
    const r = answersSchema(fields, false).parse({ thema: "X", boese: "<script>" });
    expect(r).toEqual({ thema: "X" });
  });
});

describe("Suche", () => {
  it("entschärft Filtersyntax", () => {
    expect(safeSearch("a,b(c)%*")).toBe("a b c");
  });
});
