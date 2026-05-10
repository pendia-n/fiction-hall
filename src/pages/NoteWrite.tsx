import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API = '/api';

export default function NoteWrite() {
  const { collectionId, noteId } = useParams<{ collectionId: string; noteId?: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [labels, setLabels] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [wordCount, setWordCount] = useState(0);
  const [watchingCount, setWatchingCount] = useState(0);
  const [viewCount, setViewCount] = useState(0);
  const [isNew, setIsNew] = useState(!noteId);
  const [noteStatus, setNoteStatus] = useState<'free' | 'premium'>('free');
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const saveRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load existing note
  useEffect(() => {
    if (!noteId) return;
    setIsNew(false);
    fetch(`${API}/notes/${noteId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        setTitle(data.title || '');
        setText(data.text || '');
        setWordCount(data.wordCount || 0);
        setViewCount(data.viewCount || 0);
        setNoteStatus(data.free ? 'free' : 'premium');
        if (data.labels) setLabels(data.labels.map((l: any) => l.name).join(', '));
      })
      .catch(() => {});
  }, [noteId, token]);

  // Word count
  useEffect(() => {
    const clean = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    setWordCount(clean ? clean.split(/\s+/).length : 0);
  }, [text]);

  // Auto-save
  const autoSave = useCallback(async () => {
    if (!token) return;
    setSaving(true);
    try {
      if (isNew) {
        const res = await fetch(`${API}/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ storyId: collectionId, title: title || 'Untitled', text, labels }),
        });
        if (res.ok) {
          const data = await res.json();
          setIsNew(false);
          navigate(`/fiction/collections/${collectionId}/notes/${data.id}/write`, { replace: true });
        }
      } else if (noteId) {
        await fetch(`${API}/notes/${noteId}/autosave`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ title: title || 'Untitled', text, labels }),
        });
      }
      setLastSaved(new Date().toLocaleTimeString());
    } catch (e) { /* silent */ }
    setSaving(false);
  }, [token, isNew, noteId, collectionId, title, text, labels, navigate]);

  // Polling
  useEffect(() => {
    if (!noteId || isNew) return;
    const poll = async () => {
      try {
        const res = await fetch(`${API}/poll/${noteId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setWatchingCount(data.watchingCount || 0);
          setViewCount(data.viewCount || 0);
        }
      } catch { /* silent */ }
    };
    pollRef.current = setInterval(poll, 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [noteId, isNew, token]);

  // Debounced auto-save
  const triggerSave = useCallback(() => {
    if (saveRef.current) clearTimeout(saveRef.current);
    saveRef.current = setTimeout(autoSave, 2000);
  }, [autoSave]);

  useEffect(() => { triggerSave(); }, [text, title, labels, triggerSave]);

  const handlePublish = async () => {
    if (!noteId) return;
    await fetch(`${API}/notes/${noteId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title, text, labels, live: true }),
    });
    navigate(`/fiction/collections/${collectionId}/notes/${noteId}`);
  };

  const handleToggleStatus = async () => {
    if (!noteId) return;
    await fetch(`${API}/fiction/collections/${collectionId}/toggleState/${noteId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    setNoteStatus(s => s === 'free' ? 'premium' : 'free');
  };

  // Insert markdown at cursor
  const insertMarkdown = (before: string, after: string = '') => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = text.substring(start, end);
    const newText = text.substring(0, start) + before + selected + after + text.substring(end);
    setText(newText);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + before.length, start + before.length + selected.length);
    }, 0);
  };

  return (
    <div className="write-page">
      <div className="breadcrumb">
        <Link to="/fiction">← Fiction</Link>
        <span> / </span>
        <Link to={`/fiction/collections/${collectionId}/notes`}>Collection</Link>
      </div>

      <div className="write-header">
        <input
          className="write-title-input"
          placeholder="Chapter Title..."
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
        <div className="write-meta">
          <span>{wordCount} words</span>
          <span>👁 {viewCount} views</span>
          {watchingCount > 0 && <span>👥 {watchingCount} watching</span>}
          {saving && <span className="saving-indicator">Saving...</span>}
          {lastSaved && !saving && <span className="saved-indicator">✓ Saved {lastSaved}</span>}
        </div>
      </div>

      {/* Markdown toolbar */}
      <div className="md-toolbar">
        <button type="button" className="md-btn" onClick={() => insertMarkdown('**', '**')} title="Bold"><b>B</b></button>
        <button type="button" className="md-btn" onClick={() => insertMarkdown('*', '*')} title="Italic"><i>I</i></button>
        <button type="button" className="md-btn" onClick={() => insertMarkdown('~~', '~~')} title="Strikethrough"><s>S</s></button>
        <button type="button" className="md-btn" onClick={() => insertMarkdown('# ')} title="Heading 1">H1</button>
        <button type="button" className="md-btn" onClick={() => insertMarkdown('## ')} title="Heading 2">H2</button>
        <button type="button" className="md-btn" onClick={() => insertMarkdown('### ')} title="Heading 3">H3</button>
        <span className="md-sep">|</span>
        <button type="button" className="md-btn" onClick={() => insertMarkdown('- ')} title="Bullet list">•</button>
        <button type="button" className="md-btn" onClick={() => insertMarkdown('1. ')} title="Numbered list">1.</button>
        <button type="button" className="md-btn" onClick={() => insertMarkdown('> ')} title="Blockquote">❝</button>
        <button type="button" className="md-btn" onClick={() => insertMarkdown('```\n', '\n```')} title="Code block">&lt;/&gt;</button>
        <button type="button" className="md-btn" onClick={() => insertMarkdown('[', '](url)')} title="Link">🔗</button>
      </div>

      <div className="write-editor card">
        <textarea
          ref={textareaRef}
          className="write-textarea"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Start writing your story using Markdown..."
          rows={25}
        />
      </div>

      <div className="write-footer">
        <input
          className="input"
          placeholder="Labels (comma-separated)"
          value={labels}
          onChange={e => setLabels(e.target.value)}
        />
        <div className="write-actions">
          <button className="btn btn-outline" onClick={() => navigate(-1)}>Cancel</button>
          <button className="btn btn-outline" onClick={handleToggleStatus}>
            {noteStatus === 'free' ? '✓ Free to Read' : '🔒 Premium'}
          </button>
          <button className="btn btn-primary" onClick={autoSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button className="btn btn-success" onClick={handlePublish}>
            Publish
          </button>
        </div>
      </div>
    </div>
  );
}
