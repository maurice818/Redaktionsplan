"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, Eye, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { FieldShell, FormPendingProvider, NativeSelect, SubmitButton, submitWithoutReset, type Option } from "@/components/common/form";
import { sendMaterialRequest, sendPreview, type LinkResult } from "@/actions/customer";
import type { ActionResult } from "@/lib/action-result";
import { renderEmail } from "@/lib/email/render";
import { formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";

export interface ContactOption {
  id: string;
  name: string;
  email: string | null;
  canApprove: boolean;
}

export interface PreviewCandidate {
  id: string;
  label: string;
  eligible: boolean;
  reason?: string;
  preselect: boolean;
}

const inputCls = "h-9 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none focus-visible:border-[#b90845] focus-visible:ring-3 focus-visible:ring-[#b90845]/15";

export function SendLinkDialog({
  kind,
  dossierId,
  dossierTitle,
  clientName,
  senderName,
  contacts,
  forms,
  candidates,
  template,
  defaults,
  emailConfigured,
  trigger,
}: {
  kind: "material" | "vorschau";
  dossierId: string;
  dossierTitle: string;
  clientName: string;
  senderName: string;
  contacts: ContactOption[];
  forms?: Option[];
  candidates?: PreviewCandidate[];
  template: { subject: string; body: string };
  defaults: { expiryDays: number; responseDue: string };
  emailConfigured: boolean;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const primary = contacts.find((c) => c.canApprove && c.email) ?? contacts.find((c) => c.email);
  const [contactId, setContactId] = useState(primary?.id ?? "");
  const [name, setName] = useState(primary?.name ?? "");
  const [email, setEmail] = useState(primary?.email ?? "");
  const [message, setMessage] = useState("");
  const [due, setDue] = useState(defaults.responseDue);
  const [expiry, setExpiry] = useState(String(defaults.expiryDays));
  const [sendEmail, setSendEmail] = useState(true);
  const [showMail, setShowMail] = useState(false);
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [selected, setSelected] = useState<string[]>(candidates?.filter((c) => c.eligible && c.preselect).map((c) => c.id) ?? []);
  const [openedAt, setOpenedAt] = useState(() => Date.now());
  const router = useRouter();

  const action = kind === "material" ? sendMaterialRequest : sendPreview;
  const [state, formAction, pending] = useActionState<ActionResult<LinkResult> | null, FormData>(action, null);
  const [dismissed, setDismissed] = useState<ActionResult<LinkResult> | null>(null);
  const result = state && state.ok && state !== dismissed ? state.data : null;

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      router.refresh();
      if (state.data.email === "versendet") toast.success("E-Mail versendet.");
      else if (state.data.email === "nicht_konfiguriert") toast.warning("Link erstellt – E-Mail-Versand ist nicht eingerichtet.");
      else if (state.data.email === "fehlgeschlagen") toast.error(`Link erstellt, E-Mail fehlgeschlagen: ${state.data.emailError ?? ""}`);
      else toast.success("Link erstellt.");
    } else {
      toast.error(state.error);
    }
  }, [state, router]);

  const expiryDate = useMemo(() => new Date(openedAt + Number(expiry || 0) * 86_400_000), [openedAt, expiry]);
  const rendered = useMemo(
    () =>
      renderEmail(
        { subject, body },
        {
          empfaenger_name: name || "Damen und Herren",
          beitrag_titel: dossierTitle,
          kunde_name: clientName,
          nachricht: message,
          link: "https://… (persönlicher Link wird beim Versand erzeugt)",
          gueltig_bis: `${formatDate(expiryDate)}`,
          frist_hinweis: due ? (kind === "material" ? ` Bitte füllen Sie das Formular bis zum ${formatDate(due)} aus.` : `Bitte geben Sie uns bis zum ${formatDate(due)} Rückmeldung.`) : "",
          inhalte: candidates?.filter((c) => selected.includes(c.id)).map((c) => c.label).join(", ") ?? "",
          absender_name: senderName,
        },
      ),
    [subject, body, name, dossierTitle, clientName, message, due, kind, candidates, selected, senderName, expiryDate],
  );

  const reset = () => {
    setDismissed(state);
    setShowMail(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setOpenedAt(Date.now()); else reset(); }}>
      <DialogTrigger asChild>
        {trigger ?? <Button size="sm"><Send /> {kind === "material" ? "Materialformular senden" : "Kundenvorschau senden"}</Button>}
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{kind === "material" ? "Materialformular an den Kunden senden" : "Kundenvorschau zur Freigabe senden"}</DialogTitle>
          <DialogDescription>
            Der Kunde erhält einen persönlichen, zeitlich begrenzten Link ohne Konto. {kind === "vorschau" && "Er sieht nur die hier ausgewählten Fassungen."}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="grid gap-4">
            <div className={cn("rounded-lg border p-3 text-sm", result.email === "versendet" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50")}>
              {result.email === "versendet" && <p className="flex items-center gap-2 font-medium"><Check className="size-4" /> E-Mail an {email} versendet.</p>}
              {result.email === "nicht_konfiguriert" && <p>Der E-Mail-Versand ist nicht eingerichtet (Resend). Bitte den Link manuell weitergeben und anschließend als „versendet“ markieren.</p>}
              {result.email === "fehlgeschlagen" && <p>Die E-Mail konnte nicht versendet werden: {result.emailError}. Der Link ist trotzdem gültig.</p>}
              {result.email === "nicht_versendet" && <p>Link erstellt, keine E-Mail versendet.</p>}
            </div>
            <FieldShell label="Persönlicher Link" help="Nur an die berechtigte Person weitergeben. Der Link kann jederzeit widerrufen werden.">
              <div className="flex gap-2">
                <input readOnly value={result.link} className={cn(inputCls, "font-mono text-xs")} onFocus={(e) => e.currentTarget.select()} />
                <Button type="button" variant="outline" onClick={async () => { await navigator.clipboard.writeText(result.link); toast.success("Link kopiert."); }}>
                  <Copy /> Kopieren
                </Button>
              </div>
            </FieldShell>
            <DialogFooter>
              <Button onClick={() => { setOpen(false); reset(); }}>Fertig</Button>
            </DialogFooter>
          </div>
        ) : (
          <FormPendingProvider value={pending}>
          <form onSubmit={submitWithoutReset(formAction)} className="grid gap-4">
            <input type="hidden" name="dossier_id" value={dossierId} />
            <input type="hidden" name="contact_id" value={contactId} />
            <input type="hidden" name="send_email" value={sendEmail ? "on" : ""} />
            {/* Angepasster Text gilt auch, wenn die E-Mail-Vorschau wieder geschlossen wurde */}
            {subject !== template.subject && <input type="hidden" name="subject" value={subject} />}
            {body !== template.body && <input type="hidden" name="body" value={body} />}
            {kind === "vorschau" && selected.map((id) => <input key={id} type="hidden" name="content_ids" value={id} />)}

            {kind === "vorschau" && candidates && (
              <fieldset className="grid gap-1.5">
                <legend className="mb-1 text-sm font-medium">Inhalte für diese Vorschau</legend>
                {candidates.length === 0 && <p className="text-sm text-muted-foreground">Keine Inhalte in dieser Akte.</p>}
                {candidates.map((c) => (
                  <label key={c.id} className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-sm", c.eligible ? "cursor-pointer" : "opacity-60")}>
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-[#b90845]"
                      disabled={!c.eligible}
                      checked={selected.includes(c.id)}
                      onChange={(e) => setSelected((s) => (e.target.checked ? [...s, c.id] : s.filter((x) => x !== c.id)))}
                    />
                    <span>
                      {c.label}
                      {!c.eligible && c.reason && <span className="block text-xs text-muted-foreground">{c.reason}</span>}
                    </span>
                  </label>
                ))}
              </fieldset>
            )}

            {kind === "material" && forms && (
              <FieldShell label="Formular" htmlFor="form_id">
                <NativeSelect id="form_id" name="form_id" defaultValue={forms[0]?.value}>
                  {forms.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </NativeSelect>
              </FieldShell>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <FieldShell label="Ansprechpartner" htmlFor="contact">
                <NativeSelect
                  id="contact"
                  value={contactId}
                  onChange={(e) => {
                    const c = contacts.find((x) => x.id === e.target.value);
                    setContactId(e.target.value);
                    if (c) { setName(c.name); setEmail(c.email ?? ""); }
                  }}
                >
                  <option value="">Andere Person</option>
                  {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.canApprove ? " (freigabeberechtigt)" : ""}</option>)}
                </NativeSelect>
              </FieldShell>
              <FieldShell label="Name" htmlFor="recipient_name">
                <input id="recipient_name" name="recipient_name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
              </FieldShell>
              <FieldShell label="E-Mail" required htmlFor="recipient_email">
                <input id="recipient_email" name="recipient_email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
              </FieldShell>
              <FieldShell label={kind === "material" ? "Frist für den Kunden" : "Rückmeldung erbeten bis"} htmlFor="due">
                <input id="due" type="date" name={kind === "material" ? "due_date" : "response_due_date"} value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} />
              </FieldShell>
              <FieldShell label="Link gültig (Tage)" htmlFor="expiry_days">
                <input id="expiry_days" name="expiry_days" type="number" min={1} max={120} value={expiry} onChange={(e) => setExpiry(e.target.value)} className={inputCls} />
              </FieldShell>
            </div>
            <FieldShell label="Persönliche Nachricht (optional)" htmlFor="message">
              <textarea id="message" name="message" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} className={cn(inputCls, "h-auto py-2")} />
            </FieldShell>

            <div className="rounded-lg border border-border">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} className="size-4 accent-[#b90845]" />
                  <Mail className="size-4 text-muted-foreground" /> E-Mail mit Link senden
                  {!emailConfigured && <span className="text-xs text-amber-700">(E-Mail-Versand nicht eingerichtet – Link wird nur erstellt)</span>}
                </label>
                <div className="flex items-center gap-2">
                  {(subject !== template.subject || body !== template.body) && (
                    <>
                      <span className="text-xs text-muted-foreground">Text angepasst</span>
                      <Button type="button" variant="ghost" size="sm" onClick={() => { setSubject(template.subject); setBody(template.body); }}>
                        Vorlage wiederherstellen
                      </Button>
                    </>
                  )}
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowMail((s) => !s)}>
                    <Eye /> {showMail ? "E-Mail-Vorschau schließen" : "E-Mail prüfen & anpassen"}
                  </Button>
                </div>
              </div>
              {showMail && (
                <div className="grid gap-3 border-t p-3 lg:grid-cols-2">
                  <div className="grid gap-2">
                    <FieldShell label="Betreff" htmlFor="mail-subject">
                      <input id="mail-subject" value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} />
                    </FieldShell>
                    <FieldShell label="Text" htmlFor="mail-body" help="Platzhalter wie {{link}} werden beim Versand ersetzt.">
                      <textarea id="mail-body" rows={12} value={body} onChange={(e) => setBody(e.target.value)} className={cn(inputCls, "h-auto py-2 font-mono text-xs")} />
                    </FieldShell>
                  </div>
                  <div className="overflow-hidden rounded-lg border">
                    <p className="border-b bg-muted/40 px-3 py-2 text-xs"><span className="text-muted-foreground">Betreff:</span> {rendered.subject}</p>
                    <iframe title="E-Mail-Vorschau" srcDoc={rendered.html} className="h-80 w-full bg-white" sandbox="" />
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Abbrechen</Button>
              <SubmitButton disabled={kind === "vorschau" && selected.length === 0}>
                <Send /> {sendEmail ? "Link erstellen & senden" : "Nur Link erstellen"}
              </SubmitButton>
            </DialogFooter>
          </form>
          </FormPendingProvider>
        )}
      </DialogContent>
    </Dialog>
  );
}
