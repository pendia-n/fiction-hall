import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { marked } from 'marked';

const API = '/api';

export default function NoteRead() {
  const { collectionId, noteId } = useParams<{ collectionId: string; noteId: string }>();
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [note, setNote] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewCount, setViewCount] = useState(0);
  const [noteLiked, setNoteLiked] = useState(false);
  const [noteLikeCount, setNoteLikeCount] = useState(0);
  const [story, setStory] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      try {
        // Load story info for author check
        const storyRes = await fetch(`${API}/collections/${collectionId}`);
        if (storyRes.ok) {
          const storyData = await storyRes.json();
          setStory(storyData);
        }

        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API}/notes/${noteId}`, { headers });
        if (!res.ok) {
          const data = await res.json();
          if (res.status === 403) setError('locked');
          else setError(data.error || 'Not found');
          setLoading(false);
          return;
        }
        const data = await res.json();
        setNote(data);
        setViewCount(data.viewCount || 0);
        setNoteLikeCount(data.noteLikeCount || 0);

        // Load like status for note
        if (token) {
          const noteLikeRes = await fetch(`${API}/notes/${noteId}/emotion/status`, { headers: { Authorization: `Bearer ${token}` } });
          if (noteLikeRes.ok) { const d = await noteLikeRes.json(); setNoteLiked(d.liked); }
        }

        // Record view & last viewed
        if (token) {
          await fetch(`${API}/notes/${noteId}/view`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          });
          await fetch(`${API}/fiction/last-view`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ noteId }),
          });
        }
      } catch (e: any) { setError(e.message); }
      setLoading(false);
    };
    load();
  }, [noteId, token, collectionId]);

  const toggleNoteLike = async () => {
    if (!token) { navigate('/auth'); return; }
    const res = await fetch(`${API}/notes/${noteId}/emotion`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ emotion: noteLiked ? 'indifferent' : 'like' }),
    });
    if (res.ok) { setNoteLiked(!noteLiked); const d = await res.json(); setNoteLikeCount(d.likeCount); }
  };

  if (loading) return <div className="loading">Loading...</div>;

  if (error === 'locked') {
    return (
      <div className="card lock-screen">
        <h2>🔒 Premium Content</h2>
        <p>This chapter is part of a premium collection. Head to the <Link to={`/fiction/collections/${collectionId}/notes`}>collection page</Link> to unlock all chapters.</p>
      </div>
    );
  }

  if (error) return <div className="error-msg">{error}</div>;
  if (!note) return <div className="error-msg">Note not found</div>;

  const htmlContent = marked(note.text || '') as string;
  // Convert Google Drive sharing URLs to direct image URLs
  const fixedHtml = htmlContent.replace(
    /https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)(?:\/[^\s"<>]*)?/g,
    'https://lh3.googleusercontent.com/d/$1'
  );
  const isAuthor = user && story && user.id === story.user_id;

  return (
    <div className="note-read-page">
      <div className="breadcrumb">
        <Link to="/fiction">← Fiction</Link>
        <span> / </span>
        <Link to={`/fiction/collections/${collectionId}/notes`}>{note.story_title}</Link>
      </div>
      <article className="note-content card">
        <header className="note-header">
          <h1>{note.title}</h1>
          <div className="note-meta">
            <span>by {note.author_display}</span>
            <span>{note.word_count} words</span>
            <span>👁 {viewCount} views</span>
          </div>
          <div className="note-actions">
            {/* Per-chapter heart toggle (pink heart) */}
            <button className={`btn ${noteLiked ? 'btn-danger' : 'btn-outline'}`} onClick={toggleNoteLike}>
              💖 {noteLikeCount}
            </button>
            {isAuthor && !note.live && (
              <button className="btn btn-outline" onClick={() => navigate(`/fiction/collections/${collectionId}/notes/${noteId}/write`)}>
                ✏️ Edit
              </button>
            )}
          </div>
          {note.labels?.length > 0 && (
            <div className="item-labels">
              {note.labels.map((l: any) => <span key={l.name} className="badge badge-label">{l.name}</span>)}
            </div>
          )}
        </header>
        <div className="note-body markdown-body" dangerouslySetInnerHTML={{ __html: fixedHtml }} />
      </article>
    </div>
  );
}
