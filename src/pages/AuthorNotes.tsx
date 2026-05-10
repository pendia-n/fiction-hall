import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';

const API = '/api';

export default function AuthorNotes() {
  const { username } = useParams<{ username: string }>();
  const [notes, setNotes] = useState<any[]>([]);
  const [author, setAuthor] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [colRes] = await Promise.all([
        fetch(`${API}/collections/author/${username}`),
      ]);
      const collections = await colRes.json();
      setAuthor({ display: username, collections });

      // Get notes from all collections
      const allNotes: any[] = [];
      for (const col of collections) {
        const res = await fetch(`${API}/collections/${col.id}/notes?pageSize=100`);
        const data = await res.json();
        if (data.notes) allNotes.push(...data.notes.map((n: any) => ({ ...n, story_title: col.title })));
      }
      setNotes(allNotes);
      setLoading(false);
    };
    load();
  }, [username]);

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="author-page">
      <div className="author-hero card">
        <div className="breadcrumb"><Link to="/fiction">← Fiction</Link></div>
        <h1>{username}</h1>
        <p>{author?.collections?.length || 0} collections • {notes.length} chapters</p>
      </div>

      <h2>Collections</h2>
      <div className="item-list">
        {author?.collections?.map((col: any) => (
          <div key={col.id} className="card item-card" onClick={() => {}}>
            <h3><Link to={`/fiction/collections/${col.id}/notes`}>{col.title}</Link></h3>
            {col.description && <p>{col.description}</p>}
            {col.genre && <span className="badge badge-genre">{col.genre}</span>}
          </div>
        ))}
      </div>

      <h2>All Notes</h2>
      <div className="item-list">
        {notes.length === 0 ? (
          <div className="empty card">No published notes yet.</div>
        ) : (
          notes.map(note => (
            <div key={note.id} className="card item-card">
              <h3><Link to={`/fiction/collections/${note.story_id}/notes/${note.id}`}>{note.title}</Link></h3>
              <p className="meta">in {note.story_title} • {note.word_count} words</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
