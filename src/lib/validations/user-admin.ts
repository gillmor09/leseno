import "@/lib/validations/configure-zod";
import { z } from "zod";

export const userAdminRowSchema = z.object({
  userId: z.string().uuid({ message: "Ungültige User-ID." }),
  email: z.email({ message: "Bitte eine gültige E-Mail angeben." }),
  role: z.enum(["admin", "basis", "paket1", "paket2", "paket3"]),
  credits: z.number().int().nonnegative(),
  createdAt: z.string(),
});

export const userAdminFormSchema = z.object({
  users: z.array(userAdminRowSchema),
});
