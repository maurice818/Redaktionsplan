import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Client ohne Nutzersitzung (Rolle anon) für Kundenlinks. Hat keinen
 * Tabellenzugriff – nur die tokengeprüften public_*-Funktionen.
 */
export function createAnonClient() {
  return createClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
