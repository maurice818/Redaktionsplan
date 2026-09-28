import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { features } from "@/lib/env.server";
import { metaAuthorizeUrl } from "@/lib/platforms/meta";
import { createOAuthState } from "@/lib/platforms/oauth-state";

export const dynamic = "force-dynamic";

export async function GET() {
  const profile = await getSessionProfile();
  if (!profile?.is_active || profile.role !== "admin") return new Response("Nur für Admins.", { status: 403 });
  const back = `${publicEnv.appUrl}/einstellungen/integrationen`;
  if (!features.meta() || !features.encryption() || !features.admin()) {
    return NextResponse.redirect(`${back}?fehler=${encodeURIComponent("Meta-App, APP_ENCRYPTION_KEY oder SUPABASE_SECRET_KEY fehlen.")}`);
  }
  const state = await createOAuthState("meta");
  return NextResponse.redirect(metaAuthorizeUrl(`${publicEnv.appUrl}/api/integrations/meta/callback`, state));
}
