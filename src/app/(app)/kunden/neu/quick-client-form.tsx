"use client";

import { useMemo, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldShell, NativeSelect, type Option } from "@/components/common/form";
import { createClientWithMembership } from "@/actions/clients";
import { quickClientSchema, type QuickClientInput } from "@/lib/schemas";
import { addDays, addMonths, formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { z } from "zod";

type QuickClientOutput = z.output<typeof quickClientSchema>;

export interface TemplateOption {
  id: string;
  name: string;
  description: string | null;
  items: {
    id: string;
    name: string;
    quantity: number | null;
    perParentItemId: string | null;
    quantityPerParent: number | null;
    period: string;
    contentKind: string | null;
  }[];
}

const STEPS = ["Kunde & Ansprechpartner", "Paket & Vertrag", "Kontrolle"] as const;

function contractYears(start: string, end: string): { start: string; end: string }[] {
  const years: { start: string; end: string }[] = [];
  let s = start;
  while (s <= end && years.length < 10) {
    const e = addDays(addMonths(s, 12), -1);
    years.push({ start: s, end: e < end ? e : end });
    s = addDays(e < end ? e : end, 1);
  }
  return years;
}

export function QuickClientForm({
  templates,
  people,
  currentUserId,
  today,
}: {
  templates: TemplateOption[];
  people: Option[];
  currentUserId: string;
  today: string;
}) {
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const form = useForm<QuickClientInput, unknown, QuickClientOutput>({
    resolver: zodResolver(quickClientSchema),
    mode: "onTouched",
    defaultValues: {
      name: "", category: "", website: "", email: "", phone: "", city: "", owner_id: currentUserId, notes: "",
      contact_first_name: "", contact_last_name: "", contact_position: "", contact_email: "", contact_phone: "",
      contact_can_approve: true, template_id: templates[0]?.id ?? "", start_date: today,
      end_date: addDays(addMonths(today, 12), -1), renewal_date: "", auto_renew: false,
    },
  });
  const { register, formState: { errors }, watch, trigger, handleSubmit } = form;
  const values = watch();
  const template = templates.find((t) => t.id === values.template_id);

  const preview = useMemo(() => {
    if (!template || !values.start_date || !values.end_date || values.end_date < values.start_date) return null;
    const years = contractYears(values.start_date, values.end_date);
    const lines = years.map((y, index) => {
      const counts = new Map<string, number>();
      for (const item of template.items) {
        if (item.period === "vertragslaufzeit" && index > 0) continue;
        if (item.perParentItemId) {
          const parent = template.items.find((p) => p.id === item.perParentItemId);
          const n = (parent?.quantity ?? 1) * (item.quantityPerParent ?? 1);
          counts.set(`${item.name} (je ${parent?.name ?? "Einheit"})`, n);
        } else {
          counts.set(item.name, item.quantity ?? 0);
        }
      }
      return { year: index + 1, ...y, counts: [...counts.entries()] };
    });
    return lines;
  }, [template, values.start_date, values.end_date]);

  const next = async () => {
    const fields: (keyof QuickClientInput)[][] = [
      ["name", "category", "website", "email", "phone", "city", "owner_id", "contact_first_name", "contact_last_name", "contact_email", "contact_position", "contact_phone"],
      ["template_id", "start_date", "end_date", "renewal_date"],
    ];
    const valid = await trigger(fields[step]);
    if (valid) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const onSubmit = handleSubmit(() => {
    // Rohwerte senden – der Server validiert mit demselben Schema erneut.
    const raw = form.getValues();
    startTransition(async () => {
      const res = await createClientWithMembership(raw);
      if (res.ok) {
        toast.success(res.data.units ? `Kunde angelegt – ${res.data.units} Leistungseinheiten erzeugt.` : "Kunde angelegt.");
        router.push(`/kunden/${res.data.clientId}`);
      } else {
        toast.error(res.error);
      }
    });
  });

  const err = (name: keyof QuickClientInput) => errors[name]?.message as string | undefined;
  const input = "h-9 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none focus-visible:border-[#b90845] focus-visible:ring-3 focus-visible:ring-[#b90845]/15 aria-invalid:border-destructive";

  return (
    <form onSubmit={onSubmit} className="max-w-4xl" noValidate>
      <ol className="mb-6 grid gap-2 sm:grid-cols-3" aria-label="Fortschritt">
        {STEPS.map((label, i) => (
          <li key={label} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm", i === step ? "border-[#b90845] bg-[#fbf5f8]" : "border-border bg-card", i < step && "text-emerald-700")}>
            <span className={cn("grid size-6 place-items-center rounded-full text-xs font-semibold", i < step ? "bg-emerald-600 text-white" : i === step ? "bg-[#b90845] text-white" : "bg-muted text-muted-foreground")}>
              {i < step ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={i === step ? "font-medium" : ""} aria-current={i === step ? "step" : undefined}>{label}</span>
          </li>
        ))}
      </ol>

      <div className="rounded-xl border border-border bg-card p-5">
        {step === 0 && (
          <div className="grid gap-6">
            <fieldset className="grid gap-4 sm:grid-cols-2">
              <legend className="mb-2 text-sm font-semibold">Stammdaten</legend>
              <FieldShell label="Firmenname" required htmlFor="name" error={err("name")} className="sm:col-span-2">
                <input id="name" className={input} aria-invalid={Boolean(err("name"))} {...register("name")} autoFocus />
              </FieldShell>
              <FieldShell label="Kategorie" htmlFor="category" help="z. B. Tagungshotel, Eventlocation, Destination" error={err("category")}>
                <input id="category" className={input} {...register("category")} />
              </FieldShell>
              <FieldShell label="Ort" htmlFor="city" error={err("city")}>
                <input id="city" className={input} {...register("city")} />
              </FieldShell>
              <FieldShell label="Website" htmlFor="website" error={err("website")}>
                <input id="website" className={input} placeholder="https://" {...register("website")} />
              </FieldShell>
              <FieldShell label="Allgemeine E-Mail" htmlFor="email" error={err("email")}>
                <input id="email" type="email" className={input} {...register("email")} />
              </FieldShell>
              <FieldShell label="Telefon" htmlFor="phone" error={err("phone")}>
                <input id="phone" className={input} {...register("phone")} />
              </FieldShell>
              <FieldShell label="Zuständige interne Person" htmlFor="owner_id" error={err("owner_id")}>
                <NativeSelect id="owner_id" {...register("owner_id")}>
                  <option value="">Nicht zugewiesen</option>
                  {people.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </NativeSelect>
              </FieldShell>
            </fieldset>
            <fieldset className="grid gap-4 sm:grid-cols-2">
              <legend className="mb-2 text-sm font-semibold">Ansprechpartner (optional)</legend>
              <FieldShell label="Vorname" htmlFor="cfn"><input id="cfn" className={input} {...register("contact_first_name")} /></FieldShell>
              <FieldShell label="Nachname" htmlFor="cln" error={err("contact_last_name")}>
                <input id="cln" className={input} aria-invalid={Boolean(err("contact_last_name"))} {...register("contact_last_name")} />
              </FieldShell>
              <FieldShell label="Funktion" htmlFor="cpos"><input id="cpos" className={input} {...register("contact_position")} /></FieldShell>
              <FieldShell label="E-Mail" htmlFor="cem" error={err("contact_email")}>
                <input id="cem" type="email" className={input} {...register("contact_email")} />
              </FieldShell>
              <FieldShell label="Telefon" htmlFor="cph"><input id="cph" className={input} {...register("contact_phone")} /></FieldShell>
              <label className="flex items-center gap-2 self-end text-sm">
                <input type="checkbox" className="size-4 accent-[#b90845]" {...register("contact_can_approve")} /> Darf Inhalte freigeben
              </label>
            </fieldset>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-5">
            <fieldset>
              <legend className="mb-3 text-sm font-semibold">Membership-Paket</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                {templates.map((t) => (
                  <label key={t.id} className={cn("cursor-pointer rounded-lg border p-3 text-sm transition", values.template_id === t.id ? "border-[#b90845] bg-[#fbf5f8] ring-1 ring-[#b90845]" : "border-border hover:border-stone-400")}>
                    <input type="radio" value={t.id} className="sr-only" {...register("template_id")} />
                    <span className="block font-medium">{t.name}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{t.description}</span>
                  </label>
                ))}
                <label className={cn("cursor-pointer rounded-lg border p-3 text-sm", !values.template_id ? "border-[#b90845] bg-[#fbf5f8] ring-1 ring-[#b90845]" : "border-border")}>
                  <input type="radio" value="" className="sr-only" {...register("template_id")} />
                  <span className="block font-medium">Noch kein Paket</span>
                  <span className="mt-1 block text-xs text-muted-foreground">Nur den Kunden anlegen, Paket später buchen.</span>
                </label>
              </div>
            </fieldset>
            {values.template_id && (
              <div className="grid gap-4 sm:grid-cols-3">
                <FieldShell label="Vertragsbeginn" required htmlFor="sd" error={err("start_date")}>
                  <input id="sd" type="date" className={input} {...register("start_date")} />
                </FieldShell>
                <FieldShell label="Vertragsende" required htmlFor="ed" error={err("end_date")} help="Mehrjährige Laufzeit erzeugt je Vertragsjahr eigene Leistungen.">
                  <input id="ed" type="date" className={input} {...register("end_date")} />
                </FieldShell>
                <FieldShell label="Verlängerung / Kündigungsfrist" htmlFor="rd" error={err("renewal_date")}>
                  <input id="rd" type="date" className={input} {...register("renewal_date")} />
                </FieldShell>
                <label className="flex items-center gap-2 text-sm sm:col-span-3">
                  <input type="checkbox" className="size-4 accent-[#b90845]" {...register("auto_renew")} /> Verlängert sich automatisch
                </label>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-5 text-sm">
            <div>
              <h2 className="text-sm font-semibold">{values.name}</h2>
              <p className="text-muted-foreground">
                {[values.category, values.city].filter(Boolean).join(" · ") || "Ohne Kategorie/Ort"}
                {values.contact_last_name && ` · Ansprechpartner: ${[values.contact_first_name, values.contact_last_name].filter(Boolean).join(" ")}`}
              </p>
            </div>
            {template && preview ? (
              <div>
                <h3 className="font-semibold">{template.name} – diese Leistungen werden erzeugt</h3>
                <p className="mb-3 text-xs text-muted-foreground">
                  Der aktuelle Stand der Paketvorlage wird im Vertrag gespeichert. Spätere Vorlagenänderungen wirken sich nicht auf diesen Vertrag aus.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {preview.map((y) => (
                    <div key={y.year} className="rounded-lg border border-border p-3">
                      <p className="font-medium">Vertragsjahr {y.year}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(y.start)} – {formatDate(y.end)}</p>
                      <ul className="mt-2 space-y-1">
                        {y.counts.map(([name, n]) => (
                          <li key={name} className="flex justify-between gap-3">
                            <span>{name}</span>
                            <span className="text-muted-foreground tabular-nums">{n > 0 ? `${n} ×` : "ohne feste Stückzahl"}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">Es wird kein Paket gebucht. Sie können das später in der Kundenakte nachholen.</p>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <Button type="button" variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || pending}>
          <ChevronLeft /> Zurück
        </Button>
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={next}>Weiter <ChevronRight /></Button>
        ) : (
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Kunde anlegen{template ? " & Paket buchen" : ""}
          </Button>
        )}
      </div>
    </form>
  );
}
