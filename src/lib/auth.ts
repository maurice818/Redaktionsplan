import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canApprove, canEdit, isAdmin, type Role } from "@/lib/permissions";

export interface SessionProfile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
}

/** Aktuelles Profil (einmal pro Anfrage geladen). Verifiziert das JWT über getClaims(). */
export const getSessionProfile = cache(async (): Promise<SessionProfile | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (!sub) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_active")
    .eq("id", sub)
    .maybeSingle();
  if (!profile) return null;
  return { ...profile, role: profile.role as Role };
});

export async function requireProfile(): Promise<SessionProfile> {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  if (!profile.is_active) redirect("/login?fehler=inaktiv");
  return profile;
}

export async function requireEditor(): Promise<SessionProfile> {
  const profile = await requireProfile();
  if (!canEdit(profile.role)) redirect("/?fehler=berechtigung");
  return profile;
}

export async function requireAdmin(): Promise<SessionProfile> {
  const profile = await requireProfile();
  if (!isAdmin(profile.role)) redirect("/?fehler=berechtigung");
  return profile;
}

/** Für Server Actions: wirft statt umzuleiten. */
export class PermissionError extends Error {
  constructor(message = "Dafür fehlt Ihnen die Berechtigung.") {
    super(message);
    this.name = "PermissionError";
  }
}

export async function assertProfile(): Promise<SessionProfile> {
  const profile = await getSessionProfile();
  if (!profile || !profile.is_active) throw new PermissionError("Bitte melden Sie sich an.");
  return profile;
}

export async function assertEditor(): Promise<SessionProfile> {
  const profile = await assertProfile();
  if (!canEdit(profile.role)) throw new PermissionError();
  return profile;
}

export async function assertApprover(): Promise<SessionProfile> {
  const profile = await assertProfile();
  if (!canApprove(profile.role)) throw new PermissionError("Nur Freigabe/Leitung oder Admin darf das.");
  return profile;
}

export async function assertAdmin(): Promise<SessionProfile> {
  const profile = await assertProfile();
  if (!isAdmin(profile.role)) throw new PermissionError("Nur Admins dürfen das.");
  return profile;
}
