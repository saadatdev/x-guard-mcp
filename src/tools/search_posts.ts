import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TweetV2 } from 'twitter-api-v2';
import { z } from 'zod';
import { loadConfig } from '../config.js';
import { costOf, usd } from '../guard/usage.js';
import { guarded, TWEET_FIELDS, USER_FIELDS } from '../x/client.js';
import { formatPosts } from '../x/format.js';
import { run } from './result.js';

/** Appends each suffix operator the query doesn't already set (e.g. skips lang:en if the query has lang:). */
export function buildQuery(query: string, suffix: string): string {
  const q = query.trim();
  const missing = suffix
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => {
      const op = token.replace(/^-/, '');
      const key = op.includes(':') ? op.slice(0, op.indexOf(':') + 1) : op;
      // lang: is checked by operator; is:retweet etc. by the full operator, either polarity.
      return key === 'lang:' ? !/(^|\s)-?lang:/i.test(q) : !q.toLowerCase().includes(op.toLowerCase());
    });
  return [q, ...missing].join(' ');
}

export interface SearchResult {
  query: string;
  tweets: TweetV2[];
  handleOf: (t: TweetV2) => string;
}

export async function runSearch(
  tool: string,
  query: string,
  maxResults: number,
  sort: 'relevancy' | 'recency',
): Promise<SearchResult> {
  const fullQuery = buildQuery(query, loadConfig().reading.default_query_suffix);
  const page = await guarded(
    (x) =>
      x.v2.search(fullQuery, {
        max_results: maxResults,
        sort_order: sort,
        'tweet.fields': [...TWEET_FIELDS],
        expansions: ['author_id'],
        'user.fields': [...USER_FIELDS],
      }),
    {
      tool,
      endpoint: 'GET /2/tweets/search/recent',
      kind: 'post_read',
      plan: { postReads: maxResults, cost: costOf('post_read', maxResults) },
      units: (p) => p.tweets.length,
    },
  );
  return {
    query: fullQuery,
    tweets: page.tweets,
    handleOf: (t) => page.includes.author(t)?.username ?? t.author_id ?? 'unknown',
  };
}

export function registerSearchPosts(server: McpServer): void {
  server.registerTool(
    'search_posts',
    {
      title: 'Search recent X posts',
      description:
        'Search X posts from the last 7 days. Each returned post costs money ($0.005 per post), so keep queries ' +
        'specific and prefer fewer results (the default is usually enough). Supports X operators: quoted phrases, ' +
        'OR (uppercase), from:handle, -is:reply. "-is:retweet lang:en" is added automatically unless the query sets them.',
      inputSchema: {
        query: z.string().min(1).max(450).describe('Search query. Be specific.'),
        max_results: z
          .number()
          .int()
          .min(10)
          .max(100)
          .optional()
          .describe('Posts to return, min 10. Defaults to reading.default_max_results; capped by reading.max_results_cap in config.json.'),
        sort: z.enum(['relevancy', 'recency']).default('relevancy'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ query, max_results, sort }) =>
      run(async () => {
        const config = loadConfig();
        const cap = config.reading.max_results_cap;
        let max = max_results ?? config.reading.default_max_results;
        let note = '';
        if (max > cap) {
          note = `\n(max_results ${max} lowered to the configured cap of ${cap}.)`;
          max = cap;
        }
        const res = await runSearch('search_posts', query, max, sort);
        const header =
          `Search: ${res.query}\n${res.tweets.length} posts · sort ${sort} · est. cost ` +
          `${usd(costOf('post_read', res.tweets.length))}${note}`;
        return `${header}\n\n${formatPosts(res.tweets, res.handleOf, config.timezone)}`;
      }),
  );
}
