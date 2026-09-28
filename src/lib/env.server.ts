import "server-only";

/**
 * Serverseitige Konfiguration. Diese Werte dürfen niemals an den Browser
 * gelangen (kein NEXT_PUBLIC_-Präfix, Import nur in Server-Code).
 */
export const serverEnv = {
  // Neuer Secret Key (sb_secret_…) oder – für ältere Projekte – der service_role key.
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  // 32 Byte als Base64 – verschlüsselt Plattform-Tokens und Kundenlinks für den erneuten Versand.
  encryptionKey: process.env.APP_ENCRYPTION_KEY ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",

  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "",
  emailReplyTo: process.env.EMAIL_REPLY_TO ?? "",

  metaAppId: process.env.META_APP_ID ?? "",
  metaAppSecret: process.env.META_APP_SECRET ?? "",
  metaGraphVersion: process.env.META_GRAPH_API_VERSION ?? "v26.0",

  linkedinClientId: process.env.LINKEDIN_CLIENT_ID ?? "",
  linkedinClientSecret: process.env.LINKEDIN_CLIENT_SECRET ?? "",
  linkedinApiVersion: process.env.LINKEDIN_API_VERSION ?? "202609",
};

export const features = {
  admin: () => Boolean(serverEnv.supabaseSecretKey),
  encryption: () => Boolean(serverEnv.encryptionKey),
  email: () => Boolean(serverEnv.resendApiKey && serverEnv.emailFrom),
  cron: () => Boolean(serverEnv.cronSecret),
  meta: () => Boolean(serverEnv.metaAppId && serverEnv.metaAppSecret),
  linkedin: () => Boolean(serverEnv.linkedinClientId && serverEnv.linkedinClientSecret),
};
