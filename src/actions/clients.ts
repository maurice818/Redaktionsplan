"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdmin, assertEditor } from "@/lib/auth";
import { check, runAction, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import { quickClientSchema, type QuickClientInput } from "@/lib/schemas";
import {
  dateOnly, formToObject, optionalDate, optionalEmail, optionalText, optionalUrl, optionalUuid, requiredText, uuid,
} from "@/lib/validation";

const refresh = () => revalidatePath("/", "layout");

// -----------------------------------------------------------------------------
// Schnellweg: Kunde anlegen → Paket buchen → Leistungen erzeugen
// -----------------------------------------------------------------------------


export async function createClientWithMembership(input: QuickClientInput): Promise<ActionResult<{ clientId: string; units: number }>> {
  return runAction(async () => {
    const profile = await assertEditor();
    const d = quickClientSchema.parse(input);
    const supabase = await createClient();

    const client = check(
      await supabase
        .from("clients")
        .insert({
          name: d.name, category: d.category, website: d.website, email: d.email, phone: d.phone, city: d.city,
          owner_id: d.owner_id ?? profile.id, notes: d.notes, status: "aktiv",
        })
        .select("id")
        .single(),
    );

    if (d.contact_last_name) {
      check(
        await supabase.from("contacts").insert({
          client_id: client.id, first_name: d.contact_first_name, last_name: d.contact_last_name, position: d.contact_position,
          email: d.contact_email, phone: d.contact_phone, is_primary: true, can_approve: d.contact_can_approve,
        }),
      );
    }

    let units = 0;
    if (d.template_id && d.start_date && d.end_date) {
      const contractId = check(
        await supabase.rpc("book_membership", {
          p_client_id: client.id,
          p_template_id: d.template_id,
          p_start_date: d.start_date,
          p_end_date: d.end_date,
          p_owner_id: d.owner_id ?? profile.id,
          p_auto_renew: d.auto_renew,
          p_renewal_date: d.renewal_date,
        }),
      );
      const { count } = await supabase.from("deliverables").select("id", { count: "exact", head: true }).eq("contract_id", contractId);
      units = count ?? 0;
    }
    refresh();
    return { clientId: client.id, units };
  }, "Kunde angelegt.");
}

// -----------------------------------------------------------------------------
// Stammdaten
// -----------------------------------------------------------------------------
const clientSchema = z.object({
  id: uuid,
  name: requiredText("Firmenname", 200),
  legal_name: optionalText(200),
  category: optionalText(100),
  website: optionalUrl,
  email: optionalEmail,
  phone: optionalText(60),
  street: optionalText(200),
  postal_code: optionalText(20),
  city: optionalText(100),
  country: optionalText(100),
  owner_id: optionalUuid,
  status: z.enum(["interessent", "aktiv", "pausiert", "beendet"]),
  notes: optionalText(10000),
  links: z.string().optional(),
});

function parseLinks(raw: string | undefined): { label: string; url: string }[] {
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = /^(.*?)\s*[|–-]\s*(https?:\/\/\S+)$/.exec(line) ?? /^()(https?:\/\/\S+)$/.exec(line);
      if (!m) throw new z.ZodError([{ code: "custom", path: ["links"], message: `Ungültiger Link: „${line}“ (Format: Bezeichnung | https://…)`, input: line }]);
      return { label: m[1] || new URL(m[2]).hostname, url: m[2] };
    })
    .slice(0, 30);
}

export async function updateClient(_: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertEditor();
    const d = clientSchema.parse(formToObject(formData));
    const supabase = await createClient();
    const { id, links, ...rest } = d;
    check(await supabase.from("clients").update({ ...rest, links: parseLinks(links) }).eq("id", id));
    refresh();
    return null;
  }, "Stammdaten gespeichert.");
}

export async function deleteClient(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertAdmin();
    const supabase = await createClient();
    const { count } = await supabase.from("dossiers").select("id", { count: "exact", head: true }).eq("client_id", id);
    if (count) throw new Error("Der Kunde hat noch Beitragsakten. Bitte zuerst die Akten abschließen oder löschen.");
    check(await supabase.from("clients").delete().eq("id", uuid.parse(id)));
    refresh();
    return null;
  }, "Kunde gelöscht.");
}

// -----------------------------------------------------------------------------
// Ansprechpartner
// -----------------------------------------------------------------------------
const contactSchema = z.object({
  id: optionalUuid,
  client_id: uuid,
  first_name: optionalText(100),
  last_name: requiredText("Nachname", 100),
  position: optionalText(120),
  email: optionalEmail,
  phone: optionalText(60),
  is_primary: z.string().optional().transform((v) => v === "on"),
  can_approve: z.string().optional().transform((v) => v === "on"),
  notes: optionalText(2000),
});

export async function saveContact(_: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertEditor();
    const { id, ...d } = contactSchema.parse(formToObject(formData));
    const supabase = await createClient();
    if (d.is_primary) {
      check(await supabase.from("contacts").update({ is_primary: false }).eq("client_id", d.client_id));
    }
    if (id) check(await supabase.from("contacts").update(d).eq("id", id));
    else check(await supabase.from("contacts").insert(d));
    refresh();
    return null;
  }, "Ansprechpartner gespeichert.");
}

export async function deleteContact(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertEditor();
    const supabase = await createClient();
    check(await supabase.from("contacts").delete().eq("id", uuid.parse(id)));
    refresh();
    return null;
  }, "Ansprechpartner entfernt.");
}

// -----------------------------------------------------------------------------
// Memberships & Leistungen
// -----------------------------------------------------------------------------
const bookSchema = z
  .object({
    client_id: uuid,
    template_id: uuid,
    start_date: dateOnly,
    end_date: dateOnly,
    renewal_date: optionalDate,
    owner_id: optionalUuid,
    auto_renew: z.string().optional().transform((v) => v === "on"),
    notes: optionalText(2000),
  })
  .refine((d) => d.end_date >= d.start_date, { message: "Das Vertragsende liegt vor dem Beginn.", path: ["end_date"] });

export async function bookMembership(_: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertEditor();
    const d = bookSchema.parse(formToObject(formData));
    const supabase = await createClient();
    check(
      await supabase.rpc("book_membership", {
        p_client_id: d.client_id, p_template_id: d.template_id, p_start_date: d.start_date, p_end_date: d.end_date,
        p_owner_id: d.owner_id, p_auto_renew: d.auto_renew, p_renewal_date: d.renewal_date, p_notes: d.notes,
      }),
    );
    refresh();
    return null;
  }, "Membership gebucht – Leistungen wurden erzeugt.");
}

export async function addContractYear(contractId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertEditor();
    const supabase = await createClient();
    check(await supabase.rpc("add_contract_year", { p_contract_id: uuid.parse(contractId) }));
    refresh();
    return null;
  }, "Vertragsjahr ergänzt – Leistungen gemäß gebuchtem Stand erzeugt.");
}

const contractSchema = z.object({
  id: uuid,
  status: z.enum(["entwurf", "aktiv", "gekuendigt", "beendet"]),
  renewal_date: optionalDate,
  owner_id: optionalUuid,
  auto_renew: z.string().optional().transform((v) => v === "on"),
  notes: optionalText(5000),
});

export async function updateContract(_: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertEditor();
    const { id, ...d } = contractSchema.parse(formToObject(formData));
    const supabase = await createClient();
    check(await supabase.from("contracts").update(d).eq("id", id));
    refresh();
    return null;
  }, "Vertrag gespeichert.");
}

const addDeliverableSchema = z.object({
  client_id: uuid,
  contract_id: optionalUuid,
  contract_year_id: optionalUuid,
  service_type_id: uuid,
  title: requiredText("Bezeichnung", 200),
  quantity: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .refine((v) => v === null || (Number.isInteger(v) && v > 0 && v <= 50), "Stückzahl zwischen 1 und 50 oder leer lassen."),
  source: z.enum(["zusatzbuchung", "korrektur", "manuell"]),
  reason: requiredText("Begründung", 1000),
  due_date: optionalDate,
  owner_id: optionalUuid,
  description: optionalText(2000),
});

export async function addDeliverable(_: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertEditor();
    const d = addDeliverableSchema.parse(formToObject(formData));
    const supabase = await createClient();
    check(
      await supabase.rpc("add_deliverable", {
        p_client_id: d.client_id, p_contract_id: d.contract_id, p_contract_year_id: d.contract_year_id,
        p_service_type_id: d.service_type_id, p_title: d.title, p_quantity: d.quantity, p_source: d.source,
        p_reason: d.reason, p_due_date: d.due_date, p_owner_id: d.owner_id, p_description: d.description,
      }),
    );
    refresh();
    return null;
  }, "Leistung erfasst.");
}

const correctSchema = z
  .object({
    id: uuid,
    status: z.enum(["offen", "in_arbeit", "erbracht", "entfallen"]),
    title: optionalText(200),
    owner_id: optionalUuid,
    due_date: optionalDate,
    evidence_url: optionalUrl,
    fulfillment_note: optionalText(2000),
    cancel_reason: optionalText(1000),
    reason: requiredText("Begründung der Korrektur", 1000),
  })
  .refine((d) => d.status !== "entfallen" || d.cancel_reason, { message: "Bitte angeben, warum die Leistung entfällt.", path: ["cancel_reason"] });

export async function correctDeliverable(_: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    await assertEditor();
    const d = correctSchema.parse(formToObject(formData));
    const supabase = await createClient();
    check(
      await supabase.rpc("correct_deliverable", {
        p_id: d.id, p_status: d.status, p_title: d.title, p_owner_id: d.owner_id, p_due_date: d.due_date,
        p_evidence_url: d.evidence_url, p_fulfillment_note: d.fulfillment_note, p_cancel_reason: d.cancel_reason, p_reason: d.reason,
      }),
    );
    refresh();
    return null;
  }, "Leistung aktualisiert (mit Änderungsprotokoll).");
}
