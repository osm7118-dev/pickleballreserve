import { z } from "zod";

// Server-side environment variables, validated once at startup.
// When adding a variable, also add it to .env.example.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
});

export const env = envSchema.parse(process.env);
