"use client";

/**
 * Mein Buchclub: Freunde-Card (Chips + Dialoge) und Freundes-Geschichten.
 */

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  cancelFriendshipRequestAction,
  listFriendSharedStoriesAction,
  removeFriendshipAction,
  requestFriendshipByCodeAction,
  respondToFriendshipAction,
  sendBookClubInviteEmailAction,
  setMyFriendshipCodeAction,
} from "@/app/actions/book-club";
import { FriendStoriesBrowser } from "@/components/features/book-club/friend-stories-browser";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import type {
  BookClubFriendship,
  FriendSharedStorySummary,
} from "@/lib/book-club/repository";
import type { ReadingTypographyDefaultsCatalog } from "@/lib/stories/reading-typography-defaults";
import type { PackageFeatureId } from "@/lib/users/packages";
import { cn } from "@/lib/utils";

type FriendsDialog = "code" | "add" | "friends" | "invite" | null;

export function BookClubPanel({
  initialFriendshipCode,
  initialFriendships,
  initialStories,
  enabledFeatures,
  typographyDefaults,
}: {
  initialFriendshipCode: string | null;
  initialFriendships: BookClubFriendship[];
  initialStories: FriendSharedStorySummary[];
  enabledFeatures: readonly PackageFeatureId[];
  typographyDefaults: ReadingTypographyDefaultsCatalog;
}) {
  const [friendshipCode, setFriendshipCode] = useState(initialFriendshipCode);
  const [codeDraft, setCodeDraft] = useState(initialFriendshipCode ?? "");
  const [friendships, setFriendships] = useState(initialFriendships);
  const [stories, setStories] = useState(initialStories);
  const [addCode, setAddCode] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [dialog, setDialog] = useState<FriendsDialog>(null);
  const [removeTarget, setRemoveTarget] = useState<BookClubFriendship | null>(
    null,
  );
  const [removePending, setRemovePending] = useState(false);
  const [pending, startTransition] = useTransition();

  const incoming = useMemo(
    () =>
      friendships.filter(
        (f) => f.status === "pending" && f.direction === "incoming",
      ),
    [friendships],
  );
  const outgoing = useMemo(
    () =>
      friendships.filter(
        (f) => f.status === "pending" && f.direction === "outgoing",
      ),
    [friendships],
  );
  const accepted = useMemo(
    () => friendships.filter((f) => f.status === "accepted"),
    [friendships],
  );
  const pendingCount = incoming.length + outgoing.length;

  function closeDialog() {
    if (!pending && !removePending) setDialog(null);
  }

  function openDialog(next: FriendsDialog) {
    if (next === "code") setCodeDraft(friendshipCode ?? "");
    if (next === "add") setAddCode("");
    if (next === "invite") setInviteEmail("");
    setDialog(next);
  }

  function handleSaveCode(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await setMyFriendshipCodeAction({ code: codeDraft });
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Kennung speichern fehlgeschlagen.");
        return;
      }
      setFriendshipCode(result.data.friendshipCode);
      setCodeDraft(result.data.friendshipCode);
      toast.success("Freundschaftskennung gespeichert.");
      setDialog(null);
    });
  }

  function handleAddFriend(event: FormEvent) {
    event.preventDefault();
    const requestedCode = addCode.trim().toLowerCase();
    startTransition(async () => {
      const result = await requestFriendshipByCodeAction({ code: addCode });
      if (!result.success) {
        toast.error(result.error ?? "Anfrage fehlgeschlagen.");
        return;
      }
      setAddCode("");
      toast.success("Freundschaftsanfrage gesendet.");
      setFriendships((prev) => [
        {
          id: result.data!.friendshipId,
          status: "pending",
          direction: "outgoing",
          otherUserId: "pending",
          otherFriendshipCode: requestedCode || null,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      setDialog(null);
    });
  }

  function handleRespond(friendship: BookClubFriendship, accept: boolean) {
    startTransition(async () => {
      const result = await respondToFriendshipAction({
        friendshipId: friendship.id,
        accept,
      });
      if (!result.success) {
        toast.error(result.error ?? "Antwort fehlgeschlagen.");
        return;
      }
      if (accept) {
        setFriendships((prev) =>
          prev.map((f) =>
            f.id === friendship.id ? { ...f, status: "accepted" } : f,
          ),
        );
        const storiesResult = await listFriendSharedStoriesAction();
        if (storiesResult.success && storiesResult.data) {
          setStories(storiesResult.data.stories);
        }
        toast.success("Freundschaft bestätigt.");
      } else {
        setFriendships((prev) => prev.filter((f) => f.id !== friendship.id));
        toast.success("Anfrage abgelehnt.");
      }
    });
  }

  function handleCancel(friendship: BookClubFriendship) {
    startTransition(async () => {
      const result = await cancelFriendshipRequestAction({
        friendshipId: friendship.id,
      });
      if (!result.success) {
        toast.error(result.error ?? "Zurückziehen fehlgeschlagen.");
        return;
      }
      setFriendships((prev) => prev.filter((f) => f.id !== friendship.id));
      toast.success("Anfrage zurückgezogen.");
    });
  }

  function handleRemoveConfirm() {
    if (!removeTarget || removePending) return;
    const target = removeTarget;
    setRemovePending(true);
    startTransition(async () => {
      const result = await removeFriendshipAction({
        friendshipId: target.id,
      });
      setRemovePending(false);
      if (!result.success) {
        toast.error(result.error ?? "Entfernen fehlgeschlagen.");
        return;
      }
      setFriendships((prev) => prev.filter((f) => f.id !== target.id));
      setStories((prev) =>
        prev.filter((s) => s.ownerUserId !== target.otherUserId),
      );
      setRemoveTarget(null);
      toast.success("Freund entfernt.");
    });
  }

  function handleInvite(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await sendBookClubInviteEmailAction({
        email: inviteEmail,
      });
      if (!result.success) {
        toast.error(result.error ?? "Einladung fehlgeschlagen.");
        return;
      }
      setInviteEmail("");
      toast.success("Einladung gesendet.");
      setDialog(null);
    });
  }

  const inputClass =
    "w-full rounded-2xl border border-zinc-950/10 bg-white px-4 py-3 text-sm font-semibold text-zinc-950 outline-none focus:ring-2 focus:ring-orange-700/30";
  const primaryBtn =
    "inline-flex rounded-full bg-orange-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-800 disabled:opacity-70";
  const secondaryBtn =
    "inline-flex rounded-full bg-zinc-800 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-zinc-900 disabled:opacity-70";

  return (
    <div className="mt-10 space-y-8">
      <section className="rounded-[1.75rem] bg-white p-5 shadow-xl ring-1 ring-zinc-950/10 sm:p-6">
        <h2 className="text-lg font-extrabold text-zinc-950">Meine Freunde</h2>
        <p className="mt-2 text-sm font-semibold text-zinc-600">
          Kennung teilen, Freunde hinzufügen und zu leseno einladen.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <ActionChip
            label="Kennung"
            hint={friendshipCode ?? "nicht gesetzt"}
            active={dialog === "code"}
            onClick={() => openDialog("code")}
          />
          <ActionChip
            label="Hinzufügen"
            hint="per Kennung"
            active={dialog === "add"}
            onClick={() => openDialog("add")}
          />
          <ActionChip
            label="Freunde"
            hint={
              pendingCount > 0
                ? `${accepted.length} · ${pendingCount} Anfragen`
                : `${accepted.length}`
            }
            badge={pendingCount > 0 ? pendingCount : undefined}
            active={dialog === "friends"}
            onClick={() => openDialog("friends")}
          />
          <ActionChip
            label="Einladen"
            hint="per E-Mail"
            active={dialog === "invite"}
            onClick={() => openDialog("invite")}
          />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-extrabold text-zinc-950">
          Geschichten von Freunden
        </h2>
        <p className="mt-2 mb-4 text-sm font-semibold text-zinc-600">
          Freunde-Geschichten und öffentliche Freigaben. Du kannst liken und —
          je nach Paket — als PDF speichern.
        </p>
        <FriendStoriesBrowser
          initialStories={stories}
          friends={friendships}
          enabledFeatures={enabledFeatures}
          typographyDefaults={typographyDefaults}
        />
      </section>

      <BookClubDialog
        open={dialog === "code"}
        title="Freundschaftskennung"
        pending={pending}
        onClose={closeDialog}
      >
        <p className="text-sm font-semibold text-zinc-600">
          Vergib eine Kennung und teile sie mit Freunden. Damit können sie dich
          im Buchclub finden.
        </p>
        <form noValidate onSubmit={handleSaveCode} className="mt-4 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Kennung
            </span>
            <input
              value={codeDraft}
              onChange={(e) => setCodeDraft(e.target.value)}
              className={inputClass}
              autoComplete="off"
              spellCheck={false}
              maxLength={24}
              placeholder="z. B. lesefuchs"
            />
          </label>
          <button type="submit" disabled={pending} className={primaryBtn}>
            {pending ? "Speichern …" : "Speichern"}
          </button>
        </form>
      </BookClubDialog>

      <BookClubDialog
        open={dialog === "add"}
        title="Freund hinzufügen"
        pending={pending}
        onClose={closeDialog}
      >
        <p className="text-sm font-semibold text-zinc-600">
          Gib die Kennung deines Freundes ein. Er oder sie muss die Anfrage
          bestätigen.
        </p>
        <form noValidate onSubmit={handleAddFriend} className="mt-4 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Kennung des Freundes
            </span>
            <input
              value={addCode}
              onChange={(e) => setAddCode(e.target.value)}
              className={inputClass}
              autoComplete="off"
              spellCheck={false}
              maxLength={24}
            />
          </label>
          <button type="submit" disabled={pending} className={primaryBtn}>
            {pending ? "Senden …" : "Anfragen"}
          </button>
        </form>
      </BookClubDialog>

      <BookClubDialog
        open={dialog === "friends"}
        title="Freunde"
        pending={pending}
        onClose={closeDialog}
      >
        {incoming.length > 0 || outgoing.length > 0 ? (
          <div className="space-y-3">
            <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Anfragen
            </p>
            <ul className="space-y-3">
              {incoming.map((f) => (
                <li
                  key={f.id}
                  className="flex flex-col gap-3 rounded-2xl bg-gray-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <p className="text-sm font-semibold text-zinc-800">
                    Von{" "}
                    <span className="font-extrabold">
                      {f.otherFriendshipCode ?? "ohne Kennung"}
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => handleRespond(f, true)}
                      className={primaryBtn}
                    >
                      Bestätigen
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => handleRespond(f, false)}
                      className={secondaryBtn}
                    >
                      Ablehnen
                    </button>
                  </div>
                </li>
              ))}
              {outgoing.map((f) => (
                <li
                  key={f.id}
                  className="flex flex-col gap-3 rounded-2xl bg-gray-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <p className="text-sm font-semibold text-zinc-800">
                    An{" "}
                    <span className="font-extrabold">
                      {f.otherFriendshipCode ?? "ohne Kennung"}
                    </span>{" "}
                    · wartend
                  </p>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleCancel(f)}
                    className={secondaryBtn}
                  >
                    Zurückziehen
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div
          className={cn(
            (incoming.length > 0 || outgoing.length > 0) && "mt-6",
          )}
        >
          <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
            Bestätigt
          </p>
          {accepted.length === 0 ? (
            <p className="mt-3 text-sm font-semibold text-zinc-600">
              Noch keine bestätigten Freunde.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {accepted.map((f) => (
                <li
                  key={f.id}
                  className="flex flex-col gap-3 rounded-2xl bg-gray-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <p className="text-sm font-extrabold text-zinc-950">
                    {f.otherFriendshipCode ?? "ohne Kennung"}
                  </p>
                  <button
                    type="button"
                    onClick={() => setRemoveTarget(f)}
                    className="inline-flex rounded-full bg-orange-100 px-4 py-2 text-sm font-bold text-orange-900 transition hover:bg-orange-200"
                  >
                    Entfernen
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </BookClubDialog>

      <BookClubDialog
        open={dialog === "invite"}
        title="Zu leseno einladen"
        pending={pending}
        onClose={closeDialog}
      >
        <p className="text-sm font-semibold text-zinc-600">
          Lade jemanden per E-Mail zur Registrierung ein.
        </p>
        <form noValidate onSubmit={handleInvite} className="mt-4 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              E-Mail
            </span>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className={inputClass}
              autoComplete="email"
            />
          </label>
          <button type="submit" disabled={pending} className={primaryBtn}>
            {pending ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Senden …
              </span>
            ) : (
              "Einladung senden"
            )}
          </button>
        </form>
      </BookClubDialog>

      <ConfirmDeleteDialog
        open={Boolean(removeTarget)}
        title="Freund entfernen?"
        description={
          removeTarget
            ? `Die Freundschaft mit „${removeTarget.otherFriendshipCode ?? "ohne Kennung"}“ wird beendet. Freigegebene Geschichten dieser Person sind danach nicht mehr sichtbar.`
            : ""
        }
        confirmLabel="Freund entfernen"
        pending={removePending}
        onCancel={() => {
          if (!removePending) setRemoveTarget(null);
        }}
        onConfirm={handleRemoveConfirm}
      />
    </div>
  );
}

function ActionChip({
  label,
  hint,
  badge,
  active,
  onClick,
}: {
  label: string;
  hint: string;
  badge?: number;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex max-w-full flex-col items-start rounded-full px-3.5 py-2 text-left ring-1 transition",
        active
          ? "bg-yellow-400 text-zinc-950 ring-yellow-400"
          : "bg-gray-50 text-zinc-800 ring-zinc-950/10 hover:bg-gray-100",
      )}
    >
      <span className="inline-flex items-center gap-1.5 text-sm font-extrabold">
        {label}
        {badge != null && badge > 0 ? (
          <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-orange-700 px-1.5 text-[10px] font-extrabold text-white">
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </span>
      <span className="max-w-[11rem] truncate text-[11px] font-semibold opacity-70">
        {hint}
      </span>
    </button>
  );
}

/**
 * Edit dialog for Buchclub friend actions (close via X / Escape / outside).
 * Primary action lives in children footer — no Abbrechen button.
 */
function BookClubDialog({
  open,
  title,
  pending,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  pending?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open || pending) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="book-club-dialog-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!pending) onClose();
      }}
    >
      <div
        className="max-h-[min(90vh,40rem)] w-full max-w-md overflow-y-auto rounded-[1.75rem] bg-white p-6 shadow-2xl ring-1 ring-zinc-950/10"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2
            id="book-club-dialog-title"
            className="text-xl font-extrabold text-zinc-950"
          >
            {title}
          </h2>
          <button
            type="button"
            disabled={pending}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-gray-100 hover:text-zinc-950 disabled:opacity-50"
            onClick={onClose}
          >
            <X className="size-5" aria-hidden />
            <span className="sr-only">Schließen</span>
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
