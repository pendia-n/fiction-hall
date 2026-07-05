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
      <div className="card" style={{ marginTop: '40px' }}>
        <div className="breadcrumb">
          <Link to={`/fiction/collections/${collectionId}/notes`}>← Back to Collection</Link>
        </div>
        <h2>{isPermanent ? 'Buy Permanent Access' : 'Rent for 1 Year'}</h2>
        <p className="unlock-author">
          <strong>{story.title}</strong> by {story.author_display}
        </p>
        <div className="unlock-price-box">
          <div className="unlock-price">${price}</div>
          <div className="unlock-price-sub">
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
        >
          {processing ? 'Processing...' : `Pay $${price} with Card`}
        </button>
        <p className="unlock-secure-note">
          Secure payment via Stripe. You'll be redirected to complete payment.
        </p>
      </div>
    </div>
  );
}
