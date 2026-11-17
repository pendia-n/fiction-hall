import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { landingSamples } from './landingSamples';
import './Home.css';

const moods = [
  { id: 'lake', label: 'Something unsettling', description: 'A missing sister. A light on the wrong side of the lake.' },
  { id: 'train', label: 'Something tender', description: 'Two strangers split a train ticket and tell each other where they wish it went.' },
  { id: 'tuesday', label: 'Something a little strange', description: 'The town librarian starts lending out days that people would rather forget.' },
] as const;

export default function Home() {
  const { user } = useAuth();
  const landing = useRef<HTMLDivElement>(null);
  const reader = useRef<HTMLDialogElement>(null);
  const readerTitle = useRef<HTMLHeadingElement>(null);
  const [sampleId, setSampleId] = useState<keyof typeof landingSamples>('lake');
  const [scene, setScene] = useState(0);
  const sample = landingSamples[sampleId];

  useEffect(() => {
    if (!landing.current || !('IntersectionObserver' in window)
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.animate(
          [{ opacity: 0.7, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 430, easing: 'ease-out' },
        );
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.15 });
    landing.current.querySelectorAll('[data-landing-reveal]').forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  function openSample(id: keyof typeof landingSamples) {
    setSampleId(id);
    setScene(0);
    reader.current?.showModal();
    if (reader.current) reader.current.scrollTop = 0;
  }

  function nextScene() {
    if (scene + 1 >= sample.scenes.length) {
      reader.current?.close();
      return;
    }
    setScene(scene + 1);
    readerTitle.current?.focus({ preventScroll: true });
    if (reader.current) reader.current.scrollTop = 0;
  }

  function moveLight(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== 'mouse' || !window.matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches) return;
    const { currentTarget, clientX, clientY } = event;
    const bounds = currentTarget.getBoundingClientRect();
    currentTarget.style.setProperty('--light-x', `${clientX - bounds.left}px`);
    currentTarget.style.setProperty('--light-y', `${clientY - bounds.top}px`);
  }

  return (
    <div className="landing" ref={landing}>
      <section className="landing-hero" aria-labelledby="landing-title" onPointerMove={moveLight}>
        <div className="landing-wrap landing-hero-copy">
          <p className="landing-label">Featured sample · Mystery</p>
          <h1 id="landing-title">The House <em>Beyond the Water</em></h1>
          <blockquote>“{landingSamples.lake.scenes[0][0]}”</blockquote>
          <p className="landing-byline">By {landingSamples.lake.author}</p>
          <button className="landing-button" type="button" onClick={() => openSample('lake')}>
            Read the first chapter <span aria-hidden="true">→</span>
          </button>
          <p className="landing-meta">Free to read · No account needed</p>
        </div>
      </section>

      <section className="landing-wrap landing-stories" id="stories" aria-labelledby="landing-stories-title">
        <div className="landing-section-heading">
          <h2 id="landing-stories-title">What are you in the mood for?</h2>
          <Link className="landing-text-link" to="/fiction">Browse published stories <span aria-hidden="true">→</span></Link>
        </div>
        <div className="landing-story-list" data-landing-reveal>
          {moods.map(({ id, label, description }) => (
            <article className={`landing-story landing-story-${id}`} key={id}>
              <p className="landing-label">{label}</p>
              <h3>{landingSamples[id].title}</h3>
              <p>{description}</p>
              <button className="landing-text-link" type="button" onClick={() => openSample(id)}>
                Read the sample <span aria-hidden="true">↗</span>
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-writer" id="writers" aria-labelledby="landing-writer-title">
        <div className="landing-wrap landing-writer-inner" data-landing-reveal>
          <div>
            <h2 id="landing-writer-title">Have a chapter ready to share?</h2>
            <p>Publish it on Jothable and give readers a link to the opening. Offer free chapters or set a price for the full collection.</p>
          </div>
          <Link className="landing-button" to={user ? '/fiction' : '/auth'}>
            Publish on Jothable <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <dialog className="landing-reader" ref={reader} aria-labelledby="landing-reader-title">
        <div className="landing-reader-top">
          <p className="landing-label">{scene === 0 ? 'Opening · Sample' : 'Next scene · Sample'}</p>
          <form method="dialog"><button className="landing-text-link">Close</button></form>
        </div>
        <h2 id="landing-reader-title" tabIndex={-1} ref={readerTitle}>{sample.title}</h2>
        <p className="landing-byline">By {sample.author}</p>
        <div className="landing-reader-copy">
          {sample.scenes[scene].map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </div>
        <button className="landing-button" type="button" onClick={nextScene}>
          {scene + 1 < sample.scenes.length ? 'Read the next scene →' : 'Close sample'}
        </button>
      </dialog>
    </div>
  );
}
