import type { Config } from '../config.js';
import { entriesOnDays, periodDays, summarize, usd, type UsageEntry } from './usage.js';

export interface PlannedCall {
  /** Worst-case estimated cost of the call(s) in USD. */
  cost: number;
  /** Worst-case posts returned that count toward the daily read budget. */
  postReads?: number;
  /** Posts this call would create. */
  postCreates?: number;
}

export interface TodayStatus {
  postsRead: number;
  readsRemaining: number;
  postsCreated: number;
  createsRemaining: number;
  spend: number;
  spendRemaining: number;
}

export function todayStatus(config: Config, entries: UsageEntry[], now: Date): TodayStatus {
  const today = summarize(entriesOnDays(entries, periodDays('today', now, config.timezone), config.timezone));
  const b = config.budget;
  return {
    postsRead: today.postsRead,
    readsRemaining: Math.max(0, b.daily_post_reads - today.postsRead),
    postsCreated: today.postsCreated,
    createsRemaining: Math.max(0, b.daily_post_creates - today.postsCreated),
    spend: today.spend,
    spendRemaining: Math.max(0, b.daily_spend_usd - today.spend),
  };
}

/** Returns a human refusal message if the planned call would break a daily limit, else null. */
export function checkBudget(config: Config, entries: UsageEntry[], now: Date, plan: PlannedCall): string | null {
  const s = todayStatus(config, entries, now);
  const b = config.budget;
  const reads = plan.postReads ?? 0;
  const creates = plan.postCreates ?? 0;

  if (reads > 0 && reads > s.readsRemaining) {
    return (
      `Daily read budget would be exceeded: this needs up to ${reads} post reads but only ` +
      `${s.readsRemaining} of ${b.daily_post_reads} remain today (${config.timezone}). ` +
      `Ask for fewer results, wait until tomorrow, or raise budget.daily_post_reads in config.json.`
    );
  }
  if (creates > 0 && creates > s.createsRemaining) {
    return (
      `Daily post cap reached: ${s.postsCreated} of ${b.daily_post_creates} posts already created today` +
      (creates > 1 ? ` and this needs ${creates}` : '') +
      `. Raise budget.daily_post_creates in config.json if you really want more.`
    );
  }
  if (plan.cost > 0 && s.spend + plan.cost > b.daily_spend_usd + 1e-9) {
    return (
      `Daily spend cap would be exceeded: today's estimated spend is ${usd(s.spend)}, this call could cost ` +
      `up to ${usd(plan.cost)}, cap is ${usd(b.daily_spend_usd)}. Raise budget.daily_spend_usd in config.json to allow it.`
    );
  }
  return null;
}
