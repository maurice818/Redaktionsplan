"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-red-200 bg-white p-6 text-center">
      <AlertTriangle className="mx-auto size-8 text-red-600" aria-hidden />
      <h1 className="mt-3 text-lg font-semibold">Diese Ansicht konnte nicht geladen werden</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {/fetch failed|ECONNREFUSED|ENOTFOUND/i.test(error.message)
          ? "Die Datenbank ist nicht erreichbar. Bitte Supabase-Verbindung und Internetzugang prüfen."
          : "Es ist ein unerwarteter Fehler aufgetreten."}
        {error.digest && <span className="mt-1 block text-xs">Fehlerkennung: {error.digest}</span>}
      </p>
      <Button className="mt-4" onClick={reset}>Erneut versuchen</Button>
    </div>
  );
}
