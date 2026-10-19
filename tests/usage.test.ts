import { describe, expect, it } from 'vitest';
import { costOf, dayKey, entriesOnDays, isDuplicate, periodDays, summarize } from '../src/guard/usage.js';
import { entry } from './helpers.js';

const TZ = 'Asia/Tokyo'; // UTC+9, no DST

describe('cost math', () => {
  it('prices per unit from the cost table', () => {
    expect(costOf('post_read', 50)).toBe(0.25);
    expect(costOf('post_read', 10)).toBe(0.05);
    expect(costOf('post_create', 1)).toBe(0.015);
    expect(costOf('post_create_url', 1)).toBe(0.2);
    expect(costOf('owned_read', 20)).toBe(0.02);
    expect(costOf('user_read', 3)).toBe(0.03);
    expect(costOf('delete', 1)).toBe(0.01);
  });

  it('summarizes spend and counts, ignoring failed calls', () => {
    const s = summarize([
      entry('2026-10-19T05:00:00Z', 'post_read', 10),
      entry('2026-10-19T05:01:00Z', 'post_create', 1),
      entry('2026-10-19T05:02:00Z', 'post_create_url', 1),
      { ...entry('2026-10-19T05:03:00Z', 'post_read', 0), ok: false, cost: 0 },
    ]);
    expect(s.calls).toBe(4);
    expect(s.failed).toBe(1);
    expect(s.postsRead).toBe(10);
    expect(s.postsCreated).toBe(2);
    expect(s.spend).toBe(0.265);
  });
});

describe('timezone day boundaries', () => {
  it('rolls over at local midnight, i.e. 15:00 UTC', () => {
    expect(dayKey(new Date('2026-10-18T14:59:59Z'), TZ)).toBe('2026-10-18');
    expect(dayKey(new Date('2026-10-18T15:00:00Z'), TZ)).toBe('2026-10-19');
  });

  it("counts a 16:00 UTC call as today's when it is already the next day locally", () => {
    const now = new Date('2026-10-19T03:00:00Z'); // 12:00 on the 19th in Tokyo
    const entries = [entry('2026-10-18T16:00:00Z', 'post_read', 5), entry('2026-10-18T14:00:00Z', 'post_read', 7)];
    const today = entriesOnDays(entries, periodDays('today', now, TZ), TZ);
    expect(today.map((e) => e.units)).toEqual([5]);
  });

  it('7d covers seven local calendar days', () => {
    const days = periodDays('7d', new Date('2026-10-19T03:00:00Z'), TZ);
    expect([...days]).toEqual(['2026-10-19', '2026-10-18', '2026-10-17', '2026-10-16', '2026-10-15', '2026-10-14', '2026-10-13']);
  });

  it('does not skip the short day when DST starts', () => {
    // 00:30 EDT on 9 Mar 2026; 8 Mar was only 23 hours long in New York.
    const days = periodDays('7d', new Date('2026-03-09T04:30:00Z'), 'America/New_York');
    expect([...days]).toEqual(['2026-03-09', '2026-03-08', '2026-03-07', '2026-03-06', '2026-03-05', '2026-03-04', '2026-03-03']);
  });
});

describe('duplicate detection', () => {
  const now = new Date('2026-10-19T12:00:00Z');

  it('flags an exact repeat within 7 days', () => {
    const log = [entry('2026-10-15T10:00:00Z', 'post_create', 1, { post_id: '1', text: 'Hello world' })];
    expect(isDuplicate('Hello world', log, now)).toBe(true);
    expect(isDuplicate('  Hello world  ', log, now)).toBe(true);
    expect(isDuplicate('Hello world!', log, now)).toBe(false);
  });

  it('ignores posts older than 7 days', () => {
    const log = [entry('2026-10-11T10:00:00Z', 'post_create', 1, { post_id: '1', text: 'Hello world' })];
    expect(isDuplicate('Hello world', log, now)).toBe(false);
  });

  it('ignores posts that were later deleted', () => {
    const log = [
      entry('2026-10-18T10:00:00Z', 'post_create', 1, { post_id: '1', text: 'Hello world' }),
      entry('2026-10-18T11:00:00Z', 'delete', 1, { post_id: '1' }),
    ];
    expect(isDuplicate('Hello world', log, now)).toBe(false);
  });

  it('ignores failed create attempts', () => {
    const log = [{ ...entry('2026-10-18T10:00:00Z', 'post_create', 0, { text: 'Hello world' }), ok: false }];
    expect(isDuplicate('Hello world', log, now)).toBe(false);
  });
});
