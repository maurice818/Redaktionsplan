import "server-only";
import { encryptSecret } from "@/lib/security/crypto";
import type { AdminSupabase } from "@/lib/supabase/admin";

/** Konto anlegen bzw. aktualisieren und Zugangsdaten verschlüsselt speichern. */
export async function saveConnection(
  admin: AdminSupabase,
  input: {
    platform: "instagram" | "facebook" | "linkedin";
    externalId: string | null;
    displayName: string;
    authType: "facebook_login" | "instagram_login" | "linkedin_oauth";
    accessToken: string;
    refreshToken?: string | null;
    expiresAt: string | null;
    refreshExpiresAt?: string | null;
    scopes: string[];
    connectedBy: string;
    error?: string | null;
  },
): Promise<string> {
  let accountId: string | null = null;
  if (input.externalId) {
    const { data } = await admin.from("platform_accounts").select("id").eq("platform", input.platform).eq("external_id", input.externalId).maybeSingle();
    accountId = data?.id ?? null;
  }
  const values = {
    platform: input.platform,
    external_id: input.externalId,
    display_name: input.displayName,
    auth_type: input.authType,
    connection_status: input.error ? ("fehler" as const) : ("verbunden" as const),
    token_expires_at: input.expiresAt,
    scopes: input.scopes,
    connected_by: input.connectedBy,
    connected_at: new Date().toISOString(),
    last_checked_at: new Date().toISOString(),
    last_error: input.error ?? null,
  };
  if (accountId) {
    const { error } = await admin.from("platform_accounts").update(values).eq("id", accountId);
    if (error) throw error;
  } else {
    const { data, error } = await admin.from("platform_accounts").insert(values).select("id").single();
    if (error) throw error;
    accountId = data.id;
  }
  const { error: credError } = await admin.from("platform_credentials").upsert({
    account_id: accountId,
    access_token_enc: encryptSecret(input.accessToken),
    refresh_token_enc: input.refreshToken ? encryptSecret(input.refreshToken) : null,
    expires_at: input.expiresAt,
    refresh_expires_at: input.refreshExpiresAt ?? null,
    updated_at: new Date().toISOString(),
  });
  if (credError) throw credError;
  return accountId;
}
