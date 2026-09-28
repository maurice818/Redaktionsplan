"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertProfile } from "@/lib/auth";
import { check, runAction, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";

export interface SearchHit {
  entity_type: string;
  id: string;
  title: string;
  subtitle: string | null;
  url: string;
}

export async function searchAction(query: string): Promise<ActionResult<SearchHit[]>> {
  return runAction(async () => {
    await assertProfile();
    const q = z.string().max(100).parse(query ?? "");
    if (q.trim().length < 2) return [];
    const supabase = await createClient();
    return check(await supabase.rpc("search_all", { p_query: q, p_limit: 30 })) ?? [];
  });
}

export async function markNotificationsRead(ids?: string[]): Promise<ActionResult<null>> {
  return runAction(async () => {
    const profile = await assertProfile();
    const supabase = await createClient();
    let query = supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("recipient_id", profile.id).is("read_at", null);
    if (ids?.length) query = query.in("id", ids);
    check(await query);
    revalidatePath("/", "layout");
    return null;
  });
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// -----------------------------------------------------------------------------
// Gespeicherte Filter
// -----------------------------------------------------------------------------
const filterSchema = z.object({
  view: z.string().min(1).max(40),
  name: z.string().trim().min(1, "Bitte einen Namen angeben.").max(80),
  params: z.string().max(2000),
  shared: z.boolean(),
});

export async function saveFilterAction(input: z.infer<typeof filterSchema>): Promise<ActionResult<null>> {
  return runAction(async () => {
    const profile = await assertProfile();
    const data = filterSchema.parse(input);
    const params = Object.fromEntries(new URLSearchParams(data.params));
    const supabase = await createClient();
    check(await supabase.from("saved_filters").insert({ owner_id: profile.id, view: data.view, name: data.name, params, is_shared: data.shared }));
    revalidatePath("/", "layout");
    return null;
  }, "Filter gespeichert.");
}

export async function deleteFilterAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertProfile();
    const supabase = await createClient();
    check(await supabase.from("saved_filters").delete().eq("id", z.string().uuid().parse(id)));
    revalidatePath("/", "layout");
    return null;
  }, "Filter gelöscht.");
}
