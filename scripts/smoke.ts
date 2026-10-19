// Manual smoke test: npm run smoke
// Verifies credentials (GET /2/users/me), then runs one search with max_results 10.
// Costs about $0.06. Never posts.
import { loadConfig } from '../src/config.js';
import { loadEnv } from '../src/env.js';
import { costOf, usd } from '../src/guard/usage.js';
import { runSearch } from '../src/tools/search_posts.js';
import { formatPosts } from '../src/x/format.js';
import { getMe } from '../src/x/users.js';

async function main(): Promise<void> {
  loadEnv();
  const config = loadConfig();

  const me = await getMe('smoke', true);
  console.log(`Authenticated as @${me.username} (id ${me.id})`);

  const res = await runSearch('smoke', '"MCP server"', 10, 'relevancy');
  console.log(`\nSearch: ${res.query}\n${res.tweets.length} results · est. ${usd(costOf('post_read', res.tweets.length))}\n`);
  console.log(formatPosts(res.tweets, res.handleOf, config.timezone));

  if (res.tweets.length !== 10) throw new Error(`Expected 10 results, got ${res.tweets.length}.`);
  console.log('\nSMOKE TEST PASSED');
}

main().catch((err) => {
  console.error(`\nSMOKE TEST FAILED: ${(err as Error).message}`);
  process.exit(1);
});
