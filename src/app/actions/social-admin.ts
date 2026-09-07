"use server";

/**
 * Admin Social Media: global CRAFT settings + monthly day posts (Gemini + FLUX.2).
 */

import { revalidatePath } from "next/cache";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import {
  generateSocialCaption,
  generateSocialImage,
  refineSocialCaption,
} from "@/lib/social/generate";
import {
  ensureSocialMonth,
  getSocialGlobalSettings,
  listSocialPosts,
  upsertSocialGlobalSettings,
  upsertSocialPost,
} from "@/lib/social/repository";
import {
  craftFromGlobal,
  datesInYearMonth,
  type SocialGlobalSettings,
  type SocialPost,
} from "@/lib/social/types";
import type { ActionResult } from "@/lib/types/actions";
import {
  socialClearImageSchema,
  socialGenerateCaptionSchema,
  socialGenerateImageSchema,
  socialGlobalSettingsSchema,
  socialRefineCaptionSchema,
  socialSaveCaptionSchema,
  socialSetPublishedSchema,
  socialYearMonthSchema,
} from "@/lib/validations/social-admin";

function revalidateSocial() {
  revalidatePath("/admin/social-media");
}

export async function loadSocialMonthAction(
  input: unknown,
): Promise<
  ActionResult<{
    global: SocialGlobalSettings;
    posts: SocialPost[];
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = socialYearMonthSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Ungültiger Monat.",
    };
  }

  try {
    const [global, posts] = await Promise.all([
      getSocialGlobalSettings(),
      listSocialPosts(parsed.data.yearMonth),
    ]);
    return { success: true, data: { global, posts } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Laden fehlgeschlagen.",
    };
  }
}

export async function saveSocialGlobalSettingsAction(
  input: unknown,
): Promise<ActionResult> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = socialGlobalSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Angaben ungültig.",
    };
  }

  try {
    await upsertSocialGlobalSettings({
      ...parsed.data,
      updatedAt: null,
    });
    revalidateSocial();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Speichern fehlgeschlagen.",
    };
  }
}

export async function generateSocialCaptionAction(
  input: unknown,
): Promise<
  ActionResult<{ post: SocialPost; angleTitle: string; angleId: string }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = socialGenerateCaptionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Angaben ungültig.",
    };
  }

  const { yearMonth, postDate, channel } = parsed.data;
  const dates = datesInYearMonth(yearMonth);
  const dayIndex = dates.indexOf(postDate) + 1;
  if (dayIndex < 1) {
    return { success: false, error: "Datum passt nicht zum Monat." };
  }

  try {
    const global = await getSocialGlobalSettings();
    await ensureSocialMonth(yearMonth);
    const craft = craftFromGlobal(global);
    const { caption, angle } = await generateSocialCaption({
      storyline: global.storyline,
      craft,
      channel,
      postDate,
      dayIndex,
      daysInMonth: dates.length,
    });
    const post = await upsertSocialPost({
      yearMonth,
      postDate,
      channel,
      caption,
    });
    revalidateSocial();
    return {
      success: true,
      data: { post, angleTitle: angle.title, angleId: angle.id },
    };
  } catch (error) {
    console.error("[generateSocialCaptionAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Textgenerierung fehlgeschlagen.",
    };
  }
}

export async function refineSocialCaptionAction(
  input: unknown,
): Promise<ActionResult<{ post: SocialPost }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = socialRefineCaptionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Angaben ungültig.",
    };
  }

  try {
    const [global, posts] = await Promise.all([
      getSocialGlobalSettings(),
      listSocialPosts(parsed.data.yearMonth),
    ]);
    const existing = posts.find(
      (p) =>
        p.postDate === parsed.data.postDate &&
        p.channel === parsed.data.channel,
    );
    const currentCaption = existing?.caption?.trim() ?? "";
    if (!currentCaption) {
      return {
        success: false,
        error: "Kein Text zum Überarbeiten — zuerst generieren.",
      };
    }

    const craft = craftFromGlobal(global);
    const { caption } = await refineSocialCaption({
      storyline: global.storyline,
      craft,
      channel: parsed.data.channel,
      currentCaption,
      refineInstruction: parsed.data.refineInstruction,
      postDate: parsed.data.postDate,
    });
    const post = await upsertSocialPost({
      yearMonth: parsed.data.yearMonth,
      postDate: parsed.data.postDate,
      channel: parsed.data.channel,
      caption,
    });
    revalidateSocial();
    return { success: true, data: { post } };
  } catch (error) {
    console.error("[refineSocialCaptionAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Überarbeitung fehlgeschlagen.",
    };
  }
}

export async function saveSocialCaptionAction(
  input: unknown,
): Promise<ActionResult<{ post: SocialPost }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = socialSaveCaptionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Angaben ungültig.",
    };
  }

  try {
    const post = await upsertSocialPost({
      yearMonth: parsed.data.yearMonth,
      postDate: parsed.data.postDate,
      channel: parsed.data.channel,
      caption: parsed.data.caption,
    });
    revalidateSocial();
    return { success: true, data: { post } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Speichern fehlgeschlagen.",
    };
  }
}

export async function generateSocialImageAction(
  input: unknown,
): Promise<
  ActionResult<{
    post: SocialPost;
    promptUsed: string;
    sceneDescription: string;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = socialGenerateImageSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Angaben ungültig.",
    };
  }

  try {
    const global = await getSocialGlobalSettings();
    const posts = await listSocialPosts(parsed.data.yearMonth);
    const existing = posts.find(
      (p) =>
        p.postDate === parsed.data.postDate &&
        p.channel === parsed.data.channel,
    );
    const craft = craftFromGlobal(global);
    const { dataUrl, promptUsed, sceneDescription } = await generateSocialImage(
      {
        imagePromptTemplate: craft.imagePrompt,
        caption: existing?.caption ?? "",
        channel: parsed.data.channel,
        postDate: parsed.data.postDate,
        extraInstruction: parsed.data.extraInstruction,
      },
    );
    const post = await upsertSocialPost({
      yearMonth: parsed.data.yearMonth,
      postDate: parsed.data.postDate,
      channel: parsed.data.channel,
      imageDataUrl: dataUrl,
      lastImagePrompt: [
        "— Gemini Szene —",
        sceneDescription,
        "",
        "— FLUX Prompt —",
        promptUsed,
      ].join("\n"),
    });
    revalidateSocial();
    return {
      success: true,
      data: { post, promptUsed, sceneDescription },
    };
  } catch (error) {
    console.error("[generateSocialImageAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Bildgenerierung fehlgeschlagen.",
    };
  }
}

export async function clearSocialImageAction(
  input: unknown,
): Promise<ActionResult<{ post: SocialPost }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = socialClearImageSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Angaben ungültig.",
    };
  }

  try {
    const post = await upsertSocialPost({
      yearMonth: parsed.data.yearMonth,
      postDate: parsed.data.postDate,
      channel: parsed.data.channel,
      clearImage: true,
    });
    revalidateSocial();
    return { success: true, data: { post } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Bild löschen fehlgeschlagen.",
    };
  }
}

export async function setSocialPostPublishedAction(
  input: unknown,
): Promise<ActionResult<{ post: SocialPost }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = socialSetPublishedSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Angaben ungültig.",
    };
  }

  try {
    const post = await upsertSocialPost({
      yearMonth: parsed.data.yearMonth,
      postDate: parsed.data.postDate,
      channel: parsed.data.channel,
      published: parsed.data.published,
    });
    revalidateSocial();
    return { success: true, data: { post } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Veröffentlichungs-Status speichern fehlgeschlagen.",
    };
  }
}
