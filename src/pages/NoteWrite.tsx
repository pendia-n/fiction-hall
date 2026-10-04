import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API = '/api';

interface NoteImage { id: string; title: string; url: string; thumbnailUrl: string; thumbnailSrc: string; bytes: number; }

export default function NoteWrite() {
  const { collectionId, noteId } = useParams<{ collectionId: string; noteId?: string }>();
  const { token, loading: authLoading } = useAuth();
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
  const [isLive, setIsLive] = useState(false);
  const [showPublishWarning, setShowPublishWarning] = useState(false);
  const [totalNotesCount, setTotalNotesCount] = useState(0);
  const [images, setImages] = useState<NoteImage[]>([]);
  const [imageError, setImageError] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const imageUrlsRef = useRef<string[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const saveRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!authLoading && !token) navigate('/auth', { replace: true });
  }, [authLoading, token, navigate]);

  // Load existing note
  useEffect(() => {
    if (!noteId || authLoading || !token) return;
    setIsNew(false);
    fetch(`${API}/notes/${noteId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        setTitle(data.title || '');
        setText(data.text || '');
        setWordCount(data.wordCount || 0);
        setViewCount(data.viewCount || 0);
        setNoteStatus(data.free ? 'free' : 'premium');
        setIsLive(!!data.live);
        if (data.labels) setLabels(data.labels.map((l: any) => l.name).join(', '));
      })
      .catch(() => {});
  }, [noteId, token, authLoading]);

  // Load collection info for total note count
  useEffect(() => {
    if (authLoading || !token) return;
    fetch(`${API}/collections/${collectionId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        setTotalNotesCount(data.chapters?.length || 0);
      })
      .catch(() => {});
  }, [collectionId, token, authLoading]);

  const loadImages = useCallback(async () => {
    if (!noteId || !token) return;
    const res = await fetch(`${API}/notes/${noteId}/images`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const data = await res.json();
    const next = await Promise.all((data.images || []).map(async (image: Omit<NoteImage, 'thumbnailSrc' | 'title'>) => {
      const response = await fetch(image.thumbnailUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) return null;
      return { ...image, title: 'Chapter image', thumbnailSrc: URL.createObjectURL(await response.blob()) } as NoteImage;
    }));
    const ready = next.filter((image): image is NoteImage => Boolean(image));
    imageUrlsRef.current.forEach(URL.revokeObjectURL);
    imageUrlsRef.current = ready.map(image => image.thumbnailSrc);
    setImages(ready);
  }, [noteId, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadImages(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadImages]);
  useEffect(() => () => imageUrlsRef.current.forEach(URL.revokeObjectURL), []);

  const makeThumbnail = async (file: File) => {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 144 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser could not prepare an image preview.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob || blob.size > 100 * 1024) throw new Error('Could not prepare a small preview. Try a simpler PNG.');
    return new File([blob], 'thumbnail.png', { type: 'image/png' });
  };

  const uploadImage = async (file?: File) => {
    if (!file || !noteId || !token) return;
    setImageError('');
    if (file.type !== 'image/png' || !file.name.toLowerCase().endsWith('.png')) {
      setImageError('Choose a PNG image.');
      return;
    }
    if (file.size > 900 * 1024) {
      setImageError('Each image must be 900 KB or smaller.');
      return;
    }
    if (images.length >= 25) {
      setImageError('This chapter already has 25 images.');
      return;
    }
    setUploadingImage(true);
    try {
      const thumbnail = await makeThumbnail(file);
      const form = new FormData();
      form.append('image', file);
      form.append('thumbnail', thumbnail);
      const res = await fetch(`${API}/notes/${noteId}/images`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Image upload failed.');
      await loadImages();
    } catch (error) {
      setImageError(error instanceof Error ? error.message : 'Image upload failed.');
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const insertImage = (image: NoteImage) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const line = `![${title.trim() || image.title}](${image.url})`;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const prefix = start > 0 && text[start - 1] !== '\n' ? '\n' : '';
    const suffix = end < text.length && text[end] !== '\n' ? '\n' : '';
    const insertion = `${prefix}${line}${suffix}`;
    setText(text.slice(0, start) + insertion + text.slice(end));
    requestAnimationFrame(() => {
      ta.focus();
      const cursor = start + insertion.length;
      ta.setSelectionRange(cursor, cursor);
    });
  };

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
    // If already published, redirect to read
    if (isLive) {
      navigate(`/fiction/collections/${collectionId}/notes/${noteId}`);
      return;
    }
    // First click: show warning
    if (!showPublishWarning) {
      setShowPublishWarning(true);
      return;
    }
    // Second click: confirm publish
    await fetch(`${API}/notes/${noteId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title, text, labels, live: true }),
    });
    navigate(`/fiction/collections/${collectionId}/notes/${noteId}`);
  };

  const handleToggleStatus = async () => {
    if (!noteId || isLive) return;
    try {
      const res = await fetch(`${API}/fiction/collections/${collectionId}/toggleState/${noteId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNoteStatus(data.free ? 'free' : 'premium');
      }
    } catch { /* silent */ }
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

  if (authLoading || !token) return <div className="loading">Checking sign-in…</div>;

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
        <button type="button" className="md-btn" onClick={() => insertMarkdown('![', '](https://)')} title="Image">🖼️</button>
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

      {!isLive && <section className="image-library card" aria-labelledby="image-library-heading">
        <div className="image-library-heading">
          <div><h2 id="image-library-heading">Chapter images</h2><p className="field-hint">PNG only · up to 900 KB each · {images.length}/25 for this chapter</p></div>
          {!isLive && noteId && <>
            <input ref={imageInputRef} className="visually-hidden" type="file" accept="image/png,.png" aria-label="Choose a PNG image" onChange={event => uploadImage(event.target.files?.[0])} />
            <button type="button" className="btn btn-outline" onClick={() => imageInputRef.current?.click()} disabled={uploadingImage || images.length >= 25}>{uploadingImage ? 'Preparing image…' : 'Upload PNG'}</button>
          </>}
        </div>
        {isNew && <p className="field-hint">Save this draft first to attach images to it.</p>}
        {imageError && <p className="error-msg" role="alert">{imageError}</p>}
        {images.length > 0 ? <div className="image-library-grid">{images.map(image => <button type="button" key={image.id} className="image-library-item" onClick={() => insertImage(image)} title={`Insert ${image.title} into this chapter`}>
          <img src={image.thumbnailSrc} alt="" loading="lazy" />
          <span>Insert in chapter</span>
          <code>{image.url}</code>
        </button>)}</div> : !isNew && <p className="field-hint">Images you upload here appear as small previews. Select one to insert it on a new Markdown line.</p>}
      </section>}

      <div className="write-footer">
        {showPublishWarning && (
          <div className="card" style={{ background: 'var(--warning-bg)' }}>
            <strong>Publish Warning</strong>
            <p className="text-sm mt-2 mb-4">
              Once published, this chapter <strong>cannot be edited, deleted, or toggled between Free and Premium</strong>. 
              The free/premium status is also locked at the time of publishing. 
              Make sure your content and pricing decision are final before publishing. 
              You will only be able to create new chapters for updates.
            </p>
            <div className="flex gap-2">
              <button className="btn btn-danger btn-sm" onClick={handlePublish}>
                I Understand, Publish Now
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => setShowPublishWarning(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
        <input
          className="input"
          placeholder="Labels (comma-separated)"
          value={labels}
          onChange={e => setLabels(e.target.value)}
        />
        <div className="write-actions">
          {isLive ? (
            <div className="flex items-center gap-2">
              <span className="badge badge-locked" style={{ fontSize: '0.875rem', padding: '0.375rem 0.75rem' }}>Published — Read Only</span>
              <button className="btn btn-primary" onClick={() => navigate(`/fiction/collections/${collectionId}/notes/${noteId}`)}>View Chapter</button>
            </div>
          ) : (
            <>
              <button className="btn btn-outline" onClick={() => navigate(-1)}>Cancel</button>
              {!isLive && (
                <button
                  className="btn btn-outline"
                  onClick={handleToggleStatus}
                  disabled={totalNotesCount < 4}
                  title={totalNotesCount < 4 ? 'Need 4+ chapters before any can be premium' : ''}
                >
                  {noteStatus === 'free' ? '✓ Free to Read' : '🔒 Premium'}
                </button>
              )}
              <button className="btn btn-primary" onClick={autoSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Draft'}
              </button>
              <button className="btn btn-success" onClick={handlePublish}>
                {showPublishWarning ? 'Confirm Publish' : 'Publish'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
