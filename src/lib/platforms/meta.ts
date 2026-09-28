import "server-only";
import { serverEnv } from "@/lib/env.server";
import { graphErrorMessage, httpJson } from "./http";
import type { AttemptLog, ConnectionCheck, PlatformAdapter, PublishContext, PublishOutcome } from "./types";
import { redact } from "./types";

/**
 * Meta Graph API (Facebook-Seiten & Instagram professionelle Konten via
 * Facebook Login). Version über META_GRAPH_API_VERSION (Standard v26.0).
 *
 * Instagram: Container anlegen → Status prüfen → media_publish → Permalink.
 * Facebook:  /{page-id}/feed (Text/Link), /{page-id}/photos (Bild),
 *            mehrere Bilder unveröffentlicht hochladen + attached_media.
 */
const graph = () => `https://graph.facebook.com/${serverEnv.metaGraphVersion}`;

function form(params: Record<string, string | number | boolean | undefined | null>): URLSearchParams {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") body.set(k, String(v));
  }
  return body;
}

async function post(path: string, params: Record<string, string | number | boolean | undefined | null>) {
  return httpJson<Record<string, unknown>>(`${graph()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form(params),
  });
}

async function get(path: string, params: Record<string, string>) {
  return httpJson<Record<string, unknown>>(`${graph()}${path}?${new URLSearchParams(params)}`);
}

async function verifyMetaToken(accessToken: string, objectId: string, fields: string): Promise<ConnectionCheck> {
  const res = await get(`/${objectId}`, { fields, access_token: accessToken });
  if (!res.ok) {
    return { ok: false, detail: res.networkError ?? graphErrorMessage(res.body) };
  }
  let expiresAt: string | null = null;
  let scopes: string[] | undefined;
  if (serverEnv.metaAppId && serverEnv.metaAppSecret) {
    const dbg = await get("/debug_token", {
      input_token: accessToken,
      access_token: `${serverEnv.metaAppId}|${serverEnv.metaAppSecret}`,
    });
    const data = (dbg.body as { data?: { expires_at?: number; data_access_expires_at?: number; scopes?: string[]; is_valid?: boolean } }).data;
    if (data?.is_valid === false) return { ok: false, detail: "Das Token ist laut Meta nicht mehr gültig." };
    if (data?.expires_at) expiresAt = new Date(data.expires_at * 1000).toISOString();
    scopes = data?.scopes;
  }
  const name = (res.body as { name?: string; username?: string }).name ?? (res.body as { username?: string }).username;
  return { ok: true, detail: `Verbunden mit ${name ?? objectId}`, expiresAt, scopes };
}

// -----------------------------------------------------------------------------
// Instagram
// -----------------------------------------------------------------------------
async function igContainerStatus(containerId: string, token: string) {
  return get(`/${containerId}`, { fields: "status_code,status", access_token: token });
}

async function igCreateContainer(ctx: PublishContext, log: AttemptLog): Promise<{ id?: string; error?: string }> {
  const ig = ctx.account.externalId;
  const token = ctx.accessToken;
  const media = ctx.media;
  const fmt = ctx.content.postFormat;

  const createSingle = async (params: Record<string, string | boolean | undefined | null>, step: string) => {
    const res = await post(`/${ig}/media`, { ...params, access_token: token });
    await log({
      step,
      outcome: res.ok ? "erfolg" : "fehler",
      httpStatus: res.status,
      request: redact(params) as Record<string, unknown>,
      response: redact(res.body),
      error: res.ok ? null : res.networkError ?? graphErrorMessage(res.body),
    });
    if (!res.ok) return { error: res.networkError ?? graphErrorMessage(res.body) };
    return { id: String((res.body as { id?: string }).id ?? "") };
  };

  if (fmt === "feed_bild") {
    const m = media[0];
    if (!m || m.kind !== "bild") return { error: "Für einen Feed-Beitrag wird ein Bild benötigt." };
    return createSingle({ image_url: m.url, caption: ctx.content.text, alt_text: m.altText ?? undefined }, "container");
  }
  if (fmt === "reel") {
    const m = media.find((x) => x.kind === "video");
    if (!m) return { error: "Für ein Reel wird ein Video benötigt." };
    return createSingle({ media_type: "REELS", video_url: m.url, caption: ctx.content.text, share_to_feed: true }, "container");
  }
  if (fmt === "story") {
    const m = media[0];
    if (!m) return { error: "Für eine Story wird ein Bild oder Video benötigt." };
    return createSingle(
      m.kind === "video" ? { media_type: "STORIES", video_url: m.url } : { media_type: "STORIES", image_url: m.url },
      "container",
    );
  }
  if (fmt === "karussell") {
    if (media.length < 2 || media.length > 10) return { error: "Ein Instagram-Karussell benötigt 2 bis 10 Medien." };
    const children: string[] = [];
    for (const [i, m] of media.entries()) {
      const child = await createSingle(
        m.kind === "video"
          ? { media_type: "VIDEO", video_url: m.url, is_carousel_item: true }
          : { image_url: m.url, is_carousel_item: true, alt_text: m.altText ?? undefined },
        `karussell_element_${i + 1}`,
      );
      if (!child.id) return { error: child.error ?? "Karussell-Element konnte nicht angelegt werden." };
      children.push(child.id);
    }
    return createSingle({ media_type: "CAROUSEL", children: children.join(","), caption: ctx.content.text }, "container");
  }
  return { error: `Das Format „${fmt}“ wird für Instagram per API nicht unterstützt.` };
}

async function igPublish(ctx: PublishContext, containerId: string, log: AttemptLog): Promise<PublishOutcome> {
  const ig = ctx.account.externalId;
  const res = await post(`/${ig}/media_publish`, { creation_id: containerId, access_token: ctx.accessToken });
  if (res.networkError) {
    await log({ step: "publish", outcome: "unklar", error: res.networkError, request: { creation_id: containerId } });
    return { status: "unknown", error: `Keine Antwort von Instagram beim Veröffentlichen (${res.networkError}). Bitte auf Instagram prüfen.` };
  }
  if (!res.ok) {
    await log({ step: "publish", outcome: "fehler", httpStatus: res.status, response: redact(res.body), error: graphErrorMessage(res.body) });
    return { status: "failed", error: graphErrorMessage(res.body) };
  }
  const mediaId = String((res.body as { id?: string }).id ?? "");
  await log({ step: "publish", outcome: "erfolg", httpStatus: res.status, response: redact(res.body) });
  if (!mediaId) return { status: "unknown", error: "Instagram hat keine Medien-ID zurückgegeben." };

  const link = await get(`/${mediaId}`, { fields: "permalink,timestamp", access_token: ctx.accessToken });
  await log({ step: "permalink", outcome: link.ok ? "erfolg" : "fehler", httpStatus: link.status, response: redact(link.body) });
  const permalink = link.ok ? ((link.body as { permalink?: string }).permalink ?? null) : null;
  const ts = link.ok ? (link.body as { timestamp?: string }).timestamp : undefined;
  return { status: "published", postId: mediaId, url: permalink, publishedAt: ts ? new Date(ts).toISOString() : undefined };
}

export const instagramAdapter: PlatformAdapter = {
  platform: "instagram",
  label: "Instagram (professionelles Konto)",
  supportedFormats: ["feed_bild", "karussell", "reel", "story"],
  requirements: [
    "Instagram-Business- oder Creator-Konto, verknüpft mit einer Facebook-Seite",
    "Meta-App mit „Facebook Login for Business“ bzw. Facebook Login",
    "Berechtigungen: instagram_basic, instagram_content_publish, pages_read_engagement, pages_show_list",
    "Für Konten, die Sie selbst verwalten, genügt Standard Access (Nutzer mit Rolle in der App); sonst App Review + Business-Verifizierung",
    "Medien müssen öffentlich per URL abrufbar sein (die App erzeugt dafür kurzlebige signierte URLs); Bilder nur als JPEG",
    "Veröffentlichungslimit je 24 Stunden laut content_publishing_limit",
  ],

  async publish(ctx, log) {
    let containerId = ctx.containerId;

    if (!containerId) {
      const created = await igCreateContainer(ctx, log);
      if (!created.id) return { status: "failed", error: created.error ?? "Container konnte nicht angelegt werden." };
      containerId = created.id;
    }

    const status = await igContainerStatus(containerId, ctx.accessToken);
    const code = (status.body as { status_code?: string }).status_code;
    await log({ step: "status", outcome: status.ok ? "erfolg" : "fehler", httpStatus: status.status, response: redact(status.body) });

    if (!status.ok) {
      return status.networkError
        ? { status: "processing", containerId, nextCheckSeconds: 60 }
        : { status: "failed", error: graphErrorMessage(status.body) };
    }
    if (code === "IN_PROGRESS") {
      if (ctx.attempt > 15) return { status: "failed", error: "Instagram verarbeitet das Medium seit über 15 Minuten nicht fertig." };
      return { status: "processing", containerId, nextCheckSeconds: 60 };
    }
    if (code === "ERROR" || code === "EXPIRED") {
      return { status: "failed", error: `Instagram-Container-Status ${code}: ${(status.body as { status?: string }).status ?? ""}`.trim() };
    }
    if (code === "PUBLISHED") {
      return {
        status: "unknown",
        error: "Der Container ist laut Instagram bereits veröffentlicht. Bitte Beitrag auf Instagram prüfen und Link manuell eintragen.",
      };
    }
    return igPublish(ctx, containerId, log);
  },

  verify(accessToken, externalId) {
    return verifyMetaToken(accessToken, externalId, "id,username");
  },
};

// -----------------------------------------------------------------------------
// Facebook-Seite
// -----------------------------------------------------------------------------
async function fbPermalink(postId: string, token: string, log: AttemptLog): Promise<string | null> {
  const res = await get(`/${postId}`, { fields: "permalink_url", access_token: token });
  await log({ step: "permalink", outcome: res.ok ? "erfolg" : "fehler", httpStatus: res.status, response: redact(res.body) });
  return res.ok ? ((res.body as { permalink_url?: string }).permalink_url ?? null) : null;
}

export const facebookAdapter: PlatformAdapter = {
  platform: "facebook",
  label: "Facebook-Seite",
  supportedFormats: ["text", "link", "feed_bild", "karussell"],
  requirements: [
    "Facebook-Seite von MEET GERMANY, Ihr Nutzer hat die Aufgabe „Inhalte erstellen“",
    "Meta-App mit Facebook Login",
    "Berechtigungen: pages_manage_posts, pages_read_engagement, pages_show_list",
    "Seiten-Token (entsteht beim Verbinden; läuft i. d. R. nicht ab, kann aber ungültig werden)",
    "Videos und Reels: in dieser Version manuelle Veröffentlichung",
  ],

  async publish(ctx, log) {
    const page = ctx.account.externalId;
    const token = ctx.accessToken;
    const fmt = ctx.content.postFormat;

    const finalCall = async (path: string, params: Record<string, string | undefined>, step: string, json = false) => {
      const res = json
        ? await httpJson<Record<string, unknown>>(`${graph()}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...params, access_token: token }),
          })
        : await post(path, { ...params, access_token: token });
      if (res.networkError) {
        await log({ step, outcome: "unklar", error: res.networkError });
        return { outcome: { status: "unknown", error: `Keine Antwort von Facebook (${res.networkError}). Bitte auf der Seite prüfen.` } as PublishOutcome };
      }
      await log({ step, outcome: res.ok ? "erfolg" : "fehler", httpStatus: res.status, response: redact(res.body), error: res.ok ? null : graphErrorMessage(res.body) });
      if (!res.ok) return { outcome: { status: "failed", error: graphErrorMessage(res.body) } as PublishOutcome };
      return { body: res.body as { id?: string; post_id?: string } };
    };

    if (fmt === "text" || fmt === "link") {
      const r = await finalCall(`/${page}/feed`, { message: ctx.content.text, link: fmt === "link" ? ctx.content.linkUrl ?? undefined : undefined }, "publish");
      if ("outcome" in r) return r.outcome!;
      const postId = String(r.body!.id ?? "");
      return { status: "published", postId, url: await fbPermalink(postId, token, log) };
    }

    if (fmt === "feed_bild") {
      const m = ctx.media[0];
      if (!m || m.kind !== "bild") return { status: "failed", error: "Für einen Bildbeitrag wird ein Bild benötigt." };
      const r = await finalCall(`/${page}/photos`, { url: m.url, caption: ctx.content.text, alt_text_custom: m.altText ?? undefined }, "publish");
      if ("outcome" in r) return r.outcome!;
      const postId = String(r.body!.post_id ?? r.body!.id ?? "");
      return { status: "published", postId, url: await fbPermalink(postId, token, log) };
    }

    if (fmt === "karussell") {
      const images = ctx.media.filter((m) => m.kind === "bild");
      if (images.length < 2) return { status: "failed", error: "Für einen Mehrbild-Beitrag werden mindestens zwei Bilder benötigt." };
      const ids: string[] = [];
      for (const [i, m] of images.entries()) {
        const res = await post(`/${page}/photos`, { url: m.url, published: false, temporary: false, access_token: token });
        await log({ step: `bild_${i + 1}`, outcome: res.ok ? "erfolg" : "fehler", httpStatus: res.status, response: redact(res.body), error: res.ok ? null : res.networkError ?? graphErrorMessage(res.body) });
        if (!res.ok) return { status: "failed", error: `Bild ${i + 1} konnte nicht hochgeladen werden: ${res.networkError ?? graphErrorMessage(res.body)}` };
        ids.push(String((res.body as { id?: string }).id));
      }
      const r = await finalCall(`/${page}/feed`, {
        message: ctx.content.text,
        attached_media: JSON.stringify(ids.map((id) => ({ media_fbid: id }))),
      }, "publish");
      if ("outcome" in r) return r.outcome!;
      const postId = String(r.body!.id ?? "");
      return { status: "published", postId, url: await fbPermalink(postId, token, log) };
    }

    return { status: "failed", error: `Das Format „${fmt}“ wird für Facebook in dieser Version nicht per API unterstützt – bitte manuell veröffentlichen.` };
  },

  verify(accessToken, externalId) {
    return verifyMetaToken(accessToken, externalId, "id,name");
  },
};

// -----------------------------------------------------------------------------
// OAuth (Facebook Login) – Verbinden von Seiten und Instagram-Konten
// -----------------------------------------------------------------------------
export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
];

export function metaAuthorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: serverEnv.metaAppId,
    redirect_uri: redirectUri,
    state,
    scope: META_SCOPES.join(","),
    response_type: "code",
  });
  return `https://www.facebook.com/${serverEnv.metaGraphVersion}/dialog/oauth?${params}`;
}

export interface MetaConnectedAsset {
  platform: "facebook" | "instagram";
  externalId: string;
  displayName: string;
  accessToken: string;
  expiresAt: string | null;
}

export async function metaExchangeCode(code: string, redirectUri: string): Promise<MetaConnectedAsset[]> {
  const short = await get("/oauth/access_token", {
    client_id: serverEnv.metaAppId,
    client_secret: serverEnv.metaAppSecret,
    redirect_uri: redirectUri,
    code,
  });
  const shortToken = (short.body as { access_token?: string }).access_token;
  if (!short.ok || !shortToken) throw new Error(`Meta-Anmeldung fehlgeschlagen: ${short.networkError ?? graphErrorMessage(short.body)}`);

  const long = await get("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: serverEnv.metaAppId,
    client_secret: serverEnv.metaAppSecret,
    fb_exchange_token: shortToken,
  });
  // Ohne langlebigen Nutzer-Token wären die Seiten-Tokens nach ca. 1 Stunde ungültig –
  // dann lieber sauber abbrechen, statt eine scheinbar dauerhafte Verbindung zu speichern.
  const userToken = (long.body as { access_token?: string }).access_token;
  if (!long.ok || !userToken) {
    throw new Error(`Langfristiger Zugang konnte nicht eingerichtet werden: ${long.networkError ?? graphErrorMessage(long.body)}`);
  }

  const pages = await get("/me/accounts", {
    fields: "id,name,access_token,instagram_business_account{id,username}",
    access_token: userToken,
    limit: "100",
  });
  if (!pages.ok) throw new Error(`Seiten konnten nicht geladen werden: ${pages.networkError ?? graphErrorMessage(pages.body)}`);

  const assets: MetaConnectedAsset[] = [];
  const list = (pages.body as { data?: { id: string; name: string; access_token: string; instagram_business_account?: { id: string; username?: string } }[] }).data ?? [];
  for (const p of list) {
    // Seiten-Tokens aus einem langlebigen Nutzer-Token laufen i. d. R. nicht ab.
    assets.push({ platform: "facebook", externalId: p.id, displayName: p.name, accessToken: p.access_token, expiresAt: null });
    if (p.instagram_business_account?.id) {
      assets.push({
        platform: "instagram",
        externalId: p.instagram_business_account.id,
        displayName: p.instagram_business_account.username ? `@${p.instagram_business_account.username}` : `Instagram (${p.name})`,
        accessToken: p.access_token,
        expiresAt: null,
      });
    }
  }
  return assets;
}
