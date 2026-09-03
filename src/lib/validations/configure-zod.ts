import { z } from "zod";

/**
 * Configure Zod once for German UI error messages.
 * Import this as a side effect from every schema module.
 */
z.config({
  customError: (issue) => {
    if (issue.code === "invalid_type" && issue.input === undefined) {
      return { message: "Dieses Feld ist erforderlich." };
    }
    if (issue.code === "too_small") {
      return { message: "Eingabe ist zu kurz." };
    }
    if (issue.code === "too_big") {
      return { message: "Eingabe ist zu lang." };
    }
    return { message: "Ungültige Eingabe." };
  },
});
