import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

const isSQLite = process.env.DATABASE_URL.startsWith('file:');

export default defineConfig({
  out: "./server/db/migrations",
  schema: isSQLite ? "./shared/schema-sqlite.ts" : "./shared/schema.ts",
  dialect: isSQLite ? "sqlite" : "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
