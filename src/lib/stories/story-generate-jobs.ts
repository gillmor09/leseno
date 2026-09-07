/**
 * In-memory story generation jobs for admin progress polling.
 * Single Coolify Node process; jobs expire after 15 minutes.
 */

import type { StoryPipelineProgressEvent } from "@/lib/ai/pipeline-progress";
import type { StoryGenerateActionData } from "@/lib/stories/story-generate-action-data";

const JOB_TTL_MS = 15 * 60 * 1000;

export type StoryGenerateJobStatus = "running" | "done" | "error";

export type StoryGenerateJobSnapshot = {
  status: StoryGenerateJobStatus;
  progress: StoryPipelineProgressEvent | null;
  data?: StoryGenerateActionData;
  error?: string;
};

type StoryGenerateJob = StoryGenerateJobSnapshot & {
  userId: string;
  createdAt: number;
};

const jobs = new Map<string, StoryGenerateJob>();

function pruneExpiredJobs(now = Date.now()): void {
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) {
      jobs.delete(id);
    }
  }
}

/** Creates a running job owned by `userId`. */
export function createStoryGenerateJob(userId: string): string {
  pruneExpiredJobs();
  const jobId = crypto.randomUUID();
  jobs.set(jobId, {
    userId,
    status: "running",
    progress: null,
    createdAt: Date.now(),
  });
  return jobId;
}

export function updateStoryGenerateJobProgress(
  jobId: string,
  progress: StoryPipelineProgressEvent,
): void {
  const job = jobs.get(jobId);
  if (!job || job.status !== "running") return;
  job.progress = progress;
}

export function completeStoryGenerateJob(
  jobId: string,
  data: StoryGenerateActionData,
): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = "done";
  job.data = data;
  job.progress = {
    stage: "done",
    label: "Fertig",
    models: job.progress?.models ?? [],
  };
}

export function failStoryGenerateJob(jobId: string, error: string): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = "error";
  job.error = error;
}

/**
 * Snapshot for the job owner. Returns null if missing or wrong user.
 */
export function getStoryGenerateJobSnapshot(
  jobId: string,
  userId: string,
): StoryGenerateJobSnapshot | null {
  pruneExpiredJobs();
  const job = jobs.get(jobId);
  if (!job || job.userId !== userId) return null;
  return {
    status: job.status,
    progress: job.progress,
    data: job.data,
    error: job.error,
  };
}
