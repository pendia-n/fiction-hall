import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import QRCode from 'qrcode';

const API = '/api';

export default function CryptoPayPage() {
  const { quoteId } = useParams<{ quoteId: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [quote, setQuote] = useState<any>(null);
  const [error, setError] = useState('');
  const [statusError, setStatusError] = useState('');
  const [statusReady, setStatusReady] = useState(false);
  const [approveQrImage, setApproveQrImage] = useState('');
  const [payQrImage, setPayQrImage] = useState('');
  const [copyMessage, setCopyMessage] = useState('');

  useEffect(() => {
    if (!token) { navigate('/auth'); return; }
    fetch(`${API}/crypto/quotes/${quoteId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error); setQuote(data); })
      .catch(e => setError(e.message || 'Checkout unavailable.'));
  }, [quoteId, token, navigate]);

  useEffect(() => {
    if (!quote) return;
    Promise.all([
      QRCode.toDataURL(quote.approveUri, { width: 220, margin: 1 }),
      QRCode.toDataURL(quote.payUri, { width: 280, margin: 1 }),
    ]).then(([approve, pay]) => { setApproveQrImage(approve); setPayQrImage(pay); })
      .catch(() => setError('Could not prepare the transaction QR codes.'));
  }, [quote]);

  useEffect(() => {
    if (!quote || !token) return;
    let active = true;
    let inFlight = false;
    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await fetch(`${API}/crypto/quotes/${quote.quoteId || quote.id}/status`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (!active) return;
        if (!res.ok) {
          setStatusReady(false);
          setStatusError('Payment verification is unavailable. Do not send a payment until this message clears.');
        } else if (data.status === 'confirmed') {
          navigate(`/fiction/collections/${data.storyId}/notes?unlocked=true`);
        } else if (data.status === 'expired') {
          setStatusReady(false);
          setError('This crypto quote expired. Return to the collection and create a new checkout.');
          window.clearInterval(timer);
        } else if (data.status === 'pending') {
          setStatusError('');
          setStatusReady(true);
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
  }, [quote, token, navigate]);

  const copyRequest = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyMessage('Transaction request copied.');
    } catch { setCopyMessage('Could not copy this request.'); }
  };

  if (!quote && !error) return <div className="loading">Loading crypto checkout...</div>;
  return <div className="unlock-page"><div className="card" style={{ marginTop: '40px' }}>
    <h2>Arbitrum crypto checkout</h2>
    {error && <div className="error-msg">{error}</div>}
    {statusError && <div className="error-msg">{statusError}</div>}
    {quote && <>
      <p><strong>{quote.title}</strong></p>
      <p>Pay approximately <strong>{(Number(quote.token_amount) / 10 ** Number(quote.token_decimals)).toLocaleString(undefined, { maximumFractionDigits: 8 })} {quote.tokenSymbol}</strong> on Arbitrum.</p>
      <p className="field-hint">The wallet sends the payment directly to the writer and Fiction Hall treasury through the split contract. Fiction Hall never holds the full payment.</p>
      {!statusReady && !statusError && <p>Checking that payment verification is working before showing the transaction requests...</p>}
      {statusReady && approveQrImage && payQrImage && <>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '1rem', textAlign: 'center' }}>
          <div><img src={approveQrImage} alt={`Approve ${quote.tokenSymbol} QR code`} width="220" height="220" /><p>1. Approve {quote.tokenSymbol}</p><button className="btn btn-outline" onClick={() => copyRequest(quote.approveUri)}>Copy approval request</button></div>
          <div><img src={payQrImage} alt="Crypto payment QR code" width="280" height="280" /><p>2. Pay and split</p><button className="btn btn-outline" onClick={() => copyRequest(quote.payUri)}>Copy payment request</button></div>
        </div>
        {copyMessage && <p className="field-hint">{copyMessage}</p>}
        <p className="field-hint">Use a wallet that supports contract-call QR requests on Arbitrum. If it shows a plain transfer, cancel it. MetaMask's desktop extension does not open these links.</p>
        <p className="field-hint">This page checks for the Arbitrum payment event and unlocks the collection after a successful transaction.</p>
      </>}
      <Link to={`/fiction/collections/${quote.story_id}/notes`}>Cancel and return</Link>
    </>}
  </div></div>;
}
