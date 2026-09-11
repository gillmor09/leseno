/**
 * Formats a published blog date for German UI and admin date inputs.
 */

/** Display date for public / admin lists (e.g. „11. September 2026“). */
export function formatBlogDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("de-DE", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

/** Today as `YYYY-MM-DD` for `<input type="date">` (local calendar). */
export function todayBlogDateInput(): string {
  return isoToBlogDateInput(new Date().toISOString()) || "";
}

/** ISO timestamptz → `YYYY-MM-DD` in the local timezone. */
export function isoToBlogDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Date input → ISO timestamptz (local noon) so the calendar day stays stable
 * across timezones when stored as timestamptz.
 */
export function blogDateInputToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const d = new Date(`${trimmed}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
