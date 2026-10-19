import { ApiPartialResponseError, ApiRequestError, ApiResponseError, TwitterApi } from 'twitter-api-v2';
import { loadConfig } from '../config.js';
import { loadEnv } from '../env.js';
import { checkBudget, type PlannedCall } from '../guard/budget.js';
import { appendUsage, costOf, readUsage, type CostKind, type UsageEntry } from '../guard/usage.js';
import { formatTime } from './format.js';

/** An error whose message is safe and meant to be shown to the user as-is. */
export class UserFacingError extends Error {}

let client: TwitterApi | undefined;

/** OAuth 1.0a user-context client (acts as the account owner) — used for every call. */
function xClient(): TwitterApi {
  if (!client) {
    const env = loadEnv();
    client = new TwitterApi({
      appKey: env.appKey,
      appSecret: env.appSecret,
      accessToken: env.accessToken,
      accessSecret: env.accessSecret,
    });
  }
  return client;
}

export interface GuardedCall<T> {
  tool: string;
  endpoint: string;
  kind: CostKind;
  /** Worst case, checked against today's budgets before the call. */
  plan: PlannedCall;
  /** Billed units actually returned/used (e.g. posts returned). */
  units: (result: T) => number;
  /** Extra fields for the usage log (created post id + text). */
  meta?: (result: T) => Pick<UsageEntry, 'post_id' | 'text'>;
  /** Write calls get the "read-only token" hint on 403. */
  write?: boolean;
}

/** The single path for every X API call: budget check → call → usage record → human errors. */
export async function guarded<T>(fn: (x: TwitterApi) => Promise<T>, call: GuardedCall<T>): Promise<T> {
  const config = loadConfig();
  const refusal = checkBudget(config, readUsage(), new Date(), call.plan);
  if (refusal) throw new UserFacingError(refusal);

  const base = { ts: new Date().toISOString(), tool: call.tool, endpoint: call.endpoint, kind: call.kind };
  let result: T;
  try {
    result = await fn(xClient());
  } catch (err) {
    appendUsage({ ...base, units: 0, cost: 0, ok: false, status: err instanceof ApiResponseError ? err.code : undefined });
    throw new UserFacingError(humanError(err, call.write ?? false, config.timezone));
  }
  const units = call.units(result);
  appendUsage({ ...base, units, cost: costOf(call.kind, units), ok: true, ...call.meta?.(result) });
  return result;
}

function xMessage(err: ApiResponseError): string {
  const d = err.data as { title?: string; detail?: string } | undefined;
  const fromErrors = err.errors
    ?.map((e) => ('detail' in e && e.detail) || ('message' in e && e.message) || ('title' in e && e.title))
    .filter(Boolean)
    .join('; ');
  return d?.detail || fromErrors || d?.title || 'no details given';
}

export function humanError(err: unknown, write: boolean, timeZone: string): string {
  if (err instanceof ApiResponseError) {
    const msg = xMessage(err);
    if (err.code === 401) {
      return 'X rejected the credentials. Check .env values; regenerate keys in console.x.com if needed.';
    }
    if (err.code === 402 || /credit|payment|billing/i.test(msg)) {
      return 'Your X API credit balance is empty. Add credits in console.x.com → Billing.';
    }
    if (err.code === 429) {
      const limits = [err.rateLimit, err.rateLimit?.userDay, err.rateLimit?.day].filter((l) => l && l.remaining === 0);
      const reset = (limits[0] ?? err.rateLimit)?.reset;
      const when = reset ? formatTime(new Date(reset * 1000).toISOString(), timeZone) + ` (${timeZone})` : 'unknown';
      return `X rate limit hit for this endpoint. It resets at ${when}. Not retrying automatically.`;
    }
    if (err.code === 403 && write) {
      if (/duplicate/i.test(msg)) return `X rejected this as duplicate content (403): ${msg}`;
      return (
        'The Access Token is read-only. In console.x.com set App permissions to Read and write, ' +
        `then REGENERATE the Access Token + Secret and update .env. (X said: ${msg})`
      );
    }
    return `X API error ${err.code}: ${msg}`;
  }
  if (err instanceof ApiRequestError) return `Could not reach X (network error): ${err.requestError.message}`;
  if (err instanceof ApiPartialResponseError) return 'X closed the connection before the response finished. Try again.';
  if (err instanceof UserFacingError) return err.message;
  return `Unexpected error: ${(err as Error)?.message ?? String(err)}`;
}

export const TWEET_FIELDS = ['created_at', 'public_metrics', 'author_id', 'conversation_id'] as const;
export const USER_FIELDS = ['username', 'name'] as const;
