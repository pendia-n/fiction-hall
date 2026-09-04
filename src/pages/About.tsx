import { Link } from 'react-router-dom';

export default function About() {
  return (
    <div className="editorial-page info-page">
      <section className="editorial-hero about-hero">
        <p className="eyebrow">THE HOUSE RULES</p>
        <h1>Fiction Hall is a quiet place for finished stories.</h1>
        <p className="lede">Write privately, publish deliberately, and give readers a clean shelf they can return to. Fiction Hall keeps the writing experience simple: Markdown, media when you need it, and no subscription required to begin.</p>
        <div className="hero-actions"><Link to="/auth" className="btn btn-primary">Enter the hall</Link><Link to="/why" className="btn btn-outline">Why this exists →</Link></div>
      </section>
      <section className="about-columns">
        <article className="editorial-panel accent-panel"><p className="eyebrow">FOR WRITERS</p><h2>Build your shelf.</h2><p>Organize chapters into collections, add genres and labels, and publish only when a draft is ready. Drafts stay private. Published chapters are permanent and remain attributed to you.</p><ul className="clean-list"><li>Markdown-first writing with pluggable media</li><li>Free chapters to let readers sample the work</li><li>Your own collection prices</li><li>Stripe or Arbitrum payouts before a collection can be sold</li></ul></article>
        <article className="editorial-panel"><p className="eyebrow">FOR READERS</p><h2>Read without friction.</h2><p>Find collections by title, author, genre, labels, or reading signals. Read the free chapters first, then choose a one-year rental or permanent access when a story earns it.</p><ul className="clean-list"><li>One-year rental includes new chapters during the rental window</li><li>Permanent access includes future chapters</li><li>Crypto checkout uses a QR flow and never asks Fiction Hall to custody your wallet</li><li>Gifts are Stripe-only</li></ul></article>
      </section>
      <section className="editorial-panel pricing-panel">
        <div><p className="eyebrow">THE MONEY PATH</p><h2>Two payment rails, one clear promise.</h2><p className="muted">A collection becomes sellable only after its creator has at least one fully usable payout rail.</p></div>
        <div className="payment-rail-grid"><div className="payment-rail"><span className="rail-label">STRIPE</span><strong>95% / 90%</strong><p>Creators receive 95% of one-year rentals and 90% of permanent purchases through Stripe Connect.</p><small>Gifts work only when the creator’s Stripe status is <b>fully connected</b>.</small></div><div className="payment-rail crypto-rail"><span className="rail-label">ARBITRUM</span><strong>0.7× / 0.5×</strong><p>Reader crypto price is fiat rental × 0.7 or fiat permanent × 0.5, paid in USDC, USDT, or DAI.</p><small>The contract splits rental proceeds 85% / 15% and permanent proceeds 70% / 30%.</small></div></div>
      </section>
      <section className="about-columns"><article className="editorial-panel"><p className="eyebrow">CONTENT PROTECTION</p><h2>Publishing is a commitment.</h2><p>Published chapters cannot be edited or deleted. Collections with active purchases cannot be deleted. This protects the reader’s purchase and keeps a writer’s public record intact.</p></article><article className="editorial-panel"><p className="eyebrow">ACCESS & REFUNDS</p><h2>Know what you are buying.</h2><p>Purchases and rentals are final and non-refundable. Read the free chapters and collection description before unlocking. If a technical access problem occurs, contact support for investigation.</p></article></section>
      <section className="editorial-panel gifts-panel"><p className="eyebrow">GIFTS</p><h2>Support is deliberately separate.</h2><p>Readers can send a one-time gift through Stripe to a creator, to the platform, or split between both. Regional Stripe restrictions may leave only the platform option available. Crypto checkout does not support gifts.</p></section>
    </div>
  );
}
