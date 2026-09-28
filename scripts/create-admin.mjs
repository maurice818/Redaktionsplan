#!/usr/bin/env node
/**
 * Legt den ersten Admin an (oder macht ein bestehendes Konto zum Admin).
 *
 *   npm run admin:create -- ihre@adresse.de "Vorname Nachname"
 *
 * Benötigt NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY (oder SUPABASE_SERVICE_ROLE_KEY)
 * und NEXT_PUBLIC_APP_URL in .env.local. Gibt zusätzlich einen Einmal-Link aus,
 * mit dem sich der Admin auch ohne eingerichteten E-Mail-Versand anmelden kann.
 */
import { createClient } from "@supabase/supabase-js";

const [email, ...nameParts] = process.argv.slice(2);
const fullName = nameParts.join(" ").trim();
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Aufruf: npm run admin:create -- ihre@adresse.de "Vorname Nachname"');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SECRET_KEY müssen in .env.local gesetzt sein.");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

let userId;
let linkType = "invite";
const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
  data: { full_name: fullName },
  redirectTo: `${appUrl}/auth/confirm?next=/passwort-setzen`,
});
if (invited?.user) {
  userId = invited.user.id;
  console.log(`✓ Einladung an ${email} ausgelöst (Versand über Supabase Auth).`);
} else {
  console.warn(`Hinweis: Einladung nicht möglich (${inviteError?.message}). Suche bestehendes Konto …`);
  for (let page = 1; page <= 20 && !userId; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const found = data?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) userId = found.id;
    if (!data || data.users.length < 200) break;
  }
  linkType = "recovery";
  if (!userId) {
    console.error("Konto weder anlegbar noch auffindbar.");
    process.exit(1);
  }
}

const { error: profileError } = await admin
  .from("profiles")
  .upsert({ id: userId, email, full_name: fullName, role: "admin", is_active: true });
if (profileError) {
  console.error(`Profil konnte nicht gesetzt werden: ${profileError.message}`);
  console.error("Sind die Migrationen eingespielt? (npx supabase db push)");
  process.exit(1);
}
console.log(`✓ ${email} ist Admin und aktiv.`);

const { data: link, error: linkError } = await admin.auth.admin.generateLink({
  type: linkType,
  email,
  options: { redirectTo: `${appUrl}/auth/confirm?next=/passwort-setzen` },
});
if (link?.properties?.hashed_token) {
  console.log("\nEinmal-Link zum Festlegen des Passworts (nur für Sie, nicht weitergeben):");
  console.log(`${appUrl}/auth/confirm?token_hash=${link.properties.hashed_token}&type=${linkType}&next=/passwort-setzen\n`);
} else if (linkError) {
  console.warn(`Einmal-Link konnte nicht erzeugt werden: ${linkError.message}`);
}
