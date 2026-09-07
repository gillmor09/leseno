/**
 * Live stage events while the story pipeline runs (admin wait overlay).
 */

export type StoryPipelineProgressModel = {
  roleLabel: string;
  modelId: string;
  modelLabel: string;
  modelSlug: string;
  provider: string;
};

export type StoryPipelineProgressStage =
  | "facts"
  | "story"
  | "images"
  | "story_and_images"
  | "layout"
  | "done";

export type StoryPipelineProgressEvent = {
  stage: StoryPipelineProgressStage;
  /** Short German stage title for the wait dialog. */
  label: string;
  models: StoryPipelineProgressModel[];
};

export type StoryPipelineProgressCallback = (
  event: StoryPipelineProgressEvent,
) => void;

/** Builds a progress model row from catalog AI config. */
export function progressModelFromConfig(
  roleLabel: string,
  model: {
    id: string;
    label: string;
    modelSlug: string;
    provider: string;
  },
): StoryPipelineProgressModel {
  return {
    roleLabel,
    modelId: model.id,
    modelLabel: model.label,
    modelSlug: model.modelSlug,
    provider: model.provider,
  };
}
