# Jothable — Product Summary

**A Faith Built on Imagination**  
Website: [jothable.online](https://jothable.online)

This is a plain-language overview for sharing with collaborators or continuing the project in another chat. It describes the current product and the intended direction separately. It is based on the project reviewed on 3 November 2026; it is not a new verification of live payments or business traction.

## In one paragraph

Jothable is a home for writers, readers, and illustrated storytelling. Creators organize their work into collections and chapters, offer free chapters, and sell one-year or permanent access to a collection. Readers can discover stories, keep returning to their favourites, share passages and personal reflections anonymously, watch live streams, and send gifts. The business earns a commission from paid collection access. The ambition is to make writing and reading enjoyable and emotionally rewarding, alongside making it possible for creators to earn money.

## Who it is for

- **Writers:** people publishing fiction and building a relationship with readers.
- **Illustrators and comic creators:** people combining images and text into chapters. Comics currently use the same chapter format as written stories; there is no separate comic publishing workflow.
- **Readers:** people who want to discover independent work, sample it, support its creator, and return to stories that matter to them.

## The writer experience

A creator signs up, creates a collection, adds a description, genre and labels, then writes its chapters. Drafts can be saved and worked on privately. The editor supports formatted text and embedded images, with a preview before publication.

Published chapters are treated as a commitment: they cannot be edited or deleted through the normal publishing flow. Creators retain authorship and can publish their work elsewhere.

Creators choose collection prices and offer free chapters so readers can sample the work. Selling requires an active Stripe account connected to Jothable. Creators also have author pages and can add social handles to their profile.

### Illustrations and comics

The collection's author can upload PNG images from a chapter's editing page and insert them into its text. The editor provides image links and small previews. Image deletion is managed from the collection page by its author.

Current limits are **25 uploaded images per chapter**, **900 KB per image**, and **1,500 images per collection**. Embedded images are intended to follow the chapter's reading permissions, including the author's access to their own drafts.

## The reader experience

Readers browse collections and discover work through titles, authors, genres, labels and reading signals. They can read free chapters before deciding whether to buy access.

Paid access is for a collection rather than an individual chapter:

| Choice | What the reader receives | Minimum collection price |
| --- | --- | --- |
| One-year access | Access during the rental period, including new chapters added during that period | US$5 |
| Permanent access | Ongoing access, including future chapters | US$8 |

Creators can charge more. After Stripe confirms a successful payment, the app is designed to unlock the collection promptly, including its protected illustrations.

## Features that make people want to return

### My Shelf / Fav

A private shelf reflects the collections a reader returns to. A collection qualifies after at least three recorded chapter reads in total. It is a personal reading history and rediscovery feature, rather than simply a manually maintained favourites list.

### Bookmarks and reflections

A reader can select a passage and share what it made them feel. The passage and reflection appear in a public feed without identifying the reader. Signed-in readers can filter the feed to their own contributions. This gives stories a life beyond the chapter and lets readers encounter other people's emotional responses.

### Live and gifts

Creators can host short live streams with chat, and readers can watch and send gifts. Gifts are also available from collection pages. A supporter can direct a gift to the creator, Jothable, or both. The current payment flow requires the creator to have an active connected Stripe account, including for gifts in their collection or stream context.

## How the business earns money

Jothable takes **5% of one-year collection purchases** and **10% of permanent collection purchases**. The creator's allocated share is therefore 95% or 90%, before payment-processing fees and any other applicable charges.

Gifts are separate from collection purchases: supporters choose how much goes to the creator and how much, if any, goes to Jothable. Processing fees still apply.

Card and Stripe USDC payment paths exist for unlocks and gifts. Availability depends on the seller's connected account and Stripe approval; USDC must not be described as universally available to every writer. Enabling it for the platform alone does not approve every seller. This payment flow settles through Stripe balances and payout arrangements, rather than sending the platform's commission directly to an Ethereum wallet.

The earlier direct crypto-wallet payment feature is on hold. It should not be confused with USDC accepted through Stripe.

## Product character and direction

The desired experience is quiet, readable, personal and imaginative. Light and dark themes and restrained motion support that atmosphere.

The owner's central concern is that Jothable could become too dependent on practical publishing tools, catalogue size and audience size to stand out. The intended direction is to strengthen the emotional reasons to participate: enjoying a story, keeping a meaningful passage, seeing a reader respond, returning to a familiar collection, or spending time with a creator live.

In the owner's “Fountain and Tap” framing:

- **Tap:** useful functions such as editing, publishing, searching, selling and receiving payments.
- **Fountain:** experiences people enjoy for their own sake, such as discovery, attachment, expression and connection.

The goal is to strengthen the Fountain while keeping the paid-reading business working. Fav, bookmarks and live streams are existing building blocks; their presence alone does not prove engagement or retention.

## The central business loop

**Creator publishes work → reader discovers and samples it → reader connects with the story → reader buys access or sends support → creator has a reason to continue.**

A complementary emotional loop is:

**A passage moves a reader → the reader keeps or shares a reflection → the work gains another point of discovery → creator and reader have a reason to return.**

## Boundaries for future discussions

- Treat the app as an existing product, not a proposal to rebuild from scratch.
- Preserve the connection between paid collection access and supporting its creator.
- Consider writers' enjoyment as well as readers' enjoyment.
- Keep private reading shelves distinct from publicly shared anonymous reflections.
- Do not assume a large audience, proven demand, strong retention or successful live payment testing. This summary establishes none of those.
- Payment-provider eligibility can change and needs checking before making country-specific promises.
- The older `APP.md` contains technical history and outdated product details. Use this document for a nontechnical introduction, and verify exact behaviour before changing the product.
