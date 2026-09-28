"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertEditor, assertProfile } from "@/lib/auth";
import { check, runAction, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import { formToObject, optionalDate, optionalText, optionalUuid, requiredText, uuid } from "@/lib/validation";

const refresh = () => revalidatePath("/", "layout");
const splitList = (v: string | undefined) => (v ?? "").split(/[,\n]+/).map((x) => x.trim()).filter(Boolean).slice(0, 30);

const campaignSchema = z
  .object({
    id: optionalUuid,
    name: requiredText("Name", 200),
    goal: optionalText(2000),
    description: optionalText(5000),
    start_date: optionalDate,
    end_date: optionalDate,
    owner_id: optionalUuid,
    status: z.enum(["planung", "aktiv", "abgeschlossen", "archiviert"]).default("planung"),
    topics: z.string().optional(),
  })
  .refine((d) => !d.start_date || !d.end_date || d.end_date >= d.start_date, { message: "Das Ende liegt vor dem Beginn.", path: ["end_date"] });

export async function saveCampaign(_: ActionResult<{ id: string }> | null, formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    await assertEditor();
    const { id, topics, ...d } = campaignSchema.parse(formToObject(formData));
    const supabase = await createClient();
    const values = { ...d, topics: splitList(topics) };
    if (id) {
      check(await supabase.from("campaigns").update(values).eq("id", id));
      refresh();
      return { id };
    }
    const created = check(await supabase.from("campaigns").insert(values).select("id").single());
    refresh();
    return { id: created.id };
  }, "Kampagne gespeichert.");
}

export async function deleteCampaign(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertEditor();
    const supabase = await createClient();
    check(await supabase.from("campaigns").delete().eq("id", uuid.parse(id)));
    refresh();
    return null;
  }, "Kampagne gelöscht – zugeordnete Akten bleiben erhalten.");
}

const ideaSchema = z.object({
  id: optionalUuid,
  title: requiredText("Titel", 250),
  description: optionalText(5000),
  tags: z.string().optional(),
  campaign_id: optionalUuid,
  client_id: optionalUuid,
  status: z.enum(["neu", "vorgemerkt", "umgesetzt", "verworfen"]).default("neu"),
  is_reusable: z.string().optional().transform((v) => v === "on"),
});

export async function saveIdea(_: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertProfile();
    const { id, tags, ...d } = ideaSchema.parse(formToObject(formData));
    const supabase = await createClient();
    const values = { ...d, tags: splitList(tags) };
    if (id) check(await supabase.from("ideas").update(values).eq("id", id));
    else check(await supabase.from("ideas").insert(values));
    refresh();
    return null;
  }, "Idee gespeichert.");
}

export async function deleteIdea(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertProfile();
    const supabase = await createClient();
    check(await supabase.from("ideas").delete().eq("id", uuid.parse(id)));
    refresh();
    return null;
  }, "Idee gelöscht.");
}
