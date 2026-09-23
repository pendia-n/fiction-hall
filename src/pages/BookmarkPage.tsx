import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API = '/api';
const PAGE_SIZE = 20;

interface Bookmark {
  id: number;
  chapter_id: number;
  excerpt: string;
  reflection: string;
  created_at: string;
  chapter_title: string;
  collection_id: number;
  collection_title: string;
  author_display: string;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export default function BookmarkPage() {
  const { user, token, loading: authLoading } = useAuth();
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 0 });
  const [loadedKey, setLoadedKey] = useState('');
  const [loadError, setLoadError] = useState<{ key: string; message: string } | null>(null);
  const [actionError, setActionError] = useState('');
  const [removingId, setRemovingId] = useState<number | null>(null);
  const mineOnly = Boolean(user && mine);
  const requestKey = `${token || 'public'}:${mineOnly ? 'mine' : 'all'}:${page}`;
  const loading = authLoading || loadedKey !== requestKey;
  const error = loadError?.key === requestKey ? loadError.message : '';

  const fetchBookmarks = useCallback(async (requestedPage: number, onlyMine: boolean) => {
    const query = new URLSearchParams({ page: String(requestedPage), pageSize: String(PAGE_SIZE) });
    if (onlyMine) query.set('mine', '1');
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API}/bookmarks?${query}`, { headers });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Bookmarks could not be loaded.');
    return {
      bookmarks: Array.isArray(body.bookmarks) ? body.bookmarks as Bookmark[] : [],
      pagination: body.pagination as Pagination || { page: requestedPage, pageSize: PAGE_SIZE, total: 0, totalPages: 0 },
    };
  }, [token]);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    fetchBookmarks(page, mineOnly)
      .then(result => {
        if (cancelled) return;
        setBookmarks(result.bookmarks);
        setPagination(result.pagination);
        setLoadError(null);
        setLoadedKey(requestKey);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoadError({ key: requestKey, message: e instanceof Error ? e.message : 'Bookmarks could not be loaded.' });
        setLoadedKey(requestKey);
      });
    return () => { cancelled = true; };
  }, [authLoading, fetchBookmarks, mineOnly, page, requestKey]);

  const changeMine = (checked: boolean) => {
    setMine(checked);
    setPage(1);
  };

  const removeBookmark = async (id: number) => {
    if (!token || removingId !== null) return;
    setRemovingId(id);
    setActionError('');
    try {
      const res = await fetch(`${API}/bookmarks/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'This bookmark could not be removed.');
      const result = await fetchBookmarks(page, mineOnly);
      setBookmarks(result.bookmarks);
      setPagination(result.pagination);
      setLoadError(null);
      setLoadedKey(requestKey);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'This bookmark could not be removed.');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="bookmark-page editorial-page">
      <header className="bookmark-intro">
        <p className="eyebrow">PASSAGES THAT STAY</p>
        <h1>A line. A feeling. Kept.</h1>
        <p className="lede">Readers leave a few words about what a passage brought up for them. Their names stay private; the moment is shared.</p>
      </header>

      <section className="bookmark-feed-tools" aria-label="Bookmark feed controls">
        <p>Passages and reflections here are public. The reader who saved them is never named.</p>
        {user && (
          <label className="bookmark-mine-toggle">
            <input type="checkbox" checked={mineOnly} onChange={e => changeMine(e.target.checked)} />
            <span>Mine</span>
          </label>
        )}
        {!user && !authLoading && <Link to="/auth" className="bookmark-signin">Sign in to filter to yours <span aria-hidden="true">→</span></Link>}
      </section>

      {authLoading && <div className="loading" role="status">Loading bookmarks…</div>}
      {!authLoading && loading && <div className="loading" role="status">Gathering reader moments…</div>}
      {error && <p className="error-msg" role="alert">{error}</p>}
      {actionError && <p className="error-msg" role="alert">{actionError}</p>}

      {!authLoading && !loading && !error && bookmarks.length === 0 && (
        <section className="bookmark-empty card">
          <span className="bookmark-empty-mark" aria-hidden="true">“</span>
          <h2>{mine ? 'You have no saved moments here yet.' : 'No passages have been shared yet.'}</h2>
          <p>{mine ? 'Open a chapter, select a passage, and add what it made you feel.' : 'When readers choose to share a passage, it will appear here without their name.'}</p>
          <Link to="/fiction" className="btn btn-outline">Browse stories</Link>
        </section>
      )}

      {!authLoading && !loading && !error && bookmarks.length > 0 && (
        <>
          <div className="bookmark-list" aria-label={mineOnly ? 'Your bookmarks' : 'Public bookmarks'}>
            {bookmarks.map(bookmark => (
              <article className="bookmark-card card" key={bookmark.id}>
                <div className="bookmark-feeling">
                  <span className="eyebrow">HOW IT FELT</span>
                  <p>{bookmark.reflection}</p>
                </div>
                <blockquote className="bookmark-excerpt">“{bookmark.excerpt}”</blockquote>
                <div className="bookmark-source">
                  <Link className="bookmark-collection-link" to={`/fiction/collections/${bookmark.collection_id}/notes`}>
                    {bookmark.collection_title}
                  </Link>
                  <span className="bookmark-source-divider" aria-hidden="true">/</span>
                  <Link to={`/fiction/collections/${bookmark.collection_id}/notes/${bookmark.chapter_id}`}>
                    {bookmark.chapter_title}
                  </Link>
                  <span className="bookmark-author">by <Link to={`/author/${encodeURIComponent(bookmark.author_display)}`}>{bookmark.author_display}</Link></span>
                </div>
                {mineOnly && (
                  <button
                    type="button"
                    className="bookmark-remove"
                    disabled={removingId !== null}
                    onClick={() => void removeBookmark(bookmark.id)}
                  >
                    {removingId === bookmark.id ? 'Removing…' : 'Remove my bookmark'}
                  </button>
                )}
              </article>
            ))}
          </div>
          {pagination.totalPages > 1 && (
            <nav className="bookmark-pagination" aria-label="Bookmark pages">
              <button className="btn btn-outline btn-sm" disabled={page <= 1 || loading} onClick={() => setPage(current => current - 1)}>← Newer</button>
              <span>Page {pagination.page} of {pagination.totalPages}</span>
              <button className="btn btn-outline btn-sm" disabled={page >= pagination.totalPages || loading} onClick={() => setPage(current => current + 1)}>Older →</button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
