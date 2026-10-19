import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { UserFacingError } from '../x/client.js';

/** Runs a tool body and turns its text or error into an MCP tool result. Never includes stack traces. */
export async function run(body: () => Promise<string>): Promise<CallToolResult> {
  try {
    return { content: [{ type: 'text', text: await body() }] };
  } catch (err) {
    const message = err instanceof UserFacingError || err instanceof Error ? err.message : String(err);
    if (!(err instanceof UserFacingError)) console.error('[x-guard] tool error:', message);
    return { isError: true, content: [{ type: 'text', text: message }] };
  }
}
