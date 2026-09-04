import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

const API = '/api';

function externalHandle(handle: string, type: 'reddit' | 'twitter' | 'substack') {
  const safe = encodeURIComponent(handle);
  if (type === 'reddit') return `https://www.reddit.com/user/${safe}/`;
  if (type === 'twitter') return `https://x.com/${safe}?lang=en`;
  return `https://substack.com/@${safe}`;
}

export default function AuthorPage() {
  const { display } = useParams<{ display: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!display) return;
    setLoading(true);
    fetch(`${API}/authors/${encodeURIComponent(display)}`)
      .then(async res => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Author not found');
        return body;
      })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [display]);

  if (loading) return <div className="loading">Loading author...</div>;
  if (error || !data?.author) return <div className="page-container"><div className="empty card">{error || 'Author not found.'}</div></div>;

  const author = data.author;
  const socials = [
    author.twitter_username && { label: 'X / Twitter', handle: author.twitter_username, url: externalHandle(author.twitter_username, 'twitter') },
    author.reddit_username && { label: 'Reddit', handle: author.reddit_username, url: externalHandle(author.reddit_username, 'reddit') },
    author.substack_username && { label: 'Substack', handle: author.substack_username, url: externalHandle(author.substack_username, 'substack') },
  ].filter(Boolean) as { label: string; handle: string; url: string }[];

  return (
    <div className="author-page editorial-page">
      <Link to="/fiction" className="breadcrumb">← Fiction</Link>
      <section className="author-hero editorial-hero card">
        <div className="author-monogram">{author.display.slice(0, 1).toUpperCase()}</div>
        <div className="author-hero-copy">
          <p className="eyebrow">AUTHOR PROFILE</p>
          <h1>{author.display}</h1>
          <p className="author-handle">@{author.username}</p>
          {author.introduction && <p className="author-introduction">{author.introduction}</p>}
          {author.contact && <p className="author-contact">Contact: <a href={`mailto:${author.contact}`}>{author.contact}</a></p>}
          {socials.length > 0 && (
            <div className="author-socials">
              {socials.map(social => <a key={social.label} href={social.url} target="_blank" rel="noreferrer">{social.label} <span>↗</span></a>)}
            </div>
          )}
        </div>
        <div className="author-stats">
          <strong>{data.collections?.length || 0}</strong><span>collections</span>
          <strong>{data.browsedNotes?.length || 0}</strong><span>recent notes</span>
        </div>
      </section>

      <div className="author-content-grid">
        <section className="editorial-panel">
          <div className="section-heading"><p className="eyebrow">THE SHELF</p><h2>Created collections</h2></div>
          {data.collections?.length ? <div className="author-collection-list">{data.collections.map((collection: any) => (
            <Link key={collection.id} to={`/fiction/collections/${collection.id}/notes`} className="author-collection-card">
              <span className="collection-number">{String(collection.id).padStart(2, '0')}</span>
              <span><strong>{collection.title}</strong>{collection.description && <small>{collection.description}</small>}<em>{collection.published_note_count || 0} published chapters{collection.genre ? ` • ${collection.genre}` : ''}</em></span>
              <span className="arrow">→</span>
            </Link>
          ))}</div> : <p className="empty">No published collections yet.</p>}
        </section>

        <section className="editorial-panel">
          <div className="section-heading"><p className="eyebrow">READING TRACE</p><h2>Last 50 notes browsed</h2></div>
          {data.browsedNotes?.length ? <div className="browsed-note-list">{data.browsedNotes.map((note: any) => (
            <Link key={`${note.id}-${note.viewed_at}`} to={`/fiction/collections/${note.story_id}/notes/${note.id}`} className="browsed-note">
              <span><strong>{note.title}</strong><small>{note.story_title}</small></span><em>{note.word_count || 0} words</em>
            </Link>
          ))}</div> : <p className="empty">No public reading history yet.</p>}
        </section>
      </div>
    </div>
  );
}
