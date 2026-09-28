import { LinkIcon } from "lucide-react";

const TEXTS: Record<string, { title: string; text: string }> = {
  ungueltig: { title: "Link ungültig", text: "Dieser Link ist nicht (mehr) gültig. Bitte prüfen Sie, ob Sie den vollständigen Link aus der E-Mail verwendet haben." },
  abgelaufen: { title: "Link abgelaufen", text: "Die Gültigkeit dieses Links ist abgelaufen. Bitte wenden Sie sich an die MEET GERMANY Redaktion, damit wir Ihnen einen neuen Link senden." },
  widerrufen: { title: "Link nicht mehr aktiv", text: "Dieser Link wurde von der Redaktion deaktiviert. Bei Fragen melden Sie sich gern bei uns." },
  ersetzt: { title: "Neuere Fassung verfügbar", text: "Zu diesem Beitrag gibt es eine neuere Vorschau. Bitte verwenden Sie den Link aus der jüngsten E-Mail." },
  konfiguration: { title: "Vorübergehend nicht verfügbar", text: "Die Seite ist gerade nicht erreichbar. Bitte versuchen Sie es später erneut." },
};

export function LinkProblem({ reason }: { reason: string }) {
  const t = TEXTS[reason] ?? TEXTS.ungueltig;
  return (
    <div className="rounded-xl border border-border bg-white p-8 text-center">
      <LinkIcon className="mx-auto size-8 text-muted-foreground" aria-hidden />
      <h1 className="mt-3 text-xl font-semibold">{t.title}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{t.text}</p>
    </div>
  );
}
