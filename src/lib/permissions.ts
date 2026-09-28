/** Rollenlogik für die Oberfläche. Die verbindliche Prüfung erfolgt serverseitig (RLS/DB-Funktionen). */
export type Role = "admin" | "redaktion" | "freigabe" | "mitarbeit";

export const canEdit = (role: string | null | undefined) =>
  role === "admin" || role === "redaktion" || role === "freigabe";

export const canApprove = (role: string | null | undefined) => role === "admin" || role === "freigabe";

export const isAdmin = (role: string | null | undefined) => role === "admin";
