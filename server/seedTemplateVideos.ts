// Seed script to populate template videos
import 'dotenv/config';
import { db } from './db.js';
import { sql } from 'drizzle-orm';
import { ensureTemplateVideosTable } from './utils/templateVideos.js';

// Ensure template_videos table exists before seeding
const templateVideos = [
  {
    title: "Happy Birthday Celebration",
    description: "A joyful birthday celebration with balloons, cake, and festive music. Perfect for surprising family members on their special day!",
    thumbnailUrl: "/templates/birthday-celebration-thumb.jpg",
    videoUrl: "/templates/birthday-celebration.mp4",
    duration: 45,
    category: "birthday",
    tags: JSON.stringify(["birthday", "celebration", "party", "cake", "balloons"]),
    difficulty: "easy",
    isActive: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    title: "Christmas Morning Magic",
    description: "Capture the magic of Christmas morning with twinkling lights, presents, and holiday cheer. Ideal for creating cherished holiday memories.",
    thumbnailUrl: "/templates/christmas-morning-thumb.jpg",
    videoUrl: "/templates/christmas-morning.mp4",
    duration: 60,
    category: "holiday",
    tags: JSON.stringify(["christmas", "holiday", "family", "presents", "winter"]),
    difficulty: "medium",
    isActive: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    title: "Anniversary Love Story",
    description: "A romantic journey celebrating years of love and commitment. Features elegant transitions and heartfelt moments.",
    thumbnailUrl: "/templates/anniversary-thumb.jpg",
    videoUrl: "/templates/anniversary.mp4",
    duration: 90,
    category: "anniversary",
    tags: JSON.stringify(["anniversary", "love", "romance", "couple", "celebration"]),
    difficulty: "hard",
    isActive: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    title: "Family Reunion Memories",
    description: "Bring the whole family together in this warm and welcoming video. Perfect for reunions and gatherings.",
    thumbnailUrl: "/templates/family-reunion-thumb.jpg",
    videoUrl: "/templates/family-reunion.mp4",
    duration: 75,
    category: "family",
    tags: JSON.stringify(["family", "reunion", "gathering", "togetherness", "memories"]),
    difficulty: "medium",
    isActive: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    title: "Graduation Celebration",
    description: "Celebrate academic achievements with this inspiring graduation video. Features cap toss and proud moments.",
    thumbnailUrl: "/templates/graduation-thumb.jpg",
    videoUrl: "/templates/graduation.mp4",
    duration: 50,
    category: "celebration",
    tags: JSON.stringify(["graduation", "achievement", "school", "college", "success"]),
    difficulty: "easy",
    isActive: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    title: "New Year's Eve Countdown",
    description: "Ring in the new year with fireworks, champagne, and excitement. A festive way to welcome new beginnings!",
    thumbnailUrl: "/templates/new-year-thumb.jpg",
    videoUrl: "/templates/new-year.mp4",
    duration: 55,
    category: "holiday",
    tags: JSON.stringify(["new year", "celebration", "fireworks", "party", "countdown"]),
    difficulty: "easy",
    isActive: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    title: "Wedding Anniversary Tribute",
    description: "A sophisticated tribute to lasting love. Features elegant scenes and romantic music perfect for milestone anniversaries.",
    thumbnailUrl: "/templates/wedding-anniversary-thumb.jpg",
    videoUrl: "/templates/wedding-anniversary.mp4",
    duration: 120,
    category: "anniversary",
    tags: JSON.stringify(["wedding", "anniversary", "love", "marriage", "romance"]),
    difficulty: "hard",
    isActive: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    title: "Mother's Day Special",
    description: "Honor mom with this heartwarming video filled with appreciation and love. Perfect for showing gratitude.",
    thumbnailUrl: "/templates/mothers-day-thumb.jpg",
    videoUrl: "/templates/mothers-day.mp4",
    duration: 40,
    category: "celebration",
    tags: JSON.stringify(["mother's day", "mom", "appreciation", "love", "family"]),
    difficulty: "easy",
    isActive: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    title: "Summer Vacation Adventure",
    description: "Relive summer adventures with beach scenes, sunshine, and fun activities. Great for capturing vacation memories!",
    thumbnailUrl: "/templates/summer-vacation-thumb.jpg",
    videoUrl: "/templates/summer-vacation.mp4",
    duration: 70,
    category: "family",
    tags: JSON.stringify(["summer", "vacation", "beach", "adventure", "travel"]),
    difficulty: "medium",
    isActive: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    title: "Thanksgiving Gratitude",
    description: "Express gratitude and thankfulness with this warm Thanksgiving video. Features autumn colors and family gathering scenes.",
    thumbnailUrl: "/templates/thanksgiving-thumb.jpg",
    videoUrl: "/templates/thanksgiving.mp4",
    duration: 65,
    category: "holiday",
    tags: JSON.stringify(["thanksgiving", "gratitude", "family", "autumn", "holiday"]),
    difficulty: "medium",
    isActive: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

async function seed() {
  console.log('Seeding template videos...');
  
  try {
    await ensureTemplateVideosTable();
    
    for (const video of templateVideos) {
      await db.run(sql`
        INSERT INTO template_videos (
          title, description, thumbnail_url, video_url, duration, 
          category, tags, difficulty, is_active, metadata, created_at, updated_at
        ) VALUES (
          ${video.title}, ${video.description}, ${video.thumbnailUrl}, 
          ${video.videoUrl}, ${video.duration}, ${video.category}, 
          ${video.tags}, ${video.difficulty}, ${video.isActive}, 
          ${JSON.stringify({ pipelineStatus: "queued" })},
          ${video.createdAt.toISOString()}, ${video.updatedAt.toISOString()}
        )
      `);
      console.log(`✓ Added: ${video.title}`);
    }
    
    console.log(`\n✅ Successfully seeded ${templateVideos.length} template videos!`);
  } catch (error) {
    console.error('Error seeding template videos:', error);
    throw error;
  }
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
