import { LinkProblem } from "@/components/public/link-problem";
import { isSupabaseConfigured } from "@/lib/env";
import { features } from "@/lib/env.server";
import { sanitizeArticleHtml } from "@/lib/sanitize";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAnonClient } from "@/lib/supabase/anon";
import { formatDate, formatDateTime } from "@/lib/time";
import { PreviewReview, type PreviewItemView } from "./preview-review";

export const metadata = { title: "Vorschau zur Freigabe" };
export const dynamic = "force-dynamic";

interface PreviewPayload {
  error?: string;
  preview: {
    id: string;
    round: number;
    status: string;
    recipient_name: string | null;
    message: string | null;
    expires_at: string;
    response_due_date: string | null;
    client_name: string | null;
    dossier_title: string | null;
  };
  items: {
    id: string;
    kind: string;
    channel: string;
    version_no: number;
    snapshot: {
      title?: string; teaser?: string | null; body_html?: string | null; caption?: string | null; cta?: string | null; hashtags?: string[];
      link_url?: string | null; post_format?: string | null;
      media?: { media_asset_id: string; kind: string; source: string; storage_path: string | null; external_url: string | null; alt_text: string | null; credit: string | null; file_name: string }[];
    };
    proposed_start: string | null;
    proposed_end: string | null;
    proposed_at: string | null;
    decision: string | null;
    decision_comment: string | null;
    decided_at: string | null;
  }[];
}

export default async function PreviewPage({ params }: PageProps<"/v/[token]">) {
  const { token } = await params;
  if (!isSupabaseConfigured()) return <LinkProblem reason="konfiguration" />;
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(token)) return <LinkProblem reason="ungueltig" />;

  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("public_get_preview", { p_token: token });
  if (error) return <LinkProblem reason="konfiguration" />;
  const payload = data as unknown as PreviewPayload;
  if (payload.error) return <LinkProblem reason={payload.error} />;

  // Nur die Medien der zugesandten Fassungen signieren (Token ist geprüft).
  const paths = payload.items.flatMap((i) => (i.snapshot.media ?? []).map((m) => m.storage_path).filter((p): p is string => Boolean(p)));
  let signed: Record<string, string> = {};
  if (paths.length && features.admin()) {
    const { data: urls } = await createAdminClient().storage.from("media").createSignedUrls([...new Set(paths)], 60 * 60);
    signed = Object.fromEntries((urls ?? []).filter((u) => u.path && u.signedUrl).map((u) => [u.path!, u.signedUrl as string]));
  }

  const items: PreviewItemView[] = payload.items.map((i) => ({
    id: i.id,
    kind: i.kind,
    channel: i.channel,
    versionNo: i.version_no,
    title: i.snapshot.title ?? "",
    teaser: i.snapshot.teaser ?? null,
    bodyHtml: i.snapshot.body_html ? sanitizeArticleHtml(i.snapshot.body_html) : null,
    caption: i.snapshot.caption ?? null,
    cta: i.snapshot.cta ?? null,
    hashtags: i.snapshot.hashtags ?? [],
    linkUrl: i.snapshot.link_url ?? null,
    postFormat: i.snapshot.post_format ?? null,
    media: (i.snapshot.media ?? []).map((m) => ({
      kind: m.kind,
      url: m.storage_path ? signed[m.storage_path] ?? null : m.external_url,
      isLink: m.source === "link",
      alt: m.alt_text,
      credit: m.credit,
      fileName: m.file_name,
    })),
    period: i.proposed_at
      ? `geplant: ${formatDateTime(i.proposed_at)}`
      : i.proposed_start || i.proposed_end
        ? `Zeitraum ${formatDate(i.proposed_start)} – ${formatDate(i.proposed_end)}`
        : null,
    decision: i.decision,
    decisionComment: i.decision_comment,
    decidedAt: i.decided_at,
  }));

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-sm font-medium text-[#b90845]">{payload.preview.client_name}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{payload.preview.dossier_title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {payload.preview.recipient_name ? `Guten Tag ${payload.preview.recipient_name}, ` : ""}bitte prüfen Sie die folgenden Inhalte und geben Sie sie frei oder teilen Sie uns Ihre Änderungswünsche mit.
        </p>
        {payload.preview.message && <p className="mt-3 rounded-lg border-l-4 border-[#6f2659] bg-white p-3 text-sm whitespace-pre-line">{payload.preview.message}</p>}
        <p className="mt-3 text-xs text-muted-foreground">
          Vorschau-Runde {payload.preview.round}
          {payload.preview.response_due_date && <> · Rückmeldung erbeten bis <strong>{formatDate(payload.preview.response_due_date)}</strong></>}
          {" "}· Link gültig bis {formatDateTime(payload.preview.expires_at)}
        </p>
      </div>
      <PreviewReview token={token} items={items} clientName={payload.preview.client_name ?? ""} defaultName={payload.preview.recipient_name ?? ""} />
    </div>
  );
}
