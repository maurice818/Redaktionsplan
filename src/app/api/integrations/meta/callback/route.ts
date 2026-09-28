import { type NextRequest, NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { META_SCOPES, metaExchangeCode } from "@/lib/platforms/meta";
import { consumeOAuthState } from "@/lib/platforms/oauth-state";
import { saveConnection } from "@/lib/platforms/save-connection";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const back = `${publicEnv.appUrl}/einstellungen/integrationen`;
  const profile = await getSessionProfile();
  if (!profile?.is_active || profile.role !== "admin") return new Response("Nur für Admins.", { status: 403 });

  const params = request.nextUrl.searchParams;
  if (!(await consumeOAuthState("meta", params.get("state")))) {
    return NextResponse.redirect(`${back}?fehler=${encodeURIComponent("Ungültiger oder abgelaufener Anmeldevorgang. Bitte erneut verbinden.")}`);
  }
  if (params.get("error")) {
    return NextResponse.redirect(`${back}?fehler=${encodeURIComponent(`Meta: ${params.get("error_description") ?? params.get("error")}`)}`);
  }
  const code = params.get("code");
  if (!code) return NextResponse.redirect(`${back}?fehler=${encodeURIComponent("Kein Autorisierungscode erhalten.")}`);

  try {
    const assets = await metaExchangeCode(code, `${publicEnv.appUrl}/api/integrations/meta/callback`);
    const admin = createAdminClient();
    for (const a of assets) {
      await saveConnection(admin, {
        platform: a.platform,
        externalId: a.externalId,
        displayName: a.displayName,
        authType: "facebook_login",
        accessToken: a.accessToken,
        expiresAt: a.expiresAt,
        scopes: META_SCOPES,
        connectedBy: profile.id,
      });
    }
    const msg = assets.length
      ? `${assets.length} Konto/Konten verbunden. API-Veröffentlichung ist noch deaktiviert – bitte je Konto prüfen und bewusst aktivieren.`
      : "Keine Facebook-Seiten gefunden. Hat Ihr Nutzer Zugriff auf die MEET-GERMANY-Seite?";
    return NextResponse.redirect(`${back}?hinweis=${encodeURIComponent(msg)}`);
  } catch (error) {
    return NextResponse.redirect(`${back}?fehler=${encodeURIComponent((error as Error).message)}`);
  }
}
