import fs from 'node:fs';
import { costOf } from '../guard/usage.js';
import { DATA_DIR, USERS_PATH } from '../paths.js';
import { guarded, UserFacingError } from './client.js';

export interface CachedUser {
  id: string;
  username: string;
}

interface UserCache {
  me?: CachedUser;
  users: Record<string, CachedUser>;
}

// User lookups cost money, so ids are cached forever in data/users.json.
function readCache(): UserCache {
  try {
    const c = JSON.parse(fs.readFileSync(USERS_PATH, 'utf8')) as UserCache;
    return { me: c.me, users: c.users ?? {} };
  } catch {
    return { users: {} };
  }
}

function writeCache(cache: UserCache): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(USERS_PATH, JSON.stringify(cache, null, 2), 'utf8');
}

export function normalizeHandle(username: string): string {
  return username.trim().replace(/^@/, '').toLowerCase();
}

export function isUserCached(username: string): boolean {
  return Boolean(readCache().users[normalizeHandle(username)]);
}

export async function resolveUser(tool: string, username: string): Promise<CachedUser> {
  const key = normalizeHandle(username);
  if (!/^\w{1,15}$/.test(key)) throw new UserFacingError(`"${username}" is not a valid X username.`);
  const cached = readCache().users[key];
  if (cached) return cached;

  const res = await guarded((x) => x.v2.userByUsername(key), {
    tool,
    endpoint: 'GET /2/users/by/username/:username',
    kind: 'user_read',
    plan: { cost: costOf('user_read', 1) },
    units: (r) => (r.data ? 1 : 0),
  });
  if (!res.data) throw new UserFacingError(`X user @${key} was not found (suspended, renamed or never existed).`);
  const user = { id: res.data.id, username: res.data.username };
  const cache = readCache();
  cache.users[key] = user;
  writeCache(cache);
  return user;
}

/** The authenticated account. `fresh` forces a GET /2/users/me (used to verify credentials). */
export async function getMe(tool: string, fresh = false): Promise<CachedUser> {
  if (!fresh) {
    const me = readCache().me;
    if (me) return me;
  }
  const res = await guarded((x) => x.v2.me(), {
    tool,
    endpoint: 'GET /2/users/me',
    kind: 'user_read',
    plan: { cost: costOf('user_read', 1) },
    units: () => 1,
  });
  const me = { id: res.data.id, username: res.data.username };
  const cache = readCache();
  cache.me = me;
  writeCache(cache);
  return me;
}
