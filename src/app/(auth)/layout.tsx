export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <div className="relative hidden flex-col justify-between bg-[#2a1430] p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-[#b90845] font-bold">MG</span>
          <span className="text-sm font-semibold tracking-[0.18em]">MEET GERMANY</span>
        </div>
        <div className="max-w-md">
          <p className="text-3xl leading-tight font-semibold">Redaktionszentrale</p>
          <p className="mt-4 text-sm leading-relaxed text-white/75">
            Gebuchte Leistungen, Beitragsakten, Freigaben und Veröffentlichungen – vom Auftrag bis zum Nachweis an einem Ort.
          </p>
        </div>
        <p className="text-xs text-white/50">Interner Bereich · Zugang nur auf Einladung</p>
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-1 bg-gradient-to-b from-[#b90845] via-[#6f2659] to-[#abc788]" />
      </div>
      <div className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
