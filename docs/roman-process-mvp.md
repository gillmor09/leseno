# Roman-Prozess MVP — Abnahme-Checkliste

Freigabegeführter 9-Phasen-Pfad (Admin `/admin/roman`). Hard-Gates bleiben Qualitätschecks; **Autoren-Freigabe** (`editorial.phaseState`) ist Kanon für Downstream-KI.

## Phasen

1. Idee (Import + Coach) → Freigabe  
2. Rahmen (Basics) → Freigabe  
3. Fundament (Figuren + Welt) → Freigabe  
4. Exposé → Freigabe  
5. Wissensgraph (Seed + Konkretisierung aus Regeln, Fundament & Exposé) → Freigabe  
6. Plot (Ereignisplan aus Gesamt-Kanon: Regeln + Fundament + Exposé + Wissensgraph) → Freigabe  
7. Szenen (Verträge; MVP: ~5 Karten) → Freigabe  
8. Manuskript (Stimmprobe = 1 Kapitel) → Freigabe  
9. Lektorat (Kontinuität + Sprache) → revisionierte Version  

## Abnahme (ein Testroman)

- [ ] Freitext importiert; Quelle in `romanSources`; Idee freigeben  
- [ ] Rahmen ableiten/nachschärfen; freigeben  
- [ ] Fundament erzeugen; freigeben  
- [ ] Exposé erzeugen; freigeben  
- [ ] Graph erzeugen (nicht dünn); freigeben  
- [ ] Plot erzeugen; Hard-Gate grün; freigeben  
- [ ] Szenen erzeugen (wenige Karten reichen); freigeben  
- [ ] Manuskript: ein Kapitel (Einzelkapitel) als Stimmprobe; freigeben  
- [ ] Ein Lektorat-/Kontinuitäts-Durchgang  

## Regeln (Tests)

- [ ] Downstream-Erzeugen ohne Upstream-Freigabe → Fehler  
- [ ] Upstream-Edit → Downstream `phaseState.status = stale` (Inhalt bleibt)  
- [ ] Freigabe speichert Fingerprint; Inhalt ändern → Freigabe ungültig  
- [ ] Widersprüche als Findings markieren (nicht still „lösen“)  
- [ ] Generate-Job wiederaufnehmbar (History `running` + Continue-Hop)  

## Code-Anker

- Stages: `src/lib/roman/pipeline/stages.ts`  
- Freigabe: `src/lib/roman/phase-state.ts`, `src/app/actions/roman-phase-freigabe.ts`  
- Fingerprints: `src/lib/roman/phase-fingerprints.ts`  
- Cascade stale: `src/lib/roman/pipeline/cascade.ts`  
- Migration: `src/lib/roman/migrate-phase-state.ts`  
- Selftest: `npx tsx src/lib/roman/phase-state.selftest.ts`  
