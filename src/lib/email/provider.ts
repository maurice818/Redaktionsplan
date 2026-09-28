import "server-only";
import { serverEnv } from "@/lib/env.server";

/**
 * Austauschbare Schnittstelle für Transaktions-E-Mails.
 * Aktuell: Resend (REST). Ohne Konfiguration wird nicht versendet und das
 * ehrlich im Protokoll vermerkt ("nicht_konfiguriert").
 */
export interface OutgoingEmail {
  to: string;
  toName?: string | null;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  idempotencyKey: string;
}

export type SendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; error: string; retryable: boolean };

export interface EmailProvider {
  readonly name: string;
  readonly configured: boolean;
  send(email: OutgoingEmail): Promise<SendResult>;
}

class ResendProvider implements EmailProvider {
  readonly name = "resend";
  readonly configured = true;

  async send(email: OutgoingEmail): Promise<SendResult> {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serverEnv.resendApiKey}`,
          "Content-Type": "application/json",
          // Verhindert Doppelversand bei Wiederholungen (24 h gültig)
          "Idempotency-Key": email.idempotencyKey.slice(0, 256),
        },
        body: JSON.stringify({
          from: serverEnv.emailFrom,
          to: [email.toName ? `${email.toName.replace(/[<>"]/g, "")} <${email.to}>` : email.to],
          subject: email.subject,
          html: email.html,
          text: email.text,
          reply_to: email.replyTo || serverEnv.emailReplyTo || undefined,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
      if (res.ok && body.id) return { ok: true, providerMessageId: body.id };
      return {
        ok: false,
        error: `Resend ${res.status}: ${body.message ?? body.name ?? "Unbekannter Fehler"}`,
        retryable: res.status >= 500 || res.status === 429,
      };
    } catch (error) {
      return { ok: false, error: `Versand fehlgeschlagen: ${(error as Error).message}`, retryable: true };
    }
  }
}

class NotConfiguredProvider implements EmailProvider {
  readonly name = "keiner";
  readonly configured = false;
  async send(): Promise<SendResult> {
    return { ok: false, error: "E-Mail-Versand ist nicht eingerichtet (RESEND_API_KEY / EMAIL_FROM fehlen).", retryable: false };
  }
}

export function getEmailProvider(): EmailProvider {
  if (serverEnv.resendApiKey && serverEnv.emailFrom) return new ResendProvider();
  return new NotConfiguredProvider();
}
