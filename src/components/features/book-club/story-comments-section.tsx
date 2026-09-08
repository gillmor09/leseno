"use client";

/**
 * Story comments for Buchclub: list + add (friends) or read-only (owner).
 * Shows date and friendship code per comment.
 */

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  addFriendStoryCommentAction,
  listStoryCommentsAction,
} from "@/app/actions/book-club";
import type { StoryComment } from "@/lib/book-club/repository";
import { cn } from "@/lib/utils";

export function StoryCommentsSection({
  storyId,
  allowAdd,
  className,
}: {
  storyId: string;
  /** Friends may add; owners only read. */
  allowAdd: boolean;
  className?: string;
}) {
  const [comments, setComments] = useState<StoryComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listStoryCommentsAction({ storyId }).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.success) {
        toast.error(result.error ?? "Kommentare konnten nicht geladen werden.");
        setComments([]);
        return;
      }
      setComments(result.data?.comments ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [storyId]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!allowAdd || pending) return;
    const trimmed = body.trim();
    if (!trimmed) {
      toast.error("Kommentar fehlt.");
      return;
    }
    startTransition(async () => {
      const result = await addFriendStoryCommentAction({
        storyId,
        body: trimmed,
      });
      if (!result.success) {
        toast.error(result.error ?? "Kommentar speichern fehlgeschlagen.");
        return;
      }
      setBody("");
      const refresh = await listStoryCommentsAction({ storyId });
      if (refresh.success) {
        setComments(refresh.data?.comments ?? []);
      }
      toast.success("Kommentar gespeichert.");
    });
  }

  return (
    <div
      className={cn(
        "rounded-[1.75rem] bg-white p-5 shadow-xl ring-1 ring-zinc-950/10 sm:p-6",
        className,
      )}
    >
      <h3 className="text-base font-extrabold text-zinc-950">Kommentare</h3>

      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-zinc-600">
          <Loader2 className="size-4 animate-spin text-orange-700" />
          Lade Kommentare …
        </p>
      ) : comments.length === 0 ? (
        <p className="mt-4 text-sm font-semibold text-zinc-600">
          Noch keine Kommentare.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className="rounded-2xl bg-gray-50 px-4 py-3 ring-1 ring-zinc-950/5"
            >
              <p className="text-sm leading-relaxed text-zinc-800 whitespace-pre-wrap">
                {comment.body}
              </p>
              <p className="mt-1.5 text-xs font-semibold text-zinc-500">
                {formatCommentDate(comment.createdAt)}
                {" · "}
                {comment.authorFriendshipCode ?? "ohne Kennung"}
                {comment.isMine ? " · du" : null}
              </p>
            </li>
          ))}
        </ul>
      )}

      {allowAdd ? (
        <form noValidate onSubmit={handleSubmit} className="mt-4 space-y-3">
          <label className="block">
            <span className="sr-only">Neuer Kommentar</span>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Schreibe einen Kommentar …"
              className="w-full rounded-2xl border border-zinc-950/10 bg-white px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-orange-700/0 transition focus:ring-2 focus:ring-orange-700/30"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex rounded-full bg-orange-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-800 disabled:opacity-70"
          >
            {pending ? "Speichern …" : "Kommentieren"}
          </button>
        </form>
      ) : null}
    </div>
  );
}

function formatCommentDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
