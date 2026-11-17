import { useEffect, useRef, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Home.css';

const collectionPath = '/fiction/collections/32/notes';

const destinations = [
  { title: 'Browse stories', description: 'Find your next chapter in the fiction catalog.', to: '/fiction' },
  { title: 'Read reflections', description: 'See which lines stayed with other readers.', to: '/bookmark' },
  { title: 'See who’s live', description: 'Drop in when an author is streaming.', to: '/live' },
];

export default function Home() {
  const { user } = useAuth();
  const landing = useRef<HTMLDivElement>(null);
  const motion = useRef<MediaQueryList>(null);

  useEffect(() => {
    motion.current = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!landing.current || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const element = entry.target as HTMLElement;
        element.dataset.visible = 'true';
        observer.unobserve(element);
      }
    }, { threshold: .16 });
    landing.current.querySelectorAll('[data-reveal]').forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  function moveLight(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || motion.current?.matches) return;
    const { currentTarget, clientX, clientY } = event;
    const bounds = currentTarget.getBoundingClientRect();
    currentTarget.style.setProperty('--light-x', `${clientX - bounds.left}px`);
    currentTarget.style.setProperty('--light-y', `${clientY - bounds.top}px`);
  }

  return (
    <div className="landing" ref={landing}>
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-wrap landing-hero-inner">
          <div className="landing-hero-copy">
            <p className="landing-label">Featured story · Fable</p>
            <h1 id="landing-title">The Iron <em>Register</em></h1>
            <p className="landing-chapter">Chapter 1: The Silt-Rod</p>
            <p className="landing-byline">By <Link to="/author/sing-a-pipe">sing-a-pipe</Link></p>
            <div className="landing-actions">
              <Link className="landing-button" to={`${collectionPath}/779`}>
                Read the free chapter <span aria-hidden="true">→</span>
              </Link>
              <Link className="landing-text-link" to={collectionPath}>See all chapters</Link>
            </div>
            <p className="landing-meta">No account needed</p>
          </div>
          <div className="landing-art" aria-hidden="true" onPointerMove={moveLight}>
            <img src="/iron-register-marsh.jpg" alt="" width="1536" height="1024" fetchPriority="high" />
          </div>
        </div>
      </section>

      <section className="landing-wrap landing-stories" aria-labelledby="landing-stories-title">
        <h2 id="landing-stories-title">Keep exploring</h2>
        <div className="landing-story-list">
          {destinations.map(({ title, description, to }) => (
            <Link key={to} className="landing-story" to={to} data-reveal>
              <h3>{title} <span aria-hidden="true">↗</span></h3>
              <p>{description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="landing-writer" aria-labelledby="landing-writer-title">
        <div className="landing-wrap landing-writer-inner" data-reveal>
          <div>
            <h2 id="landing-writer-title">Have a chapter ready to share?</h2>
            <p>Publish it on Jothable and give readers a link to the opening.</p>
          </div>
          <Link className="landing-button" to={user ? '/fiction' : '/auth'}>
            Publish on Jothable <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
