"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdmin, assertEditor, assertProfile } from "@/lib/auth";
import { check, runAction, type ActionResult } from "@/lib/action-result";
import { features } from "@/lib/env.server";
import { runTick, type TickResult } from "@/lib/jobs/tick";
import { createClient } from "@/lib/supabase/server";
import { berlinLocalToIso } from "@/lib/time";
import { formToObject, optionalText, requiredText, uuid } from "@/lib/validation";

const refresh = () => revalidatePath("/", "layout");

const confirmSchema = z.object({
  content_id: uuid,
  url: z.string().trim().regex(/^https?:\/\/\S+$/i, "Bitte den vollständigen Link zur Veröffentlichung angeben (https://…)."),
  published_local: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Bitte Datum und Uhrzeit der Veröffentlichung angeben."),
  note: optionalText(1000),
});

/** Nach dem manuellen Posten: Link und tatsächlichen Zeitpunkt eintragen. */
export async function confirmManualPublication(_: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertProfile();
    const d = confirmSchema.parse(formToObject(formData));
    const supabase = await createClient();
    check(
      await supabase.rpc("confirm_manual_publication", {
        p_content_id: d.content_id,
        p_url: d.url,
        p_published_at: berlinLocalToIso(d.published_local),
        p_note: d.note,
      }),
    );
    refresh();
    return null;
  }, "Veröffentlichung bestätigt – Nachweis gespeichert.");
}

export async function retryPublishJob(jobId: string, confirmNotPublished = false): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertEditor();
    const supabase = await createClient();
    check(await supabase.rpc("retry_publish_job", { p_job_id: uuid.parse(jobId), p_confirm_not_published: confirmNotPublished }));
    refresh();
    return null;
  }, "Erneuter Versuch eingeplant – er läuft beim nächsten Hintergrundlauf.");
}

export async function cancelPublishJob(_: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertEditor();
    const d = z.object({ id: uuid, reason: requiredText("Grund", 1000) }).parse(formToObject(formData));
    const supabase = await createClient();
    check(await supabase.rpc("cancel_publish_job", { p_job_id: d.id, p_reason: d.reason }));
    refresh();
    return null;
  }, "Auftrag abgebrochen.");
}

/** Hintergrundprozess sofort ausführen (Admin) – nutzt dieselben Sperren wie der Cron. */
export async function runBackgroundNow(): Promise<ActionResult<TickResult>> {
  return runAction(async () => {
    await assertAdmin();
    if (!features.admin()) throw new Error("SUPABASE_SECRET_KEY ist nicht gesetzt – der Hintergrundprozess kann nicht laufen.");
    const result = await runTick("manuell");
    refresh();
    return result;
  }, "Hintergrundlauf ausgeführt.");
}
