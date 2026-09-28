"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useId, useRef } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";

// -----------------------------------------------------------------------------
// ActionForm: <form> mit Server Action, Toast-Rückmeldung und Feldfehlern
// -----------------------------------------------------------------------------
type FormAction<T> = (prev: ActionResult<T> | null, formData: FormData) => Promise<ActionResult<T>>;

const FieldErrorsContext = createContext<Record<string, string>>({});
const PendingContext = createContext<boolean | null>(null);
/** Für eigene Formulare mit useActionState: Ladezustand an SubmitButton weitergeben. */
export const FormPendingProvider = PendingContext.Provider;

/** Submit-Handler, der das automatische Zurücksetzen durch React vermeidet. */
export function submitWithoutReset(formAction: (data: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const data = new FormData(e.currentTarget, submitter);
    startTransition(() => formAction(data));
  };
}

export function ActionForm<T>({
  action,
  children,
  className,
  onSuccess,
  resetOnSuccess,
  redirectTo,
  successToast = true,
  id,
}: {
  action: FormAction<T>;
  children: React.ReactNode;
  className?: string;
  onSuccess?: (data: T) => void;
  resetOnSuccess?: boolean;
  redirectTo?: (data: T) => string | null;
  successToast?: boolean;
  id?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const handled = useRef<ActionResult<T> | null>(null);

  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      if (successToast) toast.success(state.message ?? "Gespeichert.");
      if (resetOnSuccess) formRef.current?.reset();
      onSuccess?.(state.data);
      const target = redirectTo?.(state.data);
      if (target) router.push(target);
    } else {
      toast.error(state.error);
    }
  }, [state, onSuccess, resetOnSuccess, redirectTo, router, successToast]);

  // Über onSubmit statt <form action>: React setzt das Formular sonst nach jeder
  // Aktion zurück – bei Fehlern gingen alle Eingaben verloren.
  const onSubmit = submitWithoutReset(formAction);

  return (
    <FieldErrorsContext.Provider value={state && !state.ok ? (state.fieldErrors ?? {}) : {}}>
      <PendingContext.Provider value={pending}>
        <form ref={formRef} onSubmit={onSubmit} className={className} id={id} noValidate aria-busy={pending || undefined}>
          {children}
        </form>
      </PendingContext.Provider>
    </FieldErrorsContext.Provider>
  );
}

export function useFieldError(name: string) {
  return useContext(FieldErrorsContext)[name];
}

export function SubmitButton({
  children,
  variant,
  size,
  className,
  pendingText,
  disabled,
  name,
  value,
}: {
  children: React.ReactNode;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
  pendingText?: string;
  disabled?: boolean;
  name?: string;
  value?: string;
}) {
  const status = useFormStatus();
  const contextPending = useContext(PendingContext);
  const pending = contextPending ?? status.pending;
  return (
    <Button type="submit" variant={variant} size={size} className={className} disabled={pending || disabled} name={name} value={value}>
      {pending && <Loader2 className="animate-spin" aria-hidden />}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}

// -----------------------------------------------------------------------------
// Feldbausteine (native Elemente – zugänglich und robust mit FormData)
// -----------------------------------------------------------------------------
const inputBase =
  "w-full min-w-0 rounded-lg border border-input bg-white px-3 py-2 text-sm text-foreground shadow-xs outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-[#b90845] focus-visible:ring-3 focus-visible:ring-[#b90845]/15 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive";

export function FieldShell({
  label,
  htmlFor,
  help,
  error,
  required,
  children,
  className,
}: {
  label?: React.ReactNode;
  htmlFor?: string;
  help?: React.ReactNode;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
          {label}
          {required && <span className="ml-0.5 text-[#b90845]" aria-hidden>*</span>}
        </label>
      )}
      {children}
      {help && !error && <p className="text-xs text-muted-foreground">{help}</p>}
      {error && (
        <p className="text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

type InputFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "name"> & {
  name: string;
  label?: React.ReactNode;
  help?: React.ReactNode;
  wrapperClassName?: string;
};

export function InputField({ name, label, help, required, wrapperClassName, className, id, ...rest }: InputFieldProps) {
  const auto = useId();
  const fieldId = id ?? `${name}-${auto}`;
  const error = useFieldError(name);
  return (
    <FieldShell label={label} htmlFor={fieldId} help={help} error={error} required={required} className={wrapperClassName}>
      <input id={fieldId} name={name} required={required} aria-invalid={Boolean(error) || undefined} className={cn(inputBase, "h-9", className)} {...rest} />
    </FieldShell>
  );
}

type TextareaFieldProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "name"> & {
  name: string;
  label?: React.ReactNode;
  help?: React.ReactNode;
  wrapperClassName?: string;
};

export function TextareaField({ name, label, help, required, wrapperClassName, className, id, rows = 4, ...rest }: TextareaFieldProps) {
  const auto = useId();
  const fieldId = id ?? `${name}-${auto}`;
  const error = useFieldError(name);
  return (
    <FieldShell label={label} htmlFor={fieldId} help={help} error={error} required={required} className={wrapperClassName}>
      <textarea id={fieldId} name={name} rows={rows} required={required} aria-invalid={Boolean(error) || undefined} className={cn(inputBase, "min-h-20 leading-relaxed", className)} {...rest} />
    </FieldShell>
  );
}

export interface Option {
  value: string;
  label: string;
  disabled?: boolean;
}

type SelectFieldProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "name"> & {
  name: string;
  label?: React.ReactNode;
  help?: React.ReactNode;
  options: Option[];
  placeholder?: string;
  wrapperClassName?: string;
};

export function SelectField({ name, label, help, options, placeholder, required, wrapperClassName, className, id, ...rest }: SelectFieldProps) {
  const auto = useId();
  const fieldId = id ?? `${name}-${auto}`;
  const error = useFieldError(name);
  return (
    <FieldShell label={label} htmlFor={fieldId} help={help} error={error} required={required} className={wrapperClassName}>
      <NativeSelect id={fieldId} name={name} required={required} aria-invalid={Boolean(error) || undefined} className={className} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
    </FieldShell>
  );
}

export function NativeSelect({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        inputBase,
        "h-9 appearance-none bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2366605f' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")] bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-8",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

export function CheckboxField({
  name,
  label,
  help,
  defaultChecked,
  value = "on",
  disabled,
}: {
  name: string;
  label: React.ReactNode;
  help?: React.ReactNode;
  defaultChecked?: boolean;
  value?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="mt-0.5 size-4 shrink-0 rounded border-input accent-[#b90845]"
      />
      <div className="grid gap-0.5">
        <label htmlFor={id} className="text-sm leading-snug font-medium">
          {label}
        </label>
        {help && <p className="text-xs text-muted-foreground">{help}</p>}
      </div>
    </div>
  );
}

export function FormActions({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center justify-end gap-2 pt-2", className)}>{children}</div>;
}

export function FormGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid gap-4 sm:grid-cols-2", className)}>{children}</div>;
}
