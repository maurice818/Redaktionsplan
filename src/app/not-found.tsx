import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-[60dvh] max-w-md place-items-center px-4 text-center">
      <div>
        <p className="text-sm font-semibold tracking-[0.16em] text-[#b90845]">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Seite nicht gefunden</h1>
        <p className="mt-2 text-sm text-muted-foreground">Der Eintrag existiert nicht (mehr) oder Sie haben keinen Zugriff darauf.</p>
        <Button asChild className="mt-6"><Link href="/">Zum Dashboard</Link></Button>
      </div>
    </main>
  );
}
