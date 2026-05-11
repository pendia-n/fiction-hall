import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { authHeaders } from '../context/AuthContext';
import { Link } from 'react-router-dom';

const API = '/api';

export default function Profile() {
  const { user, token, refreshUser } = useAuth();
  const [display, setDisplay] = useState(user?.display || '');
  const [introduction, setIntroduction] = useState(user?.introduction || '');
  const [contact, setContact] = useState(user?.contact || '');
  const [contactOn, setContactOn] = useState(user?.contact_on || false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [displayStatus, setDisplayStatus] = useState<'checking' | 'available' | 'taken' | null>(null);
  const [recentViews, setRecentViews] = useState<any[]>([]);
  const [myCollections, setMyCollections] = useState<any[]>([]);
  const [myNotes, setMyNotes] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      setDisplay(user.display);
      setIntroduction(user.introduction || '');
      setContact((user as any).contact || '');
      setContactOn((user as any).contact_on || false);
    }
  }, [user]);

  // Live display name check
  useEffect(() => {
    if (!display || display === user?.display) { setDisplayStatus(null); return; }
    if (display.length < 2) { setDisplayStatus(null); return; }
    setDisplayStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API}/auth/check/display?display=${encodeURIComponent(display)}`);
        const data = await res.json();
        setDisplayStatus(data.available ? 'available' : 'taken');
      } catch { setDisplayStatus(null); }
    }, 500);
    return () => clearTimeout(timer);
  }, [display, user?.display]);

  // Load recent views and my content
  useEffect(() => {
    if (!token) return;
    // Load recent views
    fetch(`${API}/profile/recent-views`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => setRecentViews(data.notes || []))
      .catch(() => {});

    // Load my collections
    if (user) {
      fetch(`${API}/profile/my-collections`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(data => setMyCollections(data.collections || []))
        .catch(() => {});

      fetch(`${API}/profile/my-notes?pageSize=100`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(data => setMyNotes(data.notes || []))
        .catch(() => {});
    }
  }, [token, user]);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`${API}/profile`, {
        method: 'PUT',
        headers: authHeaders(token),
        body: JSON.stringify({ display, introduction, contact, contact_on: contactOn }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await refreshUser();
      setMessage('Profile updated!');
    } catch (e: any) { setMessage(e.message); }
    setSaving(false);
  };

  if (!user) return <div className="loading">Loading...</div>;

  return (
    <div className="profile-page">
      <div className="card">
        <h2>Profile Settings</h2>
        <div className="form-group">
          <label>Username</label>
          <input className="input" value={user.username} disabled />
        </div>
        <div className="form-group">
          <label>Display Name</label>
          <input className="input" value={display} onChange={e => setDisplay(e.target.value)} />
          {displayStatus === 'checking' && <small className="field-hint checking">Checking...</small>}
          {displayStatus === 'available' && <small className="field-hint success">✓ Available</small>}
          {displayStatus === 'taken' && <small className="field-hint error">✗ Already taken</small>}
        </div>
        <div className="form-group">
          <label>Introduction</label>
          <textarea className="input" value={introduction} onChange={e => setIntroduction(e.target.value)} rows={3} maxLength={230} />
        </div>
        <div className="form-group">
          <label>Contact</label>
          <input className="input" value={contact} onChange={e => setContact(e.target.value)} />
        </div>
        <div className="form-group checkbox-group">
          <label>
            <input type="checkbox" checked={contactOn} onChange={e => setContactOn(e.target.checked)} />
            Show contact publicly
          </label>
        </div>
        {message && <div className={`msg ${message.includes('updated') ? 'success' : 'error'}`}>{message}</div>}
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        <div className="form-actions" style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Link to="/security" className="btn btn-outline btn-sm">🔐 Security Settings (TOTP & Security Q&A)</Link>
          <button className="btn btn-danger btn-sm" onClick={async () => {
            if (window.confirm('Are you sure you want to deactivate your account? You can reactivate later with TOTP + security questions.')) {
              const res = await fetch(`${API}/auth/deactivate`, {
                method: 'POST', headers: { Authorization: `Bearer ${token}` }
              });
              if (res.ok) {
                alert('Account deactivated. You will be redirected.');
                window.location.href = '/auth';
              }
            }
          }} style={{ marginLeft: 'auto' }}>Deactivate Account</button>
        </div>
      </div>

      {/* My Collections */}
      <div className="card">
        <h2>My Collections ({myCollections.length})</h2>
        {myCollections.length === 0 ? (
          <p className="empty">No collections yet. <Link to="/fiction">Create one →</Link></p>
        ) : (
          <div className="item-list scroll-list">
            {myCollections.map(col => (
              <div key={col.id} className="card item-card" onClick={() => window.location.href = `/fiction/collections/${col.id}/notes`}>
                <h3>{col.title}</h3>
                <p className="item-meta">{col.total_note_count || 0} chapters • {(col.total_word_count || 0).toLocaleString()} words</p>
                {col.genre && <span className="badge badge-genre">{col.genre}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* My Recent Notes */}
      <div className="card">
        <h2>My Recent Chapters ({myNotes.length})</h2>
        {myNotes.length === 0 ? (
          <p className="empty">No chapters written yet.</p>
        ) : (
          <div className="item-list scroll-list">
            {myNotes.slice(0, 5).map(note => (
              <div key={note.id} className="card item-card" onClick={() => window.location.href = `/fiction/collections/${note.story_id}/notes/${note.id}`}>
                <h3>{note.title}</h3>
                <p className="item-meta">{note.word_count} words • {new Date(note.created_at).toLocaleDateString()}</p>
                {!note.free && <span className="badge badge-locked">🔒 Premium</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recently Viewed */}
      <div className="card">
        <h2>Recently Viewed ({recentViews.length})</h2>
        {recentViews.length === 0 ? (
          <p className="empty">No recently viewed chapters. Start reading!</p>
        ) : (
          <div className="item-list scroll-list">
            {recentViews.slice(0, 50).map(note => (
              <div key={note.id} className="card item-card" onClick={() => window.location.href = `/fiction/collections/${note.story_id}/notes/${note.id}`}>
                <h3>{note.title}</h3>
                <p className="item-meta">by {note.author_display} • {note.word_count} words</p>
                {note.story_title && <p className="item-sub">in {note.story_title}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
