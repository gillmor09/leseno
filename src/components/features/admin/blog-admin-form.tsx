"use client";

/**
 * Admin form: create / edit / delete blog posts with Quill HTML body.
 */

import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteBlogPostAction,
  saveBlogPostAction,
} from "@/app/actions/blog-admin";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { RichHtmlEditor } from "@/components/ui/rich-html-editor";
import {
  blogDateInputToIso,
  isoToBlogDateInput,
  todayBlogDateInput,
} from "@/lib/blog/format";
import { slugifyBlogTitle } from "@/lib/blog/slug";
import type { BlogPost, BlogPostStatus } from "@/lib/blog/types";
import { cn } from "@/lib/utils";

type Draft = {
  id: string | null;
  title: string;
  slug: string;
  excerpt: string;
  htmlBody: string;
  status: BlogPostStatus;
  /** Local calendar date for `published_at` (`YYYY-MM-DD`). */
  publishedAtDate: string;
  slugTouched: boolean;
};

const emptyDraft = (): Draft => ({
  id: null,
  title: "",
  slug: "",
  excerpt: "",
  htmlBody: "",
  status: "draft",
  publishedAtDate: todayBlogDateInput(),
  slugTouched: false,
});

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("de-DE", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function draftFromPost(post: BlogPost): Draft {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    htmlBody: post.htmlBody,
    status: post.status,
    publishedAtDate:
      isoToBlogDateInput(post.publishedAt) || todayBlogDateInput(),
    slugTouched: true,
  };
}

export function BlogAdminForm({
  initialPosts,
  canSave,
  readOnlyNotice,
}: {
  initialPosts: BlogPost[];
  canSave: boolean;
  readOnlyNotice?: string;
}) {
  const [posts, setPosts] = useState(initialPosts);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [pending, setPending] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BlogPost | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  const editingLabel = useMemo(
    () => (draft.id ? "Beitrag bearbeiten" : "Neuer Beitrag"),
    [draft.id],
  );

  function patchDraft(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function startCreate() {
    setDraft(emptyDraft());
  }

  function startEdit(post: BlogPost) {
    setDraft(draftFromPost(post));
  }

  async function handleSave() {
    if (!canSave) {
      toast.error(
        "Speichern ist noch nicht verfügbar — Migration oder Service-Role prüfen.",
      );
      return;
    }
    const publishedAt = blogDateInputToIso(draft.publishedAtDate);
    if (draft.status === "published" && !publishedAt) {
      toast.error("Bitte ein Veröffentlichungsdatum angeben.");
      return;
    }
    setPending(true);
    const result = await saveBlogPostAction({
      id: draft.id,
      title: draft.title,
      slug: draft.slug,
      excerpt: draft.excerpt,
      htmlBody: draft.htmlBody,
      status: draft.status,
      publishedAt,
    });
    setPending(false);
    if (!result.success) {
      toast.error(result.error ?? "Speichern fehlgeschlagen.");
      return;
    }
    const saved = result.data!.post;
    setPosts((current) => {
      const without = current.filter((p) => p.id !== saved.id);
      return [saved, ...without].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      );
    });
    setDraft(draftFromPost(saved));
    toast.success(
      saved.status === "published"
        ? "Beitrag veröffentlicht."
        : "Entwurf gespeichert.",
    );
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeletePending(true);
    const result = await deleteBlogPostAction({ id: deleteTarget.id });
    setDeletePending(false);
    if (!result.success) {
      toast.error(result.error ?? "Löschen fehlgeschlagen.");
      return;
    }
    setPosts((current) =>
      current.filter((post) => post.id !== deleteTarget.id),
    );
    if (draft.id === deleteTarget.id) {
      setDraft(emptyDraft());
    }
    setDeleteTarget(null);
    toast.success("Beitrag gelöscht.");
  }

  return (
    <div className="space-y-8">
      {!canSave && readOnlyNotice ? (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 ring-1 ring-amber-700/20">
          {readOnlyNotice}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-zinc-600">
          {posts.length === 0
            ? "Noch keine Beiträge."
            : `${posts.length} Beitrag${posts.length === 1 ? "" : "e"}`}
        </p>
        <button
          type="button"
          onClick={startCreate}
          className="inline-flex items-center gap-2 rounded-full bg-zinc-800 px-4 py-2 text-sm font-bold text-white transition hover:bg-zinc-900"
        >
          <Plus className="size-4" aria-hidden />
          Neu
        </button>
      </div>

      {posts.length > 0 ? (
        <ul className="space-y-2">
          {posts.map((post) => {
            const active = draft.id === post.id;
            return (
              <li
                key={post.id}
                className={cn(
                  "flex flex-wrap items-center gap-2 rounded-2xl bg-white px-4 py-3 ring-1 ring-zinc-950/10",
                  active && "ring-2 ring-orange-700/40",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold text-zinc-950">
                    {post.title}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-zinc-500">
                    /blog/{post.slug} ·{" "}
                    {post.status === "published" ? "Veröffentlicht" : "Entwurf"}{" "}
                    · {formatDate(post.publishedAt ?? post.updatedAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => startEdit(post)}
                  className="inline-flex size-9 items-center justify-center rounded-full text-zinc-700 transition hover:bg-gray-100"
                  aria-label={`„${post.title}“ bearbeiten`}
                  title="Bearbeiten"
                >
                  <Pencil className="size-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(post)}
                  className="inline-flex size-9 items-center justify-center rounded-full text-orange-800 transition hover:bg-orange-50"
                  aria-label={`„${post.title}“ löschen`}
                  title="Löschen"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <section className="rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8">
        <h2 className="text-lg font-extrabold text-zinc-950">{editingLabel}</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Titel und Kurztext für die Übersicht; der Artikeltext mit Quill.
          Veröffentlichen macht den Beitrag unter /blog sichtbar.
        </p>

        <div className="mt-6 space-y-5">
          <label className="block">
            <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Titel
            </span>
            <input
              value={draft.title}
              onChange={(event) => {
                const title = event.target.value;
                patchDraft({
                  title,
                  slug: draft.slugTouched
                    ? draft.slug
                    : slugifyBlogTitle(title),
                });
              }}
              disabled={pending || !canSave}
              maxLength={200}
              className="w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700"
              placeholder="z. B. Lesen ohne Druck: so gelingt der Einstieg"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              URL-Slug
            </span>
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-sm font-semibold text-zinc-500">
                /blog/
              </span>
              <input
                value={draft.slug}
                onChange={(event) =>
                  patchDraft({
                    slug: event.target.value.toLowerCase(),
                    slugTouched: true,
                  })
                }
                disabled={pending || !canSave}
                maxLength={80}
                spellCheck={false}
                className="w-full rounded-2xl bg-gray-100 px-4 py-3 font-mono text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700"
                placeholder="lesen-ohne-druck"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Kurztext (Karten & Meta)
            </span>
            <textarea
              value={draft.excerpt}
              onChange={(event) => patchDraft({ excerpt: event.target.value })}
              disabled={pending || !canSave}
              maxLength={500}
              rows={3}
              className="w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700"
              placeholder="Ein bis zwei Sätze als Appetitmacher …"
            />
          </label>

          <fieldset>
            <legend className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Status
            </legend>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: "draft" as const, label: "Entwurf" },
                  { id: "published" as const, label: "Veröffentlicht" },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  disabled={pending || !canSave}
                  onClick={() => patchDraft({ status: option.id })}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-bold ring-1 transition",
                    draft.status === option.id
                      ? "bg-yellow-400 text-zinc-950 ring-yellow-400"
                      : "bg-gray-100 text-zinc-700 ring-zinc-950/10 hover:bg-white",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Veröffentlichungsdatum
            </span>
            <input
              type="date"
              value={draft.publishedAtDate}
              onChange={(event) =>
                patchDraft({ publishedAtDate: event.target.value })
              }
              disabled={pending || !canSave}
              className="w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 focus:bg-white focus:ring-2 focus:ring-orange-700 sm:max-w-xs"
            />
            <span className="mt-1.5 block text-xs font-semibold text-zinc-500">
              Erscheint auf der Blog-Seite; kann nachträglich geändert werden.
            </span>
          </label>

          <div>
            <p className="mb-1.5 text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Artikeltext
            </p>
            <RichHtmlEditor
              variant="article"
              value={draft.htmlBody}
              onChange={(htmlBody) => patchDraft({ htmlBody })}
              disabled={pending || !canSave}
              placeholder="Schreibe den Beitrag …"
            />
          </div>

          <button
            type="button"
            disabled={pending || !canSave}
            onClick={() => void handleSave()}
            className={cn(
              "inline-flex w-full items-center justify-center rounded-full bg-orange-700 px-6 py-3 text-sm font-bold text-white transition hover:bg-orange-800 sm:w-auto",
              (pending || !canSave) && "opacity-70",
            )}
          >
            {pending ? "Speichern …" : "Speichern"}
          </button>
        </div>
      </section>

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        title="Beitrag löschen?"
        description={
          deleteTarget
            ? `„${deleteTarget.title}“ (/blog/${deleteTarget.slug}) wird unwiderruflich gelöscht und ist danach nicht mehr im Blog sichtbar.`
            : ""
        }
        confirmLabel="Beitrag löschen"
        pending={deletePending}
        onCancel={() => {
          if (!deletePending) setDeleteTarget(null);
        }}
        onConfirm={() => void handleConfirmDelete()}
      />
    </div>
  );
}
