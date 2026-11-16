import { config } from "dotenv";

config({ quiet: true });

const DEFAULT_TEST_URL = "postgresql://app:app@localhost:5432/pickleball_test?schema=public";

// The test database is wiped on every run, so refuse anything that doesn't look like a test DB.
export function testDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_TEST ?? DEFAULT_TEST_URL;
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.includes("test")) {
    throw new Error(`DATABASE_URL_TEST must point to a database whose name contains "test" (got "${dbName}")`);
  }
  return url;
}
