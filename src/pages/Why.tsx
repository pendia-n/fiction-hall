export default function Why() {
  return (
    <div className="info-page card">
      <h1>Why Fiction Hall?</h1>
      <p>Most writing platforms take 30-50% of your revenue. We believe writers deserve better.</p>
      <div className="why-grid">
        <div className="why-card">
          <h3>💰 Fair Revenue Share</h3>
          <p>With Stripe, writers keep 95% of rentals and 90% of permanent sales. Crypto checkout gives readers a lower price: rental billing is the fiat price × 0.7, with the writer receiving 85% of that amount; permanent billing is the fiat price × 0.5, with the writer receiving 70%.</p>
        </div>
        <div className="why-card">
          <h3>🔓 No Lock-in</h3>
          <p>You own your content. No exclusive contracts. Publish anywhere you want.</p>
        </div>
        <div className="why-card">
          <h3>🔒 Privacy First</h3>
          <p>Simple authentication with TOTP 2FA and security questions. No email required to sign up.</p>
        </div>
        <div className="why-card">
          <h3>⚡ Fast & Modern</h3>
          <p>Built on Cloudflare's global network. Pages load instantly anywhere in the world.</p>
        </div>
        <div className="why-card">
          <h3>📱 Responsive</h3>
          <p>Write and read on any device. Dark mode included.</p>
        </div>
        <div className="why-card">
          <h3>🆓 Free to Start</h3>
          <p>Sign up and start writing for free. No subscription, no credit card. Pay only when you're ready to unlock premium features.</p>
        </div>
        <div className="why-card">
          <h3>🪙 Crypto Checkout</h3>
          <p>Writers can add an Arbitrum wallet and accept USDC, USDT, or DAI. Readers scan a QR code and pay without connecting a wallet to Fiction Hall. Gifts remain Stripe-only.</p>
        </div>
      </div>
    </div>
  );
}
