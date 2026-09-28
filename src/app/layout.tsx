import type { Metadata, Viewport } from "next";
import { Rubik } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import "./globals.css";

const rubik = Rubik({ subsets: ["latin", "latin-ext"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: { default: "MEET GERMANY Redaktionszentrale", template: "%s · MEET GERMANY Redaktionszentrale" },
  description: "Gebuchte Leistungen, Redaktion, Freigaben und Veröffentlichungen an einem Ort.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#2a1430",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={cn("font-sans", rubik.variable)}>
      <body>
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        <Toaster position="top-right" theme="light" richColors closeButton />
      </body>
    </html>
  );
}
