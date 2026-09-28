import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import type { Database } from "./database.types";

/**
 * Service-Client mit Secret Key – umgeht RLS.
 * Nur für eng begrenzte, serverseitige Aufgaben verwenden:
 *  - Hintergrundprozess (Erinnerungen, Veröffentlichung)
 *  - E-Mail-Protokoll schreiben
 *  - signierte Storage-URLs für Kundenlinks (nach Token-Prüfung)
 *  - Einladungen von Teammitgliedern (nach Admin-Prüfung)
 */
export function createAdminClient() {
  if (!serverEnv.supabaseSecretKey) {
    throw new Error(
      "SUPABASE_SECRET_KEY ist nicht gesetzt. Diese Funktion benötigt den Secret Key (nur serverseitig).",
    );
  }
  return createClient<Database>(publicEnv.supabaseUrl, serverEnv.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export type AdminSupabase = ReturnType<typeof createAdminClient>;
