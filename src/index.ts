#!/usr/bin/env node
// stdout is the MCP protocol channel: everything else goes to stderr.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { loadEnv } from './env.js';
import { registerCreatePost } from './tools/create_post.js';
import { registerCreateThread } from './tools/create_thread.js';
import { registerDeletePost } from './tools/delete_post.js';
import { registerGetAccountPosts } from './tools/get_account_posts.js';
import { registerGetMyMentions } from './tools/get_my_mentions.js';
import { registerGetMyPosts } from './tools/get_my_posts.js';
import { registerGetUsageSummary } from './tools/get_usage_summary.js';
import { registerGetWatchlistDigest } from './tools/get_watchlist_digest.js';
import { registerSearchPosts } from './tools/search_posts.js';
import { registerUploadMedia } from './tools/upload_media.js';

async function main(): Promise<void> {
  loadEnv();
  loadConfig();

  const server = new McpServer({ name: 'x-guard', version: '1.0.0' });

  registerSearchPosts(server);
  registerGetAccountPosts(server);
  registerGetWatchlistDigest(server);
  registerGetMyMentions(server);
  registerGetMyPosts(server);
  registerCreatePost(server);
  registerCreateThread(server);
  registerUploadMedia(server);
  registerDeletePost(server);
  registerGetUsageSummary(server);

  await server.connect(new StdioServerTransport());
  console.error('[x-guard] ready');
}

main().catch((err) => {
  console.error(`[x-guard] failed to start: ${(err as Error).message}`);
  process.exit(1);
});
