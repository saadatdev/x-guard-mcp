// URL detection and X's weighted character counting (twitter-text v3 rules, simplified):
// every URL counts as 23, emoji count as 2, CJK and other wide scripts count as 2, everything else 1.

const TLDS = 'com|net|org|io|ai|dev|co|app|me|ly|gg|xyz|so|tech|info|us|uk|in|pk|tv|to|sh|link|news|blog|site';
// Explicit links (http://, www.) or bare domains like "n8n.io" — X auto-links those too.
// Not preceded by @ or a word char, so emails and @handles aren't matched.
const URL_SOURCE = String.raw`(?<![@\w.])(?:(?:https?:\/\/|www\.)\S+|(?:[a-z0-9-]+\.)+(?:${TLDS})\b(?:\/\S*)?)`;
const TRAILING_PUNCT = /[.,!?;:)\]"'”’]+$/;

const urlRegex = () => new RegExp(URL_SOURCE, 'gi');

export function findUrls(text: string): string[] {
  return (text.match(urlRegex()) ?? []).map((u) => u.replace(TRAILING_PUNCT, ''));
}

const URL_LENGTH = 23;
const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
const EMOJI = /\p{Extended_Pictographic}/u;

function weight(cp: number): number {
  if (cp <= 4351) return 1;
  if (cp >= 8192 && cp <= 8205) return 1;
  if (cp >= 8208 && cp <= 8223) return 1;
  if (cp >= 8242 && cp <= 8247) return 1;
  return 2;
}

/** Length of a post as X counts it against the 280 limit. */
export function xLength(text: string): number {
  let len = 0;
  // Each URL counts as 23; punctuation trailing a URL isn't part of it and is counted normally.
  const rest = text.normalize('NFC').replace(urlRegex(), (m) => {
    len += URL_LENGTH;
    return m.match(TRAILING_PUNCT)?.[0] ?? '';
  });
  for (const { segment } of segmenter.segment(rest)) {
    if (EMOJI.test(segment)) {
      len += 2;
      continue;
    }
    for (const ch of segment) len += weight(ch.codePointAt(0)!);
  }
  return len;
}
