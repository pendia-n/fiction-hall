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
  const [approveQrImage, setApproveQrImage] = useState('');
  const [statusReady, setStatusReady] = useState(false);
  const [statusError, setStatusError] = useState('');

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
      if (Array.isArray(data.crypto_tokens) && data.crypto_tokens.length > 0) {
        setTokenSymbol(data.crypto_tokens[0]);
      }
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
    setProcessing(true); setError(''); setStatusError(''); setStatusReady(false); setCryptoQuote(null); setQrImage(''); setApproveQrImage('');
    try {
      const res = await fetch(`${API}/crypto/quotes`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ storyId: collectionId, unlockType: type === 'permanent' ? 'PERM_UNLOCK' : 'TIME_LIMITED', tokenSymbol }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create crypto checkout.');
      setCryptoQuote(data);
      setQrImage(await QRCode.toDataURL(data.payUri, { width: 280, margin: 1 }));
      setApproveQrImage(await QRCode.toDataURL(data.approveUri, { width: 220, margin: 1 }));
    } catch (e: any) { setError(e.message || 'Could not create crypto checkout.'); }
    setProcessing(false);
  };

  useEffect(() => {
    if (!cryptoQuote || !token) return;
    let active = true;
    let inFlight = false;
    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await fetch(`${API}/crypto/quotes/${cryptoQuote.quoteId}/status`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (!active) return;
        if (!res.ok) {
          setStatusReady(false);
          setStatusError('Payment verification is unavailable. Do not send a payment until this message clears.');
        } else if (data.status === 'confirmed') {
          navigate(`/fiction/collections/${data.storyId}/notes?unlocked=true`);
        } else if (data.status === 'expired') {
          setStatusReady(false);
          setError('This crypto quote expired. Create a new checkout.');
          window.clearInterval(timer);
        } else if (data.status === 'pending') {
          setStatusReady(data.acceptingPayment === true);
          setStatusError(data.acceptingPayment === true ? '' : 'This quote has expired. Do not pay. If you paid before expiry, verification is still catching up.');
        } else {
          setStatusReady(false);
          setStatusError('Payment status could not be verified. Do not send a payment.');
        }
      } catch {
        if (active) {
          setStatusReady(false);
          setStatusError('Payment verification is unavailable. Do not send a payment until this message clears.');
        }
      } finally { inFlight = false; }
    };
    poll();
    const timer = window.setInterval(poll, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [cryptoQuote, token, navigate]);

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
              ? 'Permanent access — yours forever. 80% goes to the author.'
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
          <p>{isPermanent ? '50%' : '70%'} of the listed fiat price: <strong>${(price * (isPermanent ? 0.5 : 0.7)).toFixed(2)}</strong>. The author receives {isPermanent ? '80%' : '85%'} of the crypto payment.</p>
          <div className="flex gap-2">
            {(story.crypto_tokens || []).map((symbol: string) => <button key={symbol} className={`btn ${tokenSymbol === symbol ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTokenSymbol(symbol)}>{symbol}</button>)}
          </div>
          <button className="btn btn-success btn-full" style={{ marginTop: '1rem' }} onClick={handleCrypto} disabled={processing}>{processing ? 'Preparing...' : `Create ${tokenSymbol} QR checkout`}</button>
          {cryptoQuote && !statusReady && !statusError && !error && <p className="field-hint">Checking that payment verification is working before showing the transaction requests...</p>}
          {statusError && <div className="error-msg">{statusError}</div>}
          {cryptoQuote && statusReady && qrImage && <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '1rem' }}>
              <div><img src={approveQrImage} alt={`Approve ${cryptoQuote.tokenSymbol} QR code`} width="220" height="220" /><p>1. Approve {cryptoQuote.tokenSymbol}</p></div>
              <div><img src={qrImage} alt="Scan crypto payment QR code" width="280" height="280" /><p>2. Pay and split</p></div>
            </div>
            <p>Scan with a wallet that supports contract-call QR requests on Arbitrum. If your wallet shows a plain token transfer instead of a contract approval or payment, cancel it. MetaMask's desktop extension does not open these links.</p>
            <Link className="btn btn-outline" to={`/fiction/crypto-pay/${cryptoQuote.quoteId}`}>View payment details</Link>
          </div>}
        </div>}
        {!story.author_sale_enabled && <div className="error-msg">This writer has not enabled Stripe or crypto sales.</div>}
      </div>
    </div>
  );
}
