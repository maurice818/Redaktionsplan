/**
 * Adapterstruktur für Plattform-Veröffentlichungen.
 *
 * Grundsatz: Ein Adapter meldet nur dann "published", wenn die Plattform die
 * Veröffentlichung bestätigt hat (Post-ID). Ist unklar, ob ein Beitrag
 * erschienen ist (z. B. Zeitüberschreitung beim eigentlichen
 * Veröffentlichungsaufruf), meldet er "unknown" – es gibt dann KEINEN
 * automatischen Wiederholungsversuch.
 */
export type PlatformKey = "instagram" | "facebook" | "linkedin";

export interface PublishMedia {
  kind: "bild" | "video";
  url: string; // öffentlich abrufbare, kurzlebige signierte URL
  mimeType: string | null;
  altText: string | null;
  width: number | null;
  height: number | null;
}

export interface PublishContext {
  jobId: string;
  containerId: string | null;
  attempt: number;
  account: { externalId: string; displayName: string };
  accessToken: string;
  content: {
    title: string;
    text: string; // fertig zusammengesetzter Kanaltext
    linkUrl: string | null;
    postFormat: string;
    teaser: string | null;
  };
  media: PublishMedia[];
}

export type PublishOutcome =
  | { status: "published"; postId: string; url: string | null; publishedAt?: string }
  | { status: "processing"; containerId: string; nextCheckSeconds: number }
  | { status: "failed"; error: string }
  | { status: "unknown"; error: string };

export interface AttemptLog {
  (entry: {
    step: string;
    outcome: "erfolg" | "fehler" | "unklar" | "laufend";
    httpStatus?: number | null;
    request?: Record<string, unknown>;
    response?: unknown;
    error?: string | null;
  }): Promise<void>;
}

export interface ConnectionCheck {
  ok: boolean;
  detail: string;
  expiresAt?: string | null;
  scopes?: string[];
}

export interface PlatformAdapter {
  platform: PlatformKey;
  label: string;
  /** Per API unterstützte Formate dieses Adapters */
  supportedFormats: string[];
  /** Voraussetzungen, die in der Oberfläche angezeigt werden */
  requirements: string[];
  publish(ctx: PublishContext, log: AttemptLog): Promise<PublishOutcome>;
  verify(accessToken: string, externalId: string): Promise<ConnectionCheck>;
}

/** Entfernt Zugangsdaten aus protokollierten Antworten. */
export function redact(value: unknown): unknown {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redact);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = /token|secret|authorization|password/i.test(k) ? "[entfernt]" : redact(v);
  }
  return out;
}
