import "server-only";
import { linkedinAdapter } from "./linkedin";
import { facebookAdapter, instagramAdapter } from "./meta";
import type { PlatformAdapter, PlatformKey } from "./types";

export const adapters: Record<PlatformKey, PlatformAdapter> = {
  instagram: instagramAdapter,
  facebook: facebookAdapter,
  linkedin: linkedinAdapter,
};

export function adapterFor(channel: string): PlatformAdapter | null {
  return (adapters as Record<string, PlatformAdapter>)[channel] ?? null;
}
