"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function signInWithPassword(_: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  const parsed = z
    .object({ email: z.string().trim().toLowerCase().email("Bitte eine gültige E-Mail-Adresse angeben."), password: z.string().min(1, "Bitte das Passwort eingeben.") })
    .safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return fail("Anmeldung fehlgeschlagen. Bitte E-Mail-Adresse und Passwort prüfen.");
  redirect(safeNext(formData.get("weiter")));
}

export async function sendMagicLink(_: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  const parsed = z.string().trim().toLowerCase().email("Bitte eine gültige E-Mail-Adresse angeben.").safeParse(formData.get("email"));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { shouldCreateUser: false, emailRedirectTo: `${publicEnv.appUrl}/auth/callback?next=${encodeURIComponent(safeNext(formData.get("weiter")))}` },
  });
  // Keine Auskunft darüber, ob ein Konto existiert
  if (error && error.status !== 400 && error.status !== 422) return fail("Der Link konnte nicht versendet werden. Bitte später erneut versuchen.");
  return ok(null, "Falls ein Konto existiert, wurde ein Anmeldelink versendet.");
}

export async function requestPasswordReset(_: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  const parsed = z.string().trim().toLowerCase().email("Bitte eine gültige E-Mail-Adresse angeben.").safeParse(formData.get("email"));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${publicEnv.appUrl}/auth/callback?next=/passwort-setzen`,
  });
  return ok(null, "Falls ein Konto existiert, wurde eine E-Mail zum Zurücksetzen versendet.");
}

export async function setPassword(_: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  const schema = z
    .object({
      password: z
        .string()
        .min(10, "Mindestens 10 Zeichen.")
        .regex(/[a-z]/, "Mindestens ein Kleinbuchstabe.")
        .regex(/[A-Z]/, "Mindestens ein Großbuchstabe.")
        .regex(/[0-9]/, "Mindestens eine Ziffer."),
      confirm: z.string(),
      full_name: z.string().trim().max(120).optional(),
    })
    .refine((d) => d.password === d.confirm, { message: "Die Passwörter stimmen nicht überein.", path: ["confirm"] });
  const parsed = schema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
    full_name: formData.get("full_name") ?? undefined,
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0].message, Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])));
  }
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return fail("Die Sitzung ist abgelaufen. Bitte den Link aus der E-Mail erneut öffnen.");
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fail(`Das Passwort konnte nicht gesetzt werden: ${error.message}`);
  if (parsed.data.full_name) {
    await supabase.from("profiles").update({ full_name: parsed.data.full_name }).eq("id", claims.claims.sub);
  }
  redirect("/");
}
