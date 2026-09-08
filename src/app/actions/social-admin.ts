"use server";

/**
 * Admin Social Media: global CRAFT + single-post create/edit (date + Winkel).
 */

import { revalidatePath } from "next/cache";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import {
  generateSocialCaption,
  generateSocialImage,
  refineSocialCaption,
} from "@/lib/social/generate";
import { getMotivationAngleById } from "@/lib/social/motivation";
import {
  getSocialAngleUsage,
  getSocialGlobalSettings,
  listAllSocialPosts,
  upsertSocialGlobalSettings,
  upsertSocialPost,
} from "@/lib/social/repository";
import {
  craftFromGlobal,
  yearMonthFromPostDate,
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
} from "@/lib/validations/social-admin";

function revalidateSocial() {
  revalidatePath("/admin/social-media");
}

function findPost(
  posts: SocialPost[],
  postDate: string,
  channel: string,
): SocialPost | undefined {
  return posts.find(
    (post) => post.postDate === postDate && post.channel === channel,
  );
}

export async function loadSocialWorkspaceAction(): Promise<
  ActionResult<{
    global: SocialGlobalSettings;
    posts: SocialPost[];
    angleUsage: Record<string, number>;
  }>
> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  try {
    const [global, posts, angleUsage] = await Promise.all([
      getSocialGlobalSettings(),
      listAllSocialPosts(),
      getSocialAngleUsage(),
    ]);
    return { success: true, data: { global, posts, angleUsage } };
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

  const { postDate, channel, angleId } = parsed.data;
  if (!getMotivationAngleById(angleId)) {
    return { success: false, error: "Unbekannter Winkel." };
  }

  const yearMonth = yearMonthFromPostDate(postDate);

  try {
    const global = await getSocialGlobalSettings();
    const craft = craftFromGlobal(global);
    const { caption, angle } = await generateSocialCaption({
      storyline: global.storyline,
      craft,
      channel,
      postDate,
      angleId,
    });
    const post = await upsertSocialPost({
      yearMonth,
      postDate,
      channel,
      caption,
      angleId: angle.id,
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

  const yearMonth = yearMonthFromPostDate(parsed.data.postDate);

  try {
    const [global, posts] = await Promise.all([
      getSocialGlobalSettings(),
      listAllSocialPosts(),
    ]);
    const existing = findPost(
      posts,
      parsed.data.postDate,
      parsed.data.channel,
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
      angleId: existing?.angleId,
    });
    const post = await upsertSocialPost({
      yearMonth,
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
      yearMonth: yearMonthFromPostDate(parsed.data.postDate),
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

  const yearMonth = yearMonthFromPostDate(parsed.data.postDate);

  try {
    const [global, posts] = await Promise.all([
      getSocialGlobalSettings(),
      listAllSocialPosts(),
    ]);
    const existing = findPost(
      posts,
      parsed.data.postDate,
      parsed.data.channel,
    );
    const angleId = parsed.data.angleId ?? existing?.angleId ?? "";
    if (!getMotivationAngleById(angleId)) {
      return {
        success: false,
        error: "Winkel wählen (oder zuerst Text mit Winkel erzeugen).",
      };
    }

    const craft = craftFromGlobal(global);
    const { dataUrl, promptUsed, sceneDescription, angle } =
      await generateSocialImage({
        imagePromptTemplate: craft.imagePrompt,
        caption: existing?.caption ?? "",
        channel: parsed.data.channel,
        postDate: parsed.data.postDate,
        angleId,
        extraInstruction: parsed.data.extraInstruction,
      });
    const post = await upsertSocialPost({
      yearMonth,
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
      angleId: angle.id,
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
      yearMonth: yearMonthFromPostDate(parsed.data.postDate),
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
      yearMonth: yearMonthFromPostDate(parsed.data.postDate),
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
