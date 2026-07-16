import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API = '/api';

interface Stream {
  id: number;
  user_id: number;
  title: string;
  room_name: string;
  started_at: string;
  active: number;
  author_display: string;
}

export default function LiveNow() {
  const { user } = useAuth();
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API}/live/active`);
        const data = await res.json();
        setStreams(data.streams || []);
      } catch { /* ignore */ }
      setLoading(false);
    };
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="live-page">
      <div className="page-header">
        <h1>🎥 Live Now</h1>
        {user && <Link to="/live/start" className="btn btn-primary">Go Live</Link>}
      </div>

      {loading ? (
        <div className="loading">Loading...</div>
      ) : streams.length === 0 ? (
        <div className="empty">
          <p>No active streams right now.</p>
          {user && <p><Link to="/live/start">Start your first stream!</Link></p>}
        </div>
      ) : (
        <div className="live-grid">
          {streams.map(s => (
            <Link to={`/live/${s.id}`} key={s.id} className="card live-card">
              <span className="live-badge">● LIVE</span>
              <h3>{s.title}</h3>
              <p className="item-meta">by {s.author_display}</p>
              <p className="item-sub">Started {new Date(s.started_at).toLocaleTimeString()}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
