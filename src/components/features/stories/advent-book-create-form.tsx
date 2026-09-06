"use client";

/**
 * Ultimate: create Advent calendar book + sequential day generation with progress.
 * Confirm before charging credits; blocking wait dialog while 24 days generate.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  createAdventBookAction,
  generateAdventDayAction,
} from "@/app/actions/advent";
import {
  BotGuardFields,
  useBotGuardFields,
} from "@/components/features/security/bot-guard-fields";
import { useMembershipCredits } from "@/components/features/membership/membership-credits-header";
import { StoryLengthSlider } from "@/components/features/stories/story-length-slider";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { ChildProfilePinUnlockDialog } from "@/components/features/world/child-profile-pin-unlock-dialog";
import { ADVENT_DAY_COUNT } from "@/lib/stories/advent";
import { adventBookCreditsForLength } from "@/lib/stories/credits-cost";
import type { StoryLengthCatalog, StoryLengthStepId } from "@/lib/stories/length";
import {
  STORY_MOODS,
  STORY_SCHOOL_STAGES,
  STORY_TOP_TOPICS,
  type StoryMoodId,
  type StorySchoolStageId,
} from "@/lib/stories/options";
import {
  featuresInclude,
  type PackageFeatureId,
} from "@/lib/users/packages";
import type { ChildProfileOption } from "@/lib/world/catalog";
import { cn } from "@/lib/utils";

export function AdventBookCreateForm({
  lengthCatalog,
  childProfiles,
  enabledFeatures,
  onCreditsChange,
}: {
  lengthCatalog: StoryLengthCatalog;
  childProfiles: ChildProfileOption[] | null;
  enabledFeatures: readonly PackageFeatureId[];
  onCreditsChange?: (credits: number) => void;
}) {
  const router = useRouter();
  const botGuard = useBotGuardFields();
  const creditsCtx = useMembershipCredits();
  const reportCredits = onCreditsChange ?? creditsCtx?.onCreditsChange;
  const allowMeineWelt = featuresInclude(enabledFeatures, "meine_welt");
  const allowBilder = featuresInclude(enabledFeatures, "bilder");
  const allowSilben = featuresInclude(enabledFeatures, "silbenmethode");

  const [personalMode, setPersonalMode] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(
    childProfiles?.[0]?.id ?? null,
  );
  const [topic, setTopic] = useState<string>(STORY_TOP_TOPICS[0] ?? "");
  const [schoolStage, setSchoolStage] =
    useState<StorySchoolStageId>("klasse_3");
  const [lengthStep, setLengthStep] =
    useState<StoryLengthStepId>("mittel");
  const [mood, setMood] = useState<StoryMoodId>("spannend");
  const [includeImages, setIncludeImages] = useState(false);
  const [syllableHelp, setSyllableHelp] = useState(false);
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [waitingOpen, setWaitingOpen] = useState(false);
  const [progressDay, setProgressDay] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [unlockedIds, setUnlockedIds] = useState(() => {
    const ids = new Set<string>();
    for (const profile of childProfiles ?? []) {
      if (!profile.hasPin) ids.add(profile.id);
    }
    return ids;
  });
  const [pendingUnlock, setPendingUnlock] = useState<{
    profileId: string;
    profileName: string;
    after?: "confirm";
  } | null>(null);

  const creditCost = useMemo(
    () => adventBookCreditsForLength(lengthStep),
    [lengthStep],
  );

  function validateBeforeConfirm(): string | null {
    if (!/^\d{4,8}$/.test(pin.trim())) {
      return "PIN: bitte 4 bis 8 Ziffern eingeben.";
    }
    if (pin.trim() !== pinConfirm.trim()) {
      return "Die PIN-Wiederholung stimmt nicht.";
    }
    if (personalMode && allowMeineWelt && !profileId) {
      return "Bitte wähl ein Kinder-Profil.";
    }
    if (!personalMode && !topic) {
      return "Bitte wähl ein Thema.";
    }
    return null;
  }

  function handleRequestCreate() {
    const error = validateBeforeConfirm();
    if (error) {
      toast.error(error);
      return;
    }
    if (
      personalMode &&
      allowMeineWelt &&
      profileId &&
      !unlockedIds.has(profileId)
    ) {
      const profile = childProfiles?.find((row) => row.id === profileId);
      setPendingUnlock({
        profileId,
        profileName: profile?.displayName || "Ohne Namen",
        after: "confirm",
      });
      return;
    }
    setConfirmOpen(true);
  }

  function handleConfirmCreate() {
    setConfirmOpen(false);
    setWaitingOpen(true);
    setProgressDay(0);
    startTransition(async () => {
      const create = await createAdventBookAction({
        personalMode: personalMode && allowMeineWelt,
        profileId:
          personalMode && allowMeineWelt
            ? (profileId ?? undefined)
            : undefined,
        topic: personalMode ? undefined : topic,
        schoolStage,
        lengthStep,
        mood,
        includeImages: allowBilder && includeImages,
        syllableHelp: allowSilben && syllableHelp,
        pin,
        pinConfirm,
        ...botGuard.getBotGuardPayload(),
      });

      if (!create.success || !create.data) {
        setWaitingOpen(false);
        setProgressDay(0);
        toast.error(create.error ?? "Anlegen fehlgeschlagen.");
        return;
      }

      if (
        typeof create.data.creditsRemaining === "number" &&
        reportCredits
      ) {
        reportCredits(create.data.creditsRemaining);
      }

      const bookId = create.data.bookId;

      for (let day = 1; day <= ADVENT_DAY_COUNT; day += 1) {
        setProgressDay(day);
        const dayResult = await generateAdventDayAction({
          bookId,
          dayNumber: day,
          ...botGuard.getBotGuardPayload(),
        });
        if (!dayResult.success) {
          setWaitingOpen(false);
          setProgressDay(0);
          toast.error(
            dayResult.error ??
              `Tag ${day} fehlgeschlagen. Du kannst später erneut versuchen.`,
          );
          router.push(`/adventskalender/${bookId}`);
          return;
        }
      }

      toast.success("Alle 24 Adventstage sind fertig!");
      router.push(`/adventskalender/${bookId}`);
      router.refresh();
    });
  }

  return (
    <div className="rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8">
      <BotGuardFields
        website={botGuard.website}
        onWebsiteChange={botGuard.setWebsite}
        formStartedAt={botGuard.formStartedAt}
      />

      <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
        Ultimate · Adventskalenderbuch
      </p>
      <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-zinc-950">
        24 Tage, eine Geschichte
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600">
        Es entstehen 24 aufeinander aufbauende Kapitel. Jede Tür öffnet sich
        erst am jeweiligen Dezember-Tag (Europe/Berlin). Mit deiner PIN kannst
        du als Elternteil die Vorschau für alle Tage freischalten.
      </p>

      <div className="mt-6 space-y-5">
        {allowMeineWelt && childProfiles && childProfiles.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setPersonalMode(false)}
              className={cn(
                "rounded-full px-3.5 py-2 text-sm font-bold ring-1",
                !personalMode
                  ? "bg-yellow-400 text-zinc-950 ring-yellow-400"
                  : "bg-white text-zinc-700 ring-zinc-950/10",
              )}
            >
              Freies Thema
            </button>
            <button
              type="button"
              onClick={() => setPersonalMode(true)}
              className={cn(
                "rounded-full px-3.5 py-2 text-sm font-bold ring-1",
                personalMode
                  ? "bg-yellow-400 text-zinc-950 ring-yellow-400"
                  : "bg-white text-zinc-700 ring-zinc-950/10",
              )}
            >
              Ganz persönlich
            </button>
          </div>
        ) : null}

        {personalMode && childProfiles ? (
          <label className="block space-y-1.5">
            <span className="text-xs font-bold tracking-wide text-zinc-600 uppercase">
              Kinder-Profil
            </span>
            <select
              value={profileId ?? ""}
              onChange={(event) => {
                const nextId = event.target.value || null;
                if (!nextId) {
                  setProfileId(null);
                  return;
                }
                const profile = childProfiles?.find((row) => row.id === nextId);
                if (profile?.hasPin && !unlockedIds.has(nextId)) {
                  setPendingUnlock({
                    profileId: nextId,
                    profileName: profile.displayName || "Ohne Namen",
                  });
                  return;
                }
                setProfileId(nextId);
              }}
              className="w-full rounded-2xl border-0 bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-900 ring-1 ring-zinc-950/10"
            >
              {childProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.displayName || "Ohne Namen"}
                  {profile.hasPin && !unlockedIds.has(profile.id)
                    ? " (PIN)"
                    : ""}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="block space-y-1.5">
            <span className="text-xs font-bold tracking-wide text-zinc-600 uppercase">
              Thema
            </span>
            <select
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              className="w-full rounded-2xl border-0 bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-900 ring-1 ring-zinc-950/10"
            >
              {STORY_TOP_TOPICS.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block space-y-1.5">
          <span className="text-xs font-bold tracking-wide text-zinc-600 uppercase">
            Schulstufe
          </span>
          <select
            value={schoolStage}
            onChange={(event) =>
              setSchoolStage(event.target.value as StorySchoolStageId)
            }
            disabled={personalMode}
            className="w-full rounded-2xl border-0 bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-900 ring-1 ring-zinc-950/10 disabled:opacity-60"
          >
            {STORY_SCHOOL_STAGES.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.label}
              </option>
            ))}
          </select>
        </label>

        <div>
          <p className="mb-2 text-xs font-bold tracking-wide text-zinc-600 uppercase">
            Textlänge (pro Tag)
          </p>
          <StoryLengthSlider
            catalog={lengthCatalog}
            value={lengthStep}
            onChange={setLengthStep}
          />
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-bold tracking-wide text-zinc-600 uppercase">
            Art der Geschichte
          </span>
          <select
            value={mood}
            onChange={(event) => setMood(event.target.value as StoryMoodId)}
            className="w-full rounded-2xl border-0 bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-900 ring-1 ring-zinc-950/10"
          >
            {STORY_MOODS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-bold tracking-wide text-zinc-600 uppercase">
              Eltern-PIN
            </span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              placeholder="4–8 Ziffern"
              className="w-full rounded-2xl border-0 bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-900 ring-1 ring-zinc-950/10"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-bold tracking-wide text-zinc-600 uppercase">
              PIN wiederholen
            </span>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={pinConfirm}
              onChange={(event) => setPinConfirm(event.target.value)}
              placeholder="Nochmals PIN"
              className="w-full rounded-2xl border-0 bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-900 ring-1 ring-zinc-950/10"
            />
          </label>
        </div>

        {(allowBilder || allowSilben) && (
          <div className="flex flex-wrap gap-4 text-sm font-semibold text-zinc-700">
            {allowBilder ? (
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={includeImages}
                  onChange={(event) => setIncludeImages(event.target.checked)}
                />
                Bilder (macht die Erzeugung deutlich länger)
              </label>
            ) : null}
            {allowSilben ? (
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={syllableHelp}
                  onChange={(event) => setSyllableHelp(event.target.checked)}
                />
                Silbenhilfe
              </label>
            ) : null}
          </div>
        )}

        <p className="text-sm font-semibold text-zinc-600">
          Kosten:{" "}
          <span className="tabular-nums text-zinc-950">
            {creditCost.toLocaleString("de-DE")} Credits
          </span>{" "}
          (24 × gewählte Länge)
        </p>

        <button
          type="button"
          disabled={isPending}
          onClick={handleRequestCreate}
          className="inline-flex w-full items-center justify-center rounded-full bg-orange-700 px-5 py-3.5 text-sm font-extrabold text-white transition-all duration-200 ease-in-out hover:bg-orange-800 disabled:opacity-70 sm:w-auto"
        >
          Adventskalenderbuch erzeugen
        </button>
      </div>

      <ConfirmDeleteDialog
        open={confirmOpen}
        title="Adventskalenderbuch erzeugen?"
        description={`Es werden ${creditCost.toLocaleString("de-DE")} Credits abgebucht und 24 aufeinander aufbauende Geschichten erzeugt. Das kann mehrere Minuten dauern. Bitte das Fenster danach nicht schließen.`}
        confirmLabel="Jetzt erzeugen"
        pending={false}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirmCreate}
      />

      {pendingUnlock ? (
        <ChildProfilePinUnlockDialog
          open
          profileId={pendingUnlock.profileId}
          profileName={pendingUnlock.profileName}
          onCancel={() => setPendingUnlock(null)}
          onUnlocked={() => {
            const id = pendingUnlock.profileId;
            const after = pendingUnlock.after;
            setUnlockedIds((current) => new Set(current).add(id));
            setProfileId(id);
            setPendingUnlock(null);
            if (after === "confirm") {
              setConfirmOpen(true);
            }
          }}
        />
      ) : null}

      <AdventWaitingDialog open={waitingOpen} progressDay={progressDay} />
    </div>
  );
}

/** Blocking overlay while the 24 Advent days are generated. */
function AdventWaitingDialog({
  open,
  progressDay,
}: {
  open: boolean;
  progressDay: number;
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

  if (!open || !mounted) return null;

  const percent =
    progressDay <= 0
      ? 2
      : Math.min(100, Math.round((progressDay / ADVENT_DAY_COUNT) * 100));

  const statusText =
    progressDay === 0
      ? "Buch wird angelegt und Credits werden abgebucht …"
      : `Tag ${progressDay} von ${ADVENT_DAY_COUNT} wird geschrieben …`;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="advent-wait-title"
      aria-describedby="advent-wait-desc"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-[1.75rem] bg-white p-6 shadow-2xl ring-1 ring-zinc-950/10 sm:p-8">
        <div className="flex items-start gap-3">
          <Loader2
            className="mt-0.5 size-6 shrink-0 animate-spin text-orange-700"
            aria-hidden
          />
          <div className="min-w-0">
            <h2
              id="advent-wait-title"
              className="text-xl font-extrabold text-zinc-950"
            >
              Adventskalenderbuch entsteht
            </h2>
            <p
              id="advent-wait-desc"
              className="mt-2 text-sm leading-relaxed text-zinc-600"
            >
              {statusText} Bitte warte und schließe dieses Fenster nicht.
            </p>
          </div>
        </div>

        <div className="mt-6">
          <div className="h-2 overflow-hidden rounded-full bg-gray-100 ring-1 ring-zinc-950/10">
            <div
              className="h-full rounded-full bg-orange-700 transition-all duration-300 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-2 text-xs font-bold tabular-nums text-zinc-500">
            {progressDay > 0
              ? `${progressDay} / ${ADVENT_DAY_COUNT} Tage`
              : "Start …"}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
