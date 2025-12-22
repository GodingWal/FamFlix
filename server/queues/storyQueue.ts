import { Queue } from "bullmq";
import { config } from "../config";
import { redisConnection } from "./connection";

export const STORY_QUEUE_NAME = "story_synthesize";

export const storyQueue = config.FEATURE_STORY_MODE && redisConnection 
  ? new Queue(STORY_QUEUE_NAME, {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    })
  : null;

export interface StorySynthesisJobData {
  storyId: string;
  voiceId: string;
  force?: boolean;
}

export function enqueueStorySynthesis(data: StorySynthesisJobData) {
  if (!storyQueue) {
    throw new Error("Story queue is not available. FEATURE_STORY_MODE must be enabled with Redis configured.");
  }
  return storyQueue.add("synthesize", data, {
    jobId: `${data.storyId}:${data.voiceId}`,
  });
}
