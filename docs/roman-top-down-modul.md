# Roman-Modul: Top-Down + Separation of Concerns

**Status:** ersetzt die sequentielle Zwei-Rollen-Score-Pipeline in `leseno.novels` / `src/lib/novel/` (kein Parallel-Modul). Clever/`roman_kontext` unverändert.

## 1. Lernfazit (warum linear scheitert)

Die alte Pipeline mischte pro Hop zu viel (Plot, State, Stil, Tic, Rewrite-Feedback). Typische Kollapse: Kontext-Verwässerung, Aufgaben-Überlastung, Makro-Drift. Deshalb: fraktale Verfeinerung und getrennte Rollen statt Score≥8-Steuerung.

## 2. Leitprinzipien

1. **Struktur vor Stil / Graph vor Prosa** — Pyramid-Ebenen und Wissensgraph vollständig freigeben, bevor zusammenhängende Prosa entsteht. Logik-Fixes nie im gleichen Prompt wie Stil-Politur.
2. **Immutability** — Szenen-Manifest nach Freeze schreibgeschützt; Draft/Stil ändern den Plot nicht.
3. **Kontext-Isolierung** — Draft/Stil: kompilerter Prosa-Brief + Manifest + State-Slice + 3-Satz-Vorgänger-Summary.

## 3. Agenten

| # | Rolle | Modell | Scope |
|---|--------|--------|--------|
| 1 | Architekt | Luna | Akte → Kapitel-Beats → Manifeste |
| 2 | State | Deterministisch + Luna-Diff | Slice vor Draft; Commit nach Stil |
| 3 | Draft | Haiku | Manifest → Rohprosa |
| 4 | Logik-Auditor | Luna | Pass/Fail + strukturelle changeOrders |
| 5 | Stilist | Haiku | Politur ohne Plot-Änderung |

## 4. Orchestrator-Phasen

1. `architect_acts` → `skeleton_audit_acts` → `architect_chapters` → `skeleton_audit_chapters` → `architect_manifests` → `skeleton_audit_manifests` (inkl. Kapitel-Verbund-Check auf Manifest-Ebene, **ohne Prosa**) → HITL `skeleton_gate`. Struktur-Audit: **nur bei 10/10**. Kapitel **aktweise** (5–7 pro Akt); Agentic Collab → Architekt **repair** → Neubewertung (bis 3 Runden). Idee fix. Skelett-UI: Pyramid-Baum + Neu-Erzeugen. Auto-Rewrites, sonst `structure_gate`.
2. Nach jedem bestandenen Architect-/Audit-Hop: **Graph-Delta** in `knowledge_graph.entityStates.__pyramidGraph` + optionale `pyramid_embeddings` (Vertrags-Knoten).
3. Freeze (`freezeSkeletonAction`) = **nur Struktur** → Status `prose_pending` (kein Auto-`scene_dispatch`).
4. HITL: `compileProseBriefsAction` → Hop `compile_prose_briefs` (Brief pro Szene aus Graph + Manifest + Vektor-Nachbarn → `scene.briefing`).
5. HITL: `startProseWritingAction` → `scene_dispatch`.
6. Pro Szene: `scene_draft` (Brief zuerst) → `logic_audit` (max. 2 Rewrites) → `style_polish` → `scene_tic_scrub` → `state_commit` (Ledger-Patch).
7. Nach letzter Szene eines Kapitels: `chapter_audit` (Prosa-Dramaturgie) → HITL `chapter_gate` oder weiter.
8. Export: Abnahme + Formel-Tic-Diagnose.

HITL: `logic_gate` nach max Logic-Rewrites; `chapter_gate` nach Kapitel-Audit-Fail; `pilot_mode` Pause nach Szene.

**Pyramide:** Draft/Audit bekommen Prosa-Brief + Contract + Beat-Kette + ScenePlan + Logic-Ledger + Ending-Budget. `scene.score` nach Logik-/Kapitel-Audit. Stilist lokal + Ending-Budget auf letzter Kapitelszene.

**Ton-Vertrag:** Aus High-Concept via `tone-contract.ts` — Genre/Stimmkarte, Architekt, Draft, Audit, Stilist, Kapitel-Gate, Abnahme.

**Struktur-Scores:** `skeleton_audit_*` → `state_matrix.__structureReports` (UI Skelett-Tab).

**Situationen:** `manifest.situations` (3–5) — Draft spielt sie der Reihe nach; Freeze verlangt ≥3.

**Pyramid-State + Next-Plan:** `state_matrix.__pyramid` (`idea`→`acts`→`chapters`→`scenes`). Siehe `pyramid-state.ts`.

**Pyramid-Graph:** `pyramid-graph.ts` / `pyramid-graph-sync.ts`; Embeddings: Migration `20261022140000_leseno_novels_pyramid_embeddings.sql`.

### Smoke-Pfad (manuell)

1. Idee setzen → Generierung starten → Akte 10/10 → Kapitel 10/10 → Manifeste 10/10 (Verbund ok).
2. Skelett: Pyramid-Baum prüfen; **Pyramide freigeben** (nicht „& schreiben“).
3. **Prosa-Prompts kompilieren** → Brief-Chips an Szenen.
4. **Prosa schreiben** → eine Testszene Draft → Logik/Stil.
5. Pipeline/Manuskript bleiben bis Schritt 4 gesperrt (Bestandsprosa bleibt lesbar).

## 5. Datenmodell

Spalten auf `leseno.novels`: `skeleton`, `skeleton_frozen`, `state_matrix`, `knowledge_graph`.  
Spalten auf `leseno.scenes`: `manifest`, `briefing`, `logic_notes`.  
Tabelle `leseno.pyramid_embeddings` (+ RPC `admin_match_pyramid_embeddings`).  
Migrationen: `20261020210000_leseno_novels_top_down.sql`, `20261022140000_leseno_novels_pyramid_embeddings.sql`.

## 6. Code

- Domain: `tree-pipeline.ts`, `tree-schemas.ts`, `roles.ts`, `novelOrchestrator.ts`, `pyramid-graph.ts`, `prose-brief.ts`
- Actions: `freezeSkeletonAction`, `compileProseBriefsAction`, `startProseWritingAction`, `retryLogicGateAction`, …
- UI: Dashboard-Tabs Idee | Skelett (Pyramid-Baum) | Pipeline | Manuskript | State | Export
- Job: `/api/admin/roman/novel-job` (Hop inkl. `compile_prose_briefs`)
