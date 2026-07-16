export default function About() {
  return (
    <div className="info-page card">
      <h1>About Fiction Hall</h1>
      <p>Fiction Hall is a fiction writing platform where writers can publish, organize, and monetize their work. Readers discover new stories across genres, support writers directly, and enjoy a clean reading experience.</p>

      <h2>For Writers</h2>
      <ul>
        <li>Rich text editor with markdown support</li>
        <li>Organize chapters into collections/stories</li>
        <li>Set your own pricing — keep 95% of rentals, 90% of permanent sales</li>
        <li>No subscription required to start writing</li>
        <li>Labels, genres, tags for discoverability</li>
        <li><strong>"Mark as Sellable"</strong> — once you've published chapters in a collection, click this button to make the collection available for purchase. Readers can then rent or buy access to your premium chapters. You can re-click this button anytime you publish new chapters to update the sellable count.</li>
      </ul>

      <h2>For Readers</h2>
      <ul>
        <li>Browse stories by genre, author, or popularity</li>
        <li>Free chapters to sample before buying</li>
        <li>One-time rentals or permanent access</li>
        <li>Support your favorite writers directly</li>
      </ul>

      <h2>How Purchases Work</h2>

      <h3>Rental Access (1 Year)</h3>
      <p>When you rent a collection, you get access to <strong>all premium chapters that are published at the time of your purchase</strong>, plus <strong>any new chapters the writer publishes during your 1-year rental period</strong>. You do not need to pay again for new chapters added during your rental window — they are automatically included.</p>

      <h3>Permanent Access</h3>
      <p>When you buy permanent access, you get access to all current premium chapters and every future chapter the writer publishes — forever. There is no time limit.</p>

      <h3>Upgrading: Rental → Permanent</h3>
      <p>Already rented a collection and want to keep it for life? You can upgrade to permanent access at any time by purchasing the permanent unlock. Once you do:</p>
      <ul>
        <li>Your rental period countdown <strong>stops immediately</strong></li>
        <li>The collection becomes <strong>permanently yours</strong> — no expiry, no countdown</li>
        <li>You will have paid both the rental price and the permanent price — this is intentional, as you are upgrading from a time-limited license to a lifetime license</li>
        <li>All future chapters published by the writer are automatically included</li>
      </ul>

      <h3>Non-Refundable Policy</h3>
      <p><strong>All purchases and rentals on Fiction Hall are final and non-refundable.</strong> Once a transaction is completed through Stripe, it cannot be reversed through the platform. Please review a collection's free chapters and description before purchasing. If you experience a technical issue with access after purchase, contact support and we will investigate.</p>

      <h2>Content Protection Policy</h2>
      <p>Fiction Hall is built on the principle that published content is permanent and protected. The following rules apply:</p>
      <ul>
        <li><strong>Published chapters cannot be deleted.</strong> Once a chapter is published (marked as live), it remains on the platform permanently. This protects readers who have paid for access and ensures the integrity of the collection.</li>
        <li><strong>Published chapters cannot be edited.</strong> A published chapter's title and text are locked. To make changes, the writer must create a new chapter.</li>
        <li><strong>Collections with active purchases cannot be deleted.</strong> If any reader has rented or bought a collection, the entire collection is locked from deletion. This ensures that paying readers retain access to what they purchased.</li>
        <li><strong>Drafts are private.</strong> Unpublished (draft) chapters are only visible to the author. Only published chapters appear to readers and count toward the sellable total.</li>
      </ul>
      <p>These policies exist to protect both readers and writers. Readers can trust that content they paid for will remain available. Writers can trust that their published work is permanently attributed to them.</p>

      <h2>Writer Payouts</h2>
      <p>When a reader purchases access to your collection, your share is automatically sent to the bank account you provided during Stripe Connect onboarding. Payouts are processed by Stripe on their standard schedule (typically 2-7 business days depending on your country). You do not need to manually request payouts or configure anything in the Stripe dashboard — everything is automatic once your Stripe Connect account is set up with a bank account.</p>
      <ul>
        <li><strong>Rentals:</strong> You receive 95% of the rental price (5% platform fee)</li>
        <li><strong>Permanent purchases:</strong> You receive 90% of the purchase price (10% platform fee)</li>
      </ul>
    </div>
  );
}
