import Link from "next/link";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-md focus-visible:outline-offset-4" aria-label="MEET GERMANY Redaktionszentrale – zum Dashboard">
      <span className="grid size-8 place-items-center rounded-lg bg-[#b90845] text-[13px] font-bold tracking-tight text-white shadow-sm" aria-hidden>
        MG
      </span>
      {!compact && (
        <span className="leading-tight">
          <span className="block text-[13px] font-semibold tracking-[0.14em] text-white">MEET GERMANY</span>
          <span className="block text-[11px] text-sidebar-foreground/70">Redaktionszentrale</span>
        </span>
      )}
    </Link>
  );
}
