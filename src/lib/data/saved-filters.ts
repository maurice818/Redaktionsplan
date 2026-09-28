import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SavedFilter } from "@/components/common/filter-bar";

export async function getSavedFilters(view: string): Promise<SavedFilter[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("saved_filters")
    .select("id, name, params, is_shared, owner_id")
    .eq("view", view)
    .order("name");
  return (data ?? []).map((f) => ({ ...f, params: (f.params ?? {}) as Record<string, unknown> }));
}

export function param(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0] || undefined;
  return value || undefined;
}
