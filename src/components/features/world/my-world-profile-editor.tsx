"use client";

/**
 * Editable fields for one child profile (name + three lists).
 */

import { useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  deleteChildProfileAction,
  saveChildProfileAction,
  saveChildReadingModePrefsAction,
} from "@/app/actions/user-world";
import { ChildProfilePinSettings } from "@/components/features/world/child-profile-pin-settings";
import { ReadingModePrefsControls } from "@/components/features/stories/reading-mode-prefs-controls";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import type { ChildProfile, ChildProfileFields } from "@/lib/world/catalog";
import {
  normalizeReadingModePrefs,
  saveReadingModePrefs,
  clearReadingModePrefs,
  type ReadingModePrefs,
} from "@/lib/stories/reading-mode-prefs";
import {
  typographyDefaultsForStage,
  type ReadingTypographyDefaultsCatalog,
} from "@/lib/stories/reading-typography-defaults";
import {
  featuresInclude,
  type PackageFeatureId,
} from "@/lib/users/packages";
import { STORY_LENGTH_STEPS } from "@/lib/stories/length";
import type { StoryLengthStepId } from "@/lib/stories/length";
import {
  STORY_MOODS,
  STORY_SCHOOL_STAGES,
  type StoryMoodId,
  type StorySchoolStageId,
} from "@/lib/stories/options";
import { cn } from "@/lib/utils";

type ListKey = "friends" | "interests" | "experiences" | "fears";

const LIST_COPY: Record<
  ListKey,
  { title: string; hint: string; placeholder: string; addLabel: string }
> = {
  friends: {
    title: "Freundesliste",
    hint: "Wen mag dein Kind dabei haben? Schreib Namen oder Spitznamen.",
    placeholder: "z. B. Mia",
    addLabel: "Freund:in hinzufügen",
  },
  interests: {
    title: "Interessen",
    hint: "Was mag dein Kind besonders? Dinosaurier, Fußball, Sterne …",
    placeholder: "z. B. Weltall",
    addLabel: "Interesse hinzufügen",
  },
  experiences: {
    title: "Das möchte ich mal erleben",
    hint: "Wünsche und Träume — nicht schon Erlebtes. z. B. einmal im Weltall sein …",
    placeholder: "z. B. einmal im Weltall sein",
    addLabel: "Wunsch hinzufügen",
  },
  fears: {
    title: "Davor habe ich Angst",
    hint: "Was macht deinem Kind Sorgen? Standard: kommt nicht in Geschichten vor. Optional unten „Sanft einbauen“ für spannende/motivierende Geschichten.",
    placeholder: "z. B. Gewitter",
    addLabel: "Angst hinzufügen",
  },
};

type MyWorldProfileEditorProps = {
  profileId: string | null;
  initialFields: ChildProfileFields;
  /** Custom Lesemodus prefs; null = follow admin stage Standard. */
  initialReadingModePrefs?: ReadingModePrefs | null;
  /** Whether a parent PIN is already set (existing profiles only). */
  initialHasPin?: boolean;
  typographyDefaults: ReadingTypographyDefaultsCatalog;
  onSaved: (profile: ChildProfile) => void;
  onDeleted?: (profileId: string) => void;
  onHasPinChange?: (hasPin: boolean) => void;
  onLocked?: () => void;
  canDelete?: boolean;
  /** Another profile already marked as default (name for confirm copy). */
  otherDefaultName?: string | null;
  /** Clears default on other local profiles after the user confirms the switch. */
  onClaimDefault?: () => void;
  /** Package features that unlock reading extras toggles. */
  enabledFeatures?: readonly PackageFeatureId[];
};

/**
 * Form for one child: Speichern primary; optional delete with confirm dialog.
 */
export function MyWorldProfileEditor({
  profileId,
  initialFields,
  initialReadingModePrefs = null,
  initialHasPin = false,
  typographyDefaults,
  onSaved,
  onDeleted,
  onHasPinChange,
  onLocked,
  canDelete = false,
  otherDefaultName = null,
  onClaimDefault,
  enabledFeatures = [],
}: MyWorldProfileEditorProps) {
  const stageDefaultsFor = (stage: StorySchoolStageId) =>
    normalizeReadingModePrefs(
      typographyDefaultsForStage(typographyDefaults, stage),
    );

  const [fields, setFields] = useState(initialFields);
  const [followsStandard, setFollowsStandard] = useState(
    () => initialReadingModePrefs == null,
  );
  const [readingPrefs, setReadingPrefs] = useState(() =>
    normalizeReadingModePrefs(
      initialReadingModePrefs ?? stageDefaultsFor(initialFields.schoolStage),
    ),
  );
  const [drafts, setDrafts] = useState<Record<ListKey, string>>({
    friends: "",
    interests: "",
    experiences: "",
    fears: "",
  });
  const [pending, setPending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [defaultConfirmOpen, setDefaultConfirmOpen] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [hasPin, setHasPin] = useState(initialHasPin);
  const allowLesemodus = featuresInclude(enabledFeatures, "lesemodus");

  useEffect(() => {
    setFields(initialFields);
    setHasPin(initialHasPin);
    const follows = initialReadingModePrefs == null;
    setFollowsStandard(follows);
    setReadingPrefs(
      normalizeReadingModePrefs(
        initialReadingModePrefs ?? stageDefaultsFor(initialFields.schoolStage),
      ),
    );
    setDrafts({ friends: "", interests: "", experiences: "", fears: "" });
    setFieldError(null);
    // Remount via key when switching profiles; avoid resetting while typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  function addItem(key: ListKey) {
    const value = drafts[key].trim();
    if (!value) return;
    if (fields[key].some((item) => item.toLowerCase() === value.toLowerCase())) {
      toast.error("Das steht schon auf der Liste.");
      return;
    }
    setFields((current) => ({
      ...current,
      [key]: [...current[key], value],
    }));
    setDrafts((current) => ({ ...current, [key]: "" }));
  }

  function removeItem(key: ListKey, index: number) {
    setFields((current) => ({
      ...current,
      [key]: current[key].filter((_, i) => i !== index),
    }));
  }

  function handleReadingPrefsChange(next: ReadingModePrefs) {
    setFollowsStandard(false);
    setReadingPrefs(normalizeReadingModePrefs(next));
  }

  function handleResetReadingStandard() {
    setFollowsStandard(true);
    setReadingPrefs(stageDefaultsFor(fields.schoolStage));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError(null);
    setPending(true);

    const result = await saveChildProfileAction({
      id: profileId,
      ...fields,
    });

    if (!result.success || !result.data) {
      setPending(false);
      setFieldError(result.error ?? "Speichern hat nicht geklappt.");
      toast.error(result.error ?? "Speichern hat nicht geklappt.");
      return;
    }

    const savedId = result.data.id;
    const prefsToSave = followsStandard
      ? null
      : normalizeReadingModePrefs(readingPrefs);

    if (allowLesemodus) {
      const prefsResult = await saveChildReadingModePrefsAction({
        profileId: savedId,
        prefs: prefsToSave,
      });
      if (!prefsResult.success) {
        setPending(false);
        setFieldError(
          prefsResult.error ?? "Lesemodus-Darstellung speichern fehlgeschlagen.",
        );
        toast.error(
          prefsResult.error ?? "Lesemodus-Darstellung speichern fehlgeschlagen.",
        );
        return;
      }
      if (prefsToSave) {
        saveReadingModePrefs(prefsToSave, savedId);
      } else {
        clearReadingModePrefs(savedId);
      }
    }

    setPending(false);
    toast.success("Profil gespeichert.");
    onSaved({
      id: savedId,
      displayName: fields.displayName.trim(),
      schoolStage: fields.schoolStage,
      lengthStep: fields.lengthStep,
      mood: fields.mood,
      friends: fields.friends,
      interests: fields.interests,
      experiences: fields.experiences,
      fears: fields.fears,
      fearsGentle: fields.fearsGentle,
      includeImages: fields.includeImages,
      syllableHelp: fields.syllableHelp,
      wordHighlight: fields.wordHighlight,
      readableAloud: fields.readableAloud,
      isDefault: fields.isDefault,
      readingModePrefs: prefsToSave,
      hasPin,
      sortOrder: 0,
    });
  }

  function handleDefaultToggle() {
    if (fields.isDefault) {
      setFields((current) => ({ ...current, isDefault: false }));
      return;
    }
    if (otherDefaultName) {
      setDefaultConfirmOpen(true);
      return;
    }
    setFields((current) => ({ ...current, isDefault: true }));
  }

  function handleDefaultConfirm() {
    onClaimDefault?.();
    setFields((current) => ({ ...current, isDefault: true }));
    setDefaultConfirmOpen(false);
  }

  async function handleDeleteConfirm() {
    if (!profileId || !onDeleted) return;
    setDeletePending(true);
    const result = await deleteChildProfileAction({ id: profileId });
    setDeletePending(false);
    if (!result.success) {
      toast.error(result.error ?? "Löschen hat nicht geklappt.");
      return;
    }
    setDeleteOpen(false);
    toast.success("Profil gelöscht.");
    onDeleted(profileId);
  }

  return (
    <>
      <form noValidate onSubmit={handleSubmit} className="space-y-8">
        <section className="rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8">
          <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
            Name des Kindes
          </p>
          <label
            htmlFor="world-display-name"
            className="mt-1 block text-sm text-zinc-600"
          >
            So heißt die Hauptfigur in den persönlichen Geschichten.
          </label>
          <input
            id="world-display-name"
            type="text"
            value={fields.displayName}
            onChange={(event) =>
              setFields((current) => ({
                ...current,
                displayName: event.target.value,
              }))
            }
            maxLength={80}
            className="mt-3 w-full rounded-2xl bg-gray-100 px-4 py-3 text-base font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out focus:bg-white focus:ring-2 focus:ring-orange-700"
            placeholder="z. B. Leo"
          />
          <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl bg-gray-100 px-4 py-3 ring-1 ring-zinc-950/10">
            <div>
              <p className="text-sm font-extrabold text-zinc-950">
                Standardprofil
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-zinc-600 sm:text-sm">
                Die Geschichten-Seite startet mit diesem Profil statt mit
                „Freies lesen“. Es kann nur ein Standard geben.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={fields.isDefault}
              onClick={handleDefaultToggle}
              className={cn(
                "relative h-8 w-14 shrink-0 rounded-full transition-all duration-200 ease-in-out",
                fields.isDefault ? "bg-yellow-400" : "bg-zinc-300",
              )}
            >
              <span
                className={cn(
                  "absolute top-1 left-1 size-6 rounded-full bg-white shadow transition-all duration-200 ease-in-out",
                  fields.isDefault && "translate-x-6",
                )}
              />
              <span className="sr-only">Standardprofil</span>
            </button>
          </div>
        </section>

        <section className="rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8">
          <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
            Schulstufe
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            Danach richtet sich die Sprache in den Geschichten für dieses Kind.
          </p>
          <div
            className="mt-4 flex flex-wrap gap-2"
            role="group"
            aria-label="Schulstufe"
          >
            {STORY_SCHOOL_STAGES.map((stage) => {
              const active = fields.schoolStage === stage.id;
              return (
                <button
                  key={stage.id}
                  type="button"
                  onClick={() =>
                    setFields((current) => {
                      const nextStage = stage.id as StorySchoolStageId;
                      if (followsStandard) {
                        setReadingPrefs(stageDefaultsFor(nextStage));
                      }
                      return {
                        ...current,
                        schoolStage: nextStage,
                      };
                    })
                  }
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm font-bold ring-1 transition-all duration-200 ease-in-out",
                    active
                      ? "bg-yellow-400 text-zinc-950 ring-yellow-400"
                      : "bg-gray-100 text-zinc-700 ring-zinc-950/10 hover:bg-white",
                  )}
                >
                  {stage.label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8">
          <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
            Textlänge
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            Standard für Geschichten mit diesem Profil — auf der Story-Seite
            noch änderbar.
          </p>
          <div
            className="mt-4 flex flex-wrap gap-2"
            role="group"
            aria-label="Textlänge"
          >
            {STORY_LENGTH_STEPS.map((step) => {
              const active = fields.lengthStep === step.id;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() =>
                    setFields((current) => ({
                      ...current,
                      lengthStep: step.id as StoryLengthStepId,
                    }))
                  }
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm font-bold ring-1 transition-all duration-200 ease-in-out",
                    active
                      ? "bg-yellow-400 text-zinc-950 ring-yellow-400"
                      : "bg-gray-100 text-zinc-700 ring-zinc-950/10 hover:bg-white",
                  )}
                >
                  {step.label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8">
          <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
            Art der Geschichte
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            Standard-Stimmung für dieses Profil — auf der Story-Seite noch
            änderbar.
          </p>
          <div
            className="mt-4 flex flex-wrap gap-2"
            role="group"
            aria-label="Art der Geschichte"
          >
            {STORY_MOODS.map((item) => {
              const active = fields.mood === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    setFields((current) => ({
                      ...current,
                      mood: item.id as StoryMoodId,
                    }))
                  }
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm font-bold ring-1 transition-all duration-200 ease-in-out",
                    active
                      ? "bg-yellow-400 text-zinc-950 ring-yellow-400"
                      : "bg-gray-100 text-zinc-700 ring-zinc-950/10 hover:bg-white",
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </section>

        {(Object.keys(LIST_COPY) as ListKey[]).map((key) => {
          const copy = LIST_COPY[key];
          return (
            <section
              key={key}
              className="rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8"
            >
              <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
                {copy.title}
              </p>
              <p className="mt-1 text-sm text-zinc-600">{copy.hint}</p>

              <ul className="mt-4 flex flex-wrap gap-2">
                {fields[key].length === 0 ? (
                  <li className="text-sm text-zinc-500">
                    Noch nichts eingetragen.
                  </li>
                ) : (
                  fields[key].map((item, index) => (
                    <li key={`${key}-${item}-${index}`}>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 py-1.5 pr-1.5 pl-3 text-sm font-bold text-zinc-800 ring-1 ring-zinc-950/10">
                        {item}
                        <button
                          type="button"
                          onClick={() => removeItem(key, index)}
                          className="inline-flex size-7 items-center justify-center rounded-full text-zinc-500 transition-all duration-200 ease-in-out hover:bg-white hover:text-orange-700"
                          aria-label={`${item} entfernen`}
                        >
                          <X className="size-3.5" aria-hidden />
                        </button>
                      </span>
                    </li>
                  ))
                )}
              </ul>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={drafts[key]}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addItem(key);
                    }
                  }}
                  maxLength={120}
                  placeholder={copy.placeholder}
                  className="w-full rounded-2xl bg-gray-100 px-4 py-3 text-sm font-semibold text-zinc-950 outline-none ring-1 ring-zinc-950/10 transition-all duration-200 ease-in-out focus:bg-white focus:ring-2 focus:ring-orange-700"
                />
                <button
                  type="button"
                  onClick={() => addItem(key)}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-yellow-400 px-4 py-3 text-sm font-bold text-zinc-950 transition-all duration-200 ease-in-out hover:bg-yellow-300"
                >
                  <Plus className="size-4" aria-hidden />
                  {copy.addLabel}
                </button>
              </div>

              {key === "fears" ? (
                <div className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-gray-100 px-3 py-3 ring-1 ring-zinc-950/10">
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold text-zinc-950">
                      Sanft einbauen
                    </p>
                    <p className="text-[0.65rem] leading-snug text-zinc-600">
                      Nur bei spannenden und motivierenden Geschichten: eine
                      Angst zufällig und ganz leicht einweben — sonst weiter
                      meiden.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={fields.fearsGentle}
                    onClick={() =>
                      setFields((current) => ({
                        ...current,
                        fearsGentle: !current.fearsGentle,
                      }))
                    }
                    className={cn(
                      "relative h-6 w-10 shrink-0 rounded-full transition-all duration-200 ease-in-out",
                      fields.fearsGentle ? "bg-yellow-400" : "bg-zinc-300",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-all duration-200 ease-in-out",
                        fields.fearsGentle && "translate-x-4",
                      )}
                    />
                    <span className="sr-only">Sanft einbauen</span>
                  </button>
                </div>
              ) : null}
            </section>
          );
        })}

        <section className="rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8">
          <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
            Extras
          </p>
          <p className="mt-1 text-sm text-zinc-600">
            Diese Einstellungen gelten für Geschichten mit diesem Profil — auch
            beim Lesen in der Bücherei.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(
              [
                {
                  key: "includeImages" as const,
                  feature: "bilder" as const,
                  title: "Bilder",
                  hint: "Illustrationen in die Geschichte (langsamer)",
                },
                {
                  key: "syllableHelp" as const,
                  feature: "silbenmethode" as const,
                  title: "Silbenhilfe",
                  hint: "Silben abwechselnd blau und rot",
                },
                {
                  key: "wordHighlight" as const,
                  feature: "markierung" as const,
                  title: "Wort-Markierung",
                  hint: "Beim Vorlesen das aktuelle Wort markieren",
                },
                {
                  key: "readableAloud" as const,
                  feature: "vorlesen" as const,
                  title: "Vorlesbar",
                  hint: "Play-Button und Tempo bei Geschichten",
                },
              ] as const
            )
              .filter((item) =>
                featuresInclude(enabledFeatures, item.feature),
              )
              .map((item) => {
              const active = fields[item.key];
              return (
                <div
                  key={item.key}
                  className="flex items-center justify-between gap-2 rounded-xl bg-gray-100 px-3 py-2 ring-1 ring-zinc-950/10"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold text-zinc-950">
                      {item.title}
                    </p>
                    <p className="text-[0.65rem] leading-snug text-zinc-600">
                      {item.hint}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={active}
                    onClick={() =>
                      setFields((current) => ({
                        ...current,
                        [item.key]: !current[item.key],
                      }))
                    }
                    className={cn(
                      "relative h-6 w-10 shrink-0 rounded-full transition-all duration-200 ease-in-out",
                      active ? "bg-yellow-400" : "bg-zinc-300",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-all duration-200 ease-in-out",
                        active && "translate-x-4",
                      )}
                    />
                    <span className="sr-only">{item.title}</span>
                  </button>
                </div>
              );
            })}
          </div>
          {(
            [
              "bilder",
              "silbenmethode",
              "markierung",
              "vorlesen",
            ] as const
          ).every((feature) => !featuresInclude(enabledFeatures, feature)) ? (
            <p className="mt-3 text-sm text-zinc-500">
              In deinem Paket sind keine Lese-Extras freigeschaltet.
            </p>
          ) : null}
        </section>

        {allowLesemodus ? (
          <section className="rounded-[1.75rem] bg-white p-6 shadow-xl ring-1 ring-zinc-950/10 sm:p-8">
            <p className="text-sm font-extrabold tracking-wide text-orange-700 uppercase">
              Lesemodus
            </p>
            <p className="mt-1 text-sm text-zinc-600">
              Anpassung für den Vollbild-Lesemodus. Ohne eigene Werte gilt der
              Admin-Standard der gewählten Schulstufe.
            </p>
            <ReadingModePrefsControls
              prefs={readingPrefs}
              onChange={handleReadingPrefsChange}
            />
            <button
              type="button"
              disabled={followsStandard}
              onClick={handleResetReadingStandard}
              className={cn(
                "mt-5 w-full rounded-full px-4 py-2.5 text-sm font-bold transition-all duration-200 ease-in-out",
                followsStandard
                  ? "cursor-default bg-gray-50 text-zinc-400"
                  : "bg-gray-100 text-zinc-950 ring-1 ring-zinc-950/10 hover:bg-gray-200",
              )}
            >
              {followsStandard
                ? "Aktuell: Standard (Schulstufe)"
                : "Auf Standard zurücksetzen"}
            </button>
          </section>
        ) : null}

        {profileId ? (
          <ChildProfilePinSettings
            profileId={profileId}
            hasPin={hasPin}
            onHasPinChange={(next) => {
              setHasPin(next);
              onHasPinChange?.(next);
            }}
            onLocked={onLocked}
          />
        ) : (
          <p className="rounded-[1.75rem] bg-orange-50 px-5 py-4 text-sm leading-relaxed text-orange-900 ring-1 ring-orange-700/10">
            Nach dem ersten Speichern kannst du optional eine Eltern-PIN setzen,
            damit Kinder das Profil nicht ungefragt bearbeiten oder auswählen.
          </p>
        )}

        {fieldError ? (
          <p className="text-sm font-semibold text-orange-800">{fieldError}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className={cn(
              "inline-flex rounded-full bg-orange-700 px-6 py-3 text-sm font-bold text-white transition-all duration-200 ease-in-out hover:bg-orange-800",
              pending && "opacity-70",
            )}
          >
            {pending ? "Speichert …" : "Speichern"}
          </button>
          {canDelete && profileId ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => setDeleteOpen(true)}
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-bold text-orange-800 ring-1 ring-orange-700/20 transition-all duration-200 ease-in-out hover:bg-orange-50"
            >
              <Trash2 className="size-4" aria-hidden />
              Profil löschen
            </button>
          ) : null}
        </div>
      </form>

      <ConfirmDeleteDialog
        open={deleteOpen}
        title="Profil löschen?"
        description={`Das Profil „${fields.displayName.trim() || "ohne Namen"}“ und alle Einträge (Freunde, Interessen, Wünsche) werden dauerhaft gelöscht. Das lässt sich nicht rückgängig machen.`}
        confirmLabel="Profil löschen"
        pending={deletePending}
        onCancel={() => {
          if (!deletePending) setDeleteOpen(false);
        }}
        onConfirm={() => {
          void handleDeleteConfirm();
        }}
      />

      <ConfirmDeleteDialog
        open={defaultConfirmOpen}
        title="Standardprofil wechseln?"
        description={`„${otherDefaultName ?? "Ein anderes Profil"}“ ist derzeit das Standardprofil. Wenn du bestätigst, wird dort Standard entfernt und dieses Profil wird Standard (nach dem Speichern).`}
        confirmLabel="Als Standard setzen"
        onCancel={() => setDefaultConfirmOpen(false)}
        onConfirm={handleDefaultConfirm}
      />
    </>
  );
}
