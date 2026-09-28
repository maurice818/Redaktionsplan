import Link from "next/link";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Passwort vergessen" };

export default function ForgotPasswordPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Passwort zurücksetzen</h1>
      <p className="mt-1 text-sm text-muted-foreground">Wir senden Ihnen einen Link, mit dem Sie ein neues Passwort festlegen.</p>
      <ResetForm />
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-muted-foreground hover:text-foreground hover:underline">Zurück zur Anmeldung</Link>
      </p>
    </div>
  );
}
