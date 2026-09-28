import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { features } from "@/lib/env.server";
import { linkedinAuthorizeUrl } from "@/lib/platforms/linkedin";
import { createOAuthState } from "@/lib/platforms/oauth-state";

export const dynamic = "force-dynamic";

export async function GET() {
  const profile = await getSessionProfile();
  if (!profile?.is_active || profile.role !== "admin") return new Response("Nur für Admins.", { status: 403 });
  const back = `${publicEnv.appUrl}/einstellungen/integrationen`;
  if (!features.linkedin() || !features.encryption() || !features.admin()) {
    return NextResponse.redirect(`${back}?fehler=${encodeURIComponent("LinkedIn-App, APP_ENCRYPTION_KEY oder SUPABASE_SECRET_KEY fehlen.")}`);
  }
  const state = await createOAuthState("linkedin");
  return NextResponse.redirect(linkedinAuthorizeUrl(`${publicEnv.appUrl}/api/integrations/linkedin/callback`, state));
}
