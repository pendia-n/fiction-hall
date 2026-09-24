# Fiction Hall — new-chat handoff

Last audited: **2026-09-24 05:37 UTC**. Source checkout: `/Users/nosensetxt/mvp/fiction-hall`, branch `main`, HEAD `7c3838f` before this document was added. Production: <https://nocative.pendia-community.workers.dev>. The Worker name is `nocative`; the production D1 binding `DB` points to `nocative-db` (`ac5df977-dc7b-428e-b768-1f39fd01d36c`). Git `origin` still uses the old `pendia-n/nocative` URL, which redirects to `pendia-n/fiction-hall`.

## Read this first

Fiction Hall is a Cloudflare Worker + D1 + React/Vite fiction-writing and reading site. Authors create **collections** (`story`) containing **chapters/notes** (`writing`), publish chapters, choose free or premium access, and can sell one-year or permanent collection unlocks. Readers browse, like, read, buy, keep a personal reading shelf, and post anonymous-to-the-public passage bookmarks with reflections. Stripe Connect and Arbitrum token payments are separate payout rails. Live video/chat uses LiveKit and a Durable Object; gifts are Stripe-only. There is **no active subscription requirement for readers or writers**, notwithstanding legacy plan/subscription tables and API routes.

This handoff was derived from current source and **read-only production D1 schema/aggregate queries**. Private user rows, passwords, security answers, TOTP seeds, tokens, and secret values were deliberately **not** exported or copied. Counts below are a point-in-time snapshot, not a backup. Do not treat tests or an HTTP 200 as proof of a successful real-money payment.

## Evidence hierarchy and fast start

1. Current behavior: `worker/index.ts`, `worker/crypto-settlement.ts`, `src/App.tsx`, page components, and deployed runtime configuration.
2. Production database structure: query `sqlite_master`/`pragma_table_info` on `nocative-db --remote` before writing migrations. `schema.sql` is useful but **not identical to live D1**.
3. `contracts/src/FictionHallCryptoSplitCustom.sol` is the current contract source. The existing `contracts/README.md` describes an **obsolete** V1 contract and wrong splits; do not follow it for deployment.
4. `README.md` is a Vite template; `fh.md` describes some older decisions. Reconcile both against code.
5. To resume a task: check `git status -sb`, current HEAD, the exact relevant source, D1 schema, then tests/build, then only the authorized deployment/migration. Never print secret values.

## Architecture and ownership

| Layer | Current implementation | Main files |
|---|---|---|
| Browser | React 19, TypeScript, React Router 7, Vite 8; markdown rendered with `marked` | `src/App.tsx`, `src/pages/*`, `src/context/*`, `src/index.css` |
| Edge API / HTML | Hono Worker, `/api/*`; HTML shell and static `dist` assets | `worker/index.ts`, `worker/spa_html.ts`, `wrangler.toml` |
| Data | Cloudflare D1 SQLite, binding `DB` | `schema.sql`, `migrations/*.sql` |
| Card payments | Stripe Checkout, Connect Express, webhook-driven unlock/gift records | `worker/index.ts`, `worker/connect_endpoints.ts` |
| Crypto payments | Arbitrum One (chain ID 42161), signed quote, non-upgradeable split contract, RPC receipt/event polling | `worker/index.ts`, `worker/crypto-settlement.ts`, `contracts/src/FictionHallCryptoSplitCustom.sol` |
| Live video/chat | LiveKit for video; `LIVE_ROOM` Durable Object for chat/timer | `worker/live-room.ts`, `src/pages/{LiveNow,StartStream,WatchStream}.tsx` |
| Media | Markdown can reference external images; reader rewrites some Google Drive URLs. **No R2 binding/upload pipeline** in `wrangler.toml` | `src/pages/NoteRead.tsx`, `wrangler.toml` |

Build: `npm run build` runs `tsc -b`, Vite, then `postbuild.mjs`, which appends a timestamp to the JS filename and regenerates `worker/spa_html.ts`. `dist` is the deployed static-asset directory. `worker/spa_html.ts` is generated—do not edit manually. Deploy with `npx wrangler deploy` **after** a successful build. Existing targeted test: `node --test worker/crypto-settlement.test.mjs`. The full ESLint run has pre-existing `any`-typing errors; distinguish those from new failures.

## User-visible routes

| Route | Purpose |
|---|---|
| `/`, `/fiction` | Landing and collection/chapter discovery |
| `/fiction/collections/:collectionId/notes` | Collection detail, chapter list, author controls, pricing |
| `/fiction/collections/:collectionId/notes/:noteId` | Read published/free or unlocked premium chapter; Save moment |
| `/fiction/collections/:collectionId/notes/:noteId/write` | Authenticated author editor and autosave |
| `/fiction/collections/:collectionId/unlock` | Card or crypto checkout choice |
| `/fiction/crypto-pay/:quoteId` | Two crypto transaction QR requests and payment-status polling |
| `/author/:display` | Public author profile, collections, last 50 browsed published notes, optional contact/social links |
| `/fav` | Authenticated reader's top ten collections, appearing after >=10 reads per collection |
| `/bookmark` | Public anonymous-to-other-users passage/reflection feed; `mine` filter for owner |
| `/profile`, `/security`, `/auth` | Profile/payouts, security, login/register |
| `/live`, `/live/start`, `/live/:id` | Streams, host studio, viewer/player |
| `/about`, `/why`, `/terms`, `/privacy` | Information and policies; `/terms` and `/privacy` also have Worker-served HTML handlers |

Primary API groups are `auth`, `profile`, `stripe/connect`, `collections`, `notes`, `fav`, `bookmarks`, `crypto/quotes`, `purchase/unlock`, `live`, gifts, and webhooks. All endpoints are in `worker/index.ts` except Durable Object internals. The author page uses **display name** in the URL, not username.

## Content and access rules

- `story` = collection; `writing` = chapter/note. Authors can draft and autosave, then publish a chapter (`writing.live=1`). Published title/text edits and deletion are blocked by relevant mutation routes. Premium chapter toggling requires at least four chapters and leaves at least three free; published chapters cannot be toggled.
- A collection is sellable when `story.sellable_count > 0`; author-only `POST /api/collections/:id/mark-sellable` snapshots the count of published chapters and requires at least one usable payout rail. A collection can remain published without being sellable. Stripe readiness means connected, onboarded, enabled; crypto readiness means wallet + `crypto_okay` + Worker crypto config.
- Premium read access is in `story_unlock` (`active=1`, permanent or unexpired one-year). Buyer and author cannot buy the author's own collection. `GET /api/notes/:id` and `/api/notes/:id/view` use access checks. Note the security gap below: the read endpoint does **not** explicitly reject unpublished chapters for non-authors.
- Each authenticated, authorized chapter-view POST inserts `writing_view` and increments `reader_chapter_read_count.totalPerChapterCountRead`. `/fav` sums per-chapter counts per collection, requires >=10, orders by total, returns top ten and each collection's top three chapters. It is **not** a JSON field on `user`.
- Save moment: `src/pages/NoteRead.tsx` captures selection after mouseup/keyup/touchend, then POSTs 1–280-character excerpt plus required 1–600-character reflection to `reader_bookmark`. Public API omits bookmark owner ID; `mine=1` filters server-side. Readers may bookmark a paid chapter only if they have access. The most recent selection fix was deployed in commit `0b8cb01`; live gesture behavior was not independently retested end-to-end.
- Author public page lists authored collections and the author's last 50 browsed, published notes. Social handles are stored on `user`; contact is exposed only when `contact_on=1`. `writing_view.finger` holds a user ID string for this association.

## Pricing and payment semantics — do not silently change

| Unlock | Fiat reader price | Stripe platform / author | Crypto reader quote | Contract platform / author |
|---|---|---|---|---|
| One-year rental | Author sets, minimum **$14** | **5% / 95%** | `0.7 × fiat` | `splitA`: **15% / 85%** |
| Permanent | Author sets, minimum **$21** | **10% / 90%** | `0.5 × fiat` | `splitB`: **20% / 80%** |

Fiat prices can be changed once per UTC day. Crypto quotes use a 15-minute deadline and are denominated by assuming stablecoin nominal value for the token amount; this is **not** a historical USD market-price oracle or tax valuation. Supported app labels are **USDC, USDT0, DAI**; D1 quote stores USDT0 as `USDT`. Source fallback token contracts in `worker/index.ts` are USDC `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`, USDT0 `0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9`, DAI `0xda10009cbd5d07dd0cecc66161fc93d7c9000da1`. Runtime token-address secrets may override those fallbacks; confirm contract/config match before any on-chain tests.

Stripe card unlock: `POST /api/purchase/unlock` creates a destination-charge Checkout Session only if the author has a usable Connect account; `POST /api/stripe/unlock-webhook` records purchase and unlocks after `checkout.session.completed`. The success URL's `?unlocked=true` is presentation, not the authorization record. Gifts are **Stripe-only**, with author-only, author+platform, and platform-only amounts; an author gift requires usable Connect and is blocked for `HK` author country in current code. Gift webhook writes `gift`, not `story_unlock`. The legacy plan Checkout route and `plan`/`subscription` rows are not the active sale model.

Arbitrum crypto flow: authenticated buyer requests a signed quote; Worker stores `crypto_purchase_quote`, returns ERC-20 approval and `splitA`/`splitB` `ethereum:` transaction URIs, and UI renders separate QR codes. Wallet must support contract-call QR URIs; MetaMask desktop extension does not register that URI scheme. A QR rendering successfully **does not prove a payment works**. The contract verifies signed EIP-712 order, token whitelist, deadline, and one-time order, then calls ERC-20 `transferFrom` directly from payer to writer and treasury; it emits `CryptoCustomPurchase`. It does not hold the writer's full share. UI polls `GET /api/crypto/quotes/:id/status` every three seconds; Worker scans up to four **10-block** `eth_getLogs` windows per request (Alchemy Free limit), verifies matching event plus successful receipt to the configured contract, then D1-batches purchase, unlock, receipt snapshot, and quote status. A receipt is Arbitrum inclusion/success, **not Ethereum L1 finality**. `POST /api/crypto/quotes/:id/confirm` still exists as a manual-hash fallback API, but the current UI does not require pasting a hash.

`crypto_payment_receipt` (added and migrated live at commit `7c3838f`) stores quote ID, tx hash, block number, block UTC timestamp, buyer/seller user IDs and username snapshots, payer/writer addresses, token symbol/address/decimals, exact total/writer/platform amounts as **base-unit decimal strings**, and `quoted_usd_amount_e6`. It does **not** store actual historical USD fair market value, valuation source, or Ethereum finality. The username attached to the quote is the logged-in buyer account; the paying wallet may belong to somebody else because the app does not require wallet connection. `purchase.fmv` for crypto is currently populated from the **quoted USD amount**, not an independently sourced token FMV—do not use it uncritically as a tax valuation. Historical FMV would require a separate token/USD price source at the block time with provenance and an appropriate accounting policy. No real-money crypto sale was observed in D1 at audit time.

## Production D1: actual table inventory and row counts

Read-only audit at **2026-09-24 05:37 UTC**. These are aggregates, **not** copied user records. `d1_migrations` and `_cf_KV` are internal/management tables and excluded from application counts.

| Domain | Live table | Rows | Core role / keys |
|---|---|---:|---|
| Identity | `user` | 15 | Account, bcrypt hash, profile, Connect state, Arbitrum wallet, TOTP/socials |
| Identity | `question` | 30 | Recovery-question catalog |
| Identity | `security` | 45 | User/question/answer relation; answers stored plaintext (risk) |
| Legacy billing | `plan` | 4 | Historical plan definitions, not active access gate |
| Legacy billing | `subscription` | 0 | Historical subscription state |
| Content | `story` | 15 | Collection, author, genre, prices, `sellable_count` |
| Content | `writing` | 788 | Chapters, markdown text, `live`, `free`, word count |
| Content | `label` | 8 | Reusable tags |
| Content | `story_label` | 2 | Collection tags, composite key |
| Content | `writing_label` | 0 | Chapter tags, composite key |
| Engagement | `writing_view` | 642 | Individual chapter-view records |
| Engagement | `reader_chapter_read_count` | 448 | User/chapter read total, first/last times, composite key |
| Engagement | `reader_bookmark` | 2 | Owner/chapter/excerpt/reflection, public feed owner hidden |
| Engagement | `story_emotion` | 7 | Collection likes, unique story/user |
| Engagement | `writing_emotion` | 5 | Chapter likes, unique chapter/user; exists live but **missing from `schema.sql`** |
| Access/payments | `story_unlock` | 0 | Per-user collection access and expiry |
| Access/payments | `purchase` | 0 | Fiat or crypto checkout ledger |
| Access/payments | `crypto_purchase_quote` | 5 | Signed pending/confirmed/expired checkout state and scan cursor |
| Access/payments | `crypto_payment_receipt` | 0 | Verified on-chain payment snapshot |
| Editing | `writing_autosave` | 788 | Saved draft text/title by writing/user |
| Live | `live_stream` | 10 | Stream state and LiveKit room/token |
| Live | `gift` | 0 | Stripe gift records |

Additional live aggregates: **785 published chapters**, **371 published premium chapters**, **13 collections with `sellable_count>0`**, **one Stripe-linked and usable account**, **one crypto-enabled account**, **five pending crypto quotes**, **zero confirmed/expired crypto quotes**. Counts may change; query live D1 afresh. A sellable-count flag is not proof of a completed sale. Live DB was about 10.47 MB at audit.

Important live/schema drift: live `user` also has `deactivated`, `stripe_account_id`, `stripe_onboarded`, `stripe_country` beyond the checked-in base definition; live `story_unlock` has `start_date` and `end_date`; live `writing_emotion` is not in `schema.sql`. The live `d1_migrations` table had **zero rows**, even though manual SQL migrations have been applied. Do **not** blindly run `wrangler d1 migrations apply --remote` over every file: old `ALTER TABLE` files may collide with existing columns. Check `sqlite_master`/`pragma_table_info`, then apply the exact additive migration needed. Live explicit indexes are `idx_crypto_pending`, `idx_crypto_quote_story`, `idx_crypto_quote_user`, `idx_reader_bookmark_owner_feed`, `idx_reader_bookmark_public_feed`, and `idx_reader_chapter_read_user_total`, in addition to SQLite automatic PK/unique indexes.

Entity joins: `story.user_id → user.id`; `writing.story_id → story.id`; `story_unlock.(user_id,story_id) → user,story`; `reader_chapter_read_count.(user_id,writing_id) → user,writing`; `reader_bookmark.(user_id,writing_id) → user,writing`; `crypto_purchase_quote` binds buyer `user_id`, author `writer_id`, and `story_id`; `crypto_payment_receipt.quote_id → crypto_purchase_quote.id`. `purchase.stripe_id` is also used for a crypto tx hash; naming is legacy. D1 FK declarations do not replace application authorization checks.

## Secrets and runtime config (names only)

Worker has `APP_URL` and `LIVEKIT_WS_URL` variables plus D1 and DO bindings in `wrangler.toml`. Production secret **names** observed: `ARBITRUM_RPC_URL`, `CRYPTO_DAI_ADDRESS`, `CRYPTO_QUOTE_PRIVATE_KEY`, `CRYPTO_SPLIT_CONTRACT`, `CRYPTO_USDC_ADDRESS`, `CRYPTO_USDT_ADDRESS`, `JWT_SECRET`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `STRIPE_GIFT_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_UNLOCK_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SECRET`. Existence of a secret name does **not** prove its value is correct. Do not print, paste, export to chat, commit, or inspect secret values or `~/mvp/.keys`. The contract address is held in `CRYPTO_SPLIT_CONTRACT`; this document intentionally does not duplicate its value.

## Verified state versus gaps

- Last code release before this handoff: crypto receipt snapshot, commit `7c3838f`; D1 table migration and Worker were deployed, and live schema/table presence verified. Unit tests and build passed. The reader-selection fix was previously built, committed/pushed/deployed. **Neither change has a real-money crypto end-to-end transaction test** in this audit.
- Alchemy Free tier caused historical `eth_getLogs` 503 when scanning overly wide block ranges; `worker/crypto-settlement.ts` now limits each query to ten inclusive blocks. This removed the observed 503 on a pending quote; monitor for other RPC failures.
- Current quote/RPC/QR flow does not guarantee every mobile wallet understands `ethereum:` URLs. Approval and payment are distinct transactions; never encourage a plain ERC-20 transfer as a substitute for the signed contract call.
- No background cron/listener reconciles abandoned quotes when nobody polls. The owner polling the quote drives event detection and D1 settlement. Expired quote logic keeps reconciling behind the scan cursor, but this is not an always-on payment monitor.
- Historical token/USD FMV is **not** in the receipt table; quoted USD is not independent FMV. No tax conclusion or automated reporting should be inferred from the existing `fmv` column. Tax/legal advice must be jurisdiction-specific and independently verified.
- **Critical auth/recovery review needed:** `POST /api/auth/reset-password` currently accepts a `userId` and new password without server-side proof of recovery; question verification is a separate unbound call. `security.answer` is plaintext and `/api/auth/questions/me` returns it. JWTs appear to be signed without an `exp` claim. These are code-observed risks, not claims of exploitation.
- **Content/auth review needed:** `GET /api/notes/:id` checks paid access but does not explicitly gate `live=0` drafts for non-authors. `GET /api/poll/:writingId` requires *any* login but appears not to enforce author ownership before returning autosave text. Review before claiming drafts are private.
- **Webhook review needed:** the legacy `POST /api/stripe/webhook` route checks for a `stripe-signature` header but does not visibly verify it before writing subscription/purchase state. Gift and unlock webhooks implement their own HMAC comparisons, but their behavior should be audited against Stripe's current signature/tolerance guidance. Do not treat checkout redirects as payment proof.
- **UI copy drift:** `src/pages/UnlockPage.tsx` currently says permanent card purchase gives the author 80%, while the Stripe checkout implementation gives 90%. Correct copy after confirming intended pricing. `contracts/README.md` similarly describes obsolete 30% crypto permanent platform fee and an old script; use Solidity source/Worker code as authority.
- `schema.sql` contains legacy plans and incomplete live columns. `README.md` is generic; documentation cleanup would reduce onboarding mistakes.

## Safe continuation checklist for the next Codex chat

1. Read this document, then inspect relevant current code and `git status -sb`; do not assume the handoff is more current than the checkout or live D1.
2. For D1 work, first use read-only `wrangler d1 execute nocative-db --remote --command '...'` with schema/aggregate queries. Never print credential-bearing or private row values. Design additive migrations and test them before production application.
3. For checkout changes, preserve the exact fiat/crypto price and split matrix above unless the user explicitly changes it. Validate payout-rail gating, idempotent access grants, and real receipt/event matching. Do not unlock on signature, pending tx, success URL, or unverified hash.
4. Run targeted tests, `npm run build`, and inspect generated `worker/spa_html.ts`. For a requested release, confirm Wrangler auth with `npx wrangler whoami`, apply only needed migrations, `npx wrangler deploy`, verify the live asset/API behavior, commit and push. Do **not** force-push a shared branch just because older instructions mention `-f`; a normal fast-forward push has worked.
5. If adding FMV, store token unit price, USD FMV for each split, timestamp, source identifier, and valuation methodology **separately** from quoted checkout USD. Never hard-code stablecoins as exactly $1 for tax records.
6. Prioritize the critical auth/draft exposure findings above before broader marketing or UX work; they are material user-data risks. If only asked to diagnose/report, do not edit or deploy without authorization.
