import type { TweetV2 } from 'twitter-api-v2';

export function postUrl(handle: string, id: string): string {
  return `https://x.com/${handle}/status/${id}`;
}

export function formatTime(iso: string | undefined, timeZone: string): string {
  if (!iso) return 'unknown time';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

export function engagement(t: TweetV2): number {
  const m = t.public_metrics;
  if (!m) return 0;
  return (m.like_count ?? 0) + (m.retweet_count ?? 0) + (m.reply_count ?? 0) + (m.quote_count ?? 0);
}

export function formatMetrics(t: TweetV2): string {
  const m = t.public_metrics;
  if (!m) return '';
  const bits = [`${m.like_count ?? 0} likes`, `${m.retweet_count ?? 0} reposts`, `${m.reply_count ?? 0} replies`];
  if (typeof m.impression_count === 'number') bits.push(`${m.impression_count.toLocaleString('en-US')} views`);
  return bits.join(' · ');
}

export function formatPost(t: TweetV2, handle: string, timeZone: string, index?: number): string {
  const head = `${index !== undefined ? `${index}. ` : ''}@${handle} · ${formatTime(t.created_at, timeZone)}`;
  const metrics = formatMetrics(t);
  return [head, t.text.trim(), metrics, postUrl(handle, t.id)].filter(Boolean).join('\n');
}

export function formatPosts(
  tweets: TweetV2[],
  handleOf: (t: TweetV2) => string,
  timeZone: string,
): string {
  if (tweets.length === 0) return 'No posts found.';
  return tweets.map((t, i) => formatPost(t, handleOf(t), timeZone, i + 1)).join('\n\n');
}

/** Link to a post without knowing its author; X redirects /i/status/ to the canonical URL. */
export function statusUrl(id: string): string {
  return `https://x.com/i/status/${id}`;
}
