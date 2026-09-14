import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API = '/api';

export default function CryptoPayPage() {
  const { quoteId } = useParams<{ quoteId: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [quote, setQuote] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { navigate('/auth'); return; }
    fetch(`${API}/crypto/quotes/${quoteId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error); setQuote(data); })
      .catch(e => setError(e.message || 'Checkout unavailable.'));
  }, [quoteId, token, navigate]);

  useEffect(() => {
    if (!quote || !token) return;
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(`${API}/crypto/quotes/${quote.quoteId || quote.id}/status`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (!active) return;
        if (res.ok && data.status === 'confirmed') {
          navigate(`/fiction/collections/${data.storyId}/notes?unlocked=true`);
        } else if (res.ok && data.status === 'expired') {
          setError('This crypto quote expired. Return to the collection and create a new checkout.');
        }
      } catch { /* retry on the next interval */ }
    };
    poll();
    const timer = window.setInterval(poll, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [quote, token, navigate]);

  if (!quote && !error) return <div className="loading">Loading crypto checkout...</div>;
  return <div className="unlock-page"><div className="card" style={{ marginTop: '40px' }}>
    <h2>Arbitrum crypto checkout</h2>
    {error && <div className="error-msg">{error}</div>}
    {quote && <>
      <p><strong>{quote.title}</strong></p>
      <p>Pay approximately <strong>{(Number(quote.token_amount) / 10 ** Number(quote.token_decimals)).toLocaleString(undefined, { maximumFractionDigits: 8 })} {quote.tokenSymbol}</strong> on Arbitrum.</p>
      <p className="field-hint">The wallet sends the payment directly to the writer and Fiction Hall treasury through the split contract. Fiction Hall never holds the full payment.</p>
      <a className="btn btn-outline btn-full" href={quote.approveUri}>1. Approve {quote.tokenSymbol}</a>
      <a className="btn btn-success btn-full" style={{ marginTop: '0.75rem' }} href={quote.payUri}>2. Pay and split</a>
      <p className="field-hint" style={{ marginTop: '1rem' }}>Waiting for the Arbitrum payment event. This page checks automatically and unlocks the collection after the successful transaction is processed.</p>
      <Link to={`/fiction/collections/${quote.story_id}/notes`}>Cancel and return</Link>
    </>}
  </div></div>;
}
