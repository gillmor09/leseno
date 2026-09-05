"use client";

/**
 * Client shell for `/geschichte`: package badge + live credits + composer.
 */

import { useState } from "react";
import { FreeStoryForm } from "@/components/features/stories/free-story-form";
import type { StoryLengthCatalog } from "@/lib/stories/length";
import type { PackageFeatureId } from "@/lib/users/packages";
import type { ChildProfileOption } from "@/lib/world/catalog";

export function GeschichteComposer({
  packageLabel,
  initialCredits,
  allowMeineWelt,
  lengthCatalog,
  childProfiles,
  enabledFeatures,
}: {
  packageLabel: string;
  initialCredits: number;
  allowMeineWelt: boolean;
  lengthCatalog: StoryLengthCatalog;
  childProfiles: ChildProfileOption[] | null;
  enabledFeatures: readonly PackageFeatureId[];
}) {
  const [credits, setCredits] = useState(initialCredits);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="inline-flex items-center rounded-full bg-yellow-400 px-3 py-1 text-xs font-extrabold tracking-wide text-zinc-950 uppercase">
          {packageLabel} für dich
        </p>
        <p
          className="inline-flex items-center rounded-full bg-zinc-800 px-3 py-1 text-xs font-extrabold tracking-wide text-white tabular-nums"
          title="Aktueller Credits-Stand"
        >
          {credits.toLocaleString("de-DE")} Credits
        </p>
      </div>
      <h1 className="mt-4 max-w-2xl text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl lg:text-5xl lg:leading-[1.1]">
        Wähl dein Thema. Lies deine Geschichte.
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600 sm:text-lg">
        {allowMeineWelt
          ? "Nimm ein Top-Thema oder schalte „Ganz persönlich“ ein. Dann stell Schulstufe und Textlänge ein — als Komödie, Detektivgeschichte oder Motivationsgeschichte."
          : "Nimm ein Top-Thema und stell Schulstufe und Textlänge ein — als Komödie, Detektivgeschichte oder Motivationsgeschichte."}
      </p>
      <div className="mt-10">
        <FreeStoryForm
          lengthCatalog={lengthCatalog}
          childProfiles={childProfiles}
          enabledFeatures={enabledFeatures}
          initialCredits={credits}
          onCreditsChange={setCredits}
        />
      </div>
    </>
  );
}
