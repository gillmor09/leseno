import "@/lib/validations/configure-zod";
import { z } from "zod";

export const userAdminRowSchema = z.object({
  userId: z.string().uuid({ message: "Ungültige User-ID." }),
  email: z.email({ message: "Bitte eine gültige E-Mail angeben." }),
  role: z.enum([
    "admin",
    "guest",
    "member_tier_1",
    "member_tier_2",
    "member_tier_3",
  ]),
  createdAt: z.string(),
});

export const userAdminFormSchema = z.object({
  users: z.array(userAdminRowSchema),
});
