import { describe, expect, it } from "vitest";
import { answersSchema, type MaterialField } from "@/lib/material-form";

const fields: MaterialField[] = [
  { key: "fakten", label: "Fakten", type: "list", count: 3, required: true },
  { key: "thema", label: "Thema", type: "text" },
];

describe("Materialformular – Antworten", () => {
  it("akzeptiert Listen mit Lücken (später Punkt zuerst ausgefüllt)", () => {
    const res = answersSchema(fields, false).safeParse({ fakten: [null, undefined, "Dritter Punkt"] });
    expect(res.success).toBe(true);
    expect(res.data?.fakten).toEqual(["", "", "Dritter Punkt"]);
  });

  it("meldet Pflichtfelder und zu lange Punkte auf Deutsch", () => {
    const empty = answersSchema(fields, true).safeParse({ fakten: ["", ""] });
    expect(empty.success).toBe(false);
    expect(empty.error?.issues[0]?.message).toBe("„Fakten“ ist ein Pflichtfeld.");
    const long = answersSchema(fields, false).safeParse({ fakten: ["x".repeat(1001)] });
    expect(long.error?.issues[0]?.message).toBe("Maximal 1000 Zeichen je Punkt.");
    const many = answersSchema(fields, false).safeParse({ fakten: ["a", "b", "c", "d"] });
    expect(many.error?.issues[0]?.message).toBe("„Fakten“: zu viele Punkte.");
  });
});
