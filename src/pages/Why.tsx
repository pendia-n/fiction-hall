import { Link } from 'react-router-dom';

const principles = [
  ['01', 'A smaller cut', 'Stripe creators keep 95% of rentals and 90% of permanent purchases. The numbers are visible before the reader pays.'],
  ['02', 'No lock-in', 'Creators keep their authorship and can publish elsewhere. Jothable is a shelf, not an exclusive contract.'],
  ['03', 'Private by default', 'No email is required to start. TOTP and security questions give the account a recovery path without turning a writing tool into a social network.'],
  ['04', 'A real reading object', 'Collections, chapters, free samples, rental windows, permanent access, and author pages give a story a durable shape.'],
  ['05', 'Free to begin', 'There is no subscription and no credit card needed to write. Add a payout rail only when a collection is ready to sell.'],
];

export default function Why() {
  return (
    <div className="editorial-page why-page">
      <section className="editorial-hero why-hero"><p className="eyebrow">A DIFFERENT DEFAULT</p><h1>Stories deserve a home that does not get in the way.</h1><p className="lede">Jothable is built around the moment a private draft becomes a public work: a place for readers to discover it, pay for it, and return to it without the platform swallowing the relationship.</p><div className="why-equation"><span>private draft</span><b>→</b><span>published shelf</span><b>→</b><span>reader-supported work</span></div></section>
      <section className="principle-grid">{principles.map(([number, title, text]) => <article className="principle-card" key={number}><span className="principle-number">{number}</span><h2>{title}</h2><p>{text}</p></article>)}</section>
      <section className="why-close"><p className="eyebrow">READY WHEN YOU ARE</p><h2>Keep the draft yours. Publish when it has earned the light.</h2><Link to="/auth" className="btn btn-primary">Start writing</Link></section>
    </div>
  );
}
