"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, Loader2, MessageSquareWarning, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { submitDecisions } from "@/actions/public";
import { CHANNEL_LABELS, CONTENT_KIND_LABELS, POST_FORMAT_LABELS } from "@/lib/labels";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export interface PreviewItemView {
  id: string;
  kind: string;
  channel: string;
  versionNo: number;
  title: string;
  teaser: string | null;
  bodyHtml: string | null;
  caption: string | null;
  cta: string | null;
  hashtags: string[];
  linkUrl: string | null;
  postFormat: string | null;
  media: { kind: string; url: string | null; isLink: boolean; alt: string | null; credit: string | null; fileName: string }[];
  period: string | null;
  decision: string | null;
  decisionComment: string | null;
  decidedAt: string | null;
}

type Choice = { decision: "freigegeben" | "aenderung_gewuenscht" | ""; comment: string };

const inputCls = "w-full rounded-lg border border-input bg-white px-3 py-2 text-[15px] outline-none focus-visible:border-[#b90845] focus-visible:ring-3 focus-visible:ring-[#b90845]/15";

function Media({ m }: { m: PreviewItemView["media"][number] }) {
  if (m.url && !m.isLink && m.kind === "bild") {
    // eslint-disable-next-line @next/next/no-img-element -- signierte, kurzlebige URL
    return <img src={m.url} alt={m.alt ?? ""} className="w-full rounded-lg object-cover" />;
  }
  if (m.url && !m.isLink && m.kind === "video") {
    return <video src={m.url} controls playsInline className="w-full rounded-lg bg-black" aria-label={m.alt ?? "Video"} />;
  }
  return (
    <a href={m.url ?? "#"} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-[#b90845]">
      <ExternalLink className="size-4" /> {m.fileName} öffnen
    </a>
  );
}

export function PreviewReview({ token, items, clientName, defaultName }: { token: string; items: PreviewItemView[]; clientName: string; defaultName: string }) {
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState("");
  const [position, setPosition] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, startTransition] = useTransition();
  // Gerade beantwortete Inhalte, bis die aktualisierte Seite ihre Entscheidung anzeigt
  const [submittedIds, setSubmittedIds] = useState<ReadonlySet<string>>(new Set());
  const [thanks, setThanks] = useState(false);
  const router = useRouter();

  const open = items.filter((i) => !i.decision && !submittedIds.has(i.id));
  const chosen = Object.entries(choices).filter(([, c]) => c.decision);
  const anyApproval = chosen.some(([, c]) => c.decision === "freigegeben");

  const setChoice = (id: string, patch: Partial<Choice>) => setChoices((c) => ({ ...c, [id]: { ...(c[id] ?? { decision: "", comment: "" }), ...patch } }));

  const submit = () =>
    startTransition(async () => {
      const res = await submitDecisions({
        token,
        decisions: chosen.map(([item_id, c]) => ({ item_id, decision: c.decision as "freigegeben", comment: c.comment || undefined })),
        name,
        email,
        position: position || undefined,
        confirmed,
      });
      if (res.ok) {
        setSubmittedIds((ids) => new Set([...ids, ...chosen.map(([id]) => id)]));
        setChoices({});
        setConfirmed(false);
        setThanks(true);
        toast.success("Vielen Dank – Ihre Rückmeldung wurde gespeichert.");
        router.refresh();
      } else toast.error(res.error);
    });

  return (
    <div className="grid gap-6">
      {items.map((item) => {
        const choice = choices[item.id];
        const text = [item.caption, item.cta, item.hashtags.join(" ")].filter(Boolean).join("\n\n");
        return (
          <article key={item.id} className="overflow-hidden rounded-xl border border-border bg-white" aria-labelledby={`titel-${item.id}`}>
            <header className="flex flex-wrap items-center gap-2 border-b bg-[#faf8f7] px-4 py-3">
              <span className="rounded-md bg-[#2a1430] px-2 py-0.5 text-xs font-medium text-white">{CONTENT_KIND_LABELS[item.kind]} · {CHANNEL_LABELS[item.channel]}</span>
              <span className="rounded-md bg-[#f4ecf1] px-2 py-0.5 text-xs font-medium text-[#6f2659]">Version {item.versionNo}</span>
              {item.postFormat && item.kind === "social" && <span className="text-xs text-muted-foreground">{POST_FORMAT_LABELS[item.postFormat]}</span>}
              {item.period && <span className="ml-auto text-xs text-muted-foreground">{item.period}</span>}
            </header>

            <div className="p-4 sm:p-6">
              {item.kind === "magazinartikel" ? (
                <div>
                  {item.media[0] && <div className="mb-4"><Media m={item.media[0]} /></div>}
                  <h2 id={`titel-${item.id}`} className="text-2xl leading-tight font-semibold">{item.title}</h2>
                  {item.teaser && <p className="mt-3 text-lg leading-relaxed text-muted-foreground">{item.teaser}</p>}
                  {item.bodyHtml && <div className="prose-mg mt-4" dangerouslySetInnerHTML={{ __html: item.bodyHtml }} />}
                  {item.media[0]?.credit && <p className="mt-3 text-xs text-muted-foreground">Bild: {item.media[0].credit}</p>}
                </div>
              ) : (
                <div className="mx-auto max-w-md rounded-xl border border-border">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <span className="grid size-8 place-items-center rounded-full bg-[#b90845] text-[10px] font-bold text-white">MG</span>
                    <span id={`titel-${item.id}`} className="text-sm font-semibold">MEET GERMANY <span className="font-normal text-muted-foreground">· {CHANNEL_LABELS[item.channel]}</span></span>
                  </div>
                  {item.media.length > 0 && (
                    <div className={cn("grid gap-1 px-1", item.media.length > 1 && "grid-cols-2")}>
                      {item.media.map((m, i) => <Media key={i} m={m} />)}
                    </div>
                  )}
                  <p className="px-3 py-3 text-sm whitespace-pre-line break-words">{text}</p>
                  {item.linkUrl && <p className="px-3 pb-3 text-xs break-all text-[#b90845]">{item.linkUrl}</p>}
                </div>
              )}
            </div>

            <footer className="border-t bg-[#faf8f7] p-4">
              {item.decision ? (
                <p className={cn("flex items-start gap-2 text-sm", item.decision === "freigegeben" ? "text-emerald-800" : "text-orange-800")}>
                  {item.decision === "freigegeben" ? <CheckCircle2 className="mt-0.5 size-4" /> : <MessageSquareWarning className="mt-0.5 size-4" />}
                  <span>
                    {item.decision === "freigegeben" ? `Freigegeben (Version ${item.versionNo})` : "Änderung gewünscht"} am {formatDateTime(item.decidedAt)}
                    {item.decisionComment && <span className="mt-1 block text-muted-foreground">„{item.decisionComment}“</span>}
                  </span>
                </p>
              ) : submittedIds.has(item.id) ? (
                <p className="flex items-center gap-2 text-sm text-emerald-800">
                  <CheckCircle2 className="size-4" /> Rückmeldung gespeichert.
                </p>
              ) : (
                <fieldset className="grid gap-3">
                  <legend className="mb-2 text-sm font-medium">Ihre Entscheidung zu diesem {item.kind === "magazinartikel" ? "Magazinartikel" : `${CHANNEL_LABELS[item.channel]}-Beitrag`} (Version {item.versionNo})</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className={cn("flex cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 py-2.5 text-sm", choice?.decision === "freigegeben" && "border-emerald-600 ring-1 ring-emerald-600")}>
                      <input type="radio" name={`d-${item.id}`} checked={choice?.decision === "freigegeben"} onChange={() => setChoice(item.id, { decision: "freigegeben" })} className="accent-emerald-700" />
                      <CheckCircle2 className="size-4 text-emerald-700" /> Freigeben
                    </label>
                    <label className={cn("flex cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 py-2.5 text-sm", choice?.decision === "aenderung_gewuenscht" && "border-orange-600 ring-1 ring-orange-600")}>
                      <input type="radio" name={`d-${item.id}`} checked={choice?.decision === "aenderung_gewuenscht"} onChange={() => setChoice(item.id, { decision: "aenderung_gewuenscht" })} className="accent-orange-600" />
                      <MessageSquareWarning className="size-4 text-orange-700" /> Änderung wünschen
                    </label>
                  </div>
                  {choice?.decision && (
                    <label className="grid gap-1 text-sm">
                      {choice.decision === "aenderung_gewuenscht" ? "Was sollen wir ändern? (erforderlich)" : "Kommentar (optional)"}
                      <textarea rows={3} value={choice.comment} onChange={(e) => setChoice(item.id, { comment: e.target.value })} className={inputCls} />
                    </label>
                  )}
                </fieldset>
              )}
            </footer>
          </article>
        );
      })}

      {open.length > 0 && (
        <section className="grid gap-4 rounded-xl border border-border bg-white p-4 sm:p-6" aria-labelledby="absenden">
          {thanks && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">
              Vielen Dank – Ihre Rückmeldung wurde gespeichert. Die übrigen Inhalte können Sie jetzt oder später beantworten.
            </p>
          )}
          <h2 id="absenden" className="text-base font-semibold">Rückmeldung absenden</h2>
          <p className="text-sm text-muted-foreground">
            {chosen.length === 0 ? "Bitte treffen Sie oben für mindestens einen Inhalt eine Entscheidung." : `${chosen.length} von ${open.length} offenen Inhalten entschieden. Sie können die übrigen auch später beantworten.`}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-sm">Ihr Name *<input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} autoComplete="name" /></label>
            <label className="grid gap-1 text-sm">E-Mail *<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} autoComplete="email" /></label>
            <label className="grid gap-1 text-sm">Funktion<input value={position} onChange={(e) => setPosition(e.target.value)} className={inputCls} autoComplete="organization-title" /></label>
          </div>
          {anyApproval && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 size-4 accent-[#b90845]" />
              <span>Ich bin berechtigt, die als „Freigeben“ markierten Inhalte in der angezeigten Version im Namen von {clientName || "meinem Unternehmen"} freizugeben.</span>
            </label>
          )}
          <p className="text-xs text-muted-foreground">Gespeichert werden Zeitpunkt, Version, Ihre Entscheidung, Ihr Kommentar sowie die hier angegebenen Personendaten.</p>
          <div className="flex justify-end">
            <Button onClick={submit} disabled={pending || chosen.length === 0}>{pending ? <Loader2 className="animate-spin" /> : <Send />} Rückmeldung senden</Button>
          </div>
        </section>
      )}

      {open.length === 0 && (
        <div className="rounded-xl border border-emerald-200 bg-white p-6 text-center">
          <CheckCircle2 className="mx-auto size-8 text-emerald-600" aria-hidden />
          <p className="mt-2 font-medium">Vielen Dank für Ihre Rückmeldung.</p>
          <p className="text-sm text-muted-foreground">Die Redaktion wurde informiert.</p>
        </div>
      )}
    </div>
  );
}
