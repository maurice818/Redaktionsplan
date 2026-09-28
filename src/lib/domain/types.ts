import type { Tables } from "@/lib/supabase/database.types";

export type FormatRule = Tables<"format_rules">;
export type ContentItem = Tables<"content_items">;
export type MediaAsset = Tables<"media_assets">;
export type PublishJob = Tables<"publish_jobs">;
export type Deliverable = Tables<"deliverables">;
export type Task = Tables<"tasks">;

export type Channel = "magazin" | "instagram" | "facebook" | "linkedin";

export interface MediaInfo {
  id?: string;
  kind: string; // bild | video | dokument
  source?: string; // upload | link
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  status?: string; // entwurf | final | veraltet
  file_name?: string;
}

export type IssueLevel = "error" | "warning" | "info";

export interface Issue {
  level: IssueLevel;
  code: string;
  message: string;
  mediaId?: string;
}
