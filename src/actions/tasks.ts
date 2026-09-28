"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertProfile } from "@/lib/auth";
import { check, runAction, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import { formToObject, optionalDate, optionalText, optionalUuid, requiredText, uuid } from "@/lib/validation";

const refresh = () => revalidatePath("/", "layout");

const TASK_TYPES = [
  "allgemein", "material_anfordern", "material_pruefen", "rueckfrage", "entwurf", "social_vorbereiten", "grafik",
  "interne_pruefung", "kundenvorschau", "kundenfeedback", "aenderungen", "terminierung", "manuelle_veroeffentlichung",
  "nachweis", "erinnerung",
] as const;
const STATUSES = ["offen", "in_arbeit", "wartet_auf_kunde", "erledigt", "abgebrochen"] as const;

const taskSchema = z.object({
  id: optionalUuid,
  title: requiredText("Titel", 250),
  description: optionalText(10000),
  task_type: z.enum(TASK_TYPES).default("allgemein"),
  status: z.enum(STATUSES).default("offen"),
  priority: z.enum(["niedrig", "normal", "hoch", "dringend"]).default("normal"),
  assignee_id: optionalUuid,
  due_date: optionalDate,
  dossier_id: optionalUuid,
  content_item_id: optionalUuid,
  client_id: optionalUuid,
  campaign_id: optionalUuid,
});

export async function saveTask(_: ActionResult<{ id: string }> | null, formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const profile = await assertProfile();
    const { id, ...d } = taskSchema.parse(formToObject(formData));
    const supabase = await createClient();
    if (id) {
      check(await supabase.from("tasks").update(d).eq("id", id));
      refresh();
      return { id };
    }
    const created = check(
      await supabase
        .from("tasks")
        .insert({ ...d, assignee_id: d.assignee_id ?? profile.id, origin: "manuell" })
        .select("id")
        .single(),
    );
    refresh();
    return { id: created.id };
  }, "Aufgabe gespeichert.");
}

export async function setTaskStatus(id: string, status: (typeof STATUSES)[number]): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertProfile();
    const supabase = await createClient();
    const { data, error } = await supabase.from("tasks").update({ status: z.enum(STATUSES).parse(status) }).eq("id", uuid.parse(id)).select("id");
    if (error) throw error;
    if (!data?.length) throw new Error("Aufgabe nicht gefunden oder keine Berechtigung.");
    refresh();
    return null;
  }, status === "erledigt" ? "Aufgabe erledigt." : "Status geändert.");
}

export async function deleteTask(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertProfile();
    const supabase = await createClient();
    const { data, error } = await supabase.from("tasks").delete().eq("id", uuid.parse(id)).select("id");
    if (error) throw error;
    if (!data?.length) throw new Error("Automatisch erzeugte Aufgaben können nur von der Redaktion gelöscht werden – bitte stattdessen abbrechen.");
    refresh();
    return null;
  }, "Aufgabe gelöscht.");
}
