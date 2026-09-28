import type { NextRequest } from "next/server";
import { serverEnv } from "@/lib/env.server";
import { runTick } from "@/lib/jobs/tick";
import { safeEqual } from "@/lib/security/crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Geschützter Hintergrundprozess (Vercel Cron oder externer Scheduler).
 * Vercel sendet automatisch "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(request: NextRequest) {
  const secret = serverEnv.cronSecret;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const result = await runTick("cron");
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ status: "fehler", error: (error as Error).message }, { status: 500 });
  }
}
