import fs from 'node:fs';
import { DATA_DIR, USAGE_PATH } from '../paths.js';

/**
 * Pay-per-use prices in USD, seeded from docs/x-api-reference.md (listed 10 Oct 2026).
 * The console.x.com Usage page is the source of truth — update this table if it disagrees.
 */
export const COST_USD = {
  post_create: 0.015, // per request
  post_create_url: 0.2, // per request, post text contains a URL
  delete: 0.01, // per request
  post_read: 0.005, // per post returned (search, other accounts' posts)
  user_read: 0.01, // per user returned (lookups, /users/me)
  owned_read: 0.001, // per item returned (own posts, mentions)
  media_upload: 0, // not listed in the price table — recorded as $0
} as const;

export type CostKind = keyof typeof COST_USD;

export interface UsageEntry {
  ts: string; // ISO timestamp (UTC)
  tool: string;
  endpoint: string;
  kind: CostKind;
  units: number;
  cost: number;
  ok: boolean;
  status?: number;
  post_id?: string;
  text?: string; // only for created posts — used for duplicate detection
}

export function costOf(kind: CostKind, units: number): number {
  return round(COST_USD[kind] * units);
}

export function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function usd(n: number): string {
  return `$${n.toFixed(3)}`;
}

/** Calendar day (YYYY-MM-DD) of a date in the given IANA timezone. */
export function dayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Local days covered by a period ending today: today=1, 7d=7, 30d=30. */
export function periodDays(period: 'today' | '7d' | '30d', now: Date, timeZone: string): Set<string> {
  const n = period === 'today' ? 1 : period === '7d' ? 7 : 30;
  const days = new Set<string>();
  // 12h steps never skip a local day, even across 23h/25h DST days.
  for (let t = now.getTime(); days.size < n; t -= 43_200_000) days.add(dayKey(new Date(t), timeZone));
  return days;
}

export function entriesOnDays(entries: UsageEntry[], days: Set<string>, timeZone: string): UsageEntry[] {
  return entries.filter((e) => days.has(dayKey(new Date(e.ts), timeZone)));
}

export interface UsageTotals {
  calls: number;
  failed: number;
  postsRead: number;
  ownedItemsRead: number;
  usersLookedUp: number;
  postsCreated: number;
  postsDeleted: number;
  spend: number;
}

export function summarize(entries: UsageEntry[]): UsageTotals {
  const t: UsageTotals = { calls: 0, failed: 0, postsRead: 0, ownedItemsRead: 0, usersLookedUp: 0, postsCreated: 0, postsDeleted: 0, spend: 0 };
  for (const e of entries) {
    t.calls++;
    if (!e.ok) {
      t.failed++;
      continue;
    }
    t.spend += e.cost;
    if (e.kind === 'post_read') t.postsRead += e.units;
    if (e.kind === 'owned_read') t.ownedItemsRead += e.units;
    if (e.kind === 'user_read') t.usersLookedUp += e.units;
    if (e.kind === 'post_create' || e.kind === 'post_create_url') t.postsCreated += e.units;
    if (e.kind === 'delete') t.postsDeleted += e.units;
  }
  t.spend = round(t.spend);
  return t;
}

/** True if this exact text was posted (and not since deleted) within the last 7 days. */
export function isDuplicate(text: string, entries: UsageEntry[], now: Date): boolean {
  const target = text.trim();
  const cutoff = now.getTime() - 7 * 86_400_000;
  const deleted = new Set(entries.filter((e) => e.ok && e.kind === 'delete' && e.post_id).map((e) => e.post_id));
  return entries.some(
    (e) =>
      e.ok &&
      (e.kind === 'post_create' || e.kind === 'post_create_url') &&
      e.text?.trim() === target &&
      new Date(e.ts).getTime() >= cutoff &&
      !(e.post_id && deleted.has(e.post_id)),
  );
}

export function readUsage(): UsageEntry[] {
  if (!fs.existsSync(USAGE_PATH)) return [];
  const out: UsageEntry[] = [];
  for (const line of fs.readFileSync(USAGE_PATH, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as UsageEntry);
    } catch {
      console.error('[x-guard] skipping malformed usage.jsonl line');
    }
  }
  return out;
}

export function appendUsage(entry: UsageEntry): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.appendFileSync(USAGE_PATH, JSON.stringify(entry) + '\n', 'utf8');
}
