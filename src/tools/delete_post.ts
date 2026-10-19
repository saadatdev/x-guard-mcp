import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadConfig } from '../config.js';
import { COST_USD, costOf, usd } from '../guard/usage.js';
import { guarded, TWEET_FIELDS, UserFacingError } from '../x/client.js';
import { formatPost } from '../x/format.js';
import { getMe } from '../x/users.js';
import { run } from './result.js';

export function registerDeletePost(server: McpServer): void {
  server.registerTool(
    'delete_post',
    {
      title: 'Delete one of my posts',
      description:
        "Delete a post authored by this account. Always call with confirm:false first, show the post to the user, and " +
        'only call again with confirm:true after they explicitly approve deleting it. Refuses posts by other accounts.',
      inputSchema: {
        post_id: z.string().regex(/^\d+$/),
        confirm: z.boolean().default(false),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    ({ post_id, confirm }) =>
      run(async () => {
        const config = loadConfig();
        const me = await getMe('delete_post');
        // Lookup of our own post, so priced as an owned read.
        const res = await guarded(
          (x) => x.v2.singleTweet(post_id, { 'tweet.fields': [...TWEET_FIELDS] }),
          {
            tool: 'delete_post',
            endpoint: 'GET /2/tweets/:id',
            kind: 'owned_read',
            plan: { cost: costOf('owned_read', 1) },
            units: (r) => (r.data ? 1 : 0),
          },
        );
        if (!res.data) throw new UserFacingError(`Post ${post_id} was not found (already deleted?).`);
        if (res.data.author_id !== me.id) {
          throw new UserFacingError(`Post ${post_id} was not written by @${me.username}. Only your own posts can be deleted.`);
        }
        const preview = formatPost(res.data, me.username, config.timezone);

        if (!confirm) {
          return (
            `DRY RUN — nothing has been deleted.\n\n${preview}\n\nEstimated cost: ${usd(COST_USD.delete)}\n` +
            'Show this to the user. Only after they explicitly approve, call delete_post again with confirm:true.'
          );
        }

        const del = await guarded((x) => x.v2.deleteTweet(post_id), {
          tool: 'delete_post',
          endpoint: 'DELETE /2/tweets/:id',
          kind: 'delete',
          plan: { cost: COST_USD.delete },
          units: () => 1,
          meta: () => ({ post_id }),
          write: true,
        });
        if (!del.data.deleted) throw new UserFacingError(`X did not delete post ${post_id}.`);
        return `Deleted:\n${preview}`;
      }),
  );
}
