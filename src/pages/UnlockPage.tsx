import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API = '/api';

export default function UnlockPage() {
  const { collectionId } = useParams<{ collectionId: string }>();
  const [searchParams] = useSearchParams();
  const type = searchParams.get('type') || 'rental';
  const { token } = useAuth();
  const navigate = useNavigate();
  const [story, setStory] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      navigate('/auth');
      return;
    }
    const load = async () => {
      const res = await fetch(`${API}/collections/${collectionId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        navigate('/fiction');
        return;
      }
      const data = await res.json();
      setStory(data);
      setLoading(false);
    };
    load();
  }, [collectionId, token]);

  const handlePurchase = async () => {
    if (!token) { navigate('/auth'); return; }
    setProcessing(true);
    setError('');
    try {
      const res = await fetch(`${API}/purchase/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          storyId: collectionId,
          unlockType: type === 'permanent' ? 'PERM_UNLOCK' : 'TIME_LIMITED'
        })
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Failed to create checkout session');
        setProcessing(false);
      }
    } catch {
      setError('Failed to connect. Please try again.');
      setProcessing(false);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (!story) return null;

  const price = type === 'permanent' ? (story.perm_price ?? 21) : (story.rental_price ?? 14);
  const isPermanent = type === 'permanent';

  return (
    <div className="unlock-page">
      <div className="card" style={{ maxWidth: 480, margin: '40px auto' }}>
        <div className="breadcrumb">
          <Link to={`/fiction/collections/${collectionId}/notes`}>← Back to Collection</Link>
        </div>
        <h2>{isPermanent ? '🔓 Buy Permanent Access' : '📅 Rent for 1 Year'}</h2>
        <p style={{ marginTop: 12 }}>
          <strong>{story.title}</strong> by {story.author_display}
        </p>
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 16, margin: '16px 0' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#16a34a' }}>${price}</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
            {isPermanent
              ? 'Permanent access — yours forever. 90% goes to the author.'
              : '1-year rental access. 95% goes to the author.'}
          </div>
        </div>
        {error && <div className="error-msg">{error}</div>}
        <button
          className="btn btn-primary btn-full"
          onClick={handlePurchase}
          disabled={processing}
          style={{ marginTop: 16 }}
        >
          {processing ? '⏳ Processing...' : `Pay $${price} with Card`}
        </button>
        <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 12, textAlign: 'center' }}>
          Secure payment via Stripe. You'll be redirected to complete payment.
        </p>
      </div>
    </div>
  );
}
