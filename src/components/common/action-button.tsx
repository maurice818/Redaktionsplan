"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ActionResult } from "@/lib/action-result";

/**
 * Schaltfläche für eine Server Action ohne Formular – optional mit
 * Bestätigungsdialog (für folgenreiche Aktionen).
 */
export function ActionButton<T>({
  action,
  children,
  confirm,
  variant,
  size,
  className,
  disabled,
  onDone,
  title,
}: {
  action: () => Promise<ActionResult<T>>;
  children: React.ReactNode;
  confirm?: { title: string; description?: React.ReactNode; confirmLabel?: string; destructive?: boolean };
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
  disabled?: boolean;
  onDone?: (data: T) => void;
  title?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const run = () => {
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        toast.success(res.message ?? "Erledigt.");
        onDone?.(res.data);
        router.refresh();
      } else {
        toast.error(res.error);
      }
      setOpen(false);
    });
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled={disabled || pending}
        title={title}
        onClick={() => (confirm ? setOpen(true) : run())}
      >
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {children}
      </Button>
      {confirm && (
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
              {confirm.description && <AlertDialogDescription asChild><div>{confirm.description}</div></AlertDialogDescription>}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                disabled={pending}
                onClick={(e) => {
                  e.preventDefault();
                  run();
                }}
                className={confirm.destructive ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
              >
                {pending && <Loader2 className="animate-spin" aria-hidden />}
                {confirm.confirmLabel ?? "Bestätigen"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
