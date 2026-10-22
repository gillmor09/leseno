# Clever erzählt — isolation note

Clever currently still runs on the legacy fiction stack:

- UI: `/admin/clever-erzaehlt`
- Data: `leseno.roman_kontext` (`editorial.buchTyp = clever_erzaehlt`)
- Code: `src/lib/roman/*` + `clever-*.ts` helpers

The greenfield **Roman** module (`src/lib/novel/`, `leseno.novels`) does not share this stack.

Next isolation step (when needed): move Clever-only imports into this package and stop depending on belletristik-only roman paths.
