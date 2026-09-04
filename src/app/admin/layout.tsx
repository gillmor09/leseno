import { requireAdminPage } from "@/lib/auth/require-admin";

/**
 * Locks every `/admin/*` route behind `app_metadata.role === "admin"`.
 * Actions still call `denyUnlessAdmin` — this is the UI/data gate only.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPage();
  return children;
}
