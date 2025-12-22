import 'dotenv/config';
import { storage } from '../storage';

async function main() {
  const email = process.argv[2];

  if (!email) {
    console.error('Usage: tsx server/scripts/makeAdmin.ts <email>');
    process.exit(1);
  }

  try {
    const user = await storage.getUserByEmail(email);
    if (!user) {
      console.error(`User with email ${email} not found. Please register the user first.`);
      process.exit(2);
    }

    if (user.role === 'admin') {
      console.log(`User ${email} is already an admin.`);
      process.exit(0);
    }

    await storage.updateUser(user.id, { role: 'admin' } as any);

    console.log(`Promoted ${email} (id: ${user.id}) to admin.`);
    process.exit(0);
  } catch (err) {
    console.error('Failed to promote user to admin:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
