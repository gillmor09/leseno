/**
 * Shared shell for gated membership composers (`/paket1`–`/paket3`).
 * Copy matches the public `/basis` composer UI.
 */

import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { FreeStoryForm } from "@/components/features/stories/free-story-form";
import { requireMembershipPage } from "@/lib/auth/require-membership";
import { getCurrentUser } from "@/lib/auth/session";
import { loadStoryLengthCatalog } from "@/lib/stories/length-repository";
import { canUsePersonalMode } from "@/lib/stories/personal";
import { loadMyWorld } from "@/lib/world/repository";
import {
  MEMBERSHIP_ROLE_OPTIONS,
  type MembershipRoleId,
} from "@/lib/users/catalog";

/**
 * Auth + role gate, then the basis-equivalent composer UI.
 */
export async function MembershipStoryPage({
  role,
}: {
  role: MembershipRoleId;
}) {
  await requireMembershipPage(role);

  const lengthCatalog = await loadStoryLengthCatalog();
  const user = await getCurrentUser();
  const roleLabel =
    MEMBERSHIP_ROLE_OPTIONS.find((entry) => entry.id === role)?.label ?? role;

  let personalAvailable = false;
  if (user) {
    try {
      const world = await loadMyWorld();
      personalAvailable = canUsePersonalMode(world);
    } catch {
      personalAvailable = false;
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            {roleLabel} für dich
          </p>
          <h1 className="mt-4 max-w-2xl text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl lg:text-5xl lg:leading-[1.1]">
            Wähl dein Thema. Lies deine Geschichte.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600 sm:text-lg">
            Nimm ein Top-Thema oder schalte „Ganz persönlich“ ein. Dann stell
            Schulstufe und Textlänge ein — lustig, spannend oder motivierend.
          </p>
          <div className="mt-10">
            <FreeStoryForm
              lengthCatalog={lengthCatalog}
              personalAvailable={personalAvailable}
            />
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
