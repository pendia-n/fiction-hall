# Nocative — C2C Fiction Writing Platform

Live at: `https://nocative.pendia-community.workers.dev`

## What It Is

A **creator-to-consumer (C2C) fiction marketplace** — like Medium but for fiction writers. Authors create collections (stories), write chapters in a rich text editor, set per-collection pricing (rental or permanent), and readers pay to unlock premium content via Stripe. Stripe Connect handles payments to authors with platform commission taken automatically.

This is a full rebuild from the original nocative.com (which was MySQL-based) to Cloudflare Workers + D1.

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, React Router SPA |
| **Backend API** | Hono on Cloudflare Workers (1400 lines) |
| **Database** | Cloudflare D1 (SQLite) — 15+ tables |
| **Auth** | bcryptjs password hashing, homemade JWT (HS256 via hono/jwt) |
| **2FA** | Custom TOTP (HMAC-SHA1, RFC 6238 compliant), 30s window, ±1 drift |
| **Payments** | Stripe Checkout Sessions + Stripe Connect Express (platform → author payouts) |
| **Editor** | ReactQuill (rich text WYSIWYG) |
| **Other** | CORS enabled, server-rendered SSR fallback for Terms/Privacy pages |

## How Monetization Works (C2C with Stripe Connect)

### For Readers (Buyers)

1. Browse free chapters across any collection
2. When hitting premium chapters, hit a paywall — Stripe Checkout pops up
3. Two unlock types:
   - **Rental ($14+/yr)**: 1-year access, 5% platform cut, 95% to author
   - **Permanent ($21+/perm)**: Forever access, 10% platform cut, 90% to author
4. Payment goes through Stripe → with Connect Express, the **author's share is auto-routed** to the author's Stripe account (destination charge with transfer_data), platform keeps its commission fee

### For Authors (Creators)

1. Register → create collections (stories) → write chapters (drafts or publish)
2. **Pricing**: Each collection gets rental_price and perm_price (defaults $14/$21)
   - Can be changed once per UTC day
   - Authors set per-collection, not per-chapter
3. **Free/premium toggle**: Minimum **3 free chapters** per collection, rest can be premium
   - Author toggles individual chapters free/premium
   - Once a chapter is published (live=1), it CANNOT be edited, deleted, or toggled
4. **Stripe Connect onboarding**: Author must complete Stripe Connect Express onboarding to receive payouts
   - Platform creates an Express account for the author
   - Author completes onboarding via Stripe's hosted flow
   - When reader pays, Stripe auto-splits: platform fee + author payout

### Why Stripe Connect (not just Stripe)

Without Connect, the platform would receive ALL money, then have to manually pay out authors (KYC nightmare, legal liability). With Connect Express:
- Stripe handles author KYC/onboarding
- Stripe auto-routes the author's cut directly
- Platform only touches its commission
- No need to hold other people's money in the platform's bank account

## Key Features

### Auth & Security
- **Username + password** auth (7 char min, no email required)
- **Security questions**: 3+ questions with case-insensitive matching for account recovery
- **TOTP 2FA**: HMAC-SHA1 based, optional but required for deactivation/reactivation flow
- **JWT tokens**: HS256 via `hono/jwt`, stored in localStorage
- **Account deactivation/reactivation**: Requires TOTP + 3 security questions answered correctly
- **Live availability checks**: Debounced username/display name checking during signup

### Content System
- **Collections** (stories): title, description, genre, labels
- **Chapters** (writings): rich text (ReactQuill), word count, free/premium flag, live/draft status
- **Autosave**: Polling-based autosave (PATCH `/api/notes/:id/autosave`) stores draft + autosave copy
- **Published chapters** are immutable — cannot be edited, deleted, or toggled
- **Labels**: Many-to-many via junction tables (story_label, writing_label)
- **Search/filter**: By title, author, genre, labels, word count, free/premium, likes, views
- **Sort**: By created date, updated date, like count, view count

### Social Features
- **Likes**: Per-collection and per-chapter like system (story_emotion, writing_emotion)
- **View tracking**: `writing_view` table, unique per user per chapter
- **Recent views**: Last 100 viewed notes tracked per user
- **Polling**: Autosave + watching count + view count via `/api/poll/:writingId`

### Other
- **Full Terms & Privacy** pages — server-rendered HTML fallback
- **Mobile-friendly** SPA with dark/light theme
- **No email required** for registration (privacy-first)
- **DMCA compliance** with copyright infringement policy

## Database Tables (D1)

Key tables: `user`, `story` (collections), `writing` (chapters), `story_emotion`, `writing_emotion`, `writing_view`, `story_unlock`, `purchase`, `subscription`, `plan`, `security`, `question`, `label`, `story_label`, `writing_label`, `writing_autosave`

## What It's NOT

- Not a publishing house — Nocative doesn't own content, authors retain IP
- Not subscription-based for readers — it's per-collection pay-per-access (rental or permanent), though a subscriptions table exists for future subscription plans
- Not free-to-use for premium content — only basic browsing is free
- Not a PDF/ebook store — content is read on-platform only

## Live Streaming

Live streaming using **LiveKit Cloud** (`fh-t4ls35yv`, `wss://fh-t4ls35yv.livekit.cloud`) with real-time WebSocket chat via Durable Object and Stripe gifting.

### Tech Stack (additions)

| Layer | Technology |
|---|---|
| **WebRTC SFU** | LiveKit Cloud (`fh-t4ls35yv`) |
| **LiveKit Server SDK** | `livekit-server-sdk` (token generation) |
| **LiveKit Client** | `livekit-client`, `@livekit/components-react`, `@livekit/components-styles` |
| **Real-time Chat** | Cloudflare Durable Object (`LiveRoom` class) per stream |
| **Gifting** | Stripe Checkout + Stripe Connect Express destination charges |

### Backend Routes

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `POST` | `/api/live/start` | Required | Host starts stream — creates LiveKit room, host token, `live_stream` row, 20-min DO alarm |
| `POST` | `/api/live/end` | Required | Host ends stream — sets `active=0`, cancels DO alarm, broadcasts `live_ended` to WS clients |
| `GET` | `/api/live/active` | Optional | Lists all active streams (JOINed with user), ordered by `started_at DESC`, polled every 15s |
| `GET` | `/api/live/active/mine` | Required | Returns host's own active stream with fresh LiveKit publish token (for resume after refresh) |
| `GET` | `/api/live/:id` | Required | Stream details + LiveKit token (viewer: `canPublish=false`, host: `canPublish=true`) + author Stripe info |
| `GET` | `/api/live/:id/ws` | Query-token | WebSocket upgrade to `LiveRoom` DO (validates JWT) |
| `POST` | `/api/live/:id/gift` | Required | Creates Stripe Checkout Session with destination charge to host's Connect account |
| `POST` | `/api/collections/:id/gift` | Required | Same gifting flow for collection context (non-live) |
| `POST` | `/api/stripe/gift-webhook` | Signature-verified | Stripe webhook — verifies HMAC-SHA256, inserts `gift` row, broadcasts to chat DO |

### User Table Addition

```sql
ALTER TABLE user ADD COLUMN stripe_country TEXT;  -- Stripe Connect account country, nullable (readers don't have one)
```

`stripe_country` is set during Connect onboarding (from Stripe account creation response) and updated via `account.updated` webhook. Used to block gifting to authors in unsupported regions (e.g., `HK` under `full` Connect agreement).

### Database Tables

```sql
CREATE TABLE live_stream (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES user(id),
  title           TEXT NOT NULL,
  room_name       TEXT UNIQUE NOT NULL,
  livekit_token   TEXT NOT NULL,
  started_at      TEXT DEFAULT (datetime('now')),
  ended_at        TEXT,
  active          INTEGER DEFAULT 1
);

CREATE TABLE gift (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  stream_id                 INTEGER REFERENCES live_stream(id),
  collection_id             INTEGER REFERENCES story(id),
  from_user_id              INTEGER REFERENCES user(id),
  to_user_id                INTEGER NOT NULL REFERENCES user(id),
  amount                    REAL NOT NULL,
  platform_amount           REAL DEFAULT 0,
  message                   TEXT DEFAULT '',
  stripe_payment_intent_id  TEXT,
  created_at                TEXT DEFAULT (datetime('now'))
);
```

### LiveStream Flow

1. **Host goes live** (`/live/start`): enters title → `POST /api/live/start` → gets `streamId` + `livekitToken` → connects `LiveKitRoom` with `canPublish=true` → 20-min countdown begins → chat WS connects to DO.
2. **Viewer watches** (`/live/:id`): fetches `GET /api/live/:id` → gets viewer token (`canPublish=false`) + `wsUrl` → renders `LiveKitRoom` (subscribes to host's camera track) + `LiveChat` + optional "Send Gift" button.
3. **Refresh resilience**: `beforeunload` event sets a ref flag; on mount checks `GET /api/live/active/mine` → if active stream exists, generates fresh LiveKit token and reconnects (instead of creating a new stream).
4. **End**: "End" button or tab close (no `beforeunload` = navigate-away) calls `POST /api/live/end` → DO broadcasts `live_ended` to all WS clients.
5. **Auto-end**: DO alarm fires after 20 minutes if host hasn't ended manually → broadcasts `live_ended` + closes all WS connections.

### Gifting Flow

Three gift modes in GiftModal:

| Mode | Icon | Description | Backend behavior |
|------|------|-------------|------------------|
| **Author only** | 1+1=2 | Gift to author | Destination charge to author's Connect account, no `application_fee_amount` |
| **Author + Platform** | 3>1+1 | Split gift | Destination charge + `transfer_data[amount]` = authorGift, rest stays with platform |
| **Platform only** | 0=>1 | Gift to platform (always available) | Direct charge, no Connect params |

User clicks "Send Gift" → `GiftModal` opens:
1. Choose mode (if author can receive gifts: all 3 shown; if blocked: only "0=>1" shown)
2. Enter amounts (author min $1, platform min $0.50)
3. `POST /api/live/:id/gift` → backend creates Stripe Checkout Session with:
   - `line_items[0].price_data.unit_amount` = total (cents)
   - `transfer_data[destination]` = host's `stripe_account_id` (only for modes with author gift)
   - `transfer_data[amount]` = authorGift (only when platformGift > 0)
   - **Never** `application_fee_amount` — gifts have no platform cut, only Stripe processing fees
   - Metadata: `stream_id`, `from_user_id`, `to_user_id`, `author_amount`, `platform_amount`, `type: 'stream'`
4. Frontend redirects to Stripe Checkout → user pays → Stripe redirects back with `?gift=success`
5. Stripe sends webhook → `POST /api/stripe/gift-webhook` → verifies signature (timing-safe HMAC-SHA256), inserts `gift` row (records both `amount` and `platform_amount`), notifies DO → `"🎁 username gifted $X!"` broadcast in chat

### Frontend Pages

| Route | Component | Purpose |
|-------|-----------|---------|
| `/live` | `LiveNow.tsx` | Browse active streams, "Go Live" button (Stripe-gated) |
| `/live/start` | `StartStream.tsx` | Host streaming studio (camera, mic, timer, End btn, chat) |
| `/live/:id` | `WatchStream.tsx` | Viewer stream page (video, chat, Send Gift, host End btn) |

### Configuration

| Setting | Value |
|---------|-------|
| LiveKit Cloud Project | `fh-t4ls35yv` |
| LiveKit WS URL | `wss://fh-t4ls35yv.livekit.cloud` |
| LiveKit Token TTL | 30 minutes |
| Stream Duration Limit | 20 minutes (DO alarm) |
| Stripe Connect Pattern | Express accounts, destination charge, `transfer_data[amount]` for split gifts |
| Chat WS | Durable Object `LiveRoom`, stores messages in DO key-value, cleared on end |
| Gift blocked countries | `HK` (Hong Kong not supported under `full` Connect agreement) |
| Chat history | Host gets all messages, viewer gets last 30 |

### Key Files

| File | Role |
|------|------|
| `worker/index.ts` | All API routes (live CRUD, gift, webhook) |
| `worker/live-room.ts` | DO chat server per stream |
| `schema.sql` | `live_stream` + `gift` tables |
| `wrangler.toml` | DO binding, `LIVEKIT_WS_URL` var |
| `src/pages/StartStream.tsx` | Host streaming page |
| `src/pages/WatchStream.tsx` | Viewer watch page |
| `src/pages/LiveNow.tsx` | Active streams listing |
| `src/components/LiveChat.tsx` | WebSocket chat component |
| `src/components/GiftModal.tsx` | Gift/tip modal (three-mode: 1+1=2, 3>1+1, 0=>1) |
| `src/components/GiftButton.tsx` | Simpler gift preset button (may be deprecated) |
