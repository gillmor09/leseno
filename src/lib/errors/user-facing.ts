/**
 * Errors safe to show to the user (German copy). Everything else stays server-logged.
 */

export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

/**
 * Maps unknown failures to a fixed German UI message; preserves UserFacingError text.
 */
export function toUserFacingMessage(
  error: unknown,
  fallback: string,
): string {
  if (error instanceof UserFacingError) {
    return error.message;
  }
  return fallback;
}
