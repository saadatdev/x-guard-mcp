# X API reference

Compiled 18 Oct 2026 from docs.x.com and third-party trackers that mirror it.
**The console.x.com pricing and usage pages and docs.x.com are the source of truth.** If anything
here disagrees with them, trust them and update the cost table in `src/guard/usage.ts`.

## Auth

- Every call uses **OAuth 1.0a user context**, so the server acts as the account that owns the
  Access Token: `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`.
  An app-only Bearer token would work for public reads, but one client for everything is simpler.
- App permissions must be **Read and write**, and the Access Token must be generated **after**
  that setting is saved. A token generated earlier stays read-only and posting returns 403.

## Endpoints used (X API v2)

| Tool | Endpoint |
|---|---|
| verify credentials | `GET /2/users/me` |
| search_posts | `GET /2/tweets/search/recent` (`max_results` 10–100) |
| resolve username | `GET /2/users/by/username/:username` |
| get_account_posts | `GET /2/users/:id/tweets` (`max_results` 5–100) |
| get_my_mentions | `GET /2/users/:id/mentions` |
| get_my_posts | `GET /2/users/:id/tweets` (own id) |
| create_post / create_thread | `POST /2/tweets` (`reply.in_reply_to_tweet_id`, `media.media_ids`) |
| delete_post | `GET /2/tweets/:id`, then `DELETE /2/tweets/:id` |
| upload_media | `POST /2/media/upload`, `POST /2/media/metadata` (alt text) |

Fields requested: `tweet.fields=created_at,public_metrics,author_id,conversation_id`,
`expansions=author_id`, `user.fields=username,name`.

Search operators that are useful here: `-is:retweet`, `-is:reply`, `lang:en`, `from:handle`,
quoted phrases, `OR` (uppercase). Some operators, such as `min_faves:`, depend on the access tier.

## Pay-per-use prices (as listed 10 Oct 2026)

| Action | Price |
|---|---|
| Post: create | $0.015 per request |
| Post: create **with URL** | $0.200 per request |
| Post: create (summoned reply, i.e. a reply to a post that mentions you) | $0.010 |
| Interaction: delete | $0.010 |
| Posts: read (search, other accounts' posts) | $0.005 **per post returned** |
| User: read (lookup) | $0.010 per user returned |
| Owned reads (your own posts, mentions, followers) | $0.001 per item returned |

- Billing is per **resource returned**: a search returning 50 posts costs 50 × $0.005 = $0.25.
- Reads are capped at 2,000,000 per month.
- Credits are prepaid; calls fail with 402 when the balance reaches $0.
- Media upload is not listed in the price table; the usage log records it as $0.

## Platform rules that shaped the design (2026)

- 23 Feb 2026: automated replies are only allowed in "summoned" contexts (your account was
  @mentioned or quoted).
- 16 Apr 2026: follow and like endpoints removed from all self-serve plans.
- Browser automation, scraping and unofficial API clients are prohibited on every tier.
- Bulk cold DMs and cross-account duplicate content are prohibited.
- Posting on a rigid fixed interval can attract enforcement even within rate limits.
- Posting rate limit: 100 posts per 15 minutes per user.

## Sources

- https://docs.x.com/fundamentals/developer-apps
- https://opentweet.io/x-api-pricing (price table, checked against docs.x.com 10 Oct 2026)
- https://postproxy.dev/blog/x-api-pricing-2026/
- https://socialnexis.com/guides/x-api-basic-enterprise-automation-rules
