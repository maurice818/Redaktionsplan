import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { processPublishing } from "./publisher";
import { runReminders } from "./reminders";
import { checkTokens } from "./tokens";

export interface TickResult {
  runId: string;
  status: "ok" | "fehler" | "uebersprungen";
  summary: Record<string, unknown>;
  error?: string;
}

/**
 * Ein Durchlauf des Hintergrundprozesses. Mehrfach- oder Parallelaufrufe sind
 * unkritisch: eine Sperre verhindert parallele Läufe, Aufträge und
 * Erinnerungen werden einzeln atomar reserviert.
 */
export async function runTick(trigger: "cron" | "manuell"): Promise<TickResult> {
  const admin = createAdminClient();
  const runId = randomUUID();

  const { data: locked, error: lockError } = await admin.rpc("acquire_job_lock", {
    p_job: "tick",
    p_run_id: runId,
    p_ttl_seconds: 280,
  });
  if (lockError) throw new Error(lockError.message);
  if (!locked) {
    await admin.from("job_runs").insert({ id: runId, job: "tick", trigger, status: "uebersprungen", finished_at: new Date().toISOString(), summary: { grund: "Ein anderer Lauf ist aktiv." } });
    return { runId, status: "uebersprungen", summary: { grund: "Ein anderer Lauf ist aktiv." } };
  }

  await admin.from("job_runs").insert({ id: runId, job: "tick", trigger, status: "laeuft" });
  const summary: Record<string, unknown> = {};
  const errors: string[] = [];

  try {
    const { data: stale } = await admin.rpc("mark_stale_publish_jobs", { p_minutes: 15 });
    summary.unklar_markiert = stale ?? 0;
  } catch (e) {
    errors.push(`Hängende Aufträge: ${(e as Error).message}`);
  }
  try {
    summary.veroeffentlichung = await processPublishing(admin, runId);
  } catch (e) {
    errors.push(`Veröffentlichung: ${(e as Error).message}`);
  }
  try {
    summary.erinnerungen = await runReminders(admin, runId);
  } catch (e) {
    errors.push(`Erinnerungen: ${(e as Error).message}`);
  }
  try {
    summary.autorisierungen = await checkTokens(admin);
  } catch (e) {
    errors.push(`Autorisierungen: ${(e as Error).message}`);
  }

  const status = errors.length ? "fehler" : "ok";
  await admin
    .from("job_runs")
    .update({ status, finished_at: new Date().toISOString(), summary: summary as never, error: errors.join("\n") || null })
    .eq("id", runId);
  await admin.rpc("release_job_lock", { p_job: "tick", p_run_id: runId });

  return { runId, status, summary, error: errors.join("\n") || undefined };
}
