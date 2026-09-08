/**
 * Book club visibility for library stories (`user_stories.book_club_share`).
 */

export const BOOK_CLUB_SHARE_LEVELS = ["none", "friends", "public"] as const;

export type BookClubShareLevel = (typeof BOOK_CLUB_SHARE_LEVELS)[number];

export const BOOK_CLUB_SHARE_LABELS: Record<BookClubShareLevel, string> = {
  none: "Privat",
  friends: "Freunde",
  public: "Öffentlich",
};

export function isBookClubShareLevel(value: unknown): value is BookClubShareLevel {
  return (
    typeof value === "string" &&
    (BOOK_CLUB_SHARE_LEVELS as readonly string[]).includes(value)
  );
}

/** Maps DB/API values; unknown → private. */
export function asBookClubShareLevel(value: unknown): BookClubShareLevel {
  if (isBookClubShareLevel(value)) return value;
  if (value === true) return "friends";
  return "none";
}
