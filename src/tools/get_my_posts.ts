import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadConfig } from '../config.js';
import { costOf, usd } from '../guard/usage.js';
import { guarded, TWEET_FIELDS } from '../x/client.js';
import { formatPosts } from '../x/format.js';
import { getMe } from '../x/users.js';
import { run } from './result.js';

export function registerGetMyPosts(server: McpServer): void {
  server.registerTool(
    'get_my_posts',
    {
      title: 'My recent posts',
      description: "The account's own recent posts with likes, reposts, replies and views. Owned read: $0.001 per post returned.",
      inputSchema: {
        max_results: z.number().int().min(5).max(50).default(10),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ max_results }) =>
      run(async () => {
        const config = loadConfig();
        const me = await getMe('get_my_posts');
        const page = await guarded(
          (x) => x.v2.userTimeline(me.id, { max_results, 'tweet.fields': [...TWEET_FIELDS] }),
          {
            tool: 'get_my_posts',
            endpoint: 'GET /2/users/:id/tweets',
            kind: 'owned_read',
            plan: { cost: costOf('owned_read', max_results) },
            units: (p) => p.tweets.length,
          },
        );
        const header = `@${me.username} — ${page.tweets.length} recent posts · est. cost ${usd(costOf('owned_read', page.tweets.length))}`;
        return `${header}\n\n${formatPosts(page.tweets, () => me.username, config.timezone)}`;
      }),
  );
}
