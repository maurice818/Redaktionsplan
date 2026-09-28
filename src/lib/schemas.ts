import { z } from "zod";
import { optionalDate, optionalEmail, optionalText, optionalUrl, optionalUuid, requiredText } from "@/lib/validation";

/**
 * Gemeinsame Schemas für Browser (React Hook Form) und Server (Server Actions).
 */
export const quickClientSchema = z
  .object({
    name: requiredText("Firmenname", 200),
    category: optionalText(100),
    website: optionalUrl,
    email: optionalEmail,
    phone: optionalText(60),
    city: optionalText(100),
    owner_id: optionalUuid,
    notes: optionalText(5000),
    contact_first_name: optionalText(100),
    contact_last_name: optionalText(100),
    contact_position: optionalText(120),
    contact_email: optionalEmail,
    contact_phone: optionalText(60),
    contact_can_approve: z.boolean().default(true),
    template_id: optionalUuid,
    start_date: optionalDate,
    end_date: optionalDate,
    renewal_date: optionalDate,
    auto_renew: z.boolean().default(false),
  })
  .refine((d) => !d.template_id || (d.start_date && d.end_date), {
    message: "Für die Paketbuchung bitte Vertragsbeginn und -ende angeben.",
    path: ["end_date"],
  })
  .refine((d) => !d.start_date || !d.end_date || d.end_date >= d.start_date, {
    message: "Das Vertragsende liegt vor dem Beginn.",
    path: ["end_date"],
  })
  .refine((d) => !d.contact_email || d.contact_last_name, {
    message: "Bitte den Nachnamen des Ansprechpartners angeben.",
    path: ["contact_last_name"],
  });

export type QuickClientInput = z.input<typeof quickClientSchema>;

export const ownPostSchema = z
  .object({
    title: requiredText("Titel", 200),
    own_category: z.enum(["summit", "speaker", "aussteller", "newsletter", "eventrueckblick", "netzwerk", "sonstiges"]),
    campaign_id: optionalUuid,
    idea_id: optionalUuid,
    topic: optionalText(300),
    goal: optionalText(1000),
    owner_id: optionalUuid,
    channels: z.array(z.enum(["magazin", "instagram", "facebook", "linkedin"])).min(1, "Bitte mindestens einen Kanal wählen."),
    task_title: optionalText(200),
    task_assignee_id: optionalUuid,
    task_due_date: optionalDate,
    scheduled_local: z.string().optional().transform((v) => (v ? v : null)),
  })
  .refine((d) => !d.task_title || d.task_assignee_id, { message: "Bitte eine zuständige Person für die Aufgabe wählen.", path: ["task_assignee_id"] });

export type OwnPostInput = z.input<typeof ownPostSchema>;
