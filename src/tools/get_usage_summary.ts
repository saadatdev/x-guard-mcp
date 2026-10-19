import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadConfig } from '../config.js';
import { todayStatus } from '../guard/budget.js';
import { entriesOnDays, periodDays, readUsage, summarize, usd } from '../guard/usage.js';
import { run } from './result.js';

const LABEL = { today: 'today', '7d': 'last 7 days', '30d': 'last 30 days' } as const;

export function registerGetUsageSummary(server: McpServer): void {
  server.registerTool(
    'get_usage_summary',
    {
      title: 'X API usage summary',
      description:
        'Estimated X API usage and spend from the local usage log, plus remaining daily budgets. Free (no X API call). ' +
        'These are estimates; the console.x.com Usage page is the source of truth.',
      inputSchema: {
        period: z.enum(['today', '7d', '30d']).default('today'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ period }) =>
      run(async () => {
        const config = loadConfig();
        const entries = readUsage();
        const now = new Date();
        const s = summarize(entriesOnDays(entries, periodDays(period, now, config.timezone), config.timezone));
        const t = todayStatus(config, entries, now);
        const b = config.budget;
        return [
          `X API usage — ${LABEL[period]} (${config.timezone}) — ESTIMATES`,
          `API calls: ${s.calls}${s.failed ? ` (${s.failed} failed, not billed)` : ''}`,
          `Posts read (search / accounts / digest): ${s.postsRead}`,
          `Own items read (my posts / mentions): ${s.ownedItemsRead}`,
          `User lookups: ${s.usersLookedUp}`,
          `Posts created: ${s.postsCreated} · deleted: ${s.postsDeleted}`,
          `Estimated spend: ${usd(s.spend)}`,
          '',
          `Today's budgets: reads ${t.postsRead}/${b.daily_post_reads} (${t.readsRemaining} left) · ` +
            `posts ${t.postsCreated}/${b.daily_post_creates} · spend ${usd(t.spend)}/${usd(b.daily_spend_usd)}`,
          '',
          'Estimates from data/usage.jsonl. The console.x.com Usage page is the source of truth.',
        ].join('\n');
      }),
  );
}
