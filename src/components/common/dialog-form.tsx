"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/action-result";
import { ActionForm, SubmitButton } from "./form";

/**
 * Dialog mit Formular und Server Action. Schließt sich nach Erfolg.
 * Dialoge sind auf kleinen Bildschirmen scrollbar (max. Höhe) und per Tastatur bedienbar.
 */
export function DialogForm<T>({
  trigger,
  title,
  description,
  action,
  children,
  submitLabel = "Speichern",
  wide,
  onSuccess,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action: (prev: ActionResult<T> | null, formData: FormData) => Promise<ActionResult<T>>;
  children: React.ReactNode;
  submitLabel?: string;
  wide?: boolean;
  onSuccess?: (data: T) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className={wide ? "max-h-[90dvh] overflow-y-auto sm:max-w-2xl" : "max-h-[90dvh] overflow-y-auto sm:max-w-lg"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {open && (
          <ActionForm
            action={action}
            className="grid gap-4"
            onSuccess={(data) => {
              setOpen(false);
              onSuccess?.(data);
            }}
          >
            {children}
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Abbrechen</Button>
              <SubmitButton>{submitLabel}</SubmitButton>
            </DialogFooter>
          </ActionForm>
        )}
      </DialogContent>
    </Dialog>
  );
}
