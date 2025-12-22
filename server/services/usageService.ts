import { db } from "../db";
import { usageTracking, voiceProfiles, users } from "../db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import {
  type SubscriptionPlan,
  getPlanLimits,
  canCreateVideo,
  canCreateStory,
  canCreateVoiceClone,
  getRemainingVideos,
  getRemainingStories,
  getRemainingVoiceClones
} from "@shared/subscriptions";
import { logger } from "../utils/logger-simple";

function getCurrentPeriodDates(): { periodStart: Date; periodEnd: Date } {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { periodStart, periodEnd };
}

async function getOrCreateUsageRecord(userId: string): Promise<{
  id: string;
  videosCreated: number;
  storiesCreated: number;
}> {
  const { periodStart, periodEnd } = getCurrentPeriodDates();

  const existing = await db
    .select()
    .from(usageTracking)
    .where(
      and(
        eq(usageTracking.userId, userId),
        gte(usageTracking.periodStart, periodStart),
        lte(usageTracking.periodEnd, periodEnd)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return {
      id: existing[0].id,
      videosCreated: existing[0].videosCreated,
      storiesCreated: existing[0].storiesCreated,
    };
  }

  const [newRecord] = await db
    .insert(usageTracking)
    .values({
      userId,
      periodStart,
      periodEnd,
      videosCreated: 0,
      storiesCreated: 0,
    })
    .returning();

  return {
    id: newRecord.id,
    videosCreated: 0,
    storiesCreated: 0,
  };
}

async function getVoiceCloneCount(userId: string): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(voiceProfiles)
    .where(eq(voiceProfiles.userId, userId));

  return Number(result[0]?.count || 0);
}

async function getUserPlan(userId: string): Promise<SubscriptionPlan> {
  const user = await db
    .select({ plan: users.plan })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return (user[0]?.plan as SubscriptionPlan) || "free";
}

export interface UsageStatus {
  plan: SubscriptionPlan;
  videosCreated: number;
  storiesCreated: number;
  voiceClones: number;
  limits: {
    videosPerMonth: number;
    storiesPerMonth: number;
    voiceClones: number;
    showAds: boolean;
  };
  remaining: {
    videos: number | 'unlimited';
    stories: number | 'unlimited';
    voiceClones: number;
  };
  canCreate: {
    video: boolean;
    story: boolean;
    voiceClone: boolean;
  };
}

class UsageService {
  async getUsageStatus(userId: string): Promise<UsageStatus> {
    const [plan, usage, voiceCloneCount] = await Promise.all([
      getUserPlan(userId),
      getOrCreateUsageRecord(userId),
      getVoiceCloneCount(userId),
    ]);

    const limits = getPlanLimits(plan);

    return {
      plan,
      videosCreated: usage.videosCreated,
      storiesCreated: usage.storiesCreated,
      voiceClones: voiceCloneCount,
      limits: {
        videosPerMonth: limits.videosPerMonth,
        storiesPerMonth: limits.storiesPerMonth,
        voiceClones: limits.voiceClones,
        showAds: limits.showAds,
      },
      remaining: {
        videos: getRemainingVideos(plan, usage.videosCreated),
        stories: getRemainingStories(plan, usage.storiesCreated),
        voiceClones: getRemainingVoiceClones(plan, voiceCloneCount),
      },
      canCreate: {
        video: canCreateVideo(plan, usage.videosCreated),
        story: canCreateStory(plan, usage.storiesCreated),
        voiceClone: canCreateVoiceClone(plan, voiceCloneCount),
      },
    };
  }

  async checkVideoLimit(userId: string): Promise<{ allowed: boolean; message?: string }> {
    const status = await this.getUsageStatus(userId);

    if (!status.canCreate.video) {
      const limit = status.limits.videosPerMonth;
      return {
        allowed: false,
        message: `You've reached your monthly limit of ${limit} videos. Upgrade your plan for more.`,
      };
    }

    return { allowed: true };
  }

  async checkStoryLimit(userId: string): Promise<{ allowed: boolean; message?: string }> {
    const status = await this.getUsageStatus(userId);

    if (!status.canCreate.story) {
      const limit = status.limits.storiesPerMonth;
      return {
        allowed: false,
        message: `You've reached your monthly limit of ${limit} stories. Upgrade your plan for more.`,
      };
    }

    return { allowed: true };
  }

  async checkVoiceCloneLimit(userId: string): Promise<{ allowed: boolean; message?: string }> {
    const status = await this.getUsageStatus(userId);

    if (!status.canCreate.voiceClone) {
      const limit = status.limits.voiceClones;
      return {
        allowed: false,
        message: `You've reached your limit of ${limit} voice clones. Upgrade your plan for more.`,
      };
    }

    return { allowed: true };
  }

  async incrementVideoCount(userId: string): Promise<void> {
    const { periodStart, periodEnd } = getCurrentPeriodDates();

    await db
      .insert(usageTracking)
      .values({
        userId,
        periodStart,
        periodEnd,
        videosCreated: 1,
        storiesCreated: 0,
      })
      .onConflictDoUpdate({
        target: [usageTracking.userId, usageTracking.periodStart],
        set: {
          videosCreated: sql`${usageTracking.videosCreated} + 1`,
          updatedAt: new Date(),
        },
      });

    logger.info("Incremented video count for user", { userId });
  }

  async incrementStoryCount(userId: string): Promise<void> {
    const { periodStart, periodEnd } = getCurrentPeriodDates();

    await db
      .insert(usageTracking)
      .values({
        userId,
        periodStart,
        periodEnd,
        videosCreated: 0,
        storiesCreated: 1,
      })
      .onConflictDoUpdate({
        target: [usageTracking.userId, usageTracking.periodStart],
        set: {
          storiesCreated: sql`${usageTracking.storiesCreated} + 1`,
          updatedAt: new Date(),
        },
      });

    logger.info("Incremented story count for user", { userId });
  }

  async shouldShowAds(userId: string): Promise<boolean> {
    const plan = await getUserPlan(userId);
    const limits = getPlanLimits(plan);
    return limits.showAds;
  }
}

export const usageService = new UsageService();
