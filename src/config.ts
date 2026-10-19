import fs from 'node:fs';
import { z } from 'zod';
import { CONFIG_PATH } from './paths.js';

const ConfigSchema = z.object({
  timezone: z.string().min(1),
  topics: z.array(z.string().min(1)),
  watch_accounts: z.array(z.string().min(1)),
  reading: z.object({
    default_max_results: z.number().int().min(10).max(100),
    max_results_cap: z.number().int().min(10).max(100),
    default_query_suffix: z.string(),
  }),
  posting: z.object({
    max_chars: z.number().int().positive(),
    warn_on_links: z.boolean(),
  }),
  budget: z.object({
    daily_post_reads: z.number().int().nonnegative(),
    daily_post_creates: z.number().int().nonnegative(),
    daily_spend_usd: z.number().nonnegative(),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

export function parseConfig(raw: unknown): Config {
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`config.json is invalid: ${issues}`);
  }
  return parsed.data;
}

/** Read on every call so edits to config.json apply without a rebuild or restart. */
export function loadConfig(file = CONFIG_PATH): Config {
  if (!fs.existsSync(file)) {
    throw new Error(`config.json not found at ${file}. Copy config.example.json to config.json and edit it.`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`Could not read config.json at ${file}: ${(err as Error).message}`);
  }
  return parseConfig(raw);
}
