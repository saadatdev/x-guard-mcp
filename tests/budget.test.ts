import { describe, expect, it } from 'vitest';
import { checkBudget, todayStatus } from '../src/guard/budget.js';
import { reviewDrafts, allRefusals } from '../src/guard/posting.js';
import { planDigest } from '../src/tools/get_watchlist_digest.js';
import { entry, testConfig } from './helpers.js';

const now = new Date('2026-10-19T10:00:00Z'); // 19:00 in Tokyo

describe('daily read budget', () => {
  it('allows a call that fits', () => {
    const log = [entry('2026-10-19T05:00:00Z', 'post_read', 280)];
    expect(checkBudget(testConfig(), log, now, { postReads: 20, cost: 0.1 })).toBeNull();
  });

  it('refuses a call that would exceed it and says how many remain', () => {
    const log = [entry('2026-10-19T05:00:00Z', 'post_read', 295)];
    const msg = checkBudget(testConfig(), log, now, { postReads: 10, cost: 0.05 });
    expect(msg).toMatch(/only 5 of 300 remain/);
    expect(msg).toMatch(/daily_post_reads in config\.json/);
  });

  it("does not count yesterday's reads (local day)", () => {
    const log = [entry('2026-10-18T14:30:00Z', 'post_read', 300)]; // 23:30 on the 18th in Tokyo
    expect(checkBudget(testConfig(), log, now, { postReads: 10, cost: 0.05 })).toBeNull();
  });

  it('does not count owned reads toward the read budget', () => {
    const log = [entry('2026-10-19T05:00:00Z', 'owned_read', 500)];
    expect(todayStatus(testConfig(), log, now).postsRead).toBe(0);
  });
});

describe('daily post cap and spend cap', () => {
  it('refuses once the post cap is reached', () => {
    const log = Array.from({ length: 8 }, (_, i) => entry(`2026-10-19T0${i}:10:00Z`, 'post_create', 1));
    expect(checkBudget(testConfig(), log, now, { postCreates: 1, cost: 0.015 })).toMatch(/post cap reached: 8 of 8/);
  });

  it('refuses a thread that would go over the cap', () => {
    const log = Array.from({ length: 6 }, (_, i) => entry(`2026-10-19T0${i}:10:00Z`, 'post_create', 1));
    expect(checkBudget(testConfig(), log, now, { postCreates: 3, cost: 0.045 })).toMatch(/this needs 3/);
  });

  it('refuses a call that would push spend over the cap', () => {
    const log = [entry('2026-10-19T05:00:00Z', 'post_read', 290)]; // $1.45
    const cfg = testConfig({ daily_post_reads: 1000, daily_spend_usd: 1.5 });
    expect(checkBudget(cfg, log, now, { postReads: 20, cost: 0.1 })).toMatch(/spend cap/);
    expect(checkBudget(cfg, log, now, { postReads: 10, cost: 0.05 })).toBeNull();
  });
});

describe('post review', () => {
  it('prices a link post at $0.20 and warns', () => {
    const r = reviewDrafts(['New tool: https://example.com/x'], testConfig(), [], now);
    expect(r.ok).toBe(true);
    expect(r.drafts[0].cost).toBe(0.2);
    expect(r.drafts[0].warnings[0]).toMatch(/reply/);
  });

  it('refuses over-limit text', () => {
    const r = reviewDrafts(['a'.repeat(281)], testConfig(), [], now);
    expect(r.ok).toBe(false);
    expect(allRefusals(r)[0]).toMatch(/281 \/ 280/);
  });

  it('refuses a duplicate of a recent post', () => {
    const log = [entry('2026-10-18T05:00:00Z', 'post_create', 1, { post_id: '9', text: 'hello world' })];
    expect(reviewDrafts(['hello world'], testConfig(), log, now).ok).toBe(false);
  });

  it('sums thread cost and numbers refusals by post', () => {
    const r = reviewDrafts(['one', 'two', 'a'.repeat(300)], testConfig(), [], now);
    expect(r.totalCost).toBe(0.045);
    expect(allRefusals(r)[0]).toMatch(/^Post 3:/);
  });
});

describe('digest worst case', () => {
  it('uses the X minimum of 5 per timeline plus topic results and lookups', () => {
    const p = planDigest(testConfig(), 3, true, 2);
    expect(p.perAccountRequest).toBe(5);
    expect(p.worstCaseReads).toBe(2 * 5 + 10);
    expect(p.worstCaseCost).toBe(0.12);
  });

  it('skips the topic search when disabled', () => {
    expect(planDigest(testConfig(), 8, false, 0).worstCaseReads).toBe(16);
  });
});
