import { useState } from 'react';

interface GiftModalProps {
  open: boolean;
  onClose: () => void;
  endpoint: string;
  token: string;
  authorName?: string;
}

type GiftMode = 'author' | 'both';

const MIN_AUTHOR = 1;
const MIN_PLATFORM = 0.5;

export default function GiftModal({ open, onClose, endpoint, token, authorName }: GiftModalProps) {
  const [mode, setMode] = useState<GiftMode | null>(null);
  const [authorAmount, setAuthorAmount] = useState('');
  const [platformAmount, setPlatformAmount] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  if (!open) return null;

  const authorNum = parseFloat(authorAmount) || 0;
  const platformNum = parseFloat(platformAmount) || 0;

  const canSendAuthor = authorNum >= MIN_AUTHOR;
  const canSendBoth = canSendAuthor && platformNum >= MIN_PLATFORM;
  const canSend = mode === 'author' ? canSendAuthor : canSendBoth;

  const handleSend = async () => {
    if (!canSend || sending) return;
    setError('');
    setSending(true);
    try {
      const body: Record<string, number> = { author_amount: authorNum };
      if (mode === 'both') body.platform_amount = platformNum;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Failed to create gift');
      }
    } catch {
      setError('Network error');
    }
    setSending(false);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-card">
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2 style={{ marginBottom: '0.5rem' }}>💎 Send a Gift</h2>
        {authorName && (
          <p style={{ color: 'var(--text-tertiary)', marginBottom: '1rem', fontSize: '0.85rem' }}>
            to {authorName}
          </p>
        )}

        {!mode ? (
          <div className="gift-mode-select">
            <p style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>Choose your gift type:</p>
            <button className="gift-mode-btn" onClick={() => setMode('author')}>
              <span className="gift-mode-icon">1+1=2</span>
              <span className="gift-mode-desc">Gift to author only</span>
            </button>
            <button className="gift-mode-btn" onClick={() => setMode('both')}>
              <span className="gift-mode-icon">3&gt;1+1</span>
              <span className="gift-mode-desc">Gift to author + platform</span>
            </button>
          </div>
        ) : (
          <div className="gift-form">
            <div className="form-group">
              <label>Gift to Author ${MIN_AUTHOR}+</label>
              <input
                className="input"
                type="number"
                min={MIN_AUTHOR}
                step="1"
                value={authorAmount}
                onChange={e => setAuthorAmount(e.target.value)}
                placeholder={`Min $${MIN_AUTHOR}`}
              />
            </div>

            {mode === 'both' && (
              <div className="form-group">
                <label>Gift to Platform ${MIN_PLATFORM}+</label>
                <input
                  className="input"
                  type="number"
                  min={MIN_PLATFORM}
                  step="0.5"
                  value={platformAmount}
                  onChange={e => setPlatformAmount(e.target.value)}
                  placeholder={`Min $${MIN_PLATFORM}`}
                />
              </div>
            )}

            <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>
              Total: <strong>${(authorNum + platformNum).toFixed(2)}</strong>
            </div>

            {error && <div className="error-msg">{error}</div>}

            <button
              className="btn btn-primary btn-full"
              style={{ marginTop: '0.75rem' }}
              onClick={handleSend}
              disabled={!canSend || sending}
            >
              {sending ? 'Processing...' : `Send $${(authorNum + platformNum).toFixed(2)}`}
            </button>

            <button
              className="btn btn-ghost btn-full"
              style={{ marginTop: '0.5rem' }}
              onClick={() => { setMode(null); setAuthorAmount(''); setPlatformAmount(''); setError(''); }}
            >
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
