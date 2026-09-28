import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForms } from "./login-forms";
import { getSessionProfile } from "@/lib/auth";
import { signOutAction } from "@/actions/general";

export const metadata = { title: "Anmelden" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const profile = await getSessionProfile();
  const inactive = params.fehler === "inaktiv";
  if (profile?.is_active) redirect("/");
  const weiter = typeof params.weiter === "string" ? params.weiter : "/";
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Anmelden</h1>
      <p className="mt-1 text-sm text-muted-foreground">Mit Ihrem Konto der MEET GERMANY Redaktionszentrale.</p>
      {(inactive || (profile && !profile.is_active)) && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
          Ihr Konto ist noch nicht freigeschaltet. Bitte wenden Sie sich an eine Person mit Admin-Rolle.
          {profile && (
            <form action={signOutAction} className="mt-2">
              <button type="submit" className="font-medium underline underline-offset-4">Abmelden</button>
            </form>
          )}
        </div>
      )}
      {params.fehler === "link" && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert">
          Der Anmeldelink ist ungültig oder abgelaufen. Bitte fordern Sie einen neuen Link an.
        </div>
      )}
      <LoginForms weiter={weiter} />
      <p className="mt-6 text-center text-sm">
        <Link href="/passwort-vergessen" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Passwort vergessen?
        </Link>
      </p>
    </div>
  );
}
