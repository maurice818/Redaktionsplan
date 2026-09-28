"use client";

import { useMemo, useState } from "react";
import { ActionForm, FieldShell, FormActions, FormGrid, InputField, NativeSelect, SelectField, SubmitButton, TextareaField, type Option } from "@/components/common/form";
import { saveSocial } from "@/actions/content";
import { countCaptionLength } from "@/lib/domain/format-validation";
import { CHANNEL_LABELS, POST_FORMAT_LABELS } from "@/lib/labels";
import { composeSocialText } from "@/lib/platforms/text";
import { cn } from "@/lib/utils";

export interface SocialData {
  id: string;
  channel: string;
  title: string;
  caption: string | null;
  cta: string | null;
  hashtags: string[];
  link_url: string | null;
  post_format: string | null;
  platform_account_id: string | null;
  assignee_id: string | null;
  window_start: string | null;
  window_end: string | null;
  notes: string | null;
}

const FORMATS_BY_CHANNEL: Record<string, string[]> = {
  instagram: ["feed_bild", "karussell", "reel", "story"],
  facebook: ["feed_bild", "karussell", "text", "link", "video", "reel"],
  linkedin: ["text", "link", "feed_bild", "karussell", "video"],
};

export function SocialForm({
  item,
  people,
  accounts,
  limits,
  previewImage,
  locked,
}: {
  item: SocialData;
  people: Option[];
  accounts: Option[];
  limits: { caption: number | null; hashtags: number | null };
  previewImage: string | null;
  locked: boolean;
}) {
  const [caption, setCaption] = useState(item.caption ?? "");
  const [cta, setCta] = useState(item.cta ?? "");
  const [tags, setTags] = useState(item.hashtags.join(" "));
  const [link, setLink] = useState(item.link_url ?? "");
  const [format, setFormat] = useState(item.post_format ?? FORMATS_BY_CHANNEL[item.channel]?.[0] ?? "feed_bild");

  const hashtagList = useMemo(() => tags.split(/[\s,]+/).filter(Boolean).map((t) => (t.startsWith("#") ? t : `#${t}`)), [tags]);
  const length = countCaptionLength(caption + (cta ? `\n\n${cta}` : ""), hashtagList);
  const tooLong = limits.caption !== null && length > limits.caption;
  const tooManyTags = limits.hashtags !== null && hashtagList.length > limits.hashtags;
  const fullText = composeSocialText({ caption, cta, hashtags: hashtagList, link_url: link || null, channel: item.channel, post_format: format });

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
      <ActionForm action={saveSocial} className="grid gap-4">
        <input type="hidden" name="id" value={item.id} />
        <InputField name="title" label="Titel (intern)" defaultValue={item.title} required />
        <FormGrid>
          <FieldShell label="Format" htmlFor="post_format">
            <NativeSelect id="post_format" name={locked ? undefined : "post_format"} value={format} onChange={(e) => setFormat(e.target.value)} disabled={locked}>
              {(FORMATS_BY_CHANNEL[item.channel] ?? []).map((f) => <option key={f} value={f}>{POST_FORMAT_LABELS[f]}</option>)}
            </NativeSelect>
          </FieldShell>
          <SelectField name="platform_account_id" label="Zielkonto" defaultValue={item.platform_account_id ?? ""} placeholder={accounts.length ? "Bitte wählen" : "Kein Konto angelegt"} options={accounts} help={accounts.length ? undefined : "Konten unter Einstellungen → Integrationen anlegen."} />
        </FormGrid>
        {locked && <input type="hidden" name="post_format" value={format} />}
        <FieldShell
          label={`Text für ${CHANNEL_LABELS[item.channel]}`}
          htmlFor="caption"
          help={
            <span className={cn(tooLong && "font-medium text-destructive")}>
              {length}{limits.caption ? ` / ${limits.caption}` : ""} Zeichen inkl. CTA und Hashtags
            </span>
          }
        >
          <textarea
            id="caption"
            name="caption"
            rows={8}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            readOnly={locked}
            className="min-h-40 w-full rounded-lg border border-input bg-white px-3 py-2 text-sm leading-relaxed outline-none focus-visible:border-[#b90845] focus-visible:ring-3 focus-visible:ring-[#b90845]/15"
          />
        </FieldShell>
        <FormGrid>
          <FieldShell label="Call-to-Action" htmlFor="cta">
            <input id="cta" name="cta" value={cta} onChange={(e) => setCta(e.target.value)} readOnly={locked} className="h-9 w-full rounded-lg border border-input bg-white px-3 text-sm" placeholder="z. B. Jetzt Tagung anfragen" />
          </FieldShell>
          <FieldShell label="Link" htmlFor="link_url" help={item.channel === "instagram" ? "Instagram verlinkt im Beitragstext nicht – Link ggf. in Bio/Story." : format === "link" ? "Wird als Link-Beitrag veröffentlicht." : "Wird an den Text angehängt."}>
            <input id="link_url" name="link_url" value={link} onChange={(e) => setLink(e.target.value)} readOnly={locked} className="h-9 w-full rounded-lg border border-input bg-white px-3 text-sm" placeholder="https://" />
          </FieldShell>
        </FormGrid>
        <FieldShell label="Hashtags" htmlFor="hashtags" help={<span className={cn(tooManyTags && "font-medium text-destructive")}>{hashtagList.length}{limits.hashtags ? ` / ${limits.hashtags}` : ""} Hashtags · mit Leerzeichen trennen</span>}>
          <input id="hashtags" name="hashtags" value={tags} onChange={(e) => setTags(e.target.value)} readOnly={locked} className="h-9 w-full rounded-lg border border-input bg-white px-3 text-sm" placeholder="#MICE #Tagung" />
        </FieldShell>
        <FormGrid className="sm:grid-cols-3">
          <SelectField name="assignee_id" label="Bearbeitung" defaultValue={item.assignee_id ?? ""} placeholder="Nicht zugewiesen" options={people} />
          <InputField name="window_start" type="date" label="Vorgeschlagener Zeitraum ab" defaultValue={item.window_start ?? ""} />
          <InputField name="window_end" type="date" label="bis" defaultValue={item.window_end ?? ""} />
        </FormGrid>
        <TextareaField name="notes" label="Interne Notizen" defaultValue={item.notes ?? ""} rows={2} help="Nicht Teil der Freigabe." />
        <FormActions>
          <SubmitButton>Speichern</SubmitButton>
        </FormActions>
      </ActionForm>

      <div aria-label="Vorschau" className="h-fit rounded-xl border border-border bg-white p-3 shadow-sm lg:sticky lg:top-20">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Vorschau {CHANNEL_LABELS[item.channel]} (vereinfacht)</p>
        <div className="flex items-center gap-2 pb-2">
          <span className="grid size-8 place-items-center rounded-full bg-[#b90845] text-[10px] font-bold text-white">MG</span>
          <span className="text-sm font-semibold">MEET GERMANY</span>
        </div>
        {format !== "text" && format !== "link" && (
          previewImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- signierte URL
            <img src={previewImage} alt="" className={cn("w-full rounded-md object-cover", format === "reel" || format === "story" ? "aspect-[9/16]" : "aspect-[4/5]")} />
          ) : (
            <div className={cn("grid w-full place-items-center rounded-md bg-muted text-xs text-muted-foreground", format === "reel" || format === "story" ? "aspect-[9/16]" : "aspect-[4/5]")}>Noch kein Medium</div>
          )
        )}
        <p className="mt-2 text-sm whitespace-pre-line break-words">{fullText || <span className="text-muted-foreground">Noch kein Text.</span>}</p>
      </div>
    </div>
  );
}
