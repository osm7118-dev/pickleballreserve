import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { testDatabaseUrl } from "./test-db-url";

// Start every test run from an empty test database with all migrations applied.
// testDatabaseUrl() refuses any database whose name does not contain "test".
export default async function setup() {
  const url = testDatabaseUrl();
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS public CASCADE`);
    await db.$executeRawUnsafe(`CREATE SCHEMA public`);
  } finally {
    await db.$disconnect();
  }
  execSync("pnpm prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
