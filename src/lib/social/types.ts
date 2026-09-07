/**
 * Social Media admin types.
 * Global CRAFT: storyline, role, format, action, imagePrompt (style for Gemini → FLUX).
 * Posts: Instagram calendar only (channel column remains `instagram` in DB).
 */

export const SOCIAL_CHANNELS = ["instagram"] as const;
export type SocialChannel = (typeof SOCIAL_CHANNELS)[number];

export const SOCIAL_CHANNEL_LABELS: Record<SocialChannel, string> = {
  instagram: "Instagram",
};

export type SocialGlobalSettings = {
  storyline: string;
  role: string;
  format: string;
  action: string;
  imagePrompt: string;
  updatedAt: string | null;
};

export type SocialPost = {
  id: string;
  yearMonth: string;
  postDate: string;
  channel: SocialChannel;
  caption: string;
  imageDataUrl: string | null;
  lastImagePrompt: string | null;
  published: boolean;
  updatedAt: string;
};

/** CRAFT bundle passed into prompt builders. */
export type SocialChannelCraft = {
  role: string;
  format: string;
  action: string;
  imagePrompt: string;
};

export function isSocialChannel(value: string): value is SocialChannel {
  return (SOCIAL_CHANNELS as readonly string[]).includes(value);
}

export function datesInYearMonth(yearMonth: string): string[] {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!match) return [];
  const year = Number(match[1]);
  const month = Number(match[2]);
  const count = new Date(year, month, 0).getDate();
  const dates: string[] = [];
  for (let day = 1; day <= count; day += 1) {
    dates.push(`${yearMonth}-${String(day).padStart(2, "0")}`);
  }
  return dates;
}

export function emptyGlobalSettings(): SocialGlobalSettings {
  return {
    storyline: "",
    role: "",
    format: "",
    action: "",
    imagePrompt: "",
    updatedAt: null,
  };
}

export function craftFromGlobal(
  global: SocialGlobalSettings,
): SocialChannelCraft {
  return {
    role: global.role,
    format: global.format,
    action: global.action,
    imagePrompt: global.imagePrompt,
  };
}

/** @deprecated Prefer craftFromGlobal — Instagram is the only channel. */
export function craftForChannel(
  global: SocialGlobalSettings,
  _channel?: SocialChannel,
): SocialChannelCraft {
  return craftFromGlobal(global);
}
