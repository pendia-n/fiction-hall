import { useState } from 'react';

const API = '/api';
const PRESET_AMOUNTS = [1, 3, 5, 10];

interface GiftButtonProps {
  streamId: string;
  token: string;
}

export default function GiftButton({ streamId, token }: GiftButtonProps) {
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);

  const handleGift = async (amount: number) => {
    setError('');
    setProcessing(true);
    try {
      const res = await fetch(`${API}/live/${streamId}/gift`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount }),
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
    setProcessing(false);
  };

  return (
    <>
      <div className="gift-buttons">
        {PRESET_AMOUNTS.map(a => (
          <button key={a} className="gift-btn" onClick={() => handleGift(a)} disabled={processing}>
            ${a}
          </button>
        ))}
      </div>
      {error && <div className="error-msg">{error}</div>}
    </>
  );
}
