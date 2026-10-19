import type { Config } from '../src/config.js';
import type { CostKind, UsageEntry } from '../src/guard/usage.js';
import { costOf } from '../src/guard/usage.js';

export function testConfig(overrides: Partial<Config['budget']> = {}): Config {
  return {
    timezone: 'Asia/Tokyo',
    topics: ['MCP server', 'AI agents'],
    watch_accounts: ['example_user', 'another_user'],
    reading: { default_max_results: 10, max_results_cap: 50, default_query_suffix: '-is:retweet lang:en' },
    posting: { max_chars: 280, warn_on_links: true },
    budget: { daily_post_reads: 300, daily_post_creates: 8, daily_spend_usd: 2, ...overrides },
  };
}

export function entry(ts: string, kind: CostKind, units: number, extra: Partial<UsageEntry> = {}): UsageEntry {
  return { ts, tool: 'test', endpoint: 'test', kind, units, cost: costOf(kind, units), ok: true, ...extra };
}
