"use server";

/**
 * Admin Social Media: global CRAFT + single-post create/edit (Winkel or marketing).
 */

import { revalidatePath } from "next/cache";
import { denyUnlessAdmin } from "@/lib/auth/require-admin";
import {
  generateSocialCaption,
  generateSocialFrageQuestion,
  generateSocialImage,
  refineSocialCaption,
} from "@/lib/social/generate";
import { isFrageAngleId } from "@/lib/social/frage";
import { getMarketingTopicByAngleId } from "@/lib/social/marketing-features";
import { getMotivationAngleById } from "@/lib/social/motivation";
import {
  getSocialAngleUsage,
  getSocialGlobalSettings,
  listAllSocialPosts,
  deleteSocialPost,
  upsertSocialGlobalSettings,
  upsertSocialPost,
} from "@/lib/social/repository";
import {
  craftFromGlobal,
  yearMonthFromPostDate,
  type SocialGlobalSettings,
  type SocialPost,
  type SocialPostKind,
} from "@/lib/social/types";
import type { ActionResult } from "@/lib/types/actions";
import {
  socialClearImageSchema,
  socialCommitPostSchema,
  socialDeletePostSchema,
  socialGenerateCaptionSchema,
  socialGenerateFrageSchema,
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
  angleId?: string | null,
  postKind?: SocialPostKind | null,
): SocialPost | undefined {
  const angle = angleId?.trim();
  const kind = postKind ?? "winkel";
  return posts.find((post) => {
    if (post.postDate !== postDate || post.channel !== channel) return false;
    if (post.postKind !== kind) return false;
    if (angle) return post.angleId === angle;
    return true;
  });
}

function assertTopicId(
  postKind: SocialPostKind,
  angleId: string,
): string | null {
  if (postKind === "marketing") {
    return getMarketingTopicByAngleId(angleId)
      ? null
      : "1–2 Funktionen für Marketing wählen.";
  }
  if (postKind === "frage") {
    return isFrageAngleId(angleId) ? null : "Frage-ID fehlt.";
  }
  return getMotivationAngleById(angleId) ? null : "Unbekannter Winkel.";
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
  ActionResult<{ caption: string; angleTitle: string; angleId: string }>
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

  const { postDate, channel, angleId, postKind, frageQuestion } = parsed.data;
  const topicError = assertTopicId(postKind, angleId);
  if (topicError) return { success: false, error: topicError };
  if (postKind === "frage" && !frageQuestion?.trim()) {
    return { success: false, error: "Frage fehlt — zuerst Frage erzeugen." };
  }

  try {
    const global = await getSocialGlobalSettings();
    const craft = craftFromGlobal(global);
    const { caption, topic } = await generateSocialCaption({
      storyline: global.storyline,
      craft,
      channel,
      postDate,
      angleId,
      postKind,
      frageQuestion,
    });
    // Draft only — DB write happens in commitSocialPostAction („Übernehmen“).
    return {
      success: true,
      data: {
        caption,
        angleTitle: topic.title,
        angleId: topic.id,
      },
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

/** Generates only the overlay question for Frage posts (before caption). */
export async function generateSocialFrageAction(
  input: unknown,
): Promise<ActionResult<{ question: string }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = socialGenerateFrageSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Angaben ungültig.",
    };
  }

  try {
    const global = await getSocialGlobalSettings();
    const { question } = await generateSocialFrageQuestion({
      storyline: global.storyline,
      postDate: parsed.data.postDate,
    });
    return { success: true, data: { question } };
  } catch (error) {
    console.error("[generateSocialFrageAction]", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Frage-Generierung fehlgeschlagen.",
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
      parsed.data.angleId,
      parsed.data.postKind,
    );
    const currentCaption = existing?.caption?.trim() ?? "";
    if (!currentCaption) {
      return {
        success: false,
        error: "Kein Text zum Überarbeiten — zuerst generieren.",
      };
    }

    const craft = craftFromGlobal(global);
    const { caption, topic } = await refineSocialCaption({
      storyline: global.storyline,
      craft,
      channel: parsed.data.channel,
      currentCaption,
      refineInstruction: parsed.data.refineInstruction,
      postDate: parsed.data.postDate,
      angleId: parsed.data.angleId,
      postKind: parsed.data.postKind,
    });
    const post = await upsertSocialPost({
      yearMonth,
      postDate: parsed.data.postDate,
      channel: parsed.data.channel,
      caption,
      angleId: topic.id,
      postKind: topic.postKind,
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
      angleId: parsed.data.angleId,
      postKind: parsed.data.postKind,
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
    imageDataUrl: string;
    lastImagePrompt: string;
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

  const topicError = assertTopicId(parsed.data.postKind, parsed.data.angleId);
  if (topicError) return { success: false, error: topicError };

  try {
    const [global, posts] = await Promise.all([
      getSocialGlobalSettings(),
      listAllSocialPosts(),
    ]);
    const existing = findPost(
      posts,
      parsed.data.postDate,
      parsed.data.channel,
      parsed.data.angleId,
      parsed.data.postKind,
    );

    const frageQuestion =
      parsed.data.frageQuestion?.trim() ||
      (parsed.data.postKind === "frage"
        ? existing?.lastImagePrompt?.trim()
        : "") ||
      "";

    if (parsed.data.postKind === "frage" && !frageQuestion) {
      return {
        success: false,
        error: "Frage fehlt — zuerst Frage erzeugen.",
      };
    }

    const caption =
      parsed.data.caption?.trim() || existing?.caption?.trim() || "";
    if (parsed.data.postKind !== "frage" && !caption) {
      return {
        success: false,
        error: "Kein Text für die Bildszene — zuerst Caption erzeugen.",
      };
    }

    const craft = craftFromGlobal(global);
    const { dataUrl, promptUsed, sceneDescription } = await generateSocialImage(
      {
        imagePromptTemplate: craft.imagePrompt,
        caption,
        channel: parsed.data.channel,
        postDate: parsed.data.postDate,
        angleId: parsed.data.angleId,
        postKind: parsed.data.postKind,
        extraInstruction: parsed.data.extraInstruction,
        frageQuestion,
      },
    );
    const lastImagePrompt =
      parsed.data.postKind === "frage"
        ? frageQuestion
        : [
            "— Gemini Szene —",
            sceneDescription,
            "",
            "— FLUX Prompt —",
            promptUsed,
          ].join("\n");
    // Draft only — DB write happens in commitSocialPostAction („Übernehmen“).
    return {
      success: true,
      data: {
        imageDataUrl: dataUrl,
        lastImagePrompt,
        promptUsed,
        sceneDescription,
      },
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

/**
 * Persists the create-form draft. Called only from „Übernehmen und zurücksetzen“.
 */
export async function commitSocialPostAction(
  input: unknown,
): Promise<ActionResult<{ post: SocialPost }>> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = socialCommitPostSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Angaben ungültig.",
    };
  }

  const topicError = assertTopicId(parsed.data.postKind, parsed.data.angleId);
  if (topicError) return { success: false, error: topicError };

  try {
    const lastImagePrompt =
      parsed.data.postKind === "frage"
        ? (parsed.data.frageQuestion?.trim() ||
            parsed.data.lastImagePrompt?.trim() ||
            null)
        : (parsed.data.lastImagePrompt ?? null);

    if (parsed.data.postKind === "frage" && !lastImagePrompt) {
      return {
        success: false,
        error: "Frage fehlt — zuerst Frage erzeugen.",
      };
    }

    const post = await upsertSocialPost({
      yearMonth: yearMonthFromPostDate(parsed.data.postDate),
      postDate: parsed.data.postDate,
      channel: parsed.data.channel,
      caption: parsed.data.caption,
      imageDataUrl: parsed.data.imageDataUrl ?? null,
      lastImagePrompt,
      angleId: parsed.data.angleId,
      postKind: parsed.data.postKind,
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
      angleId: parsed.data.angleId,
      postKind: parsed.data.postKind,
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
      angleId: parsed.data.angleId,
      postKind: parsed.data.postKind,
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

export async function deleteSocialPostAction(
  input: unknown,
): Promise<ActionResult> {
  const denied = await denyUnlessAdmin();
  if (denied) return { success: false, error: denied };

  const parsed = socialDeletePostSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Angaben ungültig.",
    };
  }

  try {
    await deleteSocialPost(parsed.data.postId);
    revalidateSocial();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Löschen fehlgeschlagen.",
    };
  }
}
