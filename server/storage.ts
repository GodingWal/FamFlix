// Dynamic schema for common tables (works for both SQLite and Postgres)
import {
  users, families, familyMembers, videos, voiceProfiles, voiceGenerations,
  collaborationSessions, activityLogs, emailVerificationTokens, passwordResetTokens,
  adPreferences, stories, storySections, storyAudio, storyNarrations,
  type User, type InsertUser, type Family, type InsertFamily,
  type Video, type InsertVideo, type VoiceProfile, type InsertVoiceProfile,
  type VoiceGeneration, type InsertVoiceGeneration,
  type CollaborationSession, type InsertCollaborationSession,
  type ActivityLog, type InsertActivityLog,
  type EmailVerificationToken, type InsertEmailVerificationToken,
  type PasswordResetToken, type InsertPasswordResetToken,
  type AdPreference, type InsertAdPreference,
  type Story, type InsertStory, type StorySection, type InsertStorySection,
  type StoryAudio, type InsertStoryAudio, type StoryNarration, type InsertStoryNarration,
  type StoryJobStatus, type StoryCategory, type RightsStatus,
  songTemplates, type SongTemplate,
} from "./db/schema";

// SQLite-only tables (not yet available in Postgres schema)
import {
  marketingLeads,
  type MarketingLead, type InsertMarketingLead,
} from "@shared/schema-sqlite";
import { db } from "./db";
import { eq, and, desc, or, inArray, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

export interface IStorage {
  // User management
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<InsertUser>): Promise<User>;
  markUserEmailVerified(userId: string): Promise<User>;
  deleteEmailVerificationTokensForUser(userId: string): Promise<void>;

  // Token management
  createEmailVerificationToken(token: InsertEmailVerificationToken): Promise<EmailVerificationToken>;
  getEmailVerificationToken(token: string): Promise<EmailVerificationToken | undefined>;
  deleteEmailVerificationToken(token: string): Promise<void>;
  createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken>;
  getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined>;
  deletePasswordResetToken(token: string): Promise<void>;
  deletePasswordResetTokensForUser(userId: string): Promise<void>;

  // Family management
  getFamily(id: string): Promise<Family | undefined>;
  getFamiliesByUser(userId: string): Promise<Family[]>;
  createFamily(family: InsertFamily): Promise<Family>;
  updateFamily(id: string, updates: Partial<InsertFamily>): Promise<Family>;
  addFamilyMember(familyId: string, userId: string, role?: string): Promise<void>;
  removeFamilyMember(familyId: string, userId: string): Promise<void>;
  getFamilyMembers(familyId: string): Promise<User[]>;

  // Video management
  getVideo(id: string): Promise<Video | undefined>;
  getVideosByFamily(familyId: string): Promise<Video[]>;
  getVideosByUser(userId: string): Promise<Video[]>;
  createVideo(video: InsertVideo): Promise<Video>;
  updateVideo(id: string, updates: Partial<InsertVideo>): Promise<Video>;
  deleteVideo(id: string): Promise<void>;

  // Voice profile management
  getVoiceProfile(id: string): Promise<VoiceProfile | undefined>;
  getVoiceProfilesByFamily(familyId: string): Promise<VoiceProfile[]>;
  getVoiceProfilesByUser(userId: string): Promise<VoiceProfile[]>;
  createVoiceProfile(profile: InsertVoiceProfile): Promise<VoiceProfile>;
  updateVoiceProfile(id: string, updates: Partial<InsertVoiceProfile>): Promise<VoiceProfile>;
  deleteVoiceProfile(id: string): Promise<void>;

  // Voice generation management
  getVoiceGeneration(id: string): Promise<VoiceGeneration | undefined>;
  getVoiceGenerationsByProfile(profileId: string): Promise<VoiceGeneration[]>;
  createVoiceGeneration(generation: InsertVoiceGeneration): Promise<VoiceGeneration>;
  updateVoiceGeneration(id: string, updates: Partial<InsertVoiceGeneration>): Promise<VoiceGeneration>;

  // Collaboration management
  getActiveCollaborators(videoId: string): Promise<CollaborationSession[]>;
  createCollaborationSession(session: InsertCollaborationSession): Promise<CollaborationSession>;
  updateCollaborationSession(id: string, updates: Partial<InsertCollaborationSession>): Promise<CollaborationSession>;
  endCollaborationSession(id: string): Promise<void>;

  // Activity logging
  logActivity(activity: InsertActivityLog): Promise<ActivityLog>;
  getRecentActivities(familyId: string, limit?: number): Promise<ActivityLog[]>;

  // Story management
  getStory(id: string): Promise<Story | undefined>;
  getStoriesForUser(userId: string, options?: { category?: string }): Promise<Story[]>;
  searchStories(filters?: StorySearchFilters): Promise<{ items: Story[]; total: number }>;
  createStory(story: InsertStory): Promise<Story>;
  updateStory(id: string, updates: Partial<InsertStory>): Promise<Story>;
  deleteStory(id: string): Promise<void>;
  getStoryBySlug(slug: string): Promise<Story | undefined>;
  replaceStorySections(storyId: string, sections: InsertStorySection[]): Promise<void>;
  getStorySections(storyId: string): Promise<StorySection[]>;
  upsertStoryAudio(
    sectionId: string,
    voiceId: string,
    updates: Partial<InsertStoryAudio> & { status: StoryJobStatus }
  ): Promise<StoryAudio>;
  getStoryAudioForVoice(storyId: string, voiceId: string): Promise<StoryAudio[]>;
  getStoryAudioByAudioUrl(audioUrl: string): Promise<StoryAudio | undefined>;

  // Story narration management
  createStoryNarration(narration: InsertStoryNarration): Promise<StoryNarration>;
  updateStoryNarration(id: string, updates: Partial<InsertStoryNarration>): Promise<StoryNarration>;
  deleteStoryNarrations(storyId: string): Promise<void>;
  getStoryNarrations(storyId: string): Promise<StoryNarration[]>;
  getStoryNarrationByAudioFileName(filename: string): Promise<StoryNarration | undefined>;

  // Audio helpers
  getVoiceGenerationByAudioUrl(audioUrl: string): Promise<VoiceGeneration | undefined>;

  // Ad preferences
  getAdPreference(userId: string, placementId: string): Promise<AdPreference | undefined>;
  upsertAdPreference(
    userId: string,
    placementId: string,
    updates: Partial<Omit<InsertAdPreference, "userId" | "placementId">>
  ): Promise<AdPreference>;
  // Song Templates
  getSongTemplate(id: string): Promise<SongTemplate | undefined>;
}

interface StorySearchFilters {
  query?: string;
  category?: StoryCategory;
  rights?: RightsStatus[];
  ageMin?: number;
  ageMax?: number;
  requireSlug?: boolean;
  limit?: number;
  offset?: number;
}

export class DatabaseStorage implements IStorage {
  private readonly IS_SQLITE = (process.env.DATABASE_URL || '').startsWith('file:');
  private readonly JSON_STRINGIFY_SPACES = undefined;

  private formatJson<T>(value: T | undefined): T | string | undefined {
    if (value === undefined || value === null) {
      return value;
    }

    if (this.IS_SQLITE) {
      if (typeof value === 'string') {
        return value;
      }
      try {
        return JSON.stringify(value, null, this.JSON_STRINGIFY_SPACES);
      } catch (error) {
        console.warn('[storage] Failed to stringify metadata payload:', error);
        return JSON.stringify({});
      }
    }

    return value;
  }

  private formatTags(value: InsertStory['tags']): InsertStory['tags'] {
    if (this.IS_SQLITE) {
      if (typeof value === 'string') {
        return value;
      }
      try {
        return JSON.stringify(value ?? []);
      } catch {
        return '[]';
      }
    }
    return value;
  }
  // User management
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values({
      ...insertUser,
      plan: insertUser.plan ?? "free",
    }).returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async markUserEmailVerified(userId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async deleteEmailVerificationTokensForUser(userId: string): Promise<void> {
    await db
      .delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, userId));
  }

  async createEmailVerificationToken(
    insertToken: InsertEmailVerificationToken
  ): Promise<EmailVerificationToken> {
    await this.deleteEmailVerificationTokensForUser(insertToken.userId);
    const [token] = await db
      .insert(emailVerificationTokens)
      .values(insertToken)
      .returning();
    return token;
  }

  async getEmailVerificationToken(tokenValue: string): Promise<EmailVerificationToken | undefined> {
    const [token] = await db
      .select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.token, tokenValue));
    return token || undefined;
  }

  async deleteEmailVerificationToken(tokenValue: string): Promise<void> {
    await db
      .delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.token, tokenValue));
  }

  async createPasswordResetToken(
    insertToken: InsertPasswordResetToken
  ): Promise<PasswordResetToken> {
    await this.deletePasswordResetTokensForUser(insertToken.userId);
    const [token] = await db
      .insert(passwordResetTokens)
      .values(insertToken)
      .returning();
    return token;
  }

  async getPasswordResetToken(tokenValue: string): Promise<PasswordResetToken | undefined> {
    const [token] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, tokenValue));
    return token || undefined;
  }

  async deletePasswordResetToken(tokenValue: string): Promise<void> {
    await db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.token, tokenValue));
  }

  async deletePasswordResetTokensForUser(userId: string): Promise<void> {
    await db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId));
  }

  // Family management
  async getFamily(id: string): Promise<Family | undefined> {
    const [family] = await db.select().from(families).where(eq(families.id, id));
    return family || undefined;
  }

  async getFamiliesByUser(userId: string): Promise<Family[]> {
    const result = await db
      .select({
        id: families.id,
        name: families.name,
        description: families.description,
        ownerId: families.ownerId,
        createdAt: families.createdAt,
        updatedAt: families.updatedAt
      })
      .from(families)
      .innerJoin(familyMembers, eq(families.id, familyMembers.familyId))
      .where(eq(familyMembers.userId, userId));
    return result;
  }

  async createFamily(insertFamily: InsertFamily): Promise<Family> {
    const [family] = await db.insert(families).values(insertFamily).returning();

    // Add owner as a member
    await db.insert(familyMembers).values({
      familyId: family.id,
      userId: family.ownerId,
      role: "owner",
    });

    return family;
  }

  async updateFamily(id: string, updates: Partial<InsertFamily>): Promise<Family> {
    const [family] = await db
      .update(families)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(families.id, id))
      .returning();
    return family;
  }

  async addFamilyMember(familyId: string, userId: string, role = "member"): Promise<void> {
    await db.insert(familyMembers).values({
      familyId,
      userId,
      role,
    });
  }

  async removeFamilyMember(familyId: string, userId: string): Promise<void> {
    await db
      .delete(familyMembers)
      .where(and(
        eq(familyMembers.familyId, familyId),
        eq(familyMembers.userId, userId)
      ));
  }

  async getFamilyMembers(familyId: string): Promise<User[]> {
    const result = await db
      .select()
      .from(users)
      .innerJoin(familyMembers, eq(users.id, familyMembers.userId))
      .where(eq(familyMembers.familyId, familyId));

    return result.map((row: { users: User }) => row.users);
  }

  // Video management
  async getVideo(id: string): Promise<Video | undefined> {
    const [video] = await db.select().from(videos).where(eq(videos.id, id));
    return video || undefined;
  }

  async getVideosByFamily(familyId: string): Promise<Video[]> {
    return await db
      .select()
      .from(videos)
      .where(and(eq(videos.familyId, familyId), eq(videos.type, "user_project")))
      .orderBy(desc(videos.updatedAt));
  }

  async getVideosByUser(userId: string): Promise<Video[]> {
    return await db
      .select()
      .from(videos)
      .where(and(eq(videos.createdBy, userId), eq(videos.type, "user_project")))
      .orderBy(desc(videos.updatedAt));
  }

  async createVideo(insertVideo: InsertVideo): Promise<Video> {
    const [video] = await db.insert(videos).values(insertVideo).returning();
    return video;
  }

  async updateVideo(id: string, updates: Partial<InsertVideo>): Promise<Video> {
    const [video] = await db
      .update(videos)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(videos.id, id))
      .returning();
    return video;
  }

  async deleteVideo(id: string): Promise<void> {
    await db.delete(videos).where(eq(videos.id, id));
  }

  // Admin-provided videos (for users to select from)
  async getAdminProvidedVideos(): Promise<Video[]> {
    return await db
      .select()
      .from(videos)
      .where(eq(videos.type, "admin_provided"))
      .orderBy(desc(videos.createdAt));
  }

  async createAdminProvidedVideo(insertVideo: Omit<InsertVideo, 'type'>): Promise<Video> {
    const [video] = await db.insert(videos).values({
      ...insertVideo,
      type: "admin_provided"
    }).returning();
    return video;
  }

  async createUserProject(insertVideo: Omit<InsertVideo, 'type'>): Promise<Video> {
    const [video] = await db.insert(videos).values({
      ...insertVideo,
      type: "user_project"
    }).returning();
    return video;
  }

  // Voice profile management
  async getVoiceProfile(id: string): Promise<VoiceProfile | undefined> {
    const [profile] = await db.select().from(voiceProfiles).where(eq(voiceProfiles.id, id));
    return profile || undefined;
  }

  async getVoiceProfilesByFamily(familyId: string): Promise<VoiceProfile[]> {
    return await db
      .select()
      .from(voiceProfiles)
      .where(eq(voiceProfiles.familyId, familyId))
      .orderBy(desc(voiceProfiles.updatedAt));
  }

  async getVoiceProfilesByUser(userId: string): Promise<VoiceProfile[]> {
    return await db
      .select()
      .from(voiceProfiles)
      .where(eq(voiceProfiles.userId, userId))
      .orderBy(desc(voiceProfiles.updatedAt));
  }

  async createVoiceProfile(insertProfile: InsertVoiceProfile): Promise<VoiceProfile> {
    const [profile] = await db.insert(voiceProfiles).values(insertProfile).returning();
    return profile;
  }

  async updateVoiceProfile(id: string, updates: Partial<InsertVoiceProfile>): Promise<VoiceProfile> {
    const [profile] = await db
      .update(voiceProfiles)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(voiceProfiles.id, id))
      .returning();
    return profile;
  }

  async deleteVoiceProfile(id: string): Promise<void> {
    // First delete all voice generations for this profile
    await db.delete(voiceGenerations).where(eq(voiceGenerations.voiceProfileId, id));
    // Then delete the voice profile
    await db.delete(voiceProfiles).where(eq(voiceProfiles.id, id));
  }

  // Voice generation management
  async getVoiceGeneration(id: string): Promise<VoiceGeneration | undefined> {
    const [generation] = await db.select().from(voiceGenerations).where(eq(voiceGenerations.id, id));
    return generation || undefined;
  }

  async getVoiceGenerationsByProfile(profileId: string): Promise<VoiceGeneration[]> {
    return await db
      .select()
      .from(voiceGenerations)
      .where(eq(voiceGenerations.voiceProfileId, profileId))
      .orderBy(desc(voiceGenerations.createdAt));
  }

  async getVoiceGenerationByAudioUrl(audioUrl: string): Promise<VoiceGeneration | undefined> {
    const [generation] = await db
      .select()
      .from(voiceGenerations)
      .where(eq(voiceGenerations.audioUrl, audioUrl));
    return generation || undefined;
  }

  async getAdPreference(userId: string, placementId: string): Promise<AdPreference | undefined> {
    const [preference] = await db
      .select()
      .from(adPreferences)
      .where(and(eq(adPreferences.userId, userId), eq(adPreferences.placementId, placementId)));

    return preference || undefined;
  }

  async upsertAdPreference(
    userId: string,
    placementId: string,
    updates: Partial<Omit<InsertAdPreference, "userId" | "placementId">>
  ): Promise<AdPreference> {
    const existing = await this.getAdPreference(userId, placementId);
    const now = new Date();

    const updatePayload: Partial<typeof adPreferences.$inferInsert> = {
      ...updates,
      updatedAt: now,
    };

    if (updates.lastImpressionAt !== undefined) {
      updatePayload.lastImpressionAt = updates.lastImpressionAt;
    }

    if (existing) {
      const [updated] = await db
        .update(adPreferences)
        .set(updatePayload)
        .where(and(eq(adPreferences.userId, userId), eq(adPreferences.placementId, placementId)))
        .returning();

      return updated;
    }

    const [created] = await db
      .insert(adPreferences)
      .values({
        userId,
        placementId,
        optOut: updates.optOut ?? false,
        dailyCap: updates.dailyCap ?? 5,
        dailyImpressions: updates.dailyImpressions ?? 0,
        lastImpressionAt: updates.lastImpressionAt ?? null,
      } satisfies InsertAdPreference)
      .returning();

    return created;
  }

  async createVoiceGeneration(insertGeneration: InsertVoiceGeneration): Promise<VoiceGeneration> {
    const [generation] = await db.insert(voiceGenerations).values(insertGeneration).returning();
    return generation;
  }

  async updateVoiceGeneration(id: string, updates: Partial<InsertVoiceGeneration>): Promise<VoiceGeneration> {
    const [generation] = await db
      .update(voiceGenerations)
      .set(updates)
      .where(eq(voiceGenerations.id, id))
      .returning();
    return generation;
  }

  // Story management
  async getStory(id: string): Promise<Story | undefined> {
    const [story] = await db.select().from(stories).where(eq(stories.id, id));
    return story || undefined;
  }

  async getStoriesForUser(userId: string, options: { category?: string } = {}): Promise<Story[]> {
    const memberships = await db
      .select({ familyId: familyMembers.familyId })
      .from(familyMembers)
      .where(eq(familyMembers.userId, userId)) as { familyId: string | null }[];

    const familyIds = memberships
      .map((membership: { familyId: string | null }) => membership.familyId)
      .filter((id: string | null): id is string => typeof id === 'string');
    const conditions = [eq(stories.createdBy, userId)];

    if (familyIds.length > 0) {
      conditions.push(inArray(stories.familyId, familyIds));
    }

    const baseCondition = conditions.length === 1 ? conditions[0] : or(...conditions);
    const whereClause = options.category
      ? and(baseCondition, eq(stories.category, options.category))
      : baseCondition;

    return await db
      .select()
      .from(stories)
      .where(whereClause)
      .orderBy(desc(stories.updatedAt));
  }

  async searchStories(filters: StorySearchFilters = {}): Promise<{ items: Story[]; total: number }> {
    const limit = Math.min(Math.max(Number.isFinite(filters.limit ?? NaN) ? Math.trunc(filters.limit!) : 20, 1), 100);
    const offset = Math.max(Number.isFinite(filters.offset ?? NaN) ? Math.trunc(filters.offset!) : 0, 0);

    const conditions: SQL<unknown>[] = [];

    if (filters.category) {
      const normalizedCategory = (filters.category as string).trim().toUpperCase() as StoryCategory;
      conditions.push(eq(stories.category, normalizedCategory));
    }

    if (filters.rights && filters.rights.length > 0) {
      const normalizedRights = filters.rights.map((item) => item.toUpperCase()) as RightsStatus[];
      conditions.push(inArray(stories.rights, normalizedRights));
    }

    const ageMin = filters.ageMin;
    if (typeof ageMin === 'number' && !Number.isNaN(ageMin)) {
      conditions.push(sql`(${stories.ageMax} IS NULL OR ${stories.ageMax} >= ${ageMin})`);
    }

    const ageMax = filters.ageMax;
    if (typeof ageMax === 'number' && !Number.isNaN(ageMax)) {
      conditions.push(sql`(${stories.ageMin} IS NULL OR ${stories.ageMin} <= ${ageMax})`);
    }

    if (filters.requireSlug) {
      conditions.push(sql`${stories.slug} IS NOT NULL AND ${stories.slug} != ''`);
    }

    if (filters.query && filters.query.trim() !== '') {
      const normalizedQuery = `%${filters.query.trim().toLowerCase()}%`;
      const lowerMatch = sql`lower(${stories.title}) LIKE ${normalizedQuery}
        OR lower(${stories.summary}) LIKE ${normalizedQuery}
        OR lower(${stories.author}) LIKE ${normalizedQuery}`;
      conditions.push(lowerMatch);
    }

    let whereClause: SQL<unknown> | undefined;
    if (conditions.length === 1) {
      whereClause = conditions[0];
    } else if (conditions.length > 1) {
      whereClause = and(...conditions);
    }

    let countQuery = db.select({ value: sql<number>`count(*)` }).from(stories);
    let rowsQuery = db
      .select()
      .from(stories);

    if (whereClause) {
      countQuery = countQuery.where(whereClause);
      rowsQuery = rowsQuery.where(whereClause);
    }

    rowsQuery = rowsQuery
      .orderBy(desc(stories.updatedAt))
      .limit(limit)
      .offset(offset);

    const [{ value }] = await countQuery;
    const total = Number(value ?? 0);
    const items = await rowsQuery;

    return { items, total };
  }

  async createStory(insertStory: InsertStory): Promise<Story> {
    const payload: InsertStory = {
      ...insertStory,
      tags: this.formatTags(insertStory.tags),
      metadata: this.formatJson(insertStory.metadata) as InsertStory['metadata'],
    };

    const [story] = await db.insert(stories).values(payload).returning();
    return story;
  }

  async updateStory(id: string, updates: Partial<InsertStory>): Promise<Story> {
    const payload: Record<string, unknown> = {
      ...updates,
      updatedAt: new Date(),
    };

    if (updates.tags !== undefined) {
      payload.tags = this.formatTags(updates.tags);
    }

    if (updates.metadata !== undefined) {
      payload.metadata = this.formatJson(updates.metadata);
    }

    const [story] = await db.update(stories).set(payload).where(eq(stories.id, id)).returning();
    return story;
  }

  async deleteStory(id: string): Promise<void> {
    await db.delete(stories).where(eq(stories.id, id));
  }

  async getStoryBySlug(slug: string): Promise<Story | undefined> {
    const [story] = await db.select().from(stories).where(eq(stories.slug, slug)).limit(1);
    return story || undefined;
  }

  async replaceStorySections(storyId: string, sections: InsertStorySection[]): Promise<void> {
    await db.delete(storySections).where(eq(storySections.storyId, storyId));
    if (sections.length === 0) return;
    if (sections.length > 0) {
      await db.insert(storySections).values(sections).returning();
    }
  }

  async getStorySections(storyId: string): Promise<StorySection[]> {
    return await db
      .select()
      .from(storySections)
      .where(eq(storySections.storyId, storyId))
      .orderBy(storySections.sectionIndex);
  }

  async upsertStoryAudio(
    sectionId: string,
    voiceId: string,
    updates: Partial<InsertStoryAudio> & { status: StoryJobStatus }
  ): Promise<StoryAudio> {
    const existingRows = await db
      .select()
      .from(storyAudio)
      .where(and(eq(storyAudio.sectionId, sectionId), eq(storyAudio.voiceId, voiceId)))
      .limit(1);

    if (existingRows.length > 0) {
      const [audio] = await db
        .update(storyAudio)
        .set({
          ...updates,
          metadata: updates.metadata !== undefined ? this.formatJson(updates.metadata) : undefined,
          updatedAt: new Date(),
        })
        .where(and(eq(storyAudio.sectionId, sectionId), eq(storyAudio.voiceId, voiceId)))
        .returning();
      return audio;
    }

    const payload: InsertStoryAudio = {
      sectionId,
      voiceId,
      status: updates.status,
      audioUrl: updates.audioUrl,
      transcript: updates.transcript,
      durationSec: updates.durationSec,
      checksum: updates.checksum,
      startedAt: updates.startedAt ?? undefined,
      completedAt: updates.completedAt ?? undefined,
      error: updates.error,
      metadata: this.formatJson(updates.metadata) as InsertStoryAudio['metadata'],
    };

    const [audio] = await db.insert(storyAudio).values(payload).returning();
    return audio;
  }

  async getStoryAudioForVoice(storyId: string, voiceId: string): Promise<StoryAudio[]> {
    const rows = await db
      .select({ audio: storyAudio })
      .from(storyAudio)
      .innerJoin(storySections, eq(storySections.id, storyAudio.sectionId))
      .where(and(eq(storySections.storyId, storyId), eq(storyAudio.voiceId, voiceId)))
      .orderBy(storySections.sectionIndex);

    return rows.map(({ audio }: { audio: StoryAudio }) => audio);
  }

  async getStoryAudioByAudioUrl(audioUrl: string): Promise<StoryAudio | undefined> {
    const rows = await db
      .select()
      .from(storyAudio)
      .where(eq(storyAudio.audioUrl, audioUrl))
      .limit(1);
    return rows[0] || undefined;
  }

  async createStoryNarration(insertNarration: InsertStoryNarration): Promise<StoryNarration> {
    const [narration] = await db.insert(storyNarrations).values(insertNarration).returning();
    return narration;
  }

  async updateStoryNarration(id: string, updates: Partial<InsertStoryNarration>): Promise<StoryNarration> {
    const [narration] = await db
      .update(storyNarrations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(storyNarrations.id, id))
      .returning();
    return narration;
  }

  async deleteStoryNarrations(storyId: string): Promise<void> {
    await db.delete(storyNarrations).where(eq(storyNarrations.storyId, storyId));
  }

  async getStoryNarrations(storyId: string): Promise<StoryNarration[]> {
    return await db
      .select()
      .from(storyNarrations)
      .where(eq(storyNarrations.storyId, storyId))
      .orderBy(storyNarrations.chunkIndex);
  }

  async getStoryNarrationByAudioFileName(filename: string): Promise<StoryNarration | undefined> {
    const [narration] = await db
      .select()
      .from(storyNarrations)
      .where(eq(storyNarrations.audioFileName, filename));
    return narration || undefined;
  }

  // Collaboration management
  async getActiveCollaborators(videoId: string): Promise<CollaborationSession[]> {
    return await db
      .select()
      .from(collaborationSessions)
      .where(and(
        eq(collaborationSessions.videoId, videoId),
        eq(collaborationSessions.isActive, true)
      ))
      .orderBy(desc(collaborationSessions.lastActivity));
  }

  async createCollaborationSession(insertSession: InsertCollaborationSession): Promise<CollaborationSession> {
    const [session] = await db.insert(collaborationSessions).values(insertSession).returning();
    return session;
  }

  async updateCollaborationSession(id: string, updates: Partial<InsertCollaborationSession>): Promise<CollaborationSession> {
    const [session] = await db
      .update(collaborationSessions)
      .set({ ...updates, lastActivity: new Date() })
      .where(eq(collaborationSessions.id, id))
      .returning();
    return session;
  }

  async endCollaborationSession(id: string): Promise<void> {
    await db
      .update(collaborationSessions)
      .set({ isActive: false })
      .where(eq(collaborationSessions.id, id));
  }

  // Activity logging
  async logActivity(insertActivity: InsertActivityLog): Promise<ActivityLog> {
    const [activity] = await db.insert(activityLogs).values(insertActivity).returning();
    return activity;
  }

  async getRecentActivities(familyId: string, limit = 10): Promise<ActivityLog[]> {
    const result = await db
      .select({
        id: activityLogs.id,
        userId: activityLogs.userId,
        action: activityLogs.action,
        resourceType: activityLogs.resourceType,
        resourceId: activityLogs.resourceId,
        details: activityLogs.details,
        createdAt: activityLogs.createdAt
      })
      .from(activityLogs)
      .innerJoin(familyMembers, eq(activityLogs.userId, familyMembers.userId))
      .where(eq(familyMembers.familyId, familyId))
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit);
    return result;
  }

  // Marketing
  async createMarketingLead(insertLead: InsertMarketingLead): Promise<MarketingLead> {
    if (!this.IS_SQLITE) throw new Error('Marketing leads are supported only in SQLite mode');
    const [lead] = await db.insert(marketingLeads).values(insertLead).returning();
    return lead;
  }

  async getSongTemplate(id: string): Promise<SongTemplate | undefined> {
    const [template] = await db.select().from(songTemplates).where(eq(songTemplates.id, id));
    return template;
  }
}

export const storage = new DatabaseStorage();
