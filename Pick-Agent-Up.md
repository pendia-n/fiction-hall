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
