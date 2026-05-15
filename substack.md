# Nocative — Substack Launch Post

## Title Options (pick one)
1. "I Built a Fiction Platform Where Writers Keep 95% of Every Sale"
2. "Wattpad Doesn't Pay Writers. So I Built Something That Does."
3. "Nocative: The Anti-Wattpad for Fiction Writers Who Want to Earn"

---

## Post Body

### Opening Hook

There are 50 million fiction writers on Wattpad.

The top 0.1% get book deals. The rest get "exposure."

Amazon KDP takes 30-65% and buries you in a sea of Kindle Unlimited content.

Royal Road? Great community, zero monetization.

AO3? Explicitly non-commercial.

There is no platform where a fiction writer can simply publish chapters, set a price, and get paid directly by readers.

So I built one.

### What Is Nocative?

Nocative is a fiction publishing platform. Writers publish chapters into collections. Readers browse, sample free chapters, then rent for a year or buy permanent access.

The key difference: **writers keep 95% of rental income and 90% of permanent sales.**

Not 30%. Not 50%. Not "exposure."

Ninety. Five. Percent.

### How It Works (For Writers)

1. **Create a collection** — give it a title, description, genre, labels
2. **Write chapters** — rich text editor with markdown support
3. **Publish** — chapters go live, readers can find them
4. **Set pricing** — minimum $14/year rental, $21 permanent access (you can charge more)
5. **Mark as Sellable** — one click to enable purchases on a collection
6. **Get paid** — Stripe Connect auto-transfers your share to your bank account

The first 3 chapters of every collection are free. This lets readers sample your work before committing. After that, you decide which chapters are premium.

### How It Works (For Readers)

1. **Browse** — discover stories by genre, author, popularity
2. **Read free chapters** — every collection has at least 3 free chapters
3. **Rent or Buy:**
   - **Rent ($14+/year):** Access all premium chapters for 1 year, including any new chapters the writer publishes during your rental
   - **Buy Permanent ($21+):** Access everything, forever, including all future chapters
4. **Upgrade anytime:** Rent first, upgrade to permanent later

### Why This Model Works

**For writers:**
- No subscription pressure — you don't need 10,000 readers to earn
- Even 10 readers buying permanent access at $21 = $189 in your pocket
- Stripe Connect means the money goes directly to you — no waiting for the platform to "pay out"
- You set your own prices. Charge $50 for a premium collection if you want.

**For readers:**
- No subscription — pay only for what you read
- Free chapters let you sample before buying
- Renting is cheap ($14/year) and includes future chapters
- Buying permanent means you never lose access

**For the platform:**
- 5% on rentals, 10% on permanent sales — enough to keep the lights on
- Cloudflare Workers + D1 means near-zero operating costs
- Stripe Connect handles all the payment complexity

### The Philosophy

I believe fiction writers should be able to earn from their work without needing a million followers, a book deal, or a Patreon with 10,000 subscribers.

Nocative is built for the writer who has 50 loyal readers, not 50,000 casual ones. If those 50 readers each pay $21 for permanent access, that's $945 in the writer's pocket. That's real money. That's "keep writing" money.

No platform should take 65% of that.

### Tech Stack (For the Nerds)

- **Runtime:** Cloudflare Workers (edge, no cold starts, free tier = 100K requests/day)
- **Database:** D1 (Cloudflare's SQLite, free tier = 5M rows read/month)
- **Frontend:** React SPA, Vite build, served from the worker itself
- **Payments:** Stripe Connect Express — automatic split payments, writers get paid directly
- **Auth:** JWT + optional TOTP (RFC 6238 HMAC-SHA1, works with any authenticator app)
- **Hosting cost:** $0/month on Cloudflare free tier

### What's Next

- [ ] Product Hunt launch
- [ ] Mobile app (PWA)
- [ ] Writer analytics dashboard
- [ ] Reader bookmarks and reading lists
- [ ] Collection covers and writer profiles
- [ ] API for third-party tools

### Try It

**https://nocative.pendia-community.workers.dev**

Create an account, start a collection, publish a chapter. It's free to start writing. You only need Stripe Connect when you're ready to sell.

If you're a fiction writer, I want to hear from you. What's missing? What would make you switch?

If you're a reader, tell me what you'd want from a platform like this.

This is version 1. It's rough. But the core works: writers publish, readers pay, writers keep almost everything.

That's the point.

---

## Substack Metadata

**Subtitle:** A fiction platform where writers keep 90-95% of every sale. No subscriptions, no middleman, no "exposure."

**Tags:** writing, fiction, publishing, indie authors, creator economy, startups, stripe

**Publish timing:** Same day as Product Hunt launch, or 1 day before to build anticipation

**Cross-post:** Share the Substack link in the PH comments, share the PH link in Substack notes
