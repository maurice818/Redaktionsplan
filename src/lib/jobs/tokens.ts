import "server-only";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";
import type { AdminSupabase } from "@/lib/supabase/admin";
import { features } from "@/lib/env.server";
import { linkedinRefresh } from "@/lib/platforms/linkedin";

/**
 * Überwacht Autorisierungen: markiert abgelaufene Konten, erneuert
 * LinkedIn-Tokens (sofern ein Refresh Token vorliegt) und warnt rechtzeitig.
 */
export async function checkTokens(admin: AdminSupabase): Promise<{ expired: number; refreshed: number; warned: number }> {
  const result = { expired: 0, refreshed: 0, warned: 0 };
  const { data: accounts } = await admin
    .from("platform_accounts")
    .select("id, platform, display_name, connection_status, token_expires_at, connected_by")
    .eq("connection_status", "verbunden");
  const now = Date.now();

  for (const acc of accounts ?? []) {
    if (!acc.token_expires_at) continue;
    const expiresAt = new Date(acc.token_expires_at).getTime();
    const daysLeft = (expiresAt - now) / 86_400_000;

    if (acc.platform === "linkedin" && daysLeft < 10 && features.linkedin()) {
      const { data: cred } = await admin.from("platform_credentials").select("*").eq("account_id", acc.id).maybeSingle();
      if (cred?.refresh_token_enc && (!cred.refresh_expires_at || new Date(cred.refresh_expires_at).getTime() > now)) {
        try {
          const tokens = await linkedinRefresh(decryptSecret(cred.refresh_token_enc));
          await admin.from("platform_credentials").update({
            access_token_enc: encryptSecret(tokens.accessToken),
            refresh_token_enc: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : cred.refresh_token_enc,
            expires_at: tokens.expiresAt,
            refresh_expires_at: tokens.refreshExpiresAt ?? cred.refresh_expires_at,
            updated_at: new Date().toISOString(),
          }).eq("account_id", acc.id);
          await admin.from("platform_accounts").update({ token_expires_at: tokens.expiresAt, last_error: null }).eq("id", acc.id);
          result.refreshed++;
          continue;
        } catch (e) {
          await admin.from("platform_accounts").update({ last_error: (e as Error).message }).eq("id", acc.id);
        }
      }
    }

    if (expiresAt < now) {
      await admin.from("platform_accounts").update({ connection_status: "abgelaufen" }).eq("id", acc.id);
      result.expired++;
    } else if (daysLeft < 14 && acc.connected_by) {
      const week = Math.floor(now / (7 * 86_400_000));
      await admin.rpc("system_notify", {
        p_recipient: acc.connected_by,
        p_kind: "autorisierung_laeuft_ab",
        p_title: `Autorisierung läuft ab: ${acc.display_name}`,
        p_body: `Die Verbindung zu ${acc.platform} läuft in ${Math.max(0, Math.round(daysLeft))} Tagen ab. Bitte in den Einstellungen neu verbinden.`,
        p_link: "/einstellungen/integrationen",
        p_dedupe_key: `token:${acc.id}:${week}`,
      });
      result.warned++;
    }
  }
  return result;
}
