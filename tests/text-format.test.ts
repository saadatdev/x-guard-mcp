import { describe, expect, it } from 'vitest';
import type { TweetV2 } from 'twitter-api-v2';
import { findUrls, xLength } from '../src/x/text.js';
import { engagement, formatPost, postUrl } from '../src/x/format.js';
import { buildQuery } from '../src/tools/search_posts.js';
import { buildTopicQuery } from '../src/tools/get_watchlist_digest.js';

describe('URL detection', () => {
  it('finds explicit and bare-domain links', () => {
    expect(findUrls('see https://example.com/a?b=1.')).toEqual(['https://example.com/a?b=1']);
    expect(findUrls('docs at www.example.org')).toEqual(['www.example.org']);
    expect(findUrls('built with n8n.io today')).toEqual(['n8n.io']);
  });

  it('ignores handles, emails and plain text', () => {
    expect(findUrls('thanks @example_user for the tip')).toEqual([]);
    expect(findUrls('mail me: me@example.com')).toEqual([]);
    expect(findUrls('version 1.5 is out. Nice!')).toEqual([]);
  });
});

describe('X character counting', () => {
  it('counts plain text by characters', () => {
    expect(xLength('hello')).toBe(5);
  });

  it('counts every URL as 23', () => {
    expect(xLength('https://example.com/a/very/long/path/that/is/way/more/than/23')).toBe(23);
    expect(xLength('go: https://x.com')).toBe(4 + 23);
    expect(xLength('link https://a.co.')).toBe(5 + 23 + 1);
  });

  it('counts emoji and CJK as 2', () => {
    expect(xLength('🚀')).toBe(2);
    expect(xLength('👩‍💻')).toBe(2);
    expect(xLength('日本')).toBe(4);
  });

  it('280 plain chars fit, 281 do not', () => {
    expect(xLength('a'.repeat(280))).toBe(280);
    expect(xLength('a'.repeat(281))).toBe(281);
  });
});

describe('query building', () => {
  it('appends the default suffix', () => {
    expect(buildQuery('"MCP server"', '-is:retweet lang:en')).toBe('"MCP server" -is:retweet lang:en');
  });

  it('does not duplicate operators the query already sets', () => {
    expect(buildQuery('MCP lang:de', '-is:retweet lang:en')).toBe('MCP lang:de -is:retweet');
    expect(buildQuery('MCP -is:retweet', '-is:retweet lang:en')).toBe('MCP -is:retweet lang:en');
    expect(buildQuery('MCP is:retweet lang:en', '-is:retweet lang:en')).toBe('MCP is:retweet lang:en');
  });

  it('OR-joins topics and quotes multi-word terms', () => {
    expect(buildTopicQuery(['MCP server', 'n8n', 'Make.com', 'AI agents'])).toBe('("MCP server" OR n8n OR Make.com OR "AI agents")');
  });
});

describe('post formatting', () => {
  const tweet: TweetV2 = {
    id: '123',
    text: 'Shipping an MCP server today ',
    edit_history_tweet_ids: ['123'],
    created_at: '2026-10-19T07:05:00.000Z',
    public_metrics: { like_count: 12, retweet_count: 3, reply_count: 2, quote_count: 1, impression_count: 4567, bookmark_count: 0 },
  };

  it('builds post URLs', () => {
    expect(postUrl('example_user', '123')).toBe('https://x.com/example_user/status/123');
  });

  it('includes handle, local time, text, metrics and link', () => {
    const out = formatPost(tweet, 'example_user', 'Asia/Tokyo', 1);
    expect(out).toBe(
      [
        '1. @example_user · 19 Oct 2026, 16:05',
        'Shipping an MCP server today',
        '12 likes · 3 reposts · 2 replies · 4,567 views',
        'https://x.com/example_user/status/123',
      ].join('\n'),
    );
  });

  it('scores engagement from public metrics', () => {
    expect(engagement(tweet)).toBe(18);
    expect(engagement({ ...tweet, public_metrics: undefined })).toBe(0);
  });
});
