import { Link } from 'react-router-dom';

const principles = [
  ['01', 'A smaller cut', 'Stripe creators keep 95% of rentals and 90% of permanent purchases. The numbers are visible before the reader pays.'],
  ['02', 'No lock-in', 'Creators keep their authorship and can publish elsewhere. Fiction Hall is a shelf, not an exclusive contract.'],
  ['03', 'Private by default', 'No email is required to start. TOTP and security questions give the account a recovery path without turning a writing tool into a social network.'],
  ['04', 'A real reading object', 'Collections, chapters, free samples, rental windows, permanent access, and author pages give a story a durable shape.'],
  ['05', 'Crypto without the extra login', 'Readers can scan a QR checkout for USDC, USDT, or DAI on Arbitrum. The app never asks them to connect a wallet.'],
  ['06', 'Free to begin', 'There is no subscription and no credit card needed to write. Add a payout rail only when a collection is ready to sell.'],
];

export default function Why() {
  return (
    <div className="editorial-page why-page">
      <section className="editorial-hero why-hero"><p className="eyebrow">A DIFFERENT DEFAULT</p><h1>Stories deserve a home that does not get in the way.</h1><p className="lede">Fiction Hall is built around the moment a private draft becomes a public work: a place for readers to discover it, pay for it, and return to it without the platform swallowing the relationship.</p><div className="why-equation"><span>private draft</span><b>→</b><span>published shelf</span><b>→</b><span>reader-supported work</span></div></section>
      <section className="principle-grid">{principles.map(([number, title, text]) => <article className="principle-card" key={number}><span className="principle-number">{number}</span><h2>{title}</h2><p>{text}</p></article>)}</section>
      <section className="editorial-panel fee-panel"><div><p className="eyebrow">THE TRADE-OFF, IN PLAIN LANGUAGE</p><h2>Lower reader crypto prices change the split.</h2><p>Stripe keeps the reader price at the collection price. Crypto makes rental checkout 0.7× and permanent checkout 0.5× of that fiat value; the contract then pays the creator 85% or 70% of the crypto payment and the platform receives the rest.</p></div><div className="fee-steps"><div><strong>Stripe</strong><span>reader: 1.0×</span><span>creator: 95% / 90%</span></div><div><strong>Arbitrum</strong><span>reader: 0.7× / 0.5×</span><span>creator: 85% / 70%</span></div></div></section>
      <section className="why-close"><p className="eyebrow">READY WHEN YOU ARE</p><h2>Keep the draft yours. Publish when it has earned the light.</h2><Link to="/auth" className="btn btn-primary">Start writing</Link></section>
    </div>
  );
}
