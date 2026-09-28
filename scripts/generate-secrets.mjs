#!/usr/bin/env node
/** Erzeugt zufällige Werte für APP_ENCRYPTION_KEY und CRON_SECRET (nicht einchecken!). */
import { randomBytes } from "node:crypto";

console.log("# In .env.local bzw. in den Vercel-Umgebungsvariablen eintragen:");
console.log(`APP_ENCRYPTION_KEY=${randomBytes(32).toString("base64")}`);
console.log(`CRON_SECRET=${randomBytes(32).toString("base64url")}`);
