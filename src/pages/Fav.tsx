import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API = '/api';

interface FavouriteChapter {
  id: number;
  title: string;
  totalReadCount: number;
}

interface FavouriteCollection {
  id: number;
  title: string;
  description: string;
  genre: string | null;
  totalReadCount: number;
  chapters: FavouriteChapter[];
}

export default function Fav() {
  const { user, token, loading: authLoading } = useAuth();
  const [collections, setCollections] = useState<FavouriteCollection[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loadedToken, setLoadedToken] = useState<string | null>(null);
  const [error, setError] = useState('');
  const loading = authLoading || Boolean(token && loadedToken !== token);

  useEffect(() => {
    if (authLoading) return;
    if (!token) return;

    let cancelled = false;
    fetch(`${API}/fav`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async res => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Your shelf could not be loaded.');
        return body;
      })
      .then(body => {
        if (cancelled) return;
        const next = Array.isArray(body.collections) ? body.collections as FavouriteCollection[] : [];
        setCollections(next);
        setSelectedId(current => next.some((item: FavouriteCollection) => item.id === current) ? current : null);
        setError('');
        setLoadedToken(token);
      })
      .catch(e => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Your shelf could not be loaded.');
          setLoadedToken(token);
        }
      });
    return () => { cancelled = true; };
  }, [authLoading, token]);

  const selected = collections.find(collection => collection.id === selectedId) || null;

  return (
    <div className="fav-page editorial-page">
      <header className="fav-intro">
        <p className="eyebrow">YOUR READING SHELF</p>
        <h1>The stories you return to.</h1>
        <p className="lede">Collections rise here through the chapters you choose to revisit. Only you can see this shelf.</p>
      </header>

      {!user && !authLoading && (
        <section className="fav-empty card">
          <span className="fav-empty-mark" aria-hidden="true">↗</span>
          <h2>Your shelf is yours alone.</h2>
          <p>Sign in to see the collections you keep returning to.</p>
          <Link className="btn btn-primary" to="/auth">Sign in</Link>
        </section>
      )}

      {authLoading && <div className="loading" role="status">Checking your sign-in…</div>}
      {user && loading && <div className="loading" role="status">Setting out your shelf…</div>}
      {error && <p className="error-msg" role="alert">{error}</p>}

      {user && !loading && !error && collections.length === 0 && (
        <section className="fav-empty card">
          <span className="fav-empty-mark" aria-hidden="true">✳</span>
          <h2>No books on this shelf yet.</h2>
          <p>A collection appears after you’ve opened its accessible chapters 10 times in total.</p>
          <Link className="btn btn-outline" to="/fiction">Find something to read</Link>
        </section>
      )}

      {user && !loading && !error && collections.length > 0 && (
        <>
          <section className="fav-shelf-section" aria-label="Your most-read collections">
            <div className="fav-shelf-caption">
              <span>Most returned to</span>
              <span>{collections.length} {collections.length === 1 ? 'collection' : 'collections'}</span>
            </div>
            <div className="fav-shelf" role="group" aria-label="Choose a collection to see its most-read chapters">
              {collections.map((collection, index) => (
                <button
                  type="button"
                  key={collection.id}
                  className={`fav-spine ${selectedId === collection.id ? 'is-selected' : ''}`}
                  data-tone={index % 6}
                  aria-label={`${collection.title}, ${collection.totalReadCount} chapter reads`}
                  aria-pressed={selectedId === collection.id}
                  onClick={() => setSelectedId(selectedId === collection.id ? null : collection.id)}
                >
                  <span className="fav-spine-title">{collection.title}</span>
                  <span className="fav-spine-count">{collection.totalReadCount.toLocaleString()}</span>
                </button>
              ))}
            </div>
          </section>

          {selected && (
            <section className="fav-detail card" aria-live="polite">
              <div className="fav-detail-heading">
                <div>
                  <p className="eyebrow">BACK ON YOUR SHELF</p>
                  <h2><Link to={`/fiction/collections/${selected.id}/notes`}>{selected.title}</Link></h2>
                  {selected.description && <p className="fav-description">{selected.description}</p>}
                </div>
                <div className="fav-total"><strong>{selected.totalReadCount.toLocaleString()}</strong><span>chapter reads</span></div>
              </div>
              <div className="fav-chapters">
                <h3>Chapters you revisit most</h3>
                {selected.chapters.length > 0 ? selected.chapters.map(chapter => (
                  <Link key={chapter.id} className="fav-chapter" to={`/fiction/collections/${selected.id}/notes/${chapter.id}`}>
                    <span>{chapter.title}</span>
                    <small>{chapter.totalReadCount.toLocaleString()} reads</small>
                    <span className="fav-chapter-arrow" aria-hidden="true">→</span>
                  </Link>
                )) : <p className="empty">No chapter reads to show yet.</p>}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
