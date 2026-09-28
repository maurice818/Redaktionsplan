import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { SetPasswordForm } from "./set-password-form";

export const metadata = { title: "Passwort festlegen" };

export default async function SetPasswordPage() {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login?fehler=link");
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Passwort festlegen</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Angemeldet als <strong>{profile.email}</strong>. Mindestens 10 Zeichen mit Groß- und Kleinbuchstaben sowie einer Ziffer.
      </p>
      <SetPasswordForm needsName={!profile.full_name} />
    </div>
  );
}
