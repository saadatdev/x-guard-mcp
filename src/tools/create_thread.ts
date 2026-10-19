import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadConfig } from '../config.js';
import { reviewDrafts } from '../guard/posting.js';
import { readUsage, usd } from '../guard/usage.js';
import { UserFacingError } from '../x/client.js';
import { statusUrl } from '../x/format.js';
import { CONFIRM_RULE, publish, refusalBlock, todayLine } from './create_post.js';
import { run } from './result.js';

export function registerCreateThread(server: McpServer): void {
  server.registerTool(
    'create_thread',
    {
      title: 'Create a thread',
      description:
        `Publish a thread of 2–10 posts, each replying to the previous one. ${CONFIRM_RULE} ` +
        'confirm:false is a free dry run showing every numbered post, character counts, total cost and warnings.',
      inputSchema: {
        posts: z.array(z.string().min(1)).min(2).max(10),
        confirm: z.boolean().default(false),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    ({ posts, confirm }) =>
      run(async () => {
        const config = loadConfig();
        const review = reviewDrafts(posts, config, readUsage(), new Date());

        if (!confirm) {
          const lines = ['DRY RUN — nothing has been posted.', ''];
          review.drafts.forEach((d, i) => {
            lines.push(`${i + 1}/${posts.length}  (${d.length} / ${config.posting.max_chars} chars · ${usd(d.cost)})`);
            lines.push(d.text, '');
            d.warnings.forEach((w) => lines.push(`  ! ${w}`));
          });
          lines.push(`Total estimated cost: ${usd(review.totalCost)}`, todayLine(review, config, posts.length));
          const refusals = refusalBlock(review);
          if (refusals) lines.push(refusals);
          else lines.push('', 'Show this preview to the user. Only after they approve these exact posts, call create_thread again with confirm:true.');
          return lines.join('\n');
        }

        if (!review.ok) throw new UserFacingError(`Thread not posted.${refusalBlock(review)}`);
        const posted: string[] = [];
        let previousId: string | undefined;
        for (const [i, d] of review.drafts.entries()) {
          try {
            previousId = await publish(
              'create_thread',
              { text: d.text, ...(previousId ? { reply: { in_reply_to_tweet_id: previousId } } : {}) },
              d.kind,
              d.cost,
            );
            posted.push(`${i + 1}. ${statusUrl(previousId)}`);
          } catch (err) {
            const notPosted = review.drafts.slice(i).map((_, j) => `${i + j + 1}`);
            throw new UserFacingError(
              `Thread stopped at post ${i + 1}: ${(err as Error).message}\n\n` +
                `Posted (${posted.length}):\n${posted.join('\n') || '(none)'}\n\n` +
                `NOT posted: ${notPosted.join(', ')}`,
            );
          }
        }
        return `Thread posted (${posted.length} posts, est. ${usd(review.totalCost)}):\n${posted.join('\n')}`;
      }),
  );
}
