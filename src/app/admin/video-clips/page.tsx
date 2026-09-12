import type { Metadata } from "next";
import { VideoClipsAdminForm } from "@/components/features/admin/video-clips-admin-form";
import { LandingFooter } from "@/components/features/landing/landing-footer";
import { AppHeader } from "@/components/features/landing/app-header";
import { DEFAULT_VEO_MODEL } from "@/lib/ai/gemini-video";
import { FALLBACK_AI_MODELS } from "@/lib/prompts/catalog";
import { resolveVideoClipModelSlug } from "@/lib/video-clips/generate";
import { listVideoClipsWithUrls } from "@/lib/video-clips/repository";
import { loadPromptAdminCatalog } from "@/lib/prompts/repository";
import { hasServiceRoleConfig } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Video-Clips — Leseno Admin",
  description:
    "Kurze Video-Clips mit Gemini Veo aus Bild- oder Video-Vorlage und Prompt.",
};

/** Veo long-running generation. */
export const maxDuration = 300;

/**
 * Admin: generate short video clips (Gemini Veo) from image/video + prompt.
 */
export default async function VideoClipsAdminPage() {
  const canGenerate = hasServiceRoleConfig();

  let modelSlug = DEFAULT_VEO_MODEL;
  let modelLabel = "Veo 3.1 (Gemini Video)";
  let initialClips: Awaited<ReturnType<typeof listVideoClipsWithUrls>> = [];

  try {
    modelSlug = await resolveVideoClipModelSlug();
    const catalog = await loadPromptAdminCatalog({ mergeFallback: true });
    const row =
      catalog.models.find((m) => m.modelSlug === modelSlug) ??
      catalog.models.find((m) => m.id === "video-default");
    if (row) {
      modelSlug = row.modelSlug;
      modelLabel = row.label;
    }
  } catch {
    const fallback = FALLBACK_AI_MODELS.find((m) => m.id === "video-default");
    if (fallback) {
      modelSlug = fallback.modelSlug;
      modelLabel = fallback.label;
    }
  }

  if (canGenerate) {
    try {
      initialClips = await listVideoClipsWithUrls();
    } catch {
      initialClips = [];
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gray-100">
      <AppHeader />
      <main id="main" className="flex-1">
        <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
            Admin
          </p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            Video-Clips
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-relaxed text-zinc-600">
            Aus einer Bild- oder Video-Vorlage und einem Prompt erzeugt Gemini
            Veo einen kurzen Clip und speichert ihn in Supabase Storage.
          </p>
          <div className="mt-8">
            <VideoClipsAdminForm
              canGenerate={canGenerate}
              defaultModelSlug={modelSlug}
              modelLabel={modelLabel}
              initialClips={initialClips}
            />
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
