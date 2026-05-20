import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface NoteContextMenu {
  x: number;
  y: number;
  url: string;
  label: string;
}

const API = '/api';

const GENRES = ['romance','scifi','philosophy','political','mythical','poetry','drama','utopian','dystopian','fable','tragedy','comedy','thriller','non_fiction'];

const PAGE_SIZE = 100;

export default function CollectionNotes() {
  const { collectionId } = useParams<{ collectionId: string }>();
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [story, setStory] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [showNewChapter, setShowNewChapter] = useState(false);
  const [newChapter, setNewChapter] = useState({ title: '', labels: '', description: '' });
  const [rentalPrice, setRentalPrice] = useState(14);
  const [permPrice, setPermPrice] = useState(21);
  const [showPricing, setShowPricing] = useState(false);
  const [toggleError, setToggleError] = useState('');
  // Collection editing state
  const [editingCollection, setEditingCollection] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editLabels, setEditLabels] = useState('');
  const [editGenre, setEditGenre] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [savingCollection, setSavingCollection] = useState(false);
  // Delete collection state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTotpCode, setDeleteTotpCode] = useState('');
  const [deleteTotpRequired, setDeleteTotpRequired] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deletingCollection, setDeletingCollection] = useState(false);
  // TOTP status for current user
  const [userTotpEnabled, setUserTotpEnabled] = useState(false);
  // Mark sellable state
  const [markingSellable, setMarkingSellable] = useState(false);
  const [sellableInfo, setSellableInfo] = useState('');
  const [pricingError, setPricingError] = useState('');
  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalNotesCount, setTotalNotesCount] = useState(0);
  // Context menu state
  const [noteContextMenu, setNoteContextMenu] = useState<NoteContextMenu | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Close context menu on left-click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (e.button === 0) setNoteContextMenu(null);
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const [storyRes, notesRes] = await Promise.all([
        fetch(`${API}/collections/${collectionId}`, { headers }),
        fetch(`${API}/collections/${collectionId}/notes?pageSize=${PAGE_SIZE}&page=${page}`, { headers }),
      ]);
      const storyData = await storyRes.json();
      const notesData = await notesRes.json();
      setStory(storyData);
      setNotes(notesData.notes || []);
      setTotalNotesCount(notesData.pagination?.total || 0);
      setTotalPages(notesData.pagination?.totalPages || 1);
      setLikeCount(storyData.likeCount || 0);
      setLoading(false);

      if (user && storyData.user_id === user.id) {
        const pricingRes = await fetch(`${API}/collections/${collectionId}/pricing`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (pricingRes.ok) {
          const pricing = await pricingRes.json();
          if (pricing.rental_price) setRentalPrice(pricing.rental_price);
          if (pricing.perm_price) setPermPrice(pricing.perm_price);
        }
        // Check if user has TOTP enabled
        const statusRes = await fetch(`${API}/auth/totp/status`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (statusRes.ok) {
          const status = await statusRes.json();
          setUserTotpEnabled(!!status.enabled);
        }
      }

      // Check if user liked
      if (token) {
        const likeRes = await fetch(`${API}/collections/${collectionId}/emotion/status`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (likeRes.ok) {
          const likeData = await likeRes.json();
          setLiked(likeData.liked);
        }
      }
    };
    load();
  }, [collectionId, user, token, page]);

  const toggleLike = async () => {
    if (!token) { navigate('/auth'); return; }
    const res = await fetch(`${API}/collections/${collectionId}/emotion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ emotion: liked ? 'indifferent' : 'like' }),
    });
    if (res.ok) {
      setLiked(!liked);
      const data = await res.json();
      setLikeCount(data.likeCount);
    }
  };

  const createChapter = async () => {
    if (!newChapter.title) return;
    const res = await fetch(`${API}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ storyId: collectionId, title: newChapter.title, text: '', labels: newChapter.labels }),
    });
    if (res.ok) {
      const data = await res.json();
      navigate(`/fiction/collections/${collectionId}/notes/${data.id}/write`);
    }
  };

  const toggleNoteFree = async (noteId: number, currentFree: boolean) => {
    if (!token) return;
    setToggleError('');
    try {
      const res = await fetch(`${API}/fiction/collections/${collectionId}/toggleState/${noteId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setNotes(notes.map(n => n.id === noteId ? { ...n, free: !currentFree } : n));
      } else {
        const data = await res.json();
        setToggleError(data.error || 'Cannot toggle status');
        setTimeout(() => setToggleError(''), 4000);
      }
    } catch {
      setToggleError('Failed to toggle');
      setTimeout(() => setToggleError(''), 4000);
    }
  };

  const savePricing = async () => {
    setPricingError('');
    try {
      const res = await fetch(`${API}/collections/${collectionId}/pricing`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rental_price: rentalPrice, perm_price: permPrice }),
      });
      if (res.ok) {
        setShowPricing(false);
      } else {
        const data = await res.json();
        setPricingError(data.error || 'Failed to save pricing');
        setTimeout(() => setPricingError(''), 5000);
      }
    } catch {
      setPricingError('Failed to save pricing');
      setTimeout(() => setPricingError(''), 5000);
    }
  };

  // Check if pricing is on cooldown (same UTC day as last update)
  const getPricingCooldown = () => {
    if (!story?.pricing_updated_at) return { locked: false, hoursLeft: 0 };
    const lastUpdate = new Date(story.pricing_updated_at);
    const now = new Date();
    const lastUtcDay = Date.UTC(lastUpdate.getUTCFullYear(), lastUpdate.getUTCMonth(), lastUpdate.getUTCDate());
    const nowUtcDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    if (lastUtcDay === nowUtcDay) {
      const nextMidnight = new Date(nowUtcDay + 24 * 60 * 60 * 1000);
      const hoursLeft = Math.ceil((nextMidnight.getTime() - now.getTime()) / (1000 * 60 * 60));
      return { locked: true, hoursLeft };
    }
    return { locked: false, hoursLeft: 0 };
  };

  const handleMarkSellable = async () => {
    setMarkingSellable(true);
    setSellableInfo('');
    try {
      const res = await fetch(`${API}/collections/${collectionId}/mark-sellable`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setSellableInfo(`✅ ${data.sellable_count} chapters marked as sellable`);
        setStory((s: any) => ({ ...s, sellable_count: data.sellable_count }));
      } else {
        setSellableInfo(`❌ ${data.error || 'Failed'}`);
      }
      setTimeout(() => setSellableInfo(''), 4000);
    } catch {
      setSellableInfo('❌ Failed to mark sellable');
      setTimeout(() => setSellableInfo(''), 4000);
    }
    setMarkingSellable(false);
  };

  const saveCollectionEdits = async () => {
    if (!editTitle.trim()) return;
    setSavingCollection(true);
    const res = await fetch(`${API}/collections/${collectionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: editTitle,
        description: editDescription,
        genre: editGenre,
        labels: editLabels,
      }),
    });
    if (res.ok) {
      setStory((s: any) => ({
        ...s,
        title: editTitle,
        description: editDescription,
        genre: editGenre,
        labels: editLabels.split(',').map((l: string) => l.trim()).filter((l: string) => l).map((name: string) => ({ name })),
      }));
      setEditingCollection(false);
    }
    setSavingCollection(false);
  };

  const startEditingCollection = () => {
    setEditTitle(story.title || '');
    setEditDescription(story.description || '');
    setEditGenre(story.genre || '');
    setEditLabels((story.labels || []).map((l: any) => l.name).join(', '));
    setEditingCollection(true);
  };

  const handleDeleteCollection = async () => {
    setDeleteError('');
    setDeletingCollection(true);
    const body: any = {};
    if (deleteTotpRequired && deleteTotpCode) {
      body.totpCode = deleteTotpCode;
    }
    const res = await fetch(`${API}/collections/${collectionId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      navigate('/fiction');
    } else {
      const data = await res.json();
      if (data.totpRequired) {
        setDeleteTotpRequired(true);
        setDeleteError('TOTP code required for deletion');
      } else {
        setDeleteError(data.error || 'Failed to delete');
      }
    }
    setDeletingCollection(false);
  };

  const isAuthor = user && story && user.id === story.user_id;
  const allChapters = story?.chapters || [];
  const premiumCount = allChapters.filter((n: any) => !n.free).length;
  const freeCount = allChapters.filter((n: any) => n.free).length;
  const maxPremium = totalNotesCount >= 4 ? totalNotesCount - 3 : 0;

  const goToPage = (p: number) => {
    if (p < 1 || p > totalPages) return;
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (!story) return <div className="error-msg">Collection not found</div>;

  return (
    <div className="collection-page">
      <div className="collection-hero card">
        <div className="breadcrumb">
          <Link to="/fiction">← Fiction</Link>
        </div>
        {editingCollection ? (
          <div className="edit-collection-form">
            <div className="form-group">
              <label>Collection Title *</label>
              <input className="input" value={editTitle} onChange={e => setEditTitle(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea className="input" value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={3} />
            </div>
            <div className="form-group">
              <label>Genre</label>
              <select className="input" value={editGenre} onChange={e => setEditGenre(e.target.value)}>
                <option value="">Select Genre (Optional)</option>
                {GENRES.map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Labels (comma-separated)</label>
              <input className="input" value={editLabels} onChange={e => setEditLabels(e.target.value)} placeholder="e.g. action, drama" />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-primary" onClick={saveCollectionEdits} disabled={savingCollection}>
                {savingCollection ? 'Saving...' : 'Save Changes'}
              </button>
              <button className="btn btn-outline" onClick={() => setEditingCollection(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <h1>{story.title}</h1>
            <p className="meta">by {story.author_display} • {totalNotesCount} chapters • {(story.chapters || []).reduce((s: number, c: any) => s + (c.word_count || 0), 0).toLocaleString()} words</p>
            {story.description && <p className="desc">{story.description}</p>}
            {story.genre && <span className="badge badge-genre">{story.genre}</span>}
            {story.labels?.length > 0 && (
              <div className="item-labels">
                {story.labels.map((l: any) => <span key={l.name} className="badge badge-label">{l.name}</span>)}
              </div>
            )}
          </>
        )}
        <div className="collection-actions">
          <button className={`btn ${liked ? 'btn-danger' : 'btn-outline'}`} onClick={toggleLike}>
            {liked ? '❤️' : '🤍'} {likeCount}
          </button>
          {isAuthor && !editingCollection && (
            <>
              <button className="btn btn-outline" onClick={startEditingCollection}>
                ✏️ Edit Collection
              </button>
              <button className="btn btn-primary" onClick={() => setShowNewChapter(!showNewChapter)}>
                {showNewChapter ? 'Cancel' : '+ New Chapter'}
              </button>
              <button
                className="btn btn-outline"
                onClick={() => { if (!getPricingCooldown().locked) setShowPricing(!showPricing); }}
                disabled={getPricingCooldown().locked}
                title={getPricingCooldown().locked ? `Pricing can only be changed once per day. Wait ${getPricingCooldown().hoursLeft}h (until 00:00 UTC).` : 'Set pricing for your collection'}
              >
                💰 Pricing{getPricingCooldown().locked ? ` (wait ${getPricingCooldown().hoursLeft}h)` : ''}
              </button>
              <button className="btn btn-success" onClick={handleMarkSellable} disabled={markingSellable}>
                {markingSellable ? '⏳ Marking...' : '🛒 Mark as Sellable'}
              </button>
              <button className="btn btn-danger" onClick={() => { setShowDeleteConfirm(true); setDeleteTotpRequired(false); setDeleteTotpCode(''); setDeleteError(''); }}>
                🗑️ Delete
              </button>
            </>
          )}
        </div>
      </div>

      {/* Author info about premium rules */}
      {isAuthor && totalNotesCount > 0 && (
        <div className="card premium-info">
          <p className="field-hint" style={{ margin: 0 }}>
            {totalNotesCount < 4
              ? `📝 ${totalNotesCount} chapter(s). Need 4+ before any can be premium. All chapters are free to read.`
              : `📝 ${freeCount} free / ${premiumCount} premium. Max premium allowed: ${maxPremium} (${totalNotesCount} - 3).`
            }
            {(story?.sellable_count || 0) > 0 && (
              <span style={{ marginLeft: '8px', color: '#10b981' }}>
                🛒 {story.sellable_count} sellable
              </span>
            )}
          </p>
        </div>
      )}

      {/* Pricing section for author */}
      {isAuthor && showPricing && (
        <div className="card pricing-section">
          <h3>Collection Pricing</h3>
          <p className="field-hint">Set the price for readers to access your premium chapters. Minimum: $14/year rental, $21 permanent.</p>
          <div className="form-row" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: '1', minWidth: '150px' }}>
              <label>1-Year Rental Price ($)</label>
              <input className="input" type="number" min="14" value={rentalPrice} onChange={e => setRentalPrice(Number(e.target.value))} />
            </div>
            <div className="form-group" style={{ flex: '1', minWidth: '150px' }}>
              <label>Permanent Access Price ($)</label>
              <input className="input" type="number" min="21" value={permPrice} onChange={e => setPermPrice(Number(e.target.value))} />
            </div>
          </div>
          <p className="field-hint">Platform fee: 5% on rentals, 10% on permanent purchases. You get the rest.</p>
          {pricingError && <div className="error-msg" style={{ marginTop: '8px' }}>{pricingError}</div>}
          <button className="btn btn-primary" onClick={savePricing}>Save Pricing</button>
        </div>
      )}

      {/* New chapter form */}
      {isAuthor && showNewChapter && (
        <div className="card new-chapter-form">
          <h3>Create New Chapter</h3>
          <div className="form-group">
            <label>Chapter Title *</label>
            <input className="input" placeholder="Chapter title" value={newChapter.title} onChange={e => setNewChapter({ ...newChapter, title: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Labels (comma-separated)</label>
            <input className="input" placeholder="e.g. action, drama" value={newChapter.labels} onChange={e => setNewChapter({ ...newChapter, labels: e.target.value })} />
          </div>
          <button className="btn btn-success" onClick={createChapter}>Create & Start Writing</button>
        </div>
      )}

      {/* Toggle error message */}
      {toggleError && <div className="error-msg">{toggleError}</div>}

      {/* Sellable info message */}
      {sellableInfo && <div className={`error-msg ${sellableInfo.startsWith('✅') ? 'success-msg' : ''}`}>{sellableInfo}</div>}

      {/* Paywall for non-authors — ONLY on collection page */}
      {!isAuthor && totalNotesCount > 0 && premiumCount > 0 && story?.author_stripe_connected && (story?.sellable_count || 0) > 0 && (
        <div className="card paywall-section">
          <h3>🔒 Premium Collection</h3>
          <p>{freeCount} of {totalNotesCount} chapters are free to read. Unlock all chapters:</p>
          <div className="unlock-options" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {token ? (
              <>
                <button className="btn btn-primary" onClick={() => navigate(`/fiction/collections/${collectionId}/unlock?type=rental`)}>
                  Rent 1 Year — ${story.rental_price ?? 14}
                </button>
                <button className="btn btn-success" onClick={() => navigate(`/fiction/collections/${collectionId}/unlock?type=permanent`)}>
                  Buy Permanent — ${story.perm_price ?? 21}
                </button>
              </>
            ) : (
              <button className="btn btn-primary" onClick={() => navigate('/auth')}>
                🔑 Sign in to buy the author's secret
              </button>
            )}
          </div>
          <p className="unlock-note">95% of rental fee and 90% of purchase price goes directly to the writer.</p>
        </div>
      )}

      {/* Delete collection confirmation modal */}
      {showDeleteConfirm && (
        <div className="card" style={{ background: '#fff5f5', border: '1px solid #f5c6cb' }}>
          <h3 style={{ color: '#721c24' }}>🗑️ Delete Collection?</h3>
          <p>Are you sure you want to delete "<strong>{story?.title}</strong>"? This action cannot be undone. All chapters and data will be permanently removed.</p>
          {userTotpEnabled && (
            <div className="form-group">
              <label>TOTP Code (required) *</label>
              <input className="input" value={deleteTotpCode} onChange={e => setDeleteTotpCode(e.target.value)} maxLength={6} placeholder="Enter 6-digit code" />
            </div>
          )}
          {deleteError && <div className="error-msg">{deleteError}</div>}
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button className="btn btn-danger" onClick={handleDeleteCollection} disabled={deletingCollection || (userTotpEnabled && (!deleteTotpCode || deleteTotpCode.length !== 6))}>
              {deletingCollection ? 'Deleting...' : 'Yes, Delete Forever'}
            </button>
            <button className="btn btn-outline" onClick={() => { setShowDeleteConfirm(false); setDeleteError(''); setDeleteTotpCode(''); }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="notes-list">
        {notes.length === 0 ? (
          <div className="empty card">No chapters yet.</div>
        ) : (
          notes.map(note => (
            <div
              key={note.id}
              className="card note-card"
              onClick={() => navigate(`/fiction/collections/${collectionId}/notes/${note.id}`)}
              onContextMenu={(e) => {
                e.preventDefault();
                setNoteContextMenu({ x: e.clientX, y: e.clientY, url: `/fiction/collections/${collectionId}/notes/${note.id}`, label: note.title });
              }}
            >
              <div className="note-card-header">
                <h3>{note.title}</h3>
                <div className="note-badges" style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {/* Published notes: just show status badge, no toggle */}
                  {note.live ? (
                    <span className={`badge ${note.free ? 'badge-label' : 'badge-locked'}`} style={{ fontSize: '11px' }}>
                      {note.free ? 'Free' : '🔒 Premium'}
                    </span>
                  ) : isAuthor && totalNotesCount >= 4 ? (
                    <>
                      {/* Draft with 4+ total: show toggle button */}
                      <button
                        className={`btn btn-sm ${note.free ? 'btn-outline' : 'btn-warning'}`}
                        onClick={(e) => { e.stopPropagation(); toggleNoteFree(note.id, note.free); }}
                      >
                        {note.free ? 'Set Premium' : 'Set Free'}
                      </button>
                    </>
                  ) : isAuthor && totalNotesCount < 4 ? (
                    <>
                      {/* Draft with <4 total: show disabled toggle */}
                      <button
                        className="btn btn-sm"
                        disabled
                        style={{ opacity: 0.4, cursor: 'not-allowed', background: '#334155', color: '#94a3b8', border: '1px solid #475569' }}
                        title="Need 4+ chapters before any can be premium"
                      >
                        {note.free ? 'Set Premium' : 'Set Free'}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
              <p className="meta">{note.word_count} words • 👁 {note.view_count || 0} views • 💖 {note.like_count || 0} likes</p>
            </div>
          ))
        )}

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="pagination" style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '12px',
            padding: '16px 0',
          }}>
            <button
              className="btn btn-outline btn-sm"
              disabled={page <= 1}
              onClick={() => goToPage(page - 1)}
            >
              ← Previous
            </button>
            <span className="pagination-info" style={{
              fontSize: '0.9rem',
              color: 'var(--text-secondary)',
            }}>
              Page {page} of {totalPages}
              <span style={{ marginLeft: '8px', opacity: 0.6 }}>
                ({totalNotesCount} total)
              </span>
            </span>
            <button
              className="btn btn-outline btn-sm"
              disabled={page >= totalPages}
              onClick={() => goToPage(page + 1)}
            >
              Next →
            </button>
          </div>
        )}

        <button className="btn btn-outline btn-full" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          ↑ Back to Top
        </button>
      </div>

      {/* Context Menu for notes */}
      {noteContextMenu && (
        <div
          ref={contextMenuRef}
          className="context-menu"
          style={{ position: 'fixed', top: noteContextMenu.y, left: noteContextMenu.x, zIndex: 1000 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-item" onClick={() => { window.open(noteContextMenu.url, '_blank'); setNoteContextMenu(null); }}>
            📂 Open in new tab
          </div>
          <div className="context-menu-item" onClick={() => { navigator.clipboard.writeText(window.location.origin + noteContextMenu.url); setNoteContextMenu(null); }}>
            🔗 Copy link
          </div>
        </div>
      )}
    </div>
  );
}
