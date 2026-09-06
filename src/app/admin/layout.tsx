import { Geist_Mono } from "next/font/google";
import { requireAdminPage } from "@/lib/auth/require-admin";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

/**
 * Locks every `/admin/*` route behind `app_metadata.role === "admin"`.
 * Actions still call `denyUnlessAdmin` — this is the UI/data gate only.
 * Always dynamic: admin pages hit Supabase at request time; prerender would
 * fail Coolify builds when Auth is unreachable from the build container.
 * Geist Mono loads only here so marketing pages stay off the mono font critical path.
 */
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPage();
  return <div className={geistMono.variable}>{children}</div>;
}
