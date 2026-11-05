import { headers } from "next/headers";
import { requireAdminPage } from "@/lib/auth/require-admin";

/**
 * Locks every `/admin/*` route behind `app_metadata.role === "admin"`.
 * Actions still call `denyUnlessAdmin` — this is the UI/data gate only.
 * Always dynamic: admin pages hit Supabase at request time; prerender would
 * fail Coolify builds when Auth is unreachable from the build container.
 * Uses root Nunito (`font-sans`) — no separate mono stack for admin chrome.
 */
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = (await headers()).get("x-pathname")?.trim() || "/admin/users";
  await requireAdminPage(pathname.startsWith("/admin") ? pathname : "/admin/users");
  return children;
}
