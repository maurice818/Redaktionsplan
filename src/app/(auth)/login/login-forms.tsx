"use client";

import { useState } from "react";
import { ActionForm, FormActions, InputField, SubmitButton } from "@/components/common/form";
import { sendMagicLink, signInWithPassword } from "@/actions/auth";

export function LoginForms({ weiter }: { weiter: string }) {
  const [mode, setMode] = useState<"passwort" | "link">("passwort");
  return (
    <div className="mt-6">
      <div role="tablist" aria-label="Anmeldeart" className="mb-5 grid grid-cols-2 rounded-lg bg-muted p-1 text-sm">
        {(["passwort", "link"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            type="button"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-md px-3 py-1.5 font-medium transition ${mode === m ? "bg-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {m === "passwort" ? "Passwort" : "Link per E-Mail"}
          </button>
        ))}
      </div>
      {mode === "passwort" ? (
        <ActionForm action={signInWithPassword} className="grid gap-4" successToast={false}>
          <input type="hidden" name="weiter" value={weiter} />
          <InputField name="email" type="email" label="E-Mail-Adresse" autoComplete="email" required autoFocus />
          <InputField name="password" type="password" label="Passwort" autoComplete="current-password" required />
          <FormActions>
            <SubmitButton className="w-full" pendingText="Anmelden …">Anmelden</SubmitButton>
          </FormActions>
        </ActionForm>
      ) : (
        <ActionForm action={sendMagicLink} className="grid gap-4">
          <input type="hidden" name="weiter" value={weiter} />
          <InputField name="email" type="email" label="E-Mail-Adresse" autoComplete="email" required help="Sie erhalten einen einmaligen Anmeldelink." />
          <FormActions>
            <SubmitButton className="w-full" pendingText="Wird gesendet …">Anmeldelink senden</SubmitButton>
          </FormActions>
        </ActionForm>
      )}
    </div>
  );
}
