import fs from 'node:fs';
import dotenv from 'dotenv';
import { ENV_PATH } from './paths.js';

export interface XEnv {
  appKey: string;
  appSecret: string;
  accessToken: string;
  accessSecret: string;
}

const REQUIRED = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_TOKEN_SECRET'] as const;

let cached: XEnv | undefined;

/** Loads .env next to the project root. Throws a clear message naming missing keys (never their values). */
export function loadEnv(): XEnv {
  if (cached) return cached;
  if (fs.existsSync(ENV_PATH)) {
    // quiet: dotenv must never write to stdout (the MCP protocol channel).
    dotenv.config({ path: ENV_PATH, quiet: true });
  }
  const missing = REQUIRED.filter((k) => !process.env[k]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Missing X credentials: ${missing.join(', ')}. ` +
        `Copy .env.example to .env at ${ENV_PATH} and fill in the values from console.x.com.`,
    );
  }
  cached = {
    appKey: process.env.X_API_KEY!.trim(),
    appSecret: process.env.X_API_SECRET!.trim(),
    accessToken: process.env.X_ACCESS_TOKEN!.trim(),
    accessSecret: process.env.X_ACCESS_TOKEN_SECRET!.trim(),
  };
  return cached;
}
