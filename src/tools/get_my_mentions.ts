import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadConfig } from '../config.js';
import { costOf, usd } from '../guard/usage.js';
import { guarded, TWEET_FIELDS, USER_FIELDS } from '../x/client.js';
import { formatPosts } from '../x/format.js';
import { getMe } from '../x/users.js';
import { run } from './result.js';

export function registerGetMyMentions(server: McpServer): void {
  server.registerTool(
    'get_my_mentions',
    {
      title: 'My mentions',
      description: 'Recent posts that mention the account. Owned read: $0.001 per post returned.',
      inputSchema: {
        max_results: z.number().int().min(5).max(100).default(20),
        since_id: z.string().regex(/^\d+$/).optional().describe('Only mentions newer than this post id'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ max_results, since_id }) =>
      run(async () => {
        const config = loadConfig();
        const me = await getMe('get_my_mentions');
        const page = await guarded(
          (x) =>
            x.v2.userMentionTimeline(me.id, {
              max_results,
              since_id,
              'tweet.fields': [...TWEET_FIELDS],
              expansions: ['author_id'],
              'user.fields': [...USER_FIELDS],
            }),
          {
            tool: 'get_my_mentions',
            endpoint: 'GET /2/users/:id/mentions',
            kind: 'owned_read',
            plan: { cost: costOf('owned_read', max_results) },
            units: (p) => p.tweets.length,
          },
        );
        const tweets = page.tweets;
        const header = `Mentions of @${me.username} — ${tweets.length} · est. cost ${usd(costOf('owned_read', tweets.length))}`;
        const newest = tweets[0] ? `\nNewest id: ${tweets[0].id} (pass as since_id next time)` : '';
        return `${header}${newest}\n\n${formatPosts(tweets, (t) => page.includes.author(t)?.username ?? 'unknown', config.timezone)}`;
      }),
  );
}
