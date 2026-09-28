import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { safeEqual } from "@/lib/security/crypto";

const COOKIE = "mg_oauth_state";

/** CSRF-Schutz für OAuth: zufälliger State im httpOnly-Cookie (10 Minuten gültig). */
export async function createOAuthState(provider: "meta" | "linkedin"): Promise<string> {
  const state = `${provider}.${randomBytes(24).toString("base64url")}`;
  const store = await cookies();
  store.set(COOKIE, state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/integrations", maxAge: 600 });
  return state;
}

export async function consumeOAuthState(provider: "meta" | "linkedin", received: string | null): Promise<boolean> {
  const store = await cookies();
  const expected = store.get(COOKIE)?.value;
  store.delete({ name: COOKIE, path: "/api/integrations" });
  return Boolean(expected && received && expected.startsWith(`${provider}.`) && safeEqual(expected, received));
}
