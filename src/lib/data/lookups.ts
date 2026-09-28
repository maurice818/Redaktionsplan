import "server-only";
import { cache } from "react";
import type { ServerSupabase } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";
import type { Option } from "@/components/common/form";
import { ROLE_LABELS } from "@/lib/labels";

export interface PersonLite {
  id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
}

export const getPeople = cache(async (): Promise<PersonLite[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, full_name, email, role, is_active").order("full_name");
  return data ?? [];
});

export function personName(people: PersonLite[], id: string | null | undefined): string {
  if (!id) return "Nicht zugewiesen";
  const p = people.find((x) => x.id === id);
  return p ? p.full_name || p.email : "Unbekannt";
}

export function peopleOptions(people: PersonLite[], opts: { includeInactive?: boolean } = {}): Option[] {
  return people
    .filter((p) => opts.includeInactive || p.is_active)
    .map((p) => ({ value: p.id, label: `${p.full_name || p.email} (${ROLE_LABELS[p.role] ?? p.role})` }));
}

export const getClientsLite = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("id, name, is_demo, status").order("name");
  return data ?? [];
});

export const getCampaignsLite = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("campaigns").select("id, name, status, is_demo").order("start_date", { ascending: false, nullsFirst: false });
  return data ?? [];
});

export const getPackageTemplates = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("package_templates")
    .select("id, key, name, description, is_active, revision, sort_order, package_template_items(id, service_type_id, label, quantity, period, per_parent_item_id, quantity_per_parent, notes, sort_order, service_types(name, key, content_kind, category))")
    .order("sort_order");
  return data ?? [];
});

export const getServiceTypes = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("service_types").select("*").order("sort_order");
  return data ?? [];
});

export const getFormatRules = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("format_rules").select("*").order("channel").order("post_format");
  return data ?? [];
});

export const getPlatformAccounts = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("platform_accounts").select("*").order("platform").order("display_name");
  return data ?? [];
});

export const getSettings = cache(async (): Promise<Record<string, unknown>> => {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("key, value");
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
});

export function settingNumber(settings: Record<string, unknown>, key: string, fallback: number): number {
  const v = settings[key];
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function signedUrls(supabase: ServerSupabase, paths: string[], seconds = 3600): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return {};
  const { data } = await supabase.storage.from("media").createSignedUrls(unique, seconds);
  const out: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) out[item.path] = item.signedUrl;
  }
  return out;
}
