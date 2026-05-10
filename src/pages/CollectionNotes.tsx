import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API = '/api';

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

  useEffect(() => {
    const load = async () => {
      const [storyRes, notesRes] = await Promise.all([
        fetch(`${API}/collections/${collectionId}`),
        fetch(`${API}/collections/${collectionId}/notes?pageSize=100`),
      ]);
      const storyData = await storyRes.json();
      const notesData = await notesRes.json();
      setStory(storyData);
      setNotes(notesData.notes || []);
      setLikeCount(storyData.likeCount || 0);
      setLoading(false);

      // Load pricing if author
      if (user && storyData.user_id === user.id) {
        const pricingRes = await fetch(`${API}/collections/${collectionId}/pricing`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (pricingRes.ok) {
          const pricing = await pricingRes.json();
          if (pricing.rental_price) setRentalPrice(pricing.rental_price);
          if (pricing.perm_price) setPermPrice(pricing.perm_price);
        }
      }
    };
    load();
  }, [collectionId, user, token]);

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
      body: JSON.stringify({
        storyId: collectionId,
        title: newChapter.title,
        text: '',
        labels: newChapter.labels,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      // Redirect to write page for the new note
      navigate(`/fiction/collections/${collectionId}/notes/${data.id}/write`);
    }
  };

  const toggleNoteFree = async (noteId: number, currentFree: boolean) => {
    if (!token) return;
    await fetch(`${API}/fiction/collections/${collectionId}/toggleState/${noteId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    setNotes(notes.map(n => n.id === noteId ? { ...n, free: !currentFree } : n));
  };

  const savePricing = async () => {
    await fetch(`${API}/collections/${collectionId}/pricing`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ rental_price: rentalPrice, perm_price: permPrice }),
    });
    setShowPricing(false);
  };

  const isAuthor = user && story && user.id === story.user_id;
  const freeNotes = notes.filter(n => n.free).length;
  const canToggleFree = isAuthor && notes.length > 3;

  if (loading) return <div className="loading">Loading...</div>;
  if (!story) return <div className="error-msg">Collection not found</div>;

  return (
    <div className="collection-page">
      <div className="collection-hero card">
        <div className="breadcrumb">
          <Link to="/fiction">← Fiction</Link>
        </div>
        <h1>{story.title}</h1>
        <p className="meta">by {story.author_display} • {notes.length} chapters • {(story.chapters || []).reduce((s: number, c: any) => s + (c.word_count || 0), 0).toLocaleString()} words</p>
        {story.description && <p className="desc">{story.description}</p>}
        {story.genre && <span className="badge badge-genre">{story.genre}</span>}
        {story.labels?.length > 0 && (
          <div className="item-labels">
            {story.labels.map((l: any) => <span key={l.name} className="badge badge-label">{l.name}</span>)}
          </div>
        )}
        <div className="collection-actions">
          <button className={`btn ${liked ? 'btn-danger' : 'btn-outline'}`} onClick={toggleLike}>
            {liked ? '❤️' : '🤍'} {likeCount}
          </button>
          {isAuthor && (
            <>
              <button className="btn btn-primary" onClick={() => setShowNewChapter(!showNewChapter)}>
                {showNewChapter ? 'Cancel' : '+ New Chapter'}
              </button>
              <button className="btn btn-outline" onClick={() => setShowPricing(!showPricing)}>
                💰 Pricing
              </button>
            </>
          )}
        </div>
      </div>

      {/* Pricing section for author */}
      {isAuthor && showPricing && (
        <div className="card pricing-section">
          <h3>Collection Pricing</h3>
          <p className="field-hint">Set the price for readers to access your premium chapters. Minimum: $14/year rental, $21 permanent.</p>
          <div className="form-row">
            <div className="form-group">
              <label>1-Year Rental Price ($)</label>
              <input className="input" type="number" min="14" value={rentalPrice} onChange={e => setRentalPrice(Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label>Permanent Access Price ($)</label>
              <input className="input" type="number" min="21" value={permPrice} onChange={e => setPermPrice(Number(e.target.value))} />
            </div>
          </div>
          <p className="field-hint">Platform fee: 5% on rentals, 10% on permanent purchases. You get the rest.</p>
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
          <div className="form-group">
            <label>Description (optional)</label>
            <textarea className="input" placeholder="Brief description" value={newChapter.description} onChange={e => setNewChapter({ ...newChapter, description: e.target.value })} rows={2} />
          </div>
          <button className="btn btn-success" onClick={createChapter}>Create & Start Writing</button>
        </div>
      )}

      {/* Paywall for non-authors on premium collections */}
      {!isAuthor && notes.length > 0 && notes.some(n => !n.free) && (
        <div className="card paywall-section">
          <h3>🔒 Premium Collection</h3>
          <p>{freeNotes} of {notes.length} chapters are free to read. Unlock all chapters:</p>
          <div className="unlock-options">
            <button className="btn btn-primary" onClick={() => navigate(`/fiction/collections/${collectionId}/unlock?type=rental`)}>
              Rent 1 Year — ${rentalPrice}
            </button>
            <button className="btn btn-success" onClick={() => navigate(`/fiction/collections/${collectionId}/unlock?type=permanent`)}>
              Buy Permanent — ${permPrice}
            </button>
          </div>
          <p className="unlock-note">95% of rental fee and 90% of purchase price goes directly to the writer.</p>
        </div>
      )}

      <div className="notes-list">
        {notes.length === 0 ? (
          <div className="empty card">No chapters yet.</div>
        ) : (
          notes.map(note => (
            <div key={note.id} className="card note-card" onClick={() => navigate(`/fiction/collections/${collectionId}/notes/${note.id}`)}>
              <div className="note-card-header">
                <h3>{note.title}</h3>
                <div className="note-badges">
                  {!note.free && <span className="badge badge-locked">🔒 Premium</span>}
                  {isAuthor && (
                    <button
                      className={`btn btn-sm ${note.free ? 'btn-outline' : 'btn-warning'}`}
                      onClick={(e) => { e.stopPropagation(); toggleNoteFree(note.id, note.free); }}
                      disabled={!canToggleFree && note.free && freeNotes <= 3}
                    >
                      {note.free ? 'Free' : 'Premium'}
                    </button>
                  )}
                </div>
              </div>
              <p className="meta">{note.word_count} words • {new Date(note.created_at).toLocaleDateString()}</p>
            </div>
          ))
        )}
        {isAuthor && notes.length > 0 && !showNewChapter && (
          <button className="btn btn-success btn-full" onClick={() => setShowNewChapter(true)}>
            + Write New Chapter
          </button>
        )}
      </div>
    </div>
  );
}
