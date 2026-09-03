import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import QRCode from 'qrcode';

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
  const [tokenSymbol, setTokenSymbol] = useState('USDC');
  const [cryptoQuote, setCryptoQuote] = useState<any>(null);
  const [qrImage, setQrImage] = useState('');

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

  const handleCrypto = async () => {
    if (!token) return;
    setProcessing(true); setError(''); setCryptoQuote(null); setQrImage('');
    try {
      const res = await fetch(`${API}/crypto/quotes`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ storyId: collectionId, unlockType: type === 'permanent' ? 'PERM_UNLOCK' : 'TIME_LIMITED', tokenSymbol }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create crypto checkout.');
      setCryptoQuote(data);
      setQrImage(await QRCode.toDataURL(data.checkoutUrl, { width: 280, margin: 1 }));
    } catch (e: any) { setError(e.message || 'Could not create crypto checkout.'); }
    setProcessing(false);
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
        {story.author_stripe_connected && <>
          <button className="btn btn-primary btn-full" onClick={handlePurchase} disabled={processing}>{processing ? 'Processing...' : `Pay $${price} with Card`}</button>
          <p className="unlock-secure-note">Secure Stripe payment. Gifts also remain Stripe-only.</p>
        </>}
        {story.author_crypto_connected && <div className="card" style={{ marginTop: '1rem' }}>
          <h3>Pay less with crypto on Arbitrum</h3>
          <p>{isPermanent ? '50%' : '70%'} of the listed fiat price: <strong>${(price * (isPermanent ? 0.5 : 0.7)).toFixed(2)}</strong>.</p>
          <div className="flex gap-2">
            {['USDC', 'USDT', 'DAI'].map(symbol => <button key={symbol} className={`btn ${tokenSymbol === symbol ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTokenSymbol(symbol)}>{symbol}</button>)}
          </div>
          <button className="btn btn-success btn-full" style={{ marginTop: '1rem' }} onClick={handleCrypto} disabled={processing}>{processing ? 'Preparing...' : `Create ${tokenSymbol} QR checkout`}</button>
          {cryptoQuote && qrImage && <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <img src={qrImage} alt="Scan crypto checkout QR code" width="280" height="280" />
            <p>Scan with your phone, then approve {cryptoQuote.tokenSymbol} and pay from your wallet app. No Fiction Hall wallet connection.</p>
            <Link className="btn btn-outline" to={`/fiction/crypto-pay/${cryptoQuote.quoteId}`}>Open checkout on this device</Link>
          </div>}
        </div>}
        {!story.author_sale_enabled && <div className="error-msg">This writer has not enabled Stripe or crypto sales.</div>}
      </div>
    </div>
  );
}
