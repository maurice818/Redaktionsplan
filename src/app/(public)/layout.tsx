import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#f7f6f4]">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <span className="grid size-9 place-items-center rounded-lg bg-[#b90845] text-sm font-bold text-white" aria-hidden>MG</span>
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-[0.16em]">MEET GERMANY</p>
            <p className="text-xs text-muted-foreground">Redaktion</p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-10">{children}</main>
      <footer className="mx-auto max-w-3xl px-4 pb-10 text-xs text-muted-foreground">
        Dieser persönliche Link ist nur für Sie bestimmt. Ihre Angaben werden ausschließlich zur Erstellung und Freigabe Ihres Beitrags verwendet.
      </footer>
    </div>
  );
}
