import "server-only";
import { sendTemplatedEmail } from "@/lib/email/send";
import { publicEnv } from "@/lib/env";
import { decryptSecret } from "@/lib/security/crypto";
import type { AdminSupabase } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/database.types";
import { addDays, berlinDate, berlinToday, daysBetween, formatDate, formatDateTime } from "@/lib/time";

type Rule = Tables<"reminder_rules">;

export interface ReminderSummary {
  [rule: string]: { checked: number; fired: number; errors: number };
}

/**
 * Nummer der fälligen Erinnerung (1 … max) nach "days" und "repeat_days".
 * 0 = noch nicht fällig.
 */
export function dueOccurrence(daysSince: number, rule: Pick<Rule, "days" | "repeat_days" | "max_reminders">): number {
  if (daysSince < rule.days) return 0;
  const n = rule.repeat_days ? 1 + Math.floor((daysSince - rule.days) / rule.repeat_days) : 1;
  return Math.min(n, rule.max_reminders);
}

/** Datum als ganzzahlige Nummer (YYYYMMDD) – eigene Erinnerung je Termin. */
const dayKey = (day: string) => Number(day.replaceAll("-", ""));

async function claim(admin: AdminSupabase, rule: string, entityId: string, occurrence: number, runId: string) {
  const { data, error } = await admin.rpc("claim_reminder", {
    p_rule_key: rule,
    p_entity_id: entityId,
    p_occurrence: occurrence,
    p_run_id: runId,
  });
  if (error) throw new Error(error.message);
  return data === true;
}

async function outcome(admin: AdminSupabase, rule: string, entityId: string, occurrence: number, result: Record<string, unknown>) {
  await admin.rpc("record_reminder_outcome", {
    p_rule_key: rule,
    p_entity_id: entityId,
    p_occurrence: occurrence,
    p_outcome: result as never,
  });
}

async function profileOf(admin: AdminSupabase, id: string | null) {
  if (!id) return null;
  const { data } = await admin.from("profiles").select("id, email, full_name, is_active").eq("id", id).maybeSingle();
  return data?.is_active ? data : null;
}

async function notifyTeam(
  admin: AdminSupabase,
  rule: Rule,
  recipientId: string | null,
  title: string,
  text: string,
  link: string,
  dedupe: string,
) {
  const profile = await profileOf(admin, recipientId);
  if (!profile) return { notified: false };
  await admin.rpc("system_notify", {
    p_recipient: profile.id,
    p_kind: `erinnerung_${rule.key}`,
    p_title: title,
    p_body: text,
    p_link: link,
    p_dedupe_key: dedupe,
  });
  let email: string | undefined;
  if (rule.team_template_key && profile.email) {
    const res = await sendTemplatedEmail({
      templateKey: rule.team_template_key,
      to: profile.email,
      toName: profile.full_name,
      vars: { empfaenger_name: profile.full_name || profile.email, titel: title, text, link: `${publicEnv.appUrl}${link}` },
      triggeredBy: "erinnerung",
      idempotencyKey: `team:${dedupe}`,
    });
    email = res.status;
  }
  return { notified: true, email };
}

export async function runReminders(admin: AdminSupabase, runId: string, now = new Date()): Promise<ReminderSummary> {
  const summary: ReminderSummary = {};
  const { data: rules } = await admin.from("reminder_rules").select("*").eq("is_active", true);
  const byKey = new Map((rules ?? []).map((r) => [r.key, r]));
  const today = berlinToday(now);
  const bump = (key: string, field: "checked" | "fired" | "errors") => {
    summary[key] ??= { checked: 0, fired: 0, errors: 0 };
    summary[key][field]++;
  };

  // ---------------------------------------------------------------------------
  // 1. Materialformular nicht ausgefüllt
  // ---------------------------------------------------------------------------
  const materialRule = byKey.get("material_ausstehend");
  if (materialRule) {
    const { data: requests } = await admin
      .from("material_requests")
      .select("id, dossier_id, client_id, recipient_name, recipient_email, token_encrypted, expires_at, sent_at, dossiers(title, owner_id)")
      .in("status", ["versendet", "geoeffnet", "in_bearbeitung"])
      .is("revoked_at", null)
      .not("sent_at", "is", null)
      .gt("expires_at", now.toISOString());
    for (const r of requests ?? []) {
      bump(materialRule.key, "checked");
      const n = dueOccurrence(daysBetween(berlinDate(r.sent_at!), today), materialRule);
      if (n === 0) continue;
      try {
        if (!(await claim(admin, materialRule.key, r.id, n, runId))) continue;
        const result: Record<string, unknown> = { occurrence: n };
        const title = r.dossiers?.title ?? "Beitrag";
        if (materialRule.notify_customer && materialRule.customer_template_key && r.recipient_email) {
          if (r.token_encrypted) {
            const token = decryptSecret(r.token_encrypted);
            const res = await sendTemplatedEmail({
              templateKey: materialRule.customer_template_key,
              to: r.recipient_email,
              toName: r.recipient_name,
              vars: {
                empfaenger_name: r.recipient_name || "Damen und Herren",
                beitrag_titel: title,
                link: `${publicEnv.appUrl}/m/${token}`,
                gueltig_bis: formatDateTime(r.expires_at),
              },
              related: { dossier_id: r.dossier_id, client_id: r.client_id, material_request_id: r.id },
              triggeredBy: "erinnerung",
              idempotencyKey: `reminder:${materialRule.key}:${r.id}:${n}`,
            });
            result.customer_email = res.status;
          } else {
            result.customer_email = "kein_link_gespeichert";
          }
        }
        if (materialRule.notify_team && (n >= materialRule.max_reminders || result.customer_email !== "versendet")) {
          const owner = r.dossiers?.owner_id ?? null;
          await admin.rpc("system_ensure_task", {
            p_auto_key: `nachfassen_material:${r.id}:${n}`,
            p_title: `Material nachfassen: ${title}`,
            p_task_type: "rueckfrage",
            p_assignee: owner,
            p_due_date: today,
            p_dossier_id: r.dossier_id,
            p_content_item_id: null,
            p_description: `Das Materialformular wurde trotz ${n} Erinnerung(en) nicht eingereicht.`,
            p_priority: "hoch",
          });
          result.team = await notifyTeam(admin, materialRule, owner, `Material fehlt: ${title}`,
            `Der Kunde hat das Materialformular seit ${formatDate(berlinDate(r.sent_at!))} nicht eingereicht.`,
            `/beitraege/${r.dossier_id}`, `material:${r.id}:${n}`);
        }
        await outcome(admin, materialRule.key, r.id, n, result);
        bump(materialRule.key, "fired");
      } catch (e) {
        bump(materialRule.key, "errors");
        await outcome(admin, materialRule.key, r.id, n, { error: (e as Error).message }).catch(() => undefined);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Kunde hat auf Vorschau nicht reagiert
  // ---------------------------------------------------------------------------
  const previewRule = byKey.get("vorschau_ohne_antwort");
  if (previewRule) {
    const { data: previews } = await admin
      .from("previews")
      .select("id, dossier_id, client_id, recipient_name, recipient_email, token_encrypted, expires_at, sent_at, dossiers(title, owner_id)")
      .in("status", ["versendet", "geoeffnet", "teilweise_beantwortet"])
      .is("revoked_at", null)
      .not("sent_at", "is", null)
      .gt("expires_at", now.toISOString());
    for (const p of previews ?? []) {
      bump(previewRule.key, "checked");
      const n = dueOccurrence(daysBetween(berlinDate(p.sent_at!), today), previewRule);
      if (n === 0) continue;
      try {
        if (!(await claim(admin, previewRule.key, p.id, n, runId))) continue;
        const result: Record<string, unknown> = { occurrence: n };
        const title = p.dossiers?.title ?? "Beitrag";
        if (previewRule.notify_customer && previewRule.customer_template_key && p.recipient_email) {
          if (p.token_encrypted) {
            const token = decryptSecret(p.token_encrypted);
            const res = await sendTemplatedEmail({
              templateKey: previewRule.customer_template_key,
              to: p.recipient_email,
              toName: p.recipient_name,
              vars: {
                empfaenger_name: p.recipient_name || "Damen und Herren",
                beitrag_titel: title,
                link: `${publicEnv.appUrl}/v/${token}`,
                gueltig_bis: formatDateTime(p.expires_at),
              },
              related: { dossier_id: p.dossier_id, client_id: p.client_id, preview_id: p.id },
              triggeredBy: "erinnerung",
              idempotencyKey: `reminder:${previewRule.key}:${p.id}:${n}`,
            });
            result.customer_email = res.status;
          } else {
            result.customer_email = "kein_link_gespeichert";
          }
        }
        if (previewRule.notify_team && (n >= previewRule.max_reminders || result.customer_email !== "versendet")) {
          const owner = p.dossiers?.owner_id ?? null;
          await admin.rpc("system_ensure_task", {
            p_auto_key: `nachfassen_vorschau:${p.id}:${n}`,
            p_title: `Freigabe nachfassen: ${title}`,
            p_task_type: "rueckfrage",
            p_assignee: owner,
            p_due_date: today,
            p_dossier_id: p.dossier_id,
            p_content_item_id: null,
            p_description: `Keine Rückmeldung zur Vorschau seit ${formatDate(berlinDate(p.sent_at!))}.`,
            p_priority: "hoch",
          });
          result.team = await notifyTeam(admin, previewRule, owner, `Keine Rückmeldung zur Vorschau: ${title}`,
            `Die Vorschau wurde am ${formatDate(berlinDate(p.sent_at!))} versendet und ist noch nicht beantwortet.`,
            `/beitraege/${p.dossier_id}`, `vorschau:${p.id}:${n}`);
        }
        await outcome(admin, previewRule.key, p.id, n, result);
        bump(previewRule.key, "fired");
      } catch (e) {
        bump(previewRule.key, "errors");
        await outcome(admin, previewRule.key, p.id, n, { error: (e as Error).message }).catch(() => undefined);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Grafik fehlt kurz vor dem Termin / 4. Termin naht ohne Freigabe
  // ---------------------------------------------------------------------------
  const graphicRule = byKey.get("grafik_fehlt");
  const approvalRule = byKey.get("termin_ohne_freigabe");
  const horizon = Math.max(graphicRule?.days ?? 0, approvalRule?.days ?? 0);
  if (horizon > 0) {
    const until = new Date(now.getTime() + (horizon + 1) * 86_400_000).toISOString();
    const { data: upcoming } = await admin
      .from("content_items")
      .select("id, title, dossier_id, channel, post_format, assignee_id, scheduled_at, approvals_complete, status, dossiers(owner_id), content_media(media_assets(status, kind))")
      .not("scheduled_at", "is", null)
      .gte("scheduled_at", now.toISOString())
      .lte("scheduled_at", until)
      .neq("status", "veroeffentlicht")
      .neq("status", "archiviert");
    const { data: rules } = await admin.from("format_rules").select("channel, post_format, media_required").eq("is_active", true);

    for (const c of upcoming ?? []) {
      const day = berlinDate(c.scheduled_at!);
      const daysLeft = daysBetween(today, day);
      const owner = c.assignee_id ?? c.dossiers?.owner_id ?? null;

      if (graphicRule && daysLeft <= graphicRule.days) {
        bump(graphicRule.key, "checked");
        const needsMedia = (rules ?? []).some((r) => r.channel === c.channel && r.post_format === c.post_format && r.media_required);
        const hasFinal = (c.content_media ?? []).some((cm) => cm.media_assets?.status === "final");
        if (needsMedia && !hasFinal) {
          try {
            if (await claim(admin, graphicRule.key, c.id, dayKey(day), runId)) {
              await admin.rpc("system_ensure_task", {
                p_auto_key: `grafik_fehlt:${c.id}:${day}`,
                p_title: `Grafik fehlt: ${c.title}`,
                p_task_type: "grafik",
                p_assignee: owner,
                p_due_date: addDays(day, -1) < today ? today : addDays(day, -1),
                p_dossier_id: c.dossier_id,
                p_content_item_id: c.id,
                p_description: `Geplant für ${formatDateTime(c.scheduled_at)} – noch kein finales Medium zugeordnet.`,
                p_priority: "dringend",
              });
              const team = await notifyTeam(admin, graphicRule, owner, `Grafik fehlt: ${c.title}`,
                `Geplant für ${formatDateTime(c.scheduled_at)} – bitte finale Grafik zuordnen.`,
                `/beitraege/${c.dossier_id}/inhalte/${c.id}`, `grafik:${c.id}:${day}`);
              await outcome(admin, graphicRule.key, c.id, dayKey(day), { team });
              bump(graphicRule.key, "fired");
            }
          } catch {
            bump(graphicRule.key, "errors");
          }
        }
      }

      if (approvalRule && daysLeft <= approvalRule.days && !c.approvals_complete) {
        bump(approvalRule.key, "checked");
        try {
          if (await claim(admin, approvalRule.key, c.id, dayKey(day), runId)) {
            const team = await notifyTeam(admin, approvalRule, owner, `Termin ohne Freigabe: ${c.title}`,
              `Geplant für ${formatDateTime(c.scheduled_at)} – es fehlen noch Freigaben. Ohne Freigabe wird nicht veröffentlicht.`,
              `/beitraege/${c.dossier_id}/inhalte/${c.id}`, `freigabe:${c.id}:${day}`);
            await outcome(admin, approvalRule.key, c.id, dayKey(day), { team });
            bump(approvalRule.key, "fired");
          }
        } catch {
          bump(approvalRule.key, "errors");
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Vertragsjahr endet mit offenen Leistungen
  // ---------------------------------------------------------------------------
  const yearRule = byKey.get("vertragsjahr_endet");
  if (yearRule) {
    const { data: years } = await admin
      .from("contract_years")
      .select("id, year_no, end_date, contract_id, contracts(client_id, owner_id, package_name, clients(name)), deliverables(status)")
      .gte("end_date", today)
      .lte("end_date", addDays(today, yearRule.days));
    for (const y of years ?? []) {
      bump(yearRule.key, "checked");
      const open = (y.deliverables ?? []).filter((d) => d.status === "offen" || d.status === "in_arbeit").length;
      if (open === 0) continue;
      const daysLeft = daysBetween(today, y.end_date);
      const n = dueOccurrence(yearRule.days - daysLeft, { ...yearRule, days: 0 });
      if (n === 0) continue;
      try {
        if (!(await claim(admin, yearRule.key, y.id, n, runId))) continue;
        const clientName = y.contracts?.clients?.name ?? "Kunde";
        const team = await notifyTeam(admin, yearRule, y.contracts?.owner_id ?? null,
          `Vertragsjahr endet: ${clientName}`,
          `Das Vertragsjahr ${y.year_no} (${y.contracts?.package_name}) endet am ${formatDate(y.end_date)} – ${open} zugesagte Leistung(en) sind noch offen.`,
          `/kunden/${y.contracts?.client_id}`, `vertragsjahr:${y.id}:${n}`);
        await outcome(admin, yearRule.key, y.id, n, { open, team });
        bump(yearRule.key, "fired");
      } catch {
        bump(yearRule.key, "errors");
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Überfällige Aufgaben (Wartet auf Kunde ausgenommen) – nur In-App-Hinweis
  // ---------------------------------------------------------------------------
  const taskRule = byKey.get("aufgabe_ueberfaellig");
  if (taskRule) {
    const { data: tasks } = await admin
      .from("tasks")
      .select("id, title, assignee_id, due_date")
      .in("status", ["offen", "in_arbeit"])
      .not("assignee_id", "is", null)
      .lte("due_date", addDays(today, -taskRule.days))
      .limit(500);
    for (const t of tasks ?? []) {
      bump(taskRule.key, "checked");
      try {
        if (!(await claim(admin, taskRule.key, t.id, dayKey(t.due_date!), runId))) continue;
        await admin.rpc("system_notify", {
          p_recipient: t.assignee_id!,
          p_kind: "aufgabe_ueberfaellig",
          p_title: `Überfällig: ${t.title}`,
          p_body: `Fällig war die Aufgabe am ${formatDate(t.due_date)}.`,
          p_link: `/aufgaben?aufgabe=${t.id}`,
          p_dedupe_key: `ueberfaellig:${t.id}:${t.due_date}`,
        });
        bump(taskRule.key, "fired");
      } catch {
        bump(taskRule.key, "errors");
      }
    }
  }

  return summary;
}
