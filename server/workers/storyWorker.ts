import { Worker } from "bullmq";

import { config } from "../config";
import { redisConnection } from "../queues/connection";
import { STORY_QUEUE_NAME, StorySynthesisJobData } from "../queues/storyQueue";
import { storage } from "../storage";
import { getTTSProvider } from "../tts";

const concurrency = config.STORY_WORKER_CONCURRENCY ?? 2;

function createStoryWorker() {
  if (!config.FEATURE_STORY_MODE || !redisConnection) {
    return null;
  }

  return new Worker<StorySynthesisJobData>(
    STORY_QUEUE_NAME,
    async (job) => {
      const { storyId, voiceId, force = false } = job.data;

      const story = await storage.getStory(storyId);
      if (!story) {
        throw new Error(`Story ${storyId} not found`);
      }

      const voice = await storage.getVoiceProfile(voiceId);
      if (!voice) {
        throw new Error(`Voice profile ${voiceId} not found`);
      }

      if (!voice.providerRef) {
        throw new Error(`Voice profile ${voiceId} does not have a provider reference`);
      }

      const defaultProviderKey = voice.provider ?? config.TTS_PROVIDER;

      const sections = await storage.getStorySections(storyId);
      if (sections.length === 0) {
        throw new Error(`Story ${storyId} has no sections to synthesize`);
      }

      const existingAudio = await storage.getStoryAudioForVoice(storyId, voiceId);
      const audioMap = new Map(existingAudio.map((audio) => [audio.sectionId, audio]));

      let completed = 0;

      for (const section of sections) {
        await job.updateProgress(Math.round((completed / sections.length) * 100));

        const currentAudio = audioMap.get(section.id);
        if (!force && currentAudio && currentAudio.status === "COMPLETE" && currentAudio.audioUrl) {
          completed += 1;
          continue;
        }

        const provider = getTTSProvider(defaultProviderKey);

        await storage.upsertStoryAudio(section.id, voiceId, {
          status: "PROCESSING",
          startedAt: new Date(),
        });

        try {
          const sectionAny = section as any;
          const result = await provider.synthesize({
            text: section.text,
            voiceRef: voice.providerRef,
            modelId: voice.modelId ?? undefined,
            storyId,
            sectionId: section.id,
            metadata: {
              sectionType: section.sectionType,
              emotion: sectionAny.emotion ?? undefined,
              pace: sectionAny.pace ?? undefined,
            },
          });

          const resultAny = result as any;
          await storage.upsertStoryAudio(section.id, voiceId, {
            status: "COMPLETE",
            audioUrl: resultAny.audioUrl ?? resultAny.url,
            duration: resultAny.duration ?? resultAny.audioDuration,
            completedAt: new Date(),
            error: null,
          } as any);
        } catch (sectionError) {
          await storage.upsertStoryAudio(section.id, voiceId, {
            status: "ERROR",
            completedAt: new Date(),
            error: sectionError instanceof Error ? sectionError.message : "Unknown error",
          } as any);
          throw sectionError;
        }

        completed += 1;
      }

      await storage.updateStory(storyId, {
        status: "COMPLETE",
        updatedAt: new Date(),
        metadata: {
          ...(typeof story.metadata === "object" && story.metadata !== null
            ? story.metadata
            : {}),
          lastVoiceId: voiceId,
          lastSynthesizedAt: new Date().toISOString(),
        },
      } as any);

      return { success: true, sectionsProcessed: sections.length };
    },
    {
      connection: redisConnection,
      concurrency,
    }
  );
}

export const storyWorker = createStoryWorker();

if (storyWorker) {
  storyWorker.on("failed", async (job, err) => {
    console.error(`Story job ${job?.id} failed:`, err);
    if (job) {
      const { storyId } = job.data;
      await storage.updateStory(storyId, {
        status: "ERROR",
        metadata: {
          error: err.message,
        },
      } as any);
    }
  });
}
