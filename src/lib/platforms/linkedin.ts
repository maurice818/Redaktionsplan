import "server-only";
import { serverEnv } from "@/lib/env.server";
import { httpJson } from "./http";
import { toLinkedInLittleText } from "./text";
import type { AttemptLog, ConnectionCheck, PlatformAdapter, PublishContext, PublishOutcome } from "./types";
import { redact } from "./types";

/**
 * LinkedIn Posts API (versioniert, Header Linkedin-Version: YYYYMM).
 * Organisationsbeiträge erfordern die Berechtigung w_organization_social
 * (Community Management API – Freigabe durch LinkedIn erforderlich).
 */
const API = "https://api.linkedin.com/rest";

function headers(token: string, json = true): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Linkedin-Version": serverEnv.linkedinApiVersion,
    "X-Restli-Protocol-Version": "2.0.0",
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function liError(body: unknown, status: number): string {
  const b = body as { message?: string; serviceErrorCode?: number; code?: string };
  return `LinkedIn ${status}: ${b?.message ?? (typeof body === "string" ? body.slice(0, 300) : "Unbekannter Fehler")}`;
}

async function uploadImage(ctx: PublishContext, owner: string, index: number, log: AttemptLog): Promise<{ urn?: string; error?: string }> {
  const media = ctx.media[index];
  const init = await httpJson<{ value?: { uploadUrl?: string; image?: string } }>(`${API}/images?action=initializeUpload`, {
    method: "POST",
    headers: headers(ctx.accessToken),
    body: JSON.stringify({ initializeUploadRequest: { owner } }),
  });
  await log({ step: `bild_${index + 1}_init`, outcome: init.ok ? "erfolg" : "fehler", httpStatus: init.status, response: redact(init.body) });
  const uploadUrl = init.body?.value?.uploadUrl;
  const urn = init.body?.value?.image;
  if (!init.ok || !uploadUrl || !urn) return { error: init.networkError ?? liError(init.body, init.status) };

  const file = await fetch(media.url, { signal: AbortSignal.timeout(30_000) }).catch((e: Error) => e);
  if (file instanceof Error || !file.ok) {
    return { error: `Medium konnte nicht aus dem Speicher geladen werden (${file instanceof Error ? file.message : file.status}).` };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${ctx.accessToken}`, "Content-Type": media.mimeType ?? "application/octet-stream" },
    body: bytes,
    signal: AbortSignal.timeout(60_000),
  }).catch((e: Error) => e);
  const ok = !(put instanceof Error) && put.ok;
  await log({ step: `bild_${index + 1}_upload`, outcome: ok ? "erfolg" : "fehler", httpStatus: put instanceof Error ? 0 : put.status, error: ok ? null : put instanceof Error ? put.message : `HTTP ${put.status}` });
  if (!ok) return { error: "Bild-Upload zu LinkedIn fehlgeschlagen." };
  return { urn };
}

export const linkedinAdapter: PlatformAdapter = {
  platform: "linkedin",
  label: "LinkedIn-Unternehmensseite",
  supportedFormats: ["text", "link", "feed_bild", "karussell"],
  requirements: [
    "LinkedIn-App mit Produkt „Community Management API“ (Antrag, Prüfung und ggf. Screencast durch LinkedIn)",
    "Berechtigungen: w_organization_social, r_organization_social, rw_organization_admin (zum Auslesen der Seiten)",
    "Ihr Nutzer ist Administrator oder Content-Admin der MEET-GERMANY-Unternehmensseite",
    "Access Token ist 60 Tage gültig; Refresh Tokens nur, wenn LinkedIn sie für die App freigibt",
    `API-Version: ${serverEnv.linkedinApiVersion} (Header Linkedin-Version, jährlich aktualisieren)`,
    "Videos: in dieser Version manuelle Veröffentlichung",
  ],

  async publish(ctx, log) {
    const owner = `urn:li:organization:${ctx.account.externalId}`;
    const fmt = ctx.content.postFormat;
    const body: Record<string, unknown> = {
      author: owner,
      commentary: toLinkedInLittleText(ctx.content.text),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    };

    if (fmt === "feed_bild") {
      const up = await uploadImage(ctx, owner, 0, log);
      if (!up.urn) return { status: "failed", error: up.error ?? "Bild-Upload fehlgeschlagen." };
      body.content = { media: { id: up.urn, altText: ctx.media[0]?.altText ?? undefined } };
    } else if (fmt === "karussell") {
      if (ctx.media.length < 2 || ctx.media.length > 20) return { status: "failed", error: "Ein Mehrbild-Beitrag benötigt 2 bis 20 Bilder." };
      const images: { id: string; altText?: string }[] = [];
      for (let i = 0; i < ctx.media.length; i++) {
        const up = await uploadImage(ctx, owner, i, log);
        if (!up.urn) return { status: "failed", error: up.error ?? `Bild ${i + 1} konnte nicht hochgeladen werden.` };
        images.push({ id: up.urn, altText: ctx.media[i].altText ?? undefined });
      }
      body.content = { multiImage: { images } };
    } else if (fmt === "link") {
      if (!ctx.content.linkUrl) return { status: "failed", error: "Für einen Link-Beitrag fehlt der Link." };
      const article: Record<string, unknown> = {
        source: ctx.content.linkUrl,
        title: ctx.content.title,
        description: ctx.content.teaser ?? undefined,
      };
      if (ctx.media[0]) {
        const up = await uploadImage(ctx, owner, 0, log);
        if (up.urn) article.thumbnail = up.urn;
      }
      body.content = { article };
    } else if (fmt !== "text") {
      return { status: "failed", error: `Das Format „${fmt}“ wird für LinkedIn in dieser Version nicht per API unterstützt – bitte manuell veröffentlichen.` };
    }

    const res = await httpJson(`${API}/posts`, { method: "POST", headers: headers(ctx.accessToken), body: JSON.stringify(body), timeoutMs: 30_000 });
    if (res.networkError) {
      await log({ step: "publish", outcome: "unklar", error: res.networkError });
      return { status: "unknown", error: `Keine Antwort von LinkedIn (${res.networkError}). Bitte auf der Unternehmensseite prüfen.` };
    }
    const urn = res.headers.get("x-restli-id");
    await log({
      step: "publish",
      outcome: res.status === 201 ? "erfolg" : "fehler",
      httpStatus: res.status,
      request: { author: owner, format: fmt },
      response: redact(res.body),
      error: res.status === 201 ? null : liError(res.body, res.status),
    });
    if (res.status !== 201) return { status: "failed", error: liError(res.body, res.status) };
    if (!urn) return { status: "unknown", error: "LinkedIn hat die Veröffentlichung bestätigt, aber keine Post-ID geliefert." };
    return { status: "published", postId: urn, url: `https://www.linkedin.com/feed/update/${urn}/` } satisfies PublishOutcome;
  },

  async verify(accessToken) {
    if (!serverEnv.linkedinClientId || !serverEnv.linkedinClientSecret) {
      return { ok: false, detail: "LINKEDIN_CLIENT_ID/SECRET fehlen – Token kann nicht geprüft werden." };
    }
    const res = await httpJson<{ active?: boolean; expires_at?: number; scope?: string }>(
      "https://www.linkedin.com/oauth/v2/introspectToken",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: serverEnv.linkedinClientId, client_secret: serverEnv.linkedinClientSecret, token: accessToken }),
      },
    );
    if (!res.ok || !res.body.active) {
      return { ok: false, detail: res.networkError ?? "Token ist laut LinkedIn nicht aktiv." };
    }
    const scopes = res.body.scope?.split(/[ ,]+/).filter(Boolean);
    const expiresAt = res.body.expires_at ? new Date(res.body.expires_at * 1000).toISOString() : null;
    const missing = scopes && !scopes.includes("w_organization_social") ? " – Berechtigung w_organization_social fehlt!" : "";
    return { ok: !missing, detail: `Token aktiv${missing}`, expiresAt, scopes } satisfies ConnectionCheck;
  },
};

// -----------------------------------------------------------------------------
// OAuth
// -----------------------------------------------------------------------------
export const LINKEDIN_SCOPES = ["w_organization_social", "r_organization_social", "rw_organization_admin"];

export function linkedinAuthorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: serverEnv.linkedinClientId,
    redirect_uri: redirectUri,
    state,
    scope: LINKEDIN_SCOPES.join(" "),
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${params}`;
}

export interface LinkedInTokens {
  accessToken: string;
  expiresAt: string | null;
  refreshToken: string | null;
  refreshExpiresAt: string | null;
  scopes: string[];
}

export async function linkedinExchangeCode(code: string, redirectUri: string): Promise<LinkedInTokens> {
  const res = await httpJson<{ access_token?: string; expires_in?: number; refresh_token?: string; refresh_token_expires_in?: number; scope?: string; error_description?: string }>(
    "https://www.linkedin.com/oauth/v2/accessToken",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: serverEnv.linkedinClientId,
        client_secret: serverEnv.linkedinClientSecret,
      }),
    },
  );
  if (!res.ok || !res.body.access_token) {
    throw new Error(`LinkedIn-Anmeldung fehlgeschlagen: ${res.networkError ?? res.body.error_description ?? res.status}`);
  }
  return tokensFrom(res.body);
}

export async function linkedinRefresh(refreshToken: string): Promise<LinkedInTokens> {
  const res = await httpJson<{ access_token?: string; expires_in?: number; refresh_token?: string; refresh_token_expires_in?: number; scope?: string; error_description?: string }>(
    "https://www.linkedin.com/oauth/v2/accessToken",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: serverEnv.linkedinClientId,
        client_secret: serverEnv.linkedinClientSecret,
      }),
    },
  );
  if (!res.ok || !res.body.access_token) {
    throw new Error(`Token-Erneuerung fehlgeschlagen: ${res.networkError ?? res.body.error_description ?? res.status}`);
  }
  return tokensFrom(res.body, refreshToken);
}

function tokensFrom(
  body: { access_token?: string; expires_in?: number; refresh_token?: string; refresh_token_expires_in?: number; scope?: string },
  previousRefresh: string | null = null,
): LinkedInTokens {
  const now = Date.now();
  return {
    accessToken: body.access_token!,
    expiresAt: body.expires_in ? new Date(now + body.expires_in * 1000).toISOString() : null,
    refreshToken: body.refresh_token ?? previousRefresh,
    refreshExpiresAt: body.refresh_token_expires_in ? new Date(now + body.refresh_token_expires_in * 1000).toISOString() : null,
    scopes: body.scope?.split(/[ ,]+/).filter(Boolean) ?? [],
  };
}

export async function linkedinAdminOrganizations(accessToken: string): Promise<{ id: string; name: string }[]> {
  const res = await httpJson<{ elements?: { organization?: string; organizationTarget?: string }[] }>(
    `${API}/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED`,
    { headers: headers(accessToken, false) },
  );
  if (!res.ok) return [];
  const ids = (res.body.elements ?? [])
    .map((e) => (e.organization ?? e.organizationTarget ?? "").split(":").pop() ?? "")
    .filter(Boolean);
  const result: { id: string; name: string }[] = [];
  for (const id of [...new Set(ids)]) {
    const org = await httpJson<{ localizedName?: string }>(`${API}/organizations/${id}`, { headers: headers(accessToken, false) });
    result.push({ id, name: org.ok && org.body.localizedName ? org.body.localizedName : `LinkedIn-Organisation ${id}` });
  }
  return result;
}
