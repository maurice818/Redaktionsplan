/**
 * Öffentliche Konfiguration (auch im Browser verfügbar).
 * Geheime Werte liegen ausschließlich in src/lib/env.server.ts.
 */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  // Neuer Publishable Key (sb_publishable_…) oder – für ältere Projekte – der anon key.
  supabaseKey:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  appUrl: (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
};

export function isSupabaseConfigured(): boolean {
  return Boolean(publicEnv.supabaseUrl && publicEnv.supabaseKey);
}

export const APP_TIME_ZONE = "Europe/Berlin";
export const APP_NAME = "MEET GERMANY Redaktionszentrale";
