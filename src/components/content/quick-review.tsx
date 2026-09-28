"use client";

import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/common/form";
import { decideReview } from "@/actions/content";

export function QuickReview({ contentId }: { contentId: string }) {
  const [comment, setComment] = useState("");
  return (
    <ActionForm action={decideReview} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={contentId} />
      <input
        name="comment"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Kommentar (bei Änderungen Pflicht)"
        aria-label="Kommentar zur Prüfung"
        className="h-8 min-w-48 flex-1 rounded-lg border border-input px-2.5 text-sm"
      />
      <SubmitButton size="sm" name="decision" value="freigegeben"><CheckCircle2 /> Freigeben</SubmitButton>
      <SubmitButton size="sm" variant="outline" name="decision" value="aenderung_gewuenscht" disabled={!comment.trim()}><XCircle /> Änderungen</SubmitButton>
    </ActionForm>
  );
}
