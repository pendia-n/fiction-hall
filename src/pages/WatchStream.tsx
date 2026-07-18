import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LiveKitRoom, TrackLoop, ParticipantTile, useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useAuth } from '../context/AuthContext';
import LiveChat from '../components/LiveChat';
import GiftModal from '../components/GiftModal';
import ErrorBoundary from '../components/ErrorBoundary';

const API = '/api';

interface StreamDetail {
  id: number;
  user_id: number;
  title: string;
  room_name: string;
  started_at: string;
  active: number;
  author_display: string;
  viewerToken: string | null;
  wsUrl: string;
  isHost: boolean;
  stripe_onboarded: number;
}

export default function WatchStream() {
  const { id } = useParams<{ id: string }>();
  const { token, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [stream, setStream] = useState<StreamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ending, setEnding] = useState(false);
  const [showGift, setShowGift] = useState(false);
  const giftSuccess = searchParams.get('gift') === 'success';

  useEffect(() => {
    if (!authLoading && !token) navigate('/auth');
  }, [token, authLoading, navigate]);

  if (authLoading) return <div className="loading">Loading...</div>;

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        const res = await fetch(`${API}/live/${id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) { setError('Stream not found'); setLoading(false); return; }
        const data = await res.json();
        setStream(data);
      } catch { setError('Failed to load stream'); }
      setLoading(false);
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [id, token]);

  const handleEnd = async () => {
    if (!token || !stream || ending) return;
    setEnding(true);
    try {
      await fetch(`${API}/live/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ streamId: stream.id }),
      });
    } catch {}
    navigate('/live');
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (error || !stream) return <div className="empty"><p>{error || 'Stream not found'}</p><Link to="/live">← Back to Live</Link></div>;
  if (!stream.active) return <div className="empty"><p>This stream has ended.</p><Link to="/live">← Back to Live</Link></div>;

  return (
    <div className="stream-room">
      <div className="stream-video-area">
        <div className="page-header">
          <div>
            <Link to="/live" className="back-link">← All Streams</Link>
            <h2>🔴 {stream.title}</h2>
            <p className="item-meta">by {stream.author_display}</p>
          </div>
        </div>

        {giftSuccess && (
          <div className="success-msg">🎉 Gift sent successfully! Thank you for supporting {stream.author_display}.</div>
        )}

        <div style={{ flex: 1, borderRadius: '12px', overflow: 'hidden', background: '#111', minHeight: '400px' }}>
          {stream.viewerToken ? (
            <ErrorBoundary>
              <LiveKitRoom
                serverUrl={stream.wsUrl}
                token={stream.viewerToken}
                connect={true}
                style={{ width: '100%', height: '100%' }}
              >
                <VideoGrid />
              </LiveKitRoom>
            </ErrorBoundary>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#fff' }}>
              Connecting...
            </div>
          )}
        </div>

        {stream.isHost ? (
          <button className="btn btn-danger" onClick={handleEnd} disabled={ending}
            style={{ marginTop: '0.5rem', width: '100%' }}>
            {ending ? 'Ending...' : 'End Stream'}
          </button>
        ) : token && stream.stripe_onboarded ? (
          <button className="btn btn-primary" onClick={() => setShowGift(true)} style={{ marginTop: '0.5rem' }}>
            💎 Send Gift
          </button>
        ) : null}

        <GiftModal
          open={showGift}
          onClose={() => setShowGift(false)}
          endpoint={`${API}/live/${id}/gift`}
          token={token || ''}
          authorName={stream.author_display}
        />
      </div>

      <div className="stream-chat-area">
        <h3 style={{ marginBottom: '0.5rem' }}>Chat</h3>
        {token ? (
          <LiveChat
            streamId={id!}
            role="viewer"
            authToken={token}
          />
        ) : (
          <p className="text-sm" style={{ color: 'var(--text-tertiary)', padding: '1rem 0' }}>
            <Link to="/auth">Sign in</Link> to join the chat
          </p>
        )}
      </div>
    </div>
  );
}

function VideoGrid() {
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare, Track.Source.Microphone], { onlySubscribed: false });
  if (tracks.length === 0) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: '0.9rem' }}>
        Stream offline — host will be back soon
      </div>
    );
  }
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <TrackLoop tracks={tracks}>
        <ParticipantTile style={{ width: '100%', height: '100%' }} />
      </TrackLoop>
    </div>
  );
}
