import { describe, expect, it } from "vitest";
import {
  addDays, addMonths, berlinDate, berlinLocalToIso, daysBetween, endOfMonth, formatDate, formatDateTime,
  isoWeekNumber, relativeDay, startOfWeek, toBerlinLocalInput,
} from "@/lib/time";

describe("Zeitzone Europe/Berlin", () => {
  it("wandelt Berliner Ortszeit eindeutig in UTC um (Sommerzeit)", () => {
    expect(berlinLocalToIso("2026-07-01T09:00")).toBe("2026-07-01T07:00:00.000Z");
  });

  it("wandelt Berliner Ortszeit eindeutig in UTC um (Winterzeit)", () => {
    expect(berlinLocalToIso("2026-12-01T09:00")).toBe("2026-12-01T08:00:00.000Z");
  });

  it("behandelt den Tag der Zeitumstellung korrekt", () => {
    // 29.03.2026: 02:00 → 03:00 (Beginn Sommerzeit)
    expect(berlinLocalToIso("2026-03-29T01:30")).toBe("2026-03-29T00:30:00.000Z");
    expect(berlinLocalToIso("2026-03-29T03:30")).toBe("2026-03-29T01:30:00.000Z");
    // 25.10.2026: 03:00 → 02:00 (Ende Sommerzeit)
    expect(berlinLocalToIso("2026-10-25T04:00")).toBe("2026-10-25T03:00:00.000Z");
  });

  it("liefert den Berliner Kalendertag auch kurz nach Mitternacht", () => {
    expect(berlinDate("2026-09-24T22:30:00Z")).toBe("2026-09-25");
    expect(berlinDate("2026-01-15T23:30:00Z")).toBe("2026-01-16");
  });

  it("formatiert Datumswerte deutsch", () => {
    expect(formatDate("2026-09-24")).toBe("24.09.2026");
    expect(formatDateTime("2026-09-24T08:05:00Z")).toBe("24.09.2026, 10:05 Uhr");
    expect(toBerlinLocalInput("2026-09-24T08:05:00Z")).toBe("2026-09-24T10:05");
  });

  it("rechnet mit Kalendertagen", () => {
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(daysBetween("2026-09-24", "2026-10-01")).toBe(7);
    expect(startOfWeek("2026-09-24")).toBe("2026-09-21");
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
    expect(isoWeekNumber("2026-09-24")).toBe(39);
    expect(relativeDay("2026-09-25", "2026-09-24")).toBe("morgen");
    expect(relativeDay("2026-09-20", "2026-09-24")).toBe("vor 4 Tagen");
  });
});
