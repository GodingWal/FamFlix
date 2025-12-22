import { db } from './server/db';
import { users } from './server/db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

async function resetPassword() {
    const email = 'gwal325@gmail.com';
    const password = 'password123';

    try {
        const hashedPassword = await bcrypt.hash(password, 12);

        await db.update(users)
            .set({ password: hashedPassword })
            .where(eq(users.email, email));

        console.log(`Password for ${email} reset successfully.`);
    } catch (error) {
        console.error('Error:', error);
    }
}

resetPassword();
