"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton({ label = "Drucken / PDF" }: { label?: string }) {
  return (
    <Button type="button" onClick={() => window.print()}>
      <Printer /> {label}
    </Button>
  );
}
