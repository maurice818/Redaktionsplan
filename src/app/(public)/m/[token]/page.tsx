import { LinkProblem } from "@/components/public/link-problem";
import { isSupabaseConfigured } from "@/lib/env";
import { parseFields } from "@/lib/material-form";
import { createAnonClient } from "@/lib/supabase/anon";
import { formatDate, formatDateTime } from "@/lib/time";
import { MaterialForm } from "./material-form";

export const metadata = { title: "Informationen für Ihren Beitrag" };
export const dynamic = "force-dynamic";

interface MaterialPayload {
  error?: string;
  request: {
    id: string;
    status: string;
    fields: unknown;
    intro_text: string | null;
    form_name: string | null;
    message: string | null;
    recipient_name: string | null;
    expires_at: string;
    due_date: string | null;
    client_name: string | null;
    dossier_title: string | null;
    editable: boolean;
  };
  response: { answers: Record<string, unknown>; submitted_at: string | null; submitted_by_name: string | null; submitted_by_email: string | null } | null;
  files: { id: string; file_name: string; mime_type: string | null; size_bytes: number | null; kind: string; credit: string | null; rights_note: string | null }[];
}

export default async function MaterialPage({ params }: PageProps<"/m/[token]">) {
  const { token } = await params;
  if (!isSupabaseConfigured()) return <LinkProblem reason="konfiguration" />;
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(token)) return <LinkProblem reason="ungueltig" />;

  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("public_get_material_request", { p_token: token });
  if (error) return <LinkProblem reason="konfiguration" />;
  const payload = data as unknown as MaterialPayload;
  if (payload.error) return <LinkProblem reason={payload.error} />;

  const { request, response, files } = payload;
  const fields = parseFields(request.fields);
  const prefill: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.prefill === "client_name" && request.client_name) prefill[f.key] = request.client_name;
    if (f.prefill === "recipient_name" && request.recipient_name) prefill[f.key] = request.recipient_name;
  }

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-sm font-medium text-[#b90845]">{request.client_name}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{request.dossier_title ?? "Ihr Beitrag"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {request.recipient_name ? `Guten Tag ${request.recipient_name}, ` : ""}
          {request.intro_text ?? "bitte stellen Sie uns die folgenden Informationen bereit."}
        </p>
        {request.message && <p className="mt-3 rounded-lg border-l-4 border-[#6f2659] bg-white p-3 text-sm whitespace-pre-line">{request.message}</p>}
        <p className="mt-3 text-xs text-muted-foreground">
          {request.due_date && <>Bitte bis <strong>{formatDate(request.due_date)}</strong> ausfüllen · </>}
          Link gültig bis {formatDateTime(request.expires_at)}
        </p>
      </div>
      {request.status === "rueckfrage" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
          Die Redaktion hat eine Rückfrage zu Ihren Angaben. Bitte ergänzen Sie das Formular und senden Sie es erneut ab.
        </div>
      )}
      <MaterialForm
        token={token}
        fields={fields}
        initialAnswers={{ ...prefill, ...(response?.answers ?? {}) }}
        initialFiles={files}
        editable={request.editable}
        submittedAt={response?.submitted_at ?? null}
        submittedBy={response?.submitted_by_name ?? null}
        defaultName={response?.submitted_by_name ?? request.recipient_name ?? ""}
        defaultEmail={response?.submitted_by_email ?? ""}
      />
    </div>
  );
}
