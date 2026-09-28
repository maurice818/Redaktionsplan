import { type NextRequest, NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { linkedinAdminOrganizations, linkedinExchangeCode } from "@/lib/platforms/linkedin";
import { consumeOAuthState } from "@/lib/platforms/oauth-state";
import { saveConnection } from "@/lib/platforms/save-connection";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const back = `${publicEnv.appUrl}/einstellungen/integrationen`;
  const profile = await getSessionProfile();
  if (!profile?.is_active || profile.role !== "admin") return new Response("Nur für Admins.", { status: 403 });

  const params = request.nextUrl.searchParams;
  if (!(await consumeOAuthState("linkedin", params.get("state")))) {
    return NextResponse.redirect(`${back}?fehler=${encodeURIComponent("Ungültiger oder abgelaufener Anmeldevorgang. Bitte erneut verbinden.")}`);
  }
  if (params.get("error")) {
    return NextResponse.redirect(`${back}?fehler=${encodeURIComponent(`LinkedIn: ${params.get("error_description") ?? params.get("error")}`)}`);
  }
  const code = params.get("code");
  if (!code) return NextResponse.redirect(`${back}?fehler=${encodeURIComponent("Kein Autorisierungscode erhalten.")}`);

  try {
    const tokens = await linkedinExchangeCode(code, `${publicEnv.appUrl}/api/integrations/linkedin/callback`);
    const orgs = await linkedinAdminOrganizations(tokens.accessToken);
    const admin = createAdminClient();
    const base = {
      platform: "linkedin" as const,
      authType: "linkedin_oauth" as const,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      refreshExpiresAt: tokens.refreshExpiresAt,
      scopes: tokens.scopes,
      connectedBy: profile.id,
    };
    if (orgs.length === 0) {
      await saveConnection(admin, { ...base, externalId: null, displayName: "LinkedIn (Organisation noch zuordnen)", error: "Keine Organisation mit Admin-Rolle gefunden – bitte Organisations-ID manuell eintragen." });
    }
    for (const org of orgs) {
      await saveConnection(admin, { ...base, externalId: org.id, displayName: org.name });
    }
    const missing = tokens.scopes.length && !tokens.scopes.includes("w_organization_social") ? " Achtung: Berechtigung w_organization_social wurde nicht erteilt." : "";
    return NextResponse.redirect(`${back}?hinweis=${encodeURIComponent(`LinkedIn verbunden (${orgs.length} Organisation(en)). API-Veröffentlichung bitte nach Prüfung bewusst aktivieren.${missing}`)}`);
  } catch (error) {
    return NextResponse.redirect(`${back}?fehler=${encodeURIComponent((error as Error).message)}`);
  }
}
