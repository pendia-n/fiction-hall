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
  // Stripe Connect state
  const [stripeConnected, setStripeConnected] = useState(false);
  const [stripeChecking, setStripeChecking] = useState(false);
  const [stripeOnboarded, setStripeOnboarded] = useState(false);
  const [stripeOnboarding, setStripeOnboarding] = useState(false);
  const [arbitrumWallet, setArbitrumWallet] = useState('');
  const [cryptoOkay, setCryptoOkay] = useState(false);
  const [cryptoSaving, setCryptoSaving] = useState(false);
  const [cryptoMessage, setCryptoMessage] = useState('');

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
    fetch(`${API}/profile/recent-views`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => setRecentViews(data.notes || []))
      .catch(() => {});
    fetch(`${API}/profile`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { setArbitrumWallet(data.arbitrum_wallet || ''); setCryptoOkay(!!data.crypto_okay); })
      .catch(() => {});

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

  // Check Stripe Connect status if user has published notes
  useEffect(() => {
    if (!token || !user) return;
    const hasPublished = myNotes.some(n => n.live === 1);
    if (!hasPublished) return;
    setStripeChecking(true);
    fetch(`${API}/stripe/connect/status`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        setStripeConnected(data.connected);
        setStripeOnboarded(data.onboarded);
        setStripeChecking(false);
      })
      .catch(() => setStripeChecking(false));
  }, [token, user, myNotes]);

  const [showCountryPicker, setShowCountryPicker] = useState(false);

  const COUNTRIES = [
    { code: 'US', name: 'United States' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'CA', name: 'Canada' },
    { code: 'AU', name: 'Australia' },
    { code: 'DE', name: 'Germany' },
    { code: 'FR', name: 'France' },
    { code: 'NL', name: 'Netherlands' },
    { code: 'IE', name: 'Ireland' },
    { code: 'NZ', name: 'New Zealand' },
    { code: 'SG', name: 'Singapore' },
    { code: 'JP', name: 'Japan' },
    { code: 'AT', name: 'Austria' },
    { code: 'BE', name: 'Belgium' },
    { code: 'CH', name: 'Switzerland' },
    { code: 'SE', name: 'Sweden' },
    { code: 'NO', name: 'Norway' },
    { code: 'DK', name: 'Denmark' },
    { code: 'FI', name: 'Finland' },
    { code: 'ES', name: 'Spain' },
    { code: 'IT', name: 'Italy' },
    { code: 'PL', name: 'Poland' },
    { code: 'CZ', name: 'Czech Republic' },
    { code: 'PT', name: 'Portugal' },
    { code: 'GR', name: 'Greece' },
    { code: 'HU', name: 'Hungary' },
    { code: 'RO', name: 'Romania' },
    { code: 'HR', name: 'Croatia' },
    { code: 'LT', name: 'Lithuania' },
    { code: 'LV', name: 'Latvia' },
    { code: 'SI', name: 'Slovenia' },
    { code: 'HK', name: 'Hong Kong SAR China' },
    { code: 'TH', name: 'Thailand' },
    { code: 'MX', name: 'Mexico' },
  ];

  const handleStripeOnboard = async (countryCode?: string) => {
    if (!token) return;
    setStripeOnboarding(true);
    setShowCountryPicker(false);
    try {
      const res = await fetch(`${API}/stripe/connect/onboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ country: countryCode || 'US' }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert('Failed to start Stripe onboarding: ' + (data.error || 'Unknown error'));
      }
    } catch (e: any) {
      alert('Failed to start Stripe onboarding');
    }
    setStripeOnboarding(false);
  };

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

  const saveCryptoWallet = async () => {
    if (!token) return;
    setCryptoSaving(true);
    setCryptoMessage('');
    const res = await fetch(`${API}/profile/crypto-wallet`, { method: 'PUT', headers: authHeaders(token), body: JSON.stringify({ address: arbitrumWallet }) });
    const data = await res.json();
    if (res.ok) { setArbitrumWallet(data.address); setCryptoOkay(true); setCryptoMessage('Arbitrum payouts enabled.'); }
    else setCryptoMessage(data.error || 'Could not save wallet.');
    setCryptoSaving(false);
  };

  const removeCryptoWallet = async () => {
    if (!token) return;
    setCryptoSaving(true);
    const res = await fetch(`${API}/profile/crypto-wallet`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { setArbitrumWallet(''); setCryptoOkay(false); setCryptoMessage('Crypto payouts disabled.'); }
    setCryptoSaving(false);
  };

  const hasPublishedNotes = myNotes.some(n => n.live === 1);

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
        <div className="form-actions">
          <Link to="/security" className="btn btn-outline btn-sm">Security Settings (TOTP & Security Q&A)</Link>
          <button className="btn btn-danger btn-sm ml-auto" onClick={async () => {
            if (window.confirm('Are you sure you want to deactivate your account? You can reactivate later with TOTP + security questions.')) {
              const res = await fetch(`${API}/auth/deactivate`, {
                method: 'POST', headers: { Authorization: `Bearer ${token}` }
              });
              if (res.ok) {
                alert('Account deactivated. You will be redirected.');
                window.location.href = '/auth';
              }
            }
          }}>Deactivate Account</button>
        </div>

        {/* Stripe Connect — Show if user has published notes */}
        {hasPublishedNotes && !stripeChecking && (
          <div className="stripe-connect-section">
            {stripeConnected && stripeOnboarded ? (
              <div className="stripe-branded">
                <span className="badge badge-genre">Connected</span>
                <span>Stripe payouts connected</span>
              </div>
            ) : stripeConnected && !stripeOnboarded ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm" style={{ color: 'var(--warning)' }}>Payout setup incomplete - finish onboarding to receive payments</span>
                <button
                  className="btn btn-warning"
                  onClick={() => setShowCountryPicker(true)}
                  disabled={stripeOnboarding}
                >
                  Complete Setup
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm">Receive payments for your published chapters</span>
                <button
                  className="btn btn-success"
                  onClick={() => setShowCountryPicker(true)}
                  disabled={stripeOnboarding}
                >
                  Set Up Payouts
                </button>
              </div>
            )}
          </div>
        )}

        {hasPublishedNotes && (
          <div className="stripe-connect-section">
            <h3>Arbitrum crypto payouts</h3>
            <p className="field-hint">Add an Arbitrum wallet to sell with USDC, USDT, or DAI. This does not connect the wallet or give Fiction Hall custody.</p>
            <div className="flex flex-wrap items-center gap-3">
              <input className="input" style={{ flex: 1, minWidth: '260px' }} value={arbitrumWallet} onChange={e => { setArbitrumWallet(e.target.value); setCryptoOkay(false); }} placeholder="0x... Arbitrum wallet" />
              <button className="btn btn-success" onClick={saveCryptoWallet} disabled={cryptoSaving}>{cryptoSaving ? 'Saving...' : 'Enable Crypto'}</button>
              {cryptoOkay && <button className="btn btn-outline" onClick={removeCryptoWallet} disabled={cryptoSaving}>Remove</button>}
            </div>
            {cryptoOkay && <span className="badge badge-genre">Crypto enabled</span>}
            {cryptoMessage && <div className={`msg ${cryptoOkay ? 'success' : 'error'}`}>{cryptoMessage}</div>}
            <p className="field-hint">Gifts remain Stripe-only. This address is used only for collection-sale proceeds.</p>
          </div>
        )}

        {/* Country Picker Modal */}
        {showCountryPicker && (
          <div className="modal-overlay" onClick={() => setShowCountryPicker(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
              <div className="modal-header">
                <h2>Select Your Country</h2>
                <button className="modal-close" onClick={() => setShowCountryPicker(false)}>×</button>
              </div>
              <div className="modal-body">
                <p className="text-sm mb-4">This determines your onboarding form and payout currency.</p>
                <div className="grid-cols-2">
                  {COUNTRIES.map(c => (
                    <button
                      key={c.code}
                      className="btn btn-outline"
                      style={{ justifyContent: 'flex-start', padding: '0.5rem 0.75rem' }}
                      onClick={() => handleStripeOnboard(c.code)}
                      disabled={stripeOnboarding}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
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
