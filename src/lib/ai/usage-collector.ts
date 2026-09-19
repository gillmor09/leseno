/**
 * Server-only AsyncLocalStorage collector for AI token usage.
 */

import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { installAiUsageRecorder } from "@/lib/ai/usage-sink";
import {
  sumAiUsages,
  type AiTokenUsage,
} from "@/lib/ai/usage-types";

type UsageBag = {
  usages: AiTokenUsage[];
};

const usageAls = new AsyncLocalStorage<UsageBag>();

installAiUsageRecorder((usage) => {
  const bag = usageAls.getStore();
  if (!bag) return;
  bag.usages.push(usage);
});

/**
 * Run `fn` while collecting provider usage into one summed snapshot.
 */
export async function runWithAiUsageCollector<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; usage: AiTokenUsage | undefined }> {
  const bag: UsageBag = { usages: [] };
  const result = await usageAls.run(bag, fn);
  return { result, usage: sumAiUsages(bag.usages) };
}
