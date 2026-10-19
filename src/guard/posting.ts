import type { Config } from '../config.js';
import { findUrls, xLength } from '../x/text.js';
import { checkBudget, todayStatus, type TodayStatus } from './budget.js';
import { COST_USD, isDuplicate, round, usd, type CostKind, type UsageEntry } from './usage.js';

export type CreateKind = Extract<CostKind, 'post_create' | 'post_create_url'>;

export interface DraftReview {
  text: string;
  length: number;
  urls: string[];
  kind: CreateKind;
  cost: number;
  warnings: string[];
  refusals: string[];
}

export interface DraftsReview {
  drafts: DraftReview[];
  totalCost: number;
  today: TodayStatus;
  /** Refusals that apply to the whole request (caps). */
  refusals: string[];
  ok: boolean;
}

/** Validates one or more posts about to be created. Pure: no X calls. */
export function reviewDrafts(texts: string[], config: Config, entries: UsageEntry[], now: Date): DraftsReview {
  const max = config.posting.max_chars;
  const seen = new Set<string>();
  const drafts = texts.map((text): DraftReview => {
    const length = xLength(text);
    const urls = findUrls(text);
    const kind: CreateKind = urls.length > 0 ? 'post_create_url' : 'post_create';
    const warnings: string[] = [];
    const refusals: string[] = [];

    if (!text.trim()) refusals.push('Post is empty.');
    if (length > max) refusals.push(`Too long: ${length} / ${max} characters (URLs count as 23). Shorten by ${length - max}.`);
    if (isDuplicate(text, entries, now)) refusals.push('Exact duplicate of a post made in the last 7 days.');
    if (seen.has(text.trim())) refusals.push('Same text appears twice in this request.');
    seen.add(text.trim());
    if (urls.length > 0 && config.posting.warn_on_links) {
      warnings.push(
        `Contains a link (${urls.join(', ')}): costs ${usd(COST_USD.post_create_url)} instead of ` +
          `${usd(COST_USD.post_create)}. Consider posting without it and adding the link as a reply.`,
      );
    }
    return { text, length, urls, kind, cost: COST_USD[kind], warnings, refusals };
  });

  const totalCost = round(drafts.reduce((s, d) => s + d.cost, 0));
  const refusal = checkBudget(config, entries, now, { cost: totalCost, postCreates: texts.length });
  const refusals = refusal ? [refusal] : [];
  const ok = refusals.length === 0 && drafts.every((d) => d.refusals.length === 0);
  return { drafts, totalCost, today: todayStatus(config, entries, now), refusals, ok };
}

export function allRefusals(r: DraftsReview): string[] {
  const out = [...r.refusals];
  r.drafts.forEach((d, i) => d.refusals.forEach((msg) => out.push(r.drafts.length > 1 ? `Post ${i + 1}: ${msg}` : msg)));
  return out;
}
