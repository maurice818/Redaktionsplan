import { hasBlockingIssues, validateContent } from "./format-validation";
import type { FormatRule, MediaInfo } from "./types";

/**
 * Voraussetzungen für eine Veröffentlichung (Anzeige in der Beitragsakte und
 * Prüfung im Hintergrundprozess vor jedem API-Aufruf).
 */
export interface ReadinessItem {
  kind: string;
  channel: string;
  status: string;
  title: string;
  caption: string | null;
  hashtags: string[] | null;
  body_html: string | null;
  post_format: string | null;
  schedule_status: string;
  scheduled_at: string | null;
  auto_publish: boolean;
  platform_account_id: string | null;
  requires_internal_approval: boolean;
  requires_client_approval: boolean;
  internal_ok: boolean;
  client_ok: boolean;
}

export interface ReadinessAccount {
  platform: string;
  api_enabled: boolean;
  connection_status: string;
}

export interface ReadinessCheck {
  key: string;
  label: string;
  ok: boolean;
  detail?: string;
  /** nur für die automatische (API-)Veröffentlichung relevant */
  apiOnly?: boolean;
  optional?: boolean;
}

export interface ReadinessResult {
  checks: ReadinessCheck[];
  /** alle Voraussetzungen für eine (manuelle) Veröffentlichung erfüllt */
  ready: boolean;
  /** zusätzlich alle Voraussetzungen für die automatische Veröffentlichung erfüllt */
  readyForApi: boolean;
  blockers: string[];
}

export function publishReadiness(
  item: ReadinessItem,
  media: MediaInfo[],
  rules: FormatRule[],
  account: ReadinessAccount | null,
  apiSupportedFormat: boolean,
): ReadinessResult {
  const checks: ReadinessCheck[] = [];
  const isSocial = item.kind === "social";

  if (isSocial) {
    checks.push({
      key: "konto",
      label: "Zielkonto zugeordnet",
      ok: Boolean(item.platform_account_id && account && account.platform === item.channel),
      detail: item.platform_account_id ? undefined : "Bitte das MEET-GERMANY-Konto für diesen Kanal auswählen.",
    });
  }

  const textOk = isSocial ? Boolean(item.caption?.trim()) : Boolean(item.body_html?.replace(/<[^>]*>/g, "").trim());
  checks.push({ key: "text", label: isSocial ? "Fertiger Kanaltext" : "Fertiger Artikeltext", ok: textOk });

  const issues = validateContent(item, media, rules);
  const mediaIssues = issues.filter((i) => i.code !== "text_fehlt");
  checks.push({
    key: "medium",
    label: "Geeignetes Medium",
    ok: !hasBlockingIssues(mediaIssues),
    detail: mediaIssues.filter((i) => i.level === "error").map((i) => i.message).join(" ") || undefined,
  });

  if (item.requires_internal_approval) {
    checks.push({ key: "intern", label: "Interne Freigabe der aktuellen Fassung", ok: item.internal_ok });
  }
  if (item.requires_client_approval) {
    checks.push({ key: "kunde", label: "Kundenfreigabe der aktuellen Fassung", ok: item.client_ok });
  }

  checks.push({
    key: "termin",
    label: "Verbindlicher Termin",
    ok: item.schedule_status === "verbindlich" && Boolean(item.scheduled_at),
  });

  if (isSocial) {
    checks.push({
      key: "aktiviert",
      label: "Automatische Veröffentlichung für diesen Kanal aktiviert",
      ok: item.auto_publish,
      apiOnly: true,
      optional: true,
    });
    checks.push({
      key: "schnittstelle",
      label: "Schnittstelle verbunden und freigeschaltet",
      ok: Boolean(account && account.api_enabled && account.connection_status === "verbunden"),
      detail: !account
        ? undefined
        : !account.api_enabled
          ? "API-Veröffentlichung ist für dieses Konto nicht aktiviert (Einrichtung erforderlich)."
          : account.connection_status !== "verbunden"
            ? "Konto ist nicht verbunden."
            : undefined,
      apiOnly: true,
      optional: true,
    });
    checks.push({
      key: "format_api",
      label: "Format per API unterstützt",
      ok: apiSupportedFormat,
      detail: apiSupportedFormat ? undefined : "Dieses Format wird manuell veröffentlicht.",
      apiOnly: true,
      optional: true,
    });
  }

  const core = checks.filter((c) => !c.apiOnly);
  const ready = core.every((c) => c.ok);
  const readyForApi = ready && checks.filter((c) => c.apiOnly).every((c) => c.ok);
  return {
    checks,
    ready,
    readyForApi,
    blockers: core.filter((c) => !c.ok).map((c) => c.label),
  };
}
