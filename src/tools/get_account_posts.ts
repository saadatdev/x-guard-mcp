import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TweetV2 } from 'twitter-api-v2';
import { z } from 'zod';
import { loadConfig } from '../config.js';
import { costOf, usd } from '../guard/usage.js';
import { guarded, TWEET_FIELDS } from '../x/client.js';
import { formatPosts } from '../x/format.js';
import { resolveUser } from '../x/users.js';
import { run } from './result.js';

/** X's GET /2/users/:id/tweets accepts max_results 5–100. */
export const TIMELINE_MIN_RESULTS = 5;

export async function fetchAccountPosts(
  tool: string,
  username: string,
  maxResults: number,
  excludeReplies: boolean,
): Promise<{ handle: string; tweets: TweetV2[] }> {
  const user = await resolveUser(tool, username);
  const page = await guarded(
    (x) =>
      x.v2.userTimeline(user.id, {
        max_results: maxResults,
        exclude: excludeReplies ? ['replies'] : undefined,
        'tweet.fields': [...TWEET_FIELDS],
      }),
    {
      tool,
      endpoint: 'GET /2/users/:id/tweets',
      kind: 'post_read',
      plan: { postReads: maxResults, cost: costOf('post_read', maxResults) },
      units: (p) => p.tweets.length,
    },
  );
  return { handle: user.username, tweets: page.tweets };
}

export function registerGetAccountPosts(server: McpServer): void {
  server.registerTool(
    'get_account_posts',
    {
      title: "Get an account's latest posts",
      description:
        "Latest posts from one X account. Costs $0.005 per post returned (plus a one-time $0.01 username lookup, then cached).",
      inputSchema: {
        username: z.string().min(1).describe('X handle, with or without @'),
        max_results: z.number().int().min(TIMELINE_MIN_RESULTS).max(25).default(10),
        exclude_replies: z.boolean().default(true),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ username, max_results, exclude_replies }) =>
      run(async () => {
        const config = loadConfig();
        const { handle, tweets } = await fetchAccountPosts('get_account_posts', username, max_results, exclude_replies);
        const header = `@${handle} — ${tweets.length} latest posts · est. cost ${usd(costOf('post_read', tweets.length))}`;
        return `${header}\n\n${formatPosts(tweets, () => handle, config.timezone)}`;
      }),
  );
}
