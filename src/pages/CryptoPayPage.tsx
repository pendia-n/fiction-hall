import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API = '/api';

export default function CryptoPayPage() {
  const { quoteId } = useParams<{ quoteId: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [quote, setQuote] = useState<any>(null);
  const [txHash, setTxHash] = useState('');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!token) { navigate('/auth'); return; }
    fetch(`${API}/crypto/quotes/${quoteId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error); setQuote(data); })
      .catch(e => setError(e.message || 'Checkout unavailable.'));
  }, [quoteId, token, navigate]);

  const confirm = async () => {
    if (!token) return;
    setConfirming(true); setError('');
    const res = await fetch(`${API}/crypto/quotes/${quoteId}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ txHash }) });
    const data = await res.json();
    if (res.ok) navigate(`/fiction/collections/${data.storyId}/notes?unlocked=true`);
    else setError(data.error || 'Payment could not be confirmed.');
    setConfirming(false);
  };

  if (!quote && !error) return <div className="loading">Loading crypto checkout...</div>;
  return <div className="unlock-page"><div className="card" style={{ marginTop: '40px' }}>
    <h2>Arbitrum crypto checkout</h2>
    {error && <div className="error-msg">{error}</div>}
    {quote && <>
      <p><strong>{quote.title}</strong></p>
      <p>Pay approximately <strong>{(Number(quote.token_amount) / 10 ** Number(quote.token_decimals)).toLocaleString(undefined, { maximumFractionDigits: 8 })} {quote.token_symbol}</strong> on Arbitrum.</p>
      <p className="field-hint">Your wallet sends funds atomically to the writer and Fiction Hall. Fiction Hall never holds the full payment.</p>
      <a className="btn btn-outline btn-full" href={quote.approveUri}>1. Approve {quote.token_symbol}</a>
      <a className="btn btn-success btn-full" style={{ marginTop: '0.75rem' }} href={quote.payUri}>2. Pay and split</a>
      <div className="form-group" style={{ marginTop: '1rem' }}>
        <label>Transaction hash after payment</label>
        <input className="input" value={txHash} onChange={e => setTxHash(e.target.value)} placeholder="0x..." />
      </div>
      <button className="btn btn-primary btn-full" onClick={confirm} disabled={confirming}>{confirming ? 'Checking Arbitrum...' : 'Confirm payment and unlock'}</button>
      <p className="field-hint">The quote expires in 15 minutes. If your wallet does not open these links, paste the checkout details into a wallet that supports Ethereum transaction links.</p>
      <Link to={`/fiction/collections/${quote.story_id}/notes`}>Cancel and return</Link>
    </>}
  </div></div>;
}
