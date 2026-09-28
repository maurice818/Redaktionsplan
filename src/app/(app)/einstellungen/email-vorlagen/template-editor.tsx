"use client";

import { useMemo, useState } from "react";
import { ActionForm, CheckboxField, FieldShell, FormActions, SubmitButton } from "@/components/common/form";
import { saveEmailTemplate } from "@/actions/settings";
import { findPlaceholders, renderEmail } from "@/lib/email/render";

const SAMPLE: Record<string, string> = {
  empfaenger_name: "Mara Beispiel",
  beitrag_titel: "Nachhaltig tagen am Rhein",
  kunde_name: "Seehotel Rheinblick",
  nachricht: "Wir freuen uns auf Ihre Informationen!",
  link: "https://redaktion.meet-germany.example/m/beispiel-token",
  gueltig_bis: "15.10.2026, 23:59 Uhr",
  frist_hinweis: " Bitte füllen Sie das Formular bis zum 10.10.2026 aus.",
  absender_name: "Ihr Redaktionsteam",
  inhalte: "Magazinartikel (MICE Magazin), Social-Beitrag (Instagram)",
  titel: "Material fehlt: Nachhaltig tagen am Rhein",
  text: "Der Kunde hat das Materialformular seit dem 01.10.2026 nicht eingereicht.",
  kanal: "Instagram",
};

export function TemplateEditor({ template, editable }: { template: { key: string; name: string; description: string | null; subject: string; body: string; placeholders: string[]; is_active: boolean }; editable: boolean }) {
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const rendered = useMemo(() => renderEmail({ subject, body }, SAMPLE), [subject, body]);
  const used = findPlaceholders(`${subject} ${body}`);
  const unknown = used.filter((p) => !template.placeholders.includes(p));

  return (
    <ActionForm action={saveEmailTemplate} className="grid gap-4 lg:grid-cols-2">
      <input type="hidden" name="key" value={template.key} />
      <div className="grid content-start gap-3">
        <FieldShell label="Betreff" htmlFor={`s-${template.key}`}>
          <input id={`s-${template.key}`} name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} readOnly={!editable} className="h-9 w-full rounded-lg border border-input px-3 text-sm" />
        </FieldShell>
        <FieldShell label="Text" htmlFor={`b-${template.key}`} help="Absätze mit Leerzeile trennen. Steht {{link}} allein in einem Absatz, erscheint eine Schaltfläche.">
          <textarea id={`b-${template.key}`} name="body" rows={14} value={body} onChange={(e) => setBody(e.target.value)} readOnly={!editable} className="w-full rounded-lg border border-input px-3 py-2 font-mono text-xs leading-relaxed" />
        </FieldShell>
        <p className="text-xs text-muted-foreground">Platzhalter: {template.placeholders.map((p) => `{{${p}}}`).join(", ")}</p>
        {unknown.length > 0 && <p className="text-xs font-medium text-orange-700">Unbekannte Platzhalter werden leer ersetzt: {unknown.map((p) => `{{${p}}}`).join(", ")}</p>}
        {editable && <CheckboxField name="is_active" label="Vorlage aktiv" defaultChecked={template.is_active} />}
        {editable && <FormActions><SubmitButton>Speichern</SubmitButton></FormActions>}
      </div>
      <div className="overflow-hidden rounded-lg border">
        <p className="border-b bg-muted/40 px-3 py-2 text-xs"><span className="text-muted-foreground">Vorschau mit Beispieldaten · Betreff:</span> {rendered.subject}</p>
        <iframe title={`Vorschau ${template.name}`} srcDoc={rendered.html} className="h-[28rem] w-full bg-white" sandbox="" />
      </div>
    </ActionForm>
  );
}
