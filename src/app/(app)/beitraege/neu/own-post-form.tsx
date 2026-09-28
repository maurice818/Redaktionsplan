"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { FieldShell, NativeSelect, type Option } from "@/components/common/form";
import { createOwnPost } from "@/actions/dossiers";
import { CHANNEL_LABELS, OWN_CATEGORY_LABELS } from "@/lib/labels";
import { ownPostSchema, type OwnPostInput } from "@/lib/schemas";
import { cn } from "@/lib/utils";

type Output = z.output<typeof ownPostSchema>;

const input = "h-9 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none focus-visible:border-[#b90845] focus-visible:ring-3 focus-visible:ring-[#b90845]/15 aria-invalid:border-destructive";

export function OwnPostForm({
  people,
  campaigns,
  ideas,
  currentUserId,
  defaults,
}: {
  people: Option[];
  campaigns: Option[];
  ideas: Option[];
  currentUserId: string;
  defaults: { title: string; topic: string; idea_id: string; campaign_id: string };
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const form = useForm<OwnPostInput, unknown, Output>({
    resolver: zodResolver(ownPostSchema),
    defaultValues: {
      title: defaults.title, own_category: "summit", campaign_id: defaults.campaign_id, idea_id: defaults.idea_id,
      topic: defaults.topic, goal: "", owner_id: currentUserId, channels: ["instagram", "linkedin"],
      task_title: "", task_assignee_id: currentUserId, task_due_date: "", scheduled_local: "",
    },
  });
  const { register, formState: { errors }, watch, handleSubmit } = form;
  const channels = watch("channels") ?? [];
  const err = (k: keyof OwnPostInput) => errors[k]?.message as string | undefined;

  const onSubmit = handleSubmit(() => {
    const raw = form.getValues();
    startTransition(async () => {
      const res = await createOwnPost(raw);
      if (res.ok) {
        toast.success("Eigener Beitrag angelegt.");
        router.push(`/beitraege/${res.data.dossierId}`);
      } else toast.error(res.error);
    });
  });

  return (
    <form onSubmit={onSubmit} className="grid max-w-4xl gap-5" noValidate>
      <section className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">
        <h2 className="text-sm font-semibold sm:col-span-2">1 · Beitrag</h2>
        <FieldShell label="Titel" required htmlFor="title" error={err("title")} className="sm:col-span-2">
          <input id="title" className={input} {...register("title")} autoFocus />
        </FieldShell>
        <FieldShell label="Kategorie" htmlFor="own_category">
          <NativeSelect id="own_category" {...register("own_category")}>
            {Object.entries(OWN_CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </NativeSelect>
        </FieldShell>
        <FieldShell label="Kampagne" htmlFor="campaign_id">
          <NativeSelect id="campaign_id" {...register("campaign_id")}>
            <option value="">Keine Kampagne</option>
            {campaigns.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </NativeSelect>
        </FieldShell>
        <FieldShell label="Aus dem Ideenspeicher" htmlFor="idea_id">
          <NativeSelect id="idea_id" {...register("idea_id")}>
            <option value="">Keine Idee verknüpfen</option>
            {ideas.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </NativeSelect>
        </FieldShell>
        <FieldShell label="Verantwortlich" htmlFor="owner_id">
          <NativeSelect id="owner_id" {...register("owner_id")}>
            {people.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </NativeSelect>
        </FieldShell>
        <FieldShell label="Thema / Kernaussage" htmlFor="topic" className="sm:col-span-2">
          <textarea id="topic" rows={2} className={cn(input, "h-auto py-2")} {...register("topic")} />
        </FieldShell>
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-sm font-medium">Kanäle <span className="text-[#b90845]">*</span></legend>
          <div className="flex flex-wrap gap-2">
            {(["magazin", "instagram", "facebook", "linkedin"] as const).map((c) => (
              <label key={c} className={cn("cursor-pointer rounded-lg border px-3 py-1.5 text-sm", channels.includes(c) ? "border-[#b90845] bg-[#fbf5f8]" : "border-border")}>
                <input type="checkbox" value={c} className="mr-2 accent-[#b90845]" {...register("channels")} />
                {CHANNEL_LABELS[c]}
              </label>
            ))}
          </div>
          {err("channels") && <p className="mt-1 text-xs font-medium text-destructive">{err("channels")}</p>}
          <p className="mt-1 text-xs text-muted-foreground">Je Kanal entsteht eine eigene Fassung mit eigenem Text, Medium, Format und Termin.</p>
        </fieldset>
      </section>

      <section className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-3">
        <h2 className="text-sm font-semibold sm:col-span-3">2 · Aufgabe zuweisen (optional)</h2>
        <FieldShell label="Aufgabe" htmlFor="task_title" className="sm:col-span-3">
          <input id="task_title" className={input} placeholder="z. B. Texte und Grafik vorbereiten" {...register("task_title")} />
        </FieldShell>
        <FieldShell label="Zuständig" htmlFor="task_assignee_id" error={err("task_assignee_id")}>
          <NativeSelect id="task_assignee_id" {...register("task_assignee_id")}>
            <option value="">Bitte wählen</option>
            {people.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </NativeSelect>
        </FieldShell>
        <FieldShell label="Fällig am" htmlFor="task_due_date" error={err("task_due_date")}>
          <input id="task_due_date" type="date" className={input} {...register("task_due_date")} />
        </FieldShell>
      </section>

      <section className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">
        <h2 className="text-sm font-semibold sm:col-span-2">3 · Terminieren</h2>
        <FieldShell label="Geplanter Termin (Europe/Berlin)" htmlFor="scheduled_local" help="Wird als vorläufiger Termin eingetragen. Verbindlich einplanen ist erst nach interner Freigabe möglich.">
          <input id="scheduled_local" type="datetime-local" className={input} {...register("scheduled_local")} />
        </FieldShell>
      </section>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />} Beitrag anlegen</Button>
      </div>
    </form>
  );
}
