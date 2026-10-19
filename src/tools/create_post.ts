import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SendTweetV2Params } from 'twitter-api-v2';
import { z } from 'zod';
import { loadConfig, type Config } from '../config.js';
import { allRefusals, reviewDrafts, type CreateKind, type DraftsReview } from '../guard/posting.js';
import { readUsage, usd } from '../guard/usage.js';
import { guarded, UserFacingError } from '../x/client.js';
import { statusUrl } from '../x/format.js';
import { run } from './result.js';

export const CONFIRM_RULE =
  'Always call with confirm:false first, show the preview to the user, and only call again with confirm:true ' +
  'after the user explicitly approves this exact text.';

export function todayLine(review: DraftsReview, config: Config, creating: number): string {
  const t = review.today;
  return (
    `Posts today: ${t.postsCreated} / ${config.budget.daily_post_creates} (this adds ${creating})\n` +
    `Spend today: ${usd(t.spend)} / ${usd(config.budget.daily_spend_usd)}`
  );
}

export function refusalBlock(review: DraftsReview): string {
  const r = allRefusals(review);
  return r.length ? `\nCANNOT POST:\n${r.map((m) => `- ${m}`).join('\n')}` : '';
}

/** Creates one post through the guard; records its id + text for duplicate detection. */
export async function publish(tool: string, params: SendTweetV2Params, kind: CreateKind, cost: number) {
  const res = await guarded((x) => x.v2.tweet(params), {
    tool,
    endpoint: 'POST /2/tweets',
    kind,
    plan: { cost, postCreates: 1 },
    units: () => 1,
    meta: (r) => ({ post_id: r.data.id, text: params.text }),
    write: true,
  });
  return res.data.id;
}

export function registerCreatePost(server: McpServer): void {
  server.registerTool(
    'create_post',
    {
      title: 'Create a post',
      description:
        `Publish a post (optionally a reply, optionally with media from upload_media). ${CONFIRM_RULE} ` +
        'confirm:false is a free dry run showing final text, character count, estimated cost, daily cap and warnings.',
      inputSchema: {
        text: z.string().min(1),
        reply_to_id: z.string().regex(/^\d+$/).optional().describe('Post id to reply to — only when the user explicitly asks'),
        media_ids: z.array(z.string().regex(/^\d+$/)).min(1).max(4).optional().describe('From upload_media'),
        confirm: z.boolean().default(false),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    ({ text, reply_to_id, media_ids, confirm }) =>
      run(async () => {
        const config = loadConfig();
        const review = reviewDrafts([text], config, readUsage(), new Date());
        const draft = review.drafts[0];

        if (!confirm) {
          const warnings = [...draft.warnings];
          if (reply_to_id) {
            warnings.push(
              'This is a reply. Since Feb 2026 X only allows API replies in "summoned" contexts (the post mentions or ' +
                'quotes your account); otherwise X may reject it.',
            );
          }
          return [
            'DRY RUN — nothing has been posted.',
            '',
            'Text:',
            '"""',
            text,
            '"""',
            `Characters: ${draft.length} / ${config.posting.max_chars}`,
            reply_to_id ? `Reply to: ${statusUrl(reply_to_id)}` : '',
            media_ids ? `Media attached: ${media_ids.length}` : '',
            `Estimated cost: ${usd(draft.cost)}`,
            todayLine(review, config, 1),
            warnings.length ? `\nWarnings:\n${warnings.map((w) => `- ${w}`).join('\n')}` : '',
            refusalBlock(review),
            review.ok ? `\nShow this preview to the user. Only after they approve this exact text, call create_post again with confirm:true.` : '',
          ]
            .filter((l) => l !== '')
            .join('\n');
        }

        if (!review.ok) throw new UserFacingError(`Not posted.${refusalBlock(review)}`);
        const params: SendTweetV2Params = { text };
        if (reply_to_id) params.reply = { in_reply_to_tweet_id: reply_to_id };
        if (media_ids) params.media = { media_ids: media_ids as NonNullable<SendTweetV2Params['media']>['media_ids'] };
        const id = await publish('create_post', params, draft.kind, draft.cost);
        return `Posted: ${statusUrl(id)}\nEstimated cost: ${usd(draft.cost)}`;
      }),
  );
}
