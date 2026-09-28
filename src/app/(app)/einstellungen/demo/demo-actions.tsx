"use client";

import { Database, Trash2 } from "lucide-react";
import { ActionButton } from "@/components/common/action-button";
import { loadDemoData, removeDemoData } from "@/actions/settings";

export function DemoActions({ loaded }: { loaded: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <ActionButton
        action={loadDemoData}
        disabled={loaded}
        confirm={{ title: "Demo-Daten laden?", description: "Es werden gekennzeichnete Beispieldaten in diese Datenbank geschrieben. In der Produktivumgebung bitte nur zu Schulungszwecken und anschließend wieder entfernen.", confirmLabel: "Demo-Daten laden" }}
      >
        <Database /> Demo-Daten laden
      </ActionButton>
      <ActionButton
        action={removeDemoData}
        variant="outline"
        disabled={!loaded}
        confirm={{ title: "Demo-Daten entfernen?", description: "Alle als Demo gekennzeichneten Kunden, Akten, Kampagnen, Ideen und Aufgaben werden gelöscht. Echte Daten bleiben unberührt.", confirmLabel: "Entfernen", destructive: true }}
      >
        <Trash2 /> Demo-Daten entfernen
      </ActionButton>
    </div>
  );
}
