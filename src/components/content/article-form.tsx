"use client";

import { ActionForm, FormActions, FormGrid, InputField, SelectField, SubmitButton, TextareaField, type Option } from "@/components/common/form";
import { saveArticle } from "@/actions/content";
import { RichTextEditor } from "./rich-text-editor";

export interface ArticleData {
  id: string;
  title: string;
  teaser: string | null;
  body_html: string | null;
  seo_title: string | null;
  meta_description: string | null;
  author_name: string | null;
  assignee_id: string | null;
  window_start: string | null;
  window_end: string | null;
  notes: string | null;
}

export function ArticleForm({ item, people, locked }: { item: ArticleData; people: Option[]; locked: boolean }) {
  return (
    <ActionForm action={saveArticle} className="grid gap-4">
      <input type="hidden" name="id" value={item.id} />
      <InputField name="title" label="Titel" defaultValue={item.title} required className="text-base font-medium" readOnly={locked} />
      <TextareaField name="teaser" label="Teaser" defaultValue={item.teaser ?? ""} rows={3} maxLength={1000} readOnly={locked} help="Kurzer Einstieg – wird auch als Vorlage für Social-Fassungen genutzt." />
      <div className="grid gap-1.5">
        <span className="text-sm font-medium">Haupttext</span>
        <RichTextEditor name="body_html" defaultValue={item.body_html ?? ""} readOnly={locked} />
      </div>
      <details className="rounded-lg border border-border px-3 py-2" open={Boolean(item.seo_title || item.meta_description)}>
        <summary className="cursor-pointer text-sm font-medium">SEO & Autor</summary>
        <div className="mt-3 grid gap-4">
          <InputField name="seo_title" label="SEO-Titel" defaultValue={item.seo_title ?? ""} maxLength={120} help="Empfohlen: bis ca. 60 Zeichen." readOnly={locked} />
          <TextareaField name="meta_description" label="Meta-Beschreibung" defaultValue={item.meta_description ?? ""} rows={2} maxLength={320} help="Empfohlen: bis ca. 155 Zeichen." readOnly={locked} />
          <InputField name="author_name" label="Autor/in" defaultValue={item.author_name ?? ""} readOnly={locked} />
        </div>
      </details>
      <FormGrid className="sm:grid-cols-3">
        <SelectField name="assignee_id" label="Bearbeitung" defaultValue={item.assignee_id ?? ""} placeholder="Nicht zugewiesen" options={people} />
        <InputField name="window_start" type="date" label="Vorgeschlagener Zeitraum ab" defaultValue={item.window_start ?? ""} />
        <InputField name="window_end" type="date" label="bis" defaultValue={item.window_end ?? ""} />
      </FormGrid>
      <TextareaField name="notes" label="Interne Notizen" defaultValue={item.notes ?? ""} rows={2} help="Nicht Teil der Freigabe und nicht für Kunden sichtbar." />
      <FormActions>
        <SubmitButton>Speichern</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
