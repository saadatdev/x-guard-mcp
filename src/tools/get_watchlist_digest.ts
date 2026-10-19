import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TweetV2 } from 'twitter-api-v2';
import { z } from 'zod';
import { loadConfig, type Config } from '../config.js';
import { checkBudget } from '../guard/budget.js';
import { costOf, readUsage, round, usd } from '../guard/usage.js';
import { UserFacingError } from '../x/client.js';
import { engagement, formatPost } from '../x/format.js';
import { isUserCached } from '../x/users.js';
import { fetchAccountPosts, TIMELINE_MIN_RESULTS } from './get_account_posts.js';
import { run } from './result.js';
import { runSearch } from './search_posts.js';

/** OR-joined topics, multi-word terms quoted: ("AI agents" OR MCP OR ...). */
export function buildTopicQuery(topics: string[]): string {
  const terms = topics.map((t) => t.trim()).filter(Boolean).map((t) => (/\s/.test(t) ? `"${t}"` : t));
  return `(${terms.join(' OR ')})`;
}

export interface DigestPlan {
  perAccountRequest: number;
  topicResults: number;
  worstCaseReads: number;
  userLookups: number;
  worstCaseCost: number;
}

/** Worst case for one digest run. Timelines must request at least 5 posts each (X API minimum). */
export function planDigest(config: Config, postsPerAccount: number, includeTopics: boolean, uncachedUsers: number): DigestPlan {
  const perAccountRequest = Math.max(TIMELINE_MIN_RESULTS, postsPerAccount);
  const topicResults = includeTopics && config.topics.length > 0 ? config.reading.default_max_results : 0;
  const worstCaseReads = config.watch_accounts.length * perAccountRequest + topicResults;
  const worstCaseCost = round(costOf('post_read', worstCaseReads) + costOf('user_read', uncachedUsers));
  return { perAccountRequest, topicResults, worstCaseReads, userLookups: uncachedUsers, worstCaseCost };
}

function section(title: string, tweets: TweetV2[], handleOf: (t: TweetV2) => string, timeZone: string): string {
  if (tweets.length === 0) return `## ${title}\nNo recent posts.`;
  const sorted = [...tweets].sort((a, b) => engagement(b) - engagement(a));
  return `## ${title}\n` + sorted.map((t, i) => formatPost(t, handleOf(t), timeZone, i + 1)).join('\n\n');
}

export function registerGetWatchlistDigest(server: McpServer): void {
  server.registerTool(
    'get_watchlist_digest',
    {
      title: 'Watch-list digest',
      description:
        'Latest posts from every account in config.json watch_accounts, plus one topic search built from config.json ' +
        'topics, grouped by source and sorted by engagement. Refuses up front if the worst-case read count would ' +
        "exceed today's remaining read budget. Costs $0.005 per post returned.",
      inputSchema: {
        posts_per_account: z.number().int().min(1).max(10).default(3),
        topics_query: z.boolean().default(true).describe('Also run one search over config.json topics'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ posts_per_account, topics_query }) =>
      run(async () => {
        const config = loadConfig();
        const uncached = config.watch_accounts.filter((u) => !isUserCached(u)).length;
        const plan = planDigest(config, posts_per_account, topics_query, uncached);
        const refusal = checkBudget(config, readUsage(), new Date(), { postReads: plan.worstCaseReads, cost: plan.worstCaseCost });
        if (refusal) {
          throw new UserFacingError(
            `Digest not run. Worst case: ${config.watch_accounts.length} accounts × ${plan.perAccountRequest} posts` +
              (plan.topicResults ? ` + ${plan.topicResults} topic results` : '') +
              ` = ${plan.worstCaseReads} post reads, est. ${usd(plan.worstCaseCost)}.\n${refusal}`,
          );
        }

        const sections: string[] = [];
        let reads = 0;
        for (const account of config.watch_accounts) {
          try {
            const { handle, tweets } = await fetchAccountPosts('get_watchlist_digest', account, plan.perAccountRequest, true);
            reads += tweets.length;
            // Timeline is newest-first: keep the latest N, then rank them by engagement.
            sections.push(section(`@${handle}`, tweets.slice(0, posts_per_account), () => handle, config.timezone));
          } catch (err) {
            sections.push(`## @${account}\nSkipped: ${(err as Error).message}`);
          }
        }
        if (plan.topicResults) {
          try {
            const res = await runSearch('get_watchlist_digest', buildTopicQuery(config.topics), plan.topicResults, 'relevancy');
            reads += res.tweets.length;
            sections.push(section(`Topics: ${res.query}`, res.tweets, res.handleOf, config.timezone));
          } catch (err) {
            sections.push(`## Topics\nSkipped: ${(err as Error).message}`);
          }
        }

        const header =
          `Watch-list digest — ${reads} posts read · est. cost ${usd(costOf('post_read', reads))}` +
          (plan.userLookups ? ` + up to ${usd(costOf('user_read', plan.userLookups))} one-time username lookups` : '');
        return `${header}\n\n${sections.join('\n\n')}`;
      }),
  );
}
