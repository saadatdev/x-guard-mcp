import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolved from this file's location (src/ or dist/), never from process.cwd():
// MCP clients launch the server from their own working directory.
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const ENV_PATH = path.join(ROOT, '.env');
export const CONFIG_PATH = path.join(ROOT, 'config.json');
export const DATA_DIR = path.join(ROOT, 'data');
export const USAGE_PATH = path.join(DATA_DIR, 'usage.jsonl');
export const USERS_PATH = path.join(DATA_DIR, 'users.json');
