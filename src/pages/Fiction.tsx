import { useState, useEffect, useCallback, useRef, useEffect as useEffect2 } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ContextMenu {
  x: number;
  y: number;
  url: string;
  label: string;
}

interface Note {
  id: number; title: string; text: string; created_at: string; updated_at: string;
  word_count: number; live: boolean; free: boolean; story_id: number;
  story_title?: string; author_display?: string; genre?: string;
  noteLikeCount?: number; view_count?: number; labels?: { name: string }[];
}

interface Collection {
  id: number; title: string; description: string; created_at: string;
  author_display?: string; genre?: string; total_word_count?: number;
  total_note_count?: number; total_likes?: number; labels?: { name: string }[];
}

const GENRES = ['romance','scifi','philosophy','political','mythical','poetry','drama','utopian','dystopian','fable','tragedy','comedy','thriller','non_fiction'];
const API = '/api';

export default function Fiction() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'notes' | 'collections'>('notes');
  const [notes, setNotes] = useState<Note[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateCol, setShowCreateCol] = useState(false);
  const [newCol, setNewCol] = useState({ title: '', description: '', genre: '', labels: '' });
  const [title, setTitle] = useState('');
  const [tempTitle, setTempTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [tempAuthor, setTempAuthor] = useState('');
  const [genre, setGenre] = useState('');
  const [tempGenre, setTempGenre] = useState('');
  const [labels, setLabels] = useState('');
  const [tempLabels, setTempLabels] = useState('');
  const [freeFilter, setFreeFilter] = useState('');
  const [tempFreeFilter, setTempFreeFilter] = useState('');
  const [minLikes, setMinLikes] = useState('');
  const [tempMinLikes, setTempMinLikes] = useState('');
  const [minViews, setMinViews] = useState('');
  const [tempMinViews, setTempMinViews] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [sortOrder, setSortOrder] = useState('desc');
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const contextRef = useRef<HTMLDivElement>(null);

  // Close context menu on left-click outside
  useEffect2(() => {
    const handleClick = (e: MouseEvent) => {
      // Only close on left-click (button === 0), not right-click
      if (e.button === 0) setContextMenu(null);
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        pageSize: '10',
        ...(title && { title }),
        ...(author && { author }),
        ...(genre && { genre }),
        ...(labels && { labels }),
        ...(freeFilter && { free: freeFilter }),
        ...(minLikes && { minLikes }),
        ...(minViews && { minViews }),
        ...(sortBy && { sortBy, sortOrder }),
      });
      if (tab === 'notes') {
        const res = await fetch(`${API}/notes?${params}`);
        const data = await res.json();
        setNotes(data.notes || []);
        setPagination(prev => ({ ...prev, ...data.pagination }));
      } else {
        const res = await fetch(`${API}/collections?${params}`);
        const data = await res.json();
        setCollections(data.collections || []);
        setPagination(prev => ({ ...prev, ...data.pagination }));
      }
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, [tab, pagination.page, title, author, genre, labels, freeFilter, minLikes, minViews, sortBy, sortOrder]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const createCollection = async () => {
    if (!newCol.title) return;
    if (!token) { navigate('/auth'); return; }
    try {
      const res = await fetch(`${API}/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(newCol),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create collection');
      }
      const data = await res.json();
      setShowCreateCol(false);
      setNewCol({ title: '', description: '', genre: '', labels: '' });
      navigate(`/fiction/collections/${data.id}/notes`);
    } catch (e: any) { alert(e.message); }
  };

  const handleSort = (field: string) => {
    if (sortBy === field) setSortOrder(s => s === 'desc' ? 'asc' : 'desc');
    else { setSortBy(field); setSortOrder('desc'); }
  };

  const applyFilters = () => {
    setTitle(tempTitle); setAuthor(tempAuthor); setGenre(tempGenre); setTempGenre(tempGenre);
    setFreeFilter(tempFreeFilter); setMinLikes(tempMinLikes); setMinViews(tempMinViews);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const resetFilters = () => {
    setTitle(''); setAuthor(''); setGenre(''); setLabels('');
    setFreeFilter(''); setMinLikes(''); setMinViews('');
    setTempTitle(''); setTempAuthor(''); setTempGenre(''); setTempLabels('');
    setTempFreeFilter(''); setTempMinLikes(''); setTempMinViews('');
    setSortBy(''); setSortOrder('desc');
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  return (
    <div className="fiction-page">
      <div className="page-header">
        <h1>Fiction</h1>
        <div className="tab-switcher">
          <button className={`tab-btn ${tab === 'notes' ? 'active' : ''}`} onClick={() => { setTab('notes'); setPagination(p => ({...p, page:1})); }}>Notes</button>
          <button className={`tab-btn ${tab === 'collections' ? 'active' : ''}`} onClick={() => { setTab('collections'); setPagination(p => ({...p, page:1})); }}>Collections</button>
        </div>
      </div>

      {user && (
        <div className="create-bar">
          {tab === 'collections' && (
            <button className="btn btn-success" onClick={() => setShowCreateCol(!showCreateCol)}>
              {showCreateCol ? 'Cancel' : '+ New Collection'}
            </button>
          )}
          {tab === 'notes' && (
            <button className="btn btn-success" onClick={() => {
              if (!token) { navigate('/auth'); return; }
              setTab('collections');
              setShowCreateCol(true);
            }}>
              + New Note
            </button>
          )}
        </div>
      )}

      {showCreateCol && user && (
        <div className="card create-form">
          <h3>Create New Collection</h3>
          <input className="input" placeholder="Title *" value={newCol.title} onChange={e => setNewCol({ ...newCol, title: e.target.value })} />
          <textarea className="input" placeholder="Description" value={newCol.description} onChange={e => setNewCol({ ...newCol, description: e.target.value })} rows={3} />
          <select className="input" value={newCol.genre} onChange={e => setNewCol({ ...newCol, genre: e.target.value })}>
            <option value="">Select Genre (Optional)</option>
            {GENRES.map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
          </select>
          <input className="input" placeholder="Labels (comma-separated)" value={newCol.labels} onChange={e => setNewCol({ ...newCol, labels: e.target.value })} />
          <div className="form-actions">
            <button className="btn btn-success" onClick={createCollection}>Create</button>
          </div>
        </div>
      )}

      <div className="filters">
        <input className="input" placeholder="Filter by title" value={tempTitle} onChange={e => setTempTitle(e.target.value)} />
        <input className="input" placeholder="Filter by author" value={tempAuthor} onChange={e => setTempAuthor(e.target.value)} />
        <select className="input" value={tempGenre} onChange={e => setTempGenre(e.target.value)}>
          <option value="">All Genres</option>
          {GENRES.map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
        </select>
        <input className="input" placeholder="Labels (comma-separated)" value={tempLabels} onChange={e => setTempLabels(e.target.value)} />
        <select className="input" value={tempFreeFilter} onChange={e => setTempFreeFilter(e.target.value)}>
          <option value="">Free & Paid</option>
          <option value="1">Free Only</option>
          <option value="0">Paid Only</option>
        </select>
        <input className="input" type="number" min="0" placeholder="Min likes" value={tempMinLikes} onChange={e => setTempMinLikes(e.target.value)} />
        <input className="input" type="number" min="0" placeholder="Min views" value={tempMinViews} onChange={e => setTempMinViews(e.target.value)} />
        <div className="filter-actions">
          <button className="btn btn-primary" onClick={applyFilters}>Apply</button>
          <button className="btn btn-outline" onClick={resetFilters}>Reset</button>
        </div>
      </div>

      <div className="sort-bar">
        <button className={`sort-btn ${sortBy === 'title' ? 'active' : ''}`} onClick={() => handleSort('title')}>
          Title {sortBy === 'title' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
        </button>
        <button className={`sort-btn ${sortBy === 'updatedAt' ? 'active' : ''}`} onClick={() => handleSort('updatedAt')}>
          Updated {sortBy === 'updatedAt' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
        </button>
        <button className={`sort-btn ${sortBy === 'createdAt' ? 'active' : ''}`} onClick={() => handleSort('createdAt')}>
          Created {sortBy === 'createdAt' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
        </button>
        <button className={`sort-btn ${sortBy === 'noteLikeCount' ? 'active' : ''}`} onClick={() => handleSort('noteLikeCount')}>
          ❤️ Likes {sortBy === 'noteLikeCount' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
        </button>
        <button className={`sort-btn ${sortBy === 'view_count' ? 'active' : ''}`} onClick={() => handleSort('view_count')}>
          👁 Views {sortBy === 'view_count' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
        </button>
      </div>

      {loading && <div className="loading">Loading...</div>}
      {error && <div className="error-msg">{error}</div>}

      {!loading && tab === 'notes' && notes.length === 0 && <div className="empty">No notes found. {user && 'Create a collection and start writing!'}</div>}
      {!loading && tab === 'collections' && collections.length === 0 && <div className="empty">No collections found.</div>}

      <div className="item-list">
        {tab === 'notes' && notes.map(note => (
          <div
            key={note.id}
            className="card item-card"
            onClick={() => navigate(`/fiction/collections/${note.story_id}/notes/${note.id}`)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, url: `/fiction/collections/${note.story_id}/notes/${note.id}`, label: note.title });
            }}
          >
            <div className="item-card-header">
              <h3>{note.title}</h3>
              <div className="item-card-badges">
                {!note.free && <span className="badge badge-locked">🔒</span>}
              </div>
            </div>
            <p className="item-meta">by {note.author_display} • {note.word_count} words</p>
            {note.story_title && <p className="item-sub">in {note.story_title}</p>}
            {note.genre && <span className="badge badge-genre">{note.genre}</span>}
            <div className="item-stats">
              <span>❤️ {note.noteLikeCount || 0}</span>
              <span>👁 {note.view_count || 0}</span>
            </div>
            {note.labels && note.labels.length > 0 && (
              <div className="item-labels">
                {note.labels.map(l => <span key={l.name} className="badge badge-label">{l.name}</span>)}
              </div>
            )}
          </div>
        ))}

        {tab === 'collections' && collections.map(col => (
          <div
            key={col.id}
            className="card item-card"
            onClick={() => navigate(`/fiction/collections/${col.id}/notes`)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, url: `/fiction/collections/${col.id}/notes`, label: col.title });
            }}
          >
            <h3>{col.title}</h3>
            <p className="item-meta">by {col.author_display} • {col.total_note_count || 0} chapters • {(col.total_word_count || 0).toLocaleString()} words</p>
            {col.description && <p className="item-desc">{col.description}</p>}
            {col.genre && <span className="badge badge-genre">{col.genre}</span>}
            <div className="item-stats">
              <span>❤️ {col.total_likes || 0}</span>
            </div>
            {col.labels && col.labels.length > 0 && (
              <div className="item-labels">
                {col.labels.map(l => <span key={l.name} className="badge badge-label">{l.name}</span>)}
              </div>
            )}
          </div>
        ))}
      </div>

      {pagination.totalPages > 1 && (
        <div className="pagination">
          <button className="btn btn-sm" disabled={pagination.page <= 1} onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}>← Prev</button>
          <span>Page {pagination.page} of {pagination.totalPages}</span>
          <button className="btn btn-sm" disabled={pagination.page >= pagination.totalPages} onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}>Next →</button>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextRef}
          className="context-menu"
          style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-item" onClick={() => { window.open(contextMenu.url, '_blank'); setContextMenu(null); }}>
            📂 Open in new tab
          </div>
          <div className="context-menu-item" onClick={() => { navigator.clipboard.writeText(window.location.origin + contextMenu.url); setContextMenu(null); }}>
            🔗 Copy link
          </div>
        </div>
      )}
    </div>
  );
}
