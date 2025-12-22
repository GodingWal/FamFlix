
import { storage } from "../server/storage";

async function seed() {
    console.log("Seeding stories...");

    const stories = [
        {
            title: "The Little Astronaut",
            slug: "the-little-astronaut",
            category: "ADVENTURE",
            summary: "Join Leo on his first journey to the moon!",
            ageMin: 3,
            ageMax: 6,
            durationMin: 2,
            tags: ["space", "dreams", "courage"],
            rights: "ORIGINAL",
            sections: [
                {
                    index: 0,
                    text: "Leo looked up at the big, bright moon. 'I want to go there!' he said. He put on his shiny silver helmet and climbed into his cardboard rocket. 3, 2, 1, Blast off! The rocket zoomed past the stars. When he landed, he met a friendly moon alien named Zip. 'Welcome to the moon!' said Zip. 'Let's play hide and seek!'"
                }
            ]
        },
        {
            title: "The Sleepy Bear",
            slug: "the-sleepy-bear",
            category: "BEDTIME",
            summary: "A cozy tale about a bear getting ready for hibernation.",
            ageMin: 2,
            ageMax: 5,
            durationMin: 3,
            tags: ["animals", "sleep", "winter"],
            rights: "ORIGINAL",
            sections: [
                {
                    index: 0,
                    text: "The leaves were falling, and the air was getting chilly. Barnaby Bear yawned a big, wide yawn. 'I am so sleepy,' he said. He fluffed his pillow made of soft moss. His friends the squirrels brought him some nuts for a snack. 'Goodnight, Barnaby!' they whispered. 'See you in the spring.'"
                }
            ]
        },
        {
            title: "The Magic Garden",
            slug: "the-magic-garden",
            category: "FAIRYTALE",
            summary: "Lily discovers a garden where flowers can sing.",
            ageMin: 4,
            ageMax: 8,
            durationMin: 4,
            tags: ["magic", "nature", "music"],
            rights: "ORIGINAL",
            sections: [
                {
                    index: 0,
                    text: "Lily found a tiny golden key under a mushroom. She opened the old wooden gate at the back of her yard. Inside, the roses were humming a sweet melody. The daisies were dancing in the breeze. 'Hello, Lily!' sang a big sunflower. 'Will you sing with us?'"
                }
            ]
        }
    ];

    // Try to find a user to assign stories to
    let userId: string | undefined;

    // Try finding the user from logs
    const user = await storage.getUserByEmail("gwal325@gmail.com");
    userId = user?.id;

    if (!userId) {
        console.log("User gwal325@gmail.com not found. Creating system user...");
        try {
            // Check if system user exists first
            const sysUser = await storage.getUserByEmail("system@famflix.com");
            if (sysUser) {
                userId = sysUser.id;
            } else {
                const newUser = await storage.createUser({
                    username: "system_story_seeder",
                    email: "system@famflix.com",
                    password: "hashed_password_placeholder",
                    role: "admin"
                });
                userId = newUser.id;
            }
        } catch (e) {
            console.error("Error getting/creating system user:", e);
        }
    }

    if (!userId) {
        console.error("No user found to assign stories to. Aborting.");
        process.exit(1);
    }

    for (const s of stories) {
        console.log(`Processing story: ${s.title}`);

        const existing = await storage.getStoryBySlug(s.slug);
        let storyId = existing?.id;

        if (!existing) {
            const newStory = await storage.createStory({
                title: s.title,
                slug: s.slug,
                category: s.category as any,
                summary: s.summary,
                ageMin: s.ageMin,
                ageMax: s.ageMax,
                durationMin: s.durationMin,
                tags: s.tags,
                rights: s.rights as any,
                createdBy: userId,
                isPublic: true,
                coverUrl: `https://placehold.co/600x400?text=${encodeURIComponent(s.title)}`,
                content: s.sections.map(sec => sec.text).join("\n\n"),
                metadata: {}
            });
            storyId = newStory.id;
            console.log(`Created new story with ID: ${storyId}`);
        } else {
            console.log(`Story ${s.slug} already exists.`);
        }

        if (storyId) {
            const sections = s.sections.map(sec => ({
                storyId: storyId!,
                sectionIndex: sec.index,
                text: sec.text,
                wordCount: sec.text.split(" ").length,
                durationEst: sec.text.length * 0.1
            }));
            await storage.replaceStorySections(storyId, sections);
            console.log(`Updated ${sections.length} sections for ${s.title}`);
        }
    }

    console.log("Seeding completed successfully!");
    process.exit(0);
}

seed().catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
});
