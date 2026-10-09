"use client";

/**
 * Szenenplot panel: overview card + one card per chapter (scenes nested).
 * Structured JSON in `editorial.szenenplotStructured`.
 * Clear cascades Manuskript (confirm).
 */

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { RomanSceneWaitDialog } from "@/components/features/admin/roman-scene-wait-dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import type {
  RomanSzenenplotChapterNode,
  RomanSzenenplotScene,
  RomanSzenenplotStructured,
} from "@/lib/roman/szenenplot-structured";

function chipList(label: string, items: string[]) {
  if (!items.length) return null;
  return (
    <p className="text-xs font-semibold text-zinc-600">
      <span className="text-zinc-500">{label}: </span>
      {items.join(" · ")}
    </p>
  );
}

function sceneBlock(scene: RomanSzenenplotScene) {
  const d = scene.dramaturgy;
  const info = scene.information_flow;
  const cont = scene.continuity;
  const states = Object.entries(cont.character_states_after);
  const propPlaces = Object.entries(cont.prop_placements_after ?? {});
  const prompt = (scene.schreibPrompt ?? "").trim();
  return (
    <div
      key={scene.scene_id}
      className="rounded-xl bg-zinc-50 px-3 py-3 ring-1 ring-zinc-950/8"
    >
      <p className="text-sm font-extrabold text-zinc-950">
        {scene.scene_id} — {scene.heading}
      </p>
      {scene.summary ? (
        <p className="mt-1 text-sm font-semibold leading-relaxed text-zinc-700">
          {scene.summary}
        </p>
      ) : null}
      {scene.characters_present.length ? (
        <p className="mt-1 text-xs font-semibold text-zinc-500">
          Figuren: {scene.characters_present.join(", ")}
        </p>
      ) : null}
      <div className="mt-2 space-y-0.5 text-xs font-semibold text-zinc-600">
        {d.scene_goal ? (
          <p>
            <span className="text-zinc-500">Ziel: </span>
            {d.scene_goal}
          </p>
        ) : null}
        {d.obstacle_conflict ? (
          <p>
            <span className="text-zinc-500">Hindernis: </span>
            {d.obstacle_conflict}
          </p>
        ) : null}
        {d.turning_point ? (
          <p>
            <span className="text-zinc-500">Wendepunkt: </span>
            {d.turning_point}
          </p>
        ) : null}
        {d.outcome_value_change ? (
          <p>
            <span className="text-zinc-500">Wertänderung: </span>
            {d.outcome_value_change}
          </p>
        ) : null}
        {info.revealed_to_audience ? (
          <p>
            <span className="text-zinc-500">Publikum erfährt: </span>
            {info.revealed_to_audience}
          </p>
        ) : null}
        {info.revealed_to_characters ? (
          <p>
            <span className="text-zinc-500">Figuren erfahren: </span>
            {info.revealed_to_characters}
          </p>
        ) : null}
        {info.kept_secret ? (
          <p>
            <span className="text-zinc-500">Geheim: </span>
            {info.kept_secret}
          </p>
        ) : null}
        {states.length ? (
          <p>
            <span className="text-zinc-500">Zustand danach (Ort/Etage): </span>
            {states.map(([k, v]) => `${k}: ${v}`).join("; ")}
          </p>
        ) : null}
        {propPlaces.length ? (
          <p>
            <span className="text-zinc-500">Props danach: </span>
            {propPlaces.map(([k, v]) => `${k}: ${v}`).join("; ")}
          </p>
        ) : null}
        {cont.next_scene_hook ? (
          <p>
            <span className="text-zinc-500">Hook: </span>
            {cont.next_scene_hook}
          </p>
        ) : null}
      </div>
      {prompt ? (
        <div className="mt-2 border-t border-zinc-200/80 pt-2">
          <p className="text-[10px] font-extrabold tracking-wide text-zinc-500 uppercase">
            Schreibprompt
          </p>
          <p className="mt-0.5 whitespace-pre-wrap text-xs font-semibold leading-relaxed text-zinc-700">
            {prompt.length > 600 ? `${prompt.slice(0, 600)}…` : prompt}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function chapterCard(ch: RomanSzenenplotChapterNode) {
  return (
    <article
      key={ch.number}
      className="rounded-2xl bg-white px-4 py-4 ring-1 ring-zinc-950/10"
    >
      <h3 className="text-sm font-extrabold text-zinc-950">
        Kapitel {ch.number} — {ch.title}
      </h3>
      {ch.kernsatz ? (
        <p className="mt-1.5 text-sm font-semibold text-zinc-800">{ch.kernsatz}</p>
      ) : null}
      <div className="mt-3 space-y-1 border-t border-zinc-100 pt-3">
        {chipList("Props", ch.props)}
        {chipList("Events", ch.events)}
        {chipList("Führt ein", ch.introduces)}
        {chipList("Löst / schließt", ch.resolves)}
        {chipList("Offene Fäden", ch.openThreads)}
        {ch.arcBeats.length > 0 ? (
          <p className="text-xs font-semibold text-zinc-600">
            <span className="text-zinc-500">Arc-Beats: </span>
            {ch.arcBeats
              .map((b) => `${b.arcId} (T${b.tension}): ${b.mustShow}`)
              .join(" · ")}
          </p>
        ) : null}
      </div>
      {ch.scenes.length > 0 ? (
        <div className="mt-4 space-y-2">
          <p className="text-[10px] font-extrabold tracking-wide text-zinc-500 uppercase">
            Szenen · {ch.scenes.length}
          </p>
          {ch.scenes.map(sceneBlock)}
        </div>
      ) : (
        <p className="mt-3 text-xs font-semibold text-zinc-500">
          Noch keine Szenen in diesem Kapitel.
        </p>
      )}
    </article>
  );
}

export function RomanSzenenplotPanel({
  hasGeruest,
  value,
  structured,
  disabled,
  onClear,
  clearPending,
  onEnrichSpatial,
  enrichSpatialPending,
  enrichSpatialMode = "manual",
  staleBanner,
}: {
  hasGeruest: boolean;
  /** Raw markdown — detect content for Clear when structured is empty. */
  value?: string;
  /** Kept for callers that still wire editors; ignored in card UI. */
  onChange?: (next: string) => void;
  structured?: RomanSzenenplotStructured | null;
  canSave?: boolean;
  disabled?: boolean;
  savePending?: boolean;
  onSave?: () => void;
  /** Persist empty Szenenplot + cascade clear Manuskript. */
  onClear?: () => void | Promise<void>;
  clearPending?: boolean;
  /** Legacy: Ort/Etage/Prop-Ablage nachschärfen. */
  onEnrichSpatial?: () => void | Promise<void>;
  enrichSpatialPending?: boolean;
  /** Fertig-Toggle freezes contracts after spatial enrich. */
  enrichSpatialMode?: "manual" | "fertig";
  staleBanner?: string | null;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const busy = Boolean(disabled || clearPending || enrichSpatialPending);
  const hasContent =
    Boolean(value?.trim()) || Boolean(structured?.chapters.length);
  const chapters = structured?.chapters ?? [];
  const sceneTotal = chapters.reduce((n, c) => n + c.scenes.length, 0);
  const withPrompt = chapters.reduce(
    (n, c) =>
      n +
      c.scenes.filter((s) => (s.schreibPrompt ?? "").trim().length >= 40).length,
    0,
  );

  const spatialWait = Boolean(enrichSpatialPending);
  const spatialFertig = enrichSpatialMode === "fertig";

  async function confirmClear() {
    if (!onClear || clearPending) return;
    await onClear();
    setConfirmOpen(false);
  }

  return (
    <div className="space-y-5">
      <ConfirmDeleteDialog
        open={confirmOpen}
        title="Szenenplot leeren?"
        description="Szenenplot (Markdown + Struktur inkl. Schreibprompts), Manuskript und Export-Texte (Klappentext, Einzeiler, Keywords) werden gelöscht. Kapitelgerüst und Wissensgraph bleiben. Fertig-Flags und Reifegrade für Plot/Manuskript/Export entfallen."
        confirmLabel="Szenenplot leeren"
        pending={Boolean(clearPending)}
        onCancel={() => {
          if (!clearPending) setConfirmOpen(false);
        }}
        onConfirm={() => void confirmClear()}
      />

      <RomanSceneWaitDialog
        open={spatialWait}
        variant="pipeline-generate"
        contextLabel={
          spatialFertig
            ? "Szenenplot · Fertig"
            : "Szenenplot · Raum-Continuity"
        }
        title={
          spatialFertig
            ? "Fertig: Continuity + Einfrieren"
            : "Raum-Continuity nachschärfen"
        }
        footer={
          spatialFertig
            ? "Nur Szenenplot-Fertig: Raum angleichen und Verträge einfrieren. Tab offen lassen."
            : "Nur Ort/Etage/Prop-Ablage in den Szenenverträgen. Tab offen lassen."
        }
        progressLabel={
          spatialFertig
            ? "Ort/Etage/Props angleichen, danach Schreibprompts einfrieren …"
            : "Szenen nacheinander: Ort, Etage und Props angleichen …"
        }
        steps={
          spatialFertig
            ? [
                "Szenenverträge lesen",
                "Ort / Etage / Props angleichen",
                "Verträge einfrieren",
              ]
            : [
                "Szenenverträge lesen",
                "Ort / Etage / Props angleichen",
                "Struktur speichern",
              ]
        }
      />

      {!hasGeruest ? (
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
          Für den Szenenplot brauchst du zuerst ein Kapitelgerüst (Tab
          „Kapitelgerüst“).
        </p>
      ) : null}

      {staleBanner ? (
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
          {staleBanner}
        </p>
      ) : null}

      {chapters.length > 0 ? (
        <div className="space-y-4">
          <div className="rounded-2xl bg-zinc-50 px-4 py-4 ring-1 ring-zinc-950/10">
            <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Szenenplot · Übersicht
            </p>
            <p className="mt-2 text-sm font-bold text-zinc-950">
              {chapters.length} Kapitel · {sceneTotal} Szene
              {sceneTotal === 1 ? "" : "n"}
              {withPrompt > 0 ? ` · ${withPrompt} Schreibprompts` : ""}
              {structured?.schreibPromptsFrozenAt ? " · eingefroren" : ""}
              {structured?.spatialContinuityEnrichedAt
                ? " · Raum-Continuity"
                : ""}
              {structured?.centralArcs.length === 1
                ? " · 1 Spannungsbogen"
                : structured?.centralArcs.length
                  ? ` · ${structured.centralArcs.length} Spannungsbögen`
                  : ""}
              {structured?.modelLabel ? ` · ${structured.modelLabel}` : ""}
            </p>
            {structured && structured.centralArcs.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {structured.centralArcs.map((a, i) => (
                  <li
                    key={a.id}
                    className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-zinc-800 ring-1 ring-zinc-950/10"
                  >
                    <span className="text-[10px] font-extrabold tracking-wide text-zinc-500 uppercase">
                      {i === 0 ? "Hauptbogen" : `Nebenbogen ${i}`}
                    </span>
                    <p className="mt-0.5 text-zinc-950">{a.label}</p>
                    {a.parties.length ? (
                      <p className="text-xs font-semibold text-zinc-500">
                        {a.parties.join(", ")}
                      </p>
                    ) : null}
                    <p className="mt-0.5 text-xs font-semibold text-zinc-500">
                      Setup Kap. {a.setupChapter} → Peak Kap. {a.peakChapter} →
                      Payoff Kap. {a.payoffChapter}
                      {a.notes ? ` · ${a.notes}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-3 text-xs font-semibold text-zinc-500">
              Szenenverträge inkl. Dramaturgie und Schreibprompt. Manuskript
              formt nur Prosa aus — keine neuen Handlungsstränge.
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-extrabold tracking-wide text-zinc-500 uppercase">
              Kapitel
            </p>
            {chapters.map(chapterCard)}
          </div>
        </div>
      ) : hasGeruest && !hasContent ? (
        <p className="text-sm font-semibold text-zinc-500">
          Noch kein Szenenplot — oben „Erzeugen“ starten.
        </p>
      ) : null}

      {onClear || onEnrichSpatial ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-4">
          {onEnrichSpatial ? (
            <button
              type="button"
              disabled={busy || !hasContent}
              onClick={() => void onEnrichSpatial()}
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {enrichSpatialPending
                ? "Raum-Continuity …"
                : "Raum-Continuity nachschärfen"}
            </button>
          ) : null}
          {onClear ? (
            <button
              type="button"
              disabled={busy || !hasContent}
              onClick={() => setConfirmOpen(true)}
              className="inline-flex size-10 items-center justify-center rounded-full text-rose-800 ring-1 ring-rose-200 hover:bg-rose-50 disabled:opacity-50"
              title="Szenenplot leeren"
            >
              <Trash2 className="size-4" aria-hidden />
              <span className="sr-only">Szenenplot leeren</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
