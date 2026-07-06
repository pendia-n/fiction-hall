import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { marked } from 'marked';

const API = '/api';

interface Chapter {
  id: number;
  title: string;
  live: boolean;
  free: boolean;
}

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
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [showChapterDropdown, setShowChapterDropdown] = useState(false);
  const chapterDropdownRef = useRef<HTMLDivElement>(null);
  const chapterDropdownBottomRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<'center' | 'right'>('center');

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

        // Load all chapters in this collection for navigation
        const allChaptersRes = await fetch(`${API}/collections/${collectionId}/notes?pageSize=1000`, { headers });
        if (allChaptersRes.ok) {
          const allChaptersData = await allChaptersRes.json();
          const allChapters: Chapter[] = (allChaptersData.notes || []).map((n: any) => ({
            id: n.id,
            title: n.title,
            live: n.live,
            free: n.free,
          }));
          setChapters(allChapters);
          const idx = allChapters.findIndex(c => c.id === parseInt(noteId!));
          setCurrentIndex(idx);
        }

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

  const goToPrevChapter = () => {
    if (currentIndex > 0) {
      const prevChapter = chapters[currentIndex - 1];
      navigate(`/fiction/collections/${collectionId}/notes/${prevChapter.id}`);
    }
  };

  const goToNextChapter = () => {
    if (currentIndex >= 0 && currentIndex < chapters.length - 1) {
      const nextChapter = chapters[currentIndex + 1];
      navigate(`/fiction/collections/${collectionId}/notes/${nextChapter.id}`);
    }
  };

  const toggleChapterDropdown = (wrapperEl: HTMLDivElement | null) => {
    if (showChapterDropdown) {
      setShowChapterDropdown(false);
      return;
    }
    if (wrapperEl) {
      const rect = wrapperEl.getBoundingClientRect();
      const dropdownRight = rect.left + 140;
      setDropdownPosition(dropdownRight > window.innerWidth - 16 ? 'right' : 'center');
    }
    setShowChapterDropdown(true);
  };

  const goToChapter = (chapterId: number) => {
    setShowChapterDropdown(false);
    navigate(`/fiction/collections/${collectionId}/notes/${chapterId}`);
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
  const fixedHtml = htmlContent.replace(
    /https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)(?:\/[^\s"<>]*)?/g,
    'https://lh3.googleusercontent.com/d/$1'
  );
  const isAuthor = user && story && user.id === story.user_id;

  const prevChapter = currentIndex > 0 ? chapters[currentIndex - 1] : null;
  const nextChapter = currentIndex >= 0 && currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;

  return (
    <div className="note-read-page">
      <div className="breadcrumb">
        <Link to="/fiction">← Fiction</Link>
        <span> / </span>
        <Link to={`/fiction/collections/${collectionId}/notes`}>{note.story_title}</Link>
      </div>

      {/* Chapter Navigation Bar */}
      {chapters.length > 1 && (
        <div className="chapter-nav-bar">
          <button
            className="btn btn-outline btn-sm"
            disabled={!prevChapter}
            onClick={goToPrevChapter}
          >
            ← {prevChapter ? prevChapter.title : 'Previous'}
          </button>

          <div className="chapter-dropdown-wrapper" ref={chapterDropdownRef}>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => toggleChapterDropdown(chapterDropdownRef.current)}
            >
              📖 Chapter {currentIndex + 1} of {chapters.length} ▼
            </button>
            {showChapterDropdown && (
              <div className="chapter-dropdown" style={dropdownPosition === 'right' ? { left: 'auto', right: 0, transform: 'none' } : {}}>
                {chapters.map((ch, idx) => (
                  <div
                    key={ch.id}
                    className={`chapter-dropdown-item ${idx === currentIndex ? 'current' : ''}`}
                    onClick={() => goToChapter(ch.id)}
                  >
                    <span className="chapter-num">{idx + 1}.</span>
                    <span className="chapter-title">{ch.title}</span>
                    {!ch.free && <span className="chapter-lock">🔒</span>}
                    {idx === currentIndex && <span className="chapter-current-mark">◄</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            className="btn btn-outline btn-sm"
            disabled={!nextChapter}
            onClick={goToNextChapter}
          >
            {nextChapter ? nextChapter.title : 'Next'} →
          </button>
        </div>
      )}

      <article className="note-content card">
        <header className="note-header">
          <h1>{note.title}</h1>
          <div className="note-meta">
            <span>by {note.author_display}</span>
            <span>{note.word_count} words</span>
            <span>👁 {viewCount} views</span>
          </div>
          <div className="note-actions">
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

      {/* Bottom Chapter Navigation */}
      {chapters.length > 1 && (
        <div className="chapter-nav-bottom">
          <button
            className="btn btn-outline"
            disabled={!prevChapter}
            onClick={goToPrevChapter}
          >
            ← {prevChapter ? `Prev: ${prevChapter.title}` : 'No Previous Chapter'}
          </button>

          <div className="chapter-dropdown-wrapper" ref={chapterDropdownBottomRef}>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => toggleChapterDropdown(chapterDropdownBottomRef.current)}
            >
              📖 All Chapters ({chapters.length}) ▼
            </button>
            {showChapterDropdown && (
              <div className="chapter-dropdown" style={dropdownPosition === 'right' ? { left: 'auto', right: 0, transform: 'none' } : {}}>
                {chapters.map((ch, idx) => (
                  <div
                    key={ch.id}
                    className={`chapter-dropdown-item ${idx === currentIndex ? 'current' : ''}`}
                    onClick={() => goToChapter(ch.id)}
                  >
                    <span className="chapter-num">{idx + 1}.</span>
                    <span className="chapter-title">{ch.title}</span>
                    {!ch.free && <span className="chapter-lock">🔒</span>}
                    {idx === currentIndex && <span className="chapter-current-mark">◄</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            className="btn btn-outline"
            disabled={!nextChapter}
            onClick={goToNextChapter}
          >
            {nextChapter ? `Next: ${nextChapter.title}` : 'No Next Chapter'} →
          </button>
        </div>
      )}
    </div>
  );
}
