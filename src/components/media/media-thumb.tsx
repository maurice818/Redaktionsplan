import { FileText, Film, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Vorschau eines Bildes/Videos (signierte URL) oder Platzhalter für Links/Dokumente. */
export function MediaThumb({
  url,
  kind,
  source,
  alt,
  className,
}: {
  url: string | null | undefined;
  kind: string;
  source: string;
  alt?: string | null;
  className?: string;
}) {
  const base = cn("relative grid aspect-square w-full place-items-center overflow-hidden rounded-lg bg-muted", className);
  if (url && kind === "bild") {
    // eslint-disable-next-line @next/next/no-img-element -- signierte, kurzlebige URLs; kein Next-Bildoptimierer
    return <div className={base}><img src={url} alt={alt ?? ""} className="size-full object-cover" loading="lazy" /></div>;
  }
  if (url && kind === "video") {
    return <div className={base}><video src={url} className="size-full object-cover" muted playsInline preload="metadata" controls aria-label={alt ?? "Video"} /></div>;
  }
  const Icon = source === "link" ? Link2 : kind === "video" ? Film : FileText;
  return (
    <div className={base}>
      <Icon className="size-7 text-muted-foreground" aria-hidden />
    </div>
  );
}
