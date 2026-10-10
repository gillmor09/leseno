# A/B-Checkliste: Modelle bis Manuskript-Freigabe

Ziel: **Gemini 3.8 Flash** (Baseline) gegen günstigere/alternative Text-LLMs vergleichen — **nur bis Manuskript „fertig“ / Freigabe-Check**.

Roman Verbessern (Lesefluss, ebenfalls Gemini 3.8 Flash) getrennt bewerten — sonst mischen sich Manuskript- und Feinschliff-Kosten.

## Kandidaten (verdrahtet)

| Modell | Slug | Provider | Rolle im Test |
| --- | --- | --- | --- |
| **Baseline** Gemini 3.8 Flash | `gemini-3.8-flash` | Gemini | Aktueller Default (Assist + Co-Autor) |
| Claude Haiku 5.5 | `claude-haiku-5-5` | Anthropic | Flash-Peer, günstig/schnell |
| Qwen3.5 397B-A17B | `Qwen/Qwen3.5-397B-A17B` | IONOS | Starkes MoE / Reasoning |
| Llama 3.3 70B Instruct | `meta-llama/Llama-3.3-70B-Instruct` | IONOS | Dialog / Volumen |
| (optional) GPT-OSS 120B | `openai/gpt-oss-120b` | IONOS | Schon Bewerter — nur Assist/JSON |
| (optional) GPT-6 Luna | `gpt-6-luna` | OpenAI | Schon verdrahtet — Flash-Konkurrent |

Admin: **KI-Modelle** → Modell anlegen (Slug wählen) → in **Roman KI-Rollen** `co_autor` / Assist-Rollen auf den Kandidaten setzen. Für Assist-only-Tests nur die Rollen, die `resolveRomanAssistModel` / Co-Autor nutzen.

## Setup (ein Buch, Blind)

1. Buch wählen, dessen Manuskript-Pipeline du kennst (oder frisch erzeugen).
2. **Branch / Notiz:** pro Lauf Modell + Datum + Tokenkosten (Pipeline-Historie).
3. Pro Kandidat: **dieselbe** Ausgangslage (Idee/Recherche/Spec/Gerüst/Plot möglichst eingefroren).
4. Ideal: **zwei parallele Bücher** (Kopie) oder nacheinander mit Snapshot — nie mitten im Lauf das Modell wechseln.
5. Effort/Thinking: Baseline `medium`; Haiku `medium`; Qwen/Llama Defaults.

## Stufen (jeweils bewerten)

Nur Schritte, die bei euch typischerweise Flash fressen:

| # | Stufe | Was prüfen |
| --- | --- | --- |
| A | Idee / Recherche (kurz) | Brauchbare Struktur, kein Halluzinations-Müll |
| B | Grob-/Feingerüst | Kapitelanzahl, Arc-Logik, keine Doppel-Intros |
| C | Grob-/Feinplot / Szenenplot | MUSS/DARF-NICHT, Raum/Props, Schreibbarkeit |
| D | Manuskript Erzeugen (mind. Kap. 1, 2, Mitte, Ende) | Stimme, Alter, Kontinuität |
| E | Freigabe-Check (Seam/Payoff + Emotion) | Sinnvolle vs. Soft-Falschbefunde |
| F | Hinweise nachziehen (optional 1×) | Patch verbessert wirklich oder zerlegt |

## Qualitätskriterien (1–5, Blind wenn möglich)

Score **1 = unbrauchbar**, **5 = Baseline oder besser**. Notiere Stichworte.

1. **Deutsch & Register** — kindgerecht, kein Übersetzungsdeutsch, kein Erwachsenen-Jargon  
2. **Stimme / Ton** — passt zu Tonalität/Schreiber; Kapitel klingen wie ein Buch  
3. **Naht (Seam)** — Ende→Anfang verdient; kein Reset/Exposition-Dump  
4. **Payoff / Emotion** — Arc-Beats und Nachwirkung spürbar, nicht nur Plot-Events  
5. **Fakten / Kontinuität** — Namen, Props, Orte, Zeit stabil  
6. **Instruktionstreue** — JSON/Struktur, Kapitelköpfe, keine Meta-Sätze  
7. **Rewrite-Rate** — wie oft musst du manuell oder per Nachziehen nachbessern?  
8. **Latenz** — spürbar langsam? (Subjektiv + grobe Laufzeit)  
9. **Kosten** — Input/Output-Tokens bzw. Rechnungsschätzung für denselben Lauf  

**Go-Kriterium:** Mittelwert ≥ 4,0 **und** Kriterien 1–5 je ≥ 3,5 **und** Kosten klar unter Flash nach Preiserhöhung — sonst Baseline behalten oder Hybrid.

## Hybrid-Empfehlung (wenn Vollersatz scheitert)

Oft besser als ein Billigmodell für alles:

| Aufgabe | Modell-Idee |
| --- | --- |
| Assist (Graph, Continuity, Freigabe-Audit, JSON) | Haiku 5.5 oder OSS-120 / Llama |
| Co-Autor Manuskript-Prosa | Flash oder (wenn gut) Qwen 397B / Luna |
| Roman Feinschliff | GPT-6 Luna (Rolle Autor) |
| Gerüst/Plot Entwurf | Claude Haiku 5.5 (Schreibhilfe) |
| Pipeline Verbessern | GPT-6 Luna (Entwicklungslektor) |
| Manuskript Prosa | Gemini 3.8 Flash (Co-Autor) |

## Protokoll-Vorlage (kopieren)

```
Buch-ID:
Datum:
Kandidat-Slug:
Rollen geändert: (co_autor / …)

Scores (1–5):
1 Register: _
2 Stimme: _
3 Naht: _
4 Payoff/Emotion: _
5 Kontinuität: _
6 Instruktion: _
7 Rewrite-Rate: _  (1=viel Nacharbeit, 5=wenig)
8 Latenz: _
9 Kosten-Notiz: _

Freigabe-Befunde (#): _
Auto-Freigabe nach Nachziehen? ja/nein
Verdict: behalten Flash / Hybrid / ersetzen durch …
Notizen:
```

## Ablauf-Tipp (schnell)

1. Baseline einmal durch (oder Historie eines guten Laufs als Referenz).  
2. Kandidat nur auf **Co-Autor** → Kap. 1+2+letztes neu erzeugen → Kriterien 1–5.  
3. Wenn schon schwach → Kandidat verwerfen (spart Gerüst/Plot-Kosten).  
4. Wenn stark → Gerüst/Plot/Freigabe mit demselben Modell; Assist ggf. getrennt testen.  
5. Entscheidung dokumentieren vor **1.1.2027** (Flash-Preis).

## Verdrahtung

Neue Slugs: `src/lib/ai/wired-models.ts`.  
Haiku Effort/Thinking: `src/lib/ai/reasoning-effort.ts`, `src/lib/ai/claude.ts`.  
Rollen-Dropdown: Admin → Roman / KI-Rollen (nur verdrahtete Text-LLMs).
