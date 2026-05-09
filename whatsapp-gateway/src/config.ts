// src/config.ts
import { config as dotenvConfig } from "dotenv";
import { z } from "zod";

dotenvConfig();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),

  // AI — Anthropic SDK via z.ai proxy (backend: GLM)
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_BASE_URL: z.string().default("https://api.z.ai/api/anthropic"),
  AI_MODEL: z.string().default("claude-sonnet-4-20250514"),

  // Notion
  NOTION_API_KEY: z.string().min(1),
  NOTION_DATABASE_ID: z.string().min(1),
  NOTION_VERSION: z.string().default("2022-06-28"),
  NOTION_MASTER_PROJECTS_ID: z.string().optional(),
  NOTION_MASTER_BACKLOG_ID: z.string().optional(),
  NOTION_DIVISIONS_ID: z.string().optional(),
  NOTION_MEMBERS_ID: z.string().optional(),

  // Evolution API
  EVOLUTION_API_URL: z.string().default("http://evolution-api:8080"),
  EVOLUTION_API_KEY: z.string().default("evolution-api-key-change-this"),
  EVOLUTION_INSTANCE_NAME: z.string().default("wa-bot"),

  // Redis
  REDIS_URL: z.string().default("redis://redis:6379"),

  // Cache TTL (optional overrides)
  CACHE_TTL_BACKLOG_MS: z.coerce.number().default(2 * 60 * 1000),
  CACHE_TTL_PROJECTS_MS: z.coerce.number().default(5 * 60 * 1000),
  CACHE_TTL_MEMBERS_MS: z.coerce.number().default(10 * 60 * 1000),
  CACHE_TTL_RELATIONS_MS: z.coerce.number().default(10 * 60 * 1000),

  // Notion API Rate Limit (optional override)
  NOTION_RATE_LIMIT_RPS: z.coerce.number().default(3),
  NOTION_MAX_RETRIES: z.coerce.number().default(3),
});

export const env = envSchema.parse(process.env);

export type Env = z.infer<typeof envSchema>;
