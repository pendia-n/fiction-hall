import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { LiveKitRoom, useTrackToggle, useLocalParticipant } from '@livekit/components-react';
import { Track, LocalVideoTrack } from 'livekit-client';
import { useAuth } from '../context/AuthContext';
import LiveChat from '../components/LiveChat';
import ErrorBoundary from '../components/ErrorBoundary';

const API = '/api';

export default function StartStream() {
  const { user, token, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [streamId, setStreamId] = useState<number | null>(null);
  const [livekitToken, setLivekitToken] = useState('');
  const [wsUrl, setWsUrl] = useState('');
  const [live, setLive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(20 * 60);

  useEffect(() => {
    if (!authLoading && !token) navigate('/auth');
  }, [token, authLoading, navigate]);

  if (authLoading) return <div className="loading">Loading...</div>;
  if (!user) return null;

  const handleStart = async () => {
    if (!token || !title) return;
    setStarting(true);
    try {
      const res = await fetch(`${API}/live/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title }),
      });
      const data = await res.json();
      if (res.ok) {
        setStreamId(data.streamId);
        setLivekitToken(data.livekitToken);
        setWsUrl(data.wsUrl);
        setLive(true);
      } else {
        alert(data.error || 'Failed to start stream');
      }
    } catch { alert('Failed to start stream'); }
    setStarting(false);
  };

  const handleEnd = async () => {
    if (!token || !streamId) return;
    await fetch(`${API}/live/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ streamId }),
    });
    navigate('/live');
  };

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [live]);

  useEffect(() => {
    if (live && timeLeft <= 0 && streamId) {
      handleEnd();
    }
  }, [timeLeft, live, streamId]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  if (!user) return null;

  return (
    <div className="stream-room">
      <div className="stream-video-area">
        <div className="page-header">
          <h2>{live ? `🔴 LIVE: ${title}` : 'Start a Stream'}</h2>
          {live && (
            <span className="live-badge" style={{ fontSize: '1rem', padding: '0.25rem 0.75rem' }}>
              {minutes}:{seconds.toString().padStart(2, '0')}
            </span>
          )}
        </div>

        {!live ? (
          <div className="card">
            <div className="form-group">
              <label>Stream Title</label>
              <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="What are you writing today?" />
            </div>
            <button className="btn btn-primary btn-full" onClick={handleStart} disabled={starting || !title}>
              {starting ? 'Starting...' : 'Go Live'}
            </button>
          </div>
        ) : (
          <>
            <ErrorBoundary>
              <div style={{ flex: 1, position: 'relative', borderRadius: '12px', overflow: 'hidden', background: '#000', minHeight: '400px' }}>
                <LiveKitRoom
                  serverUrl={wsUrl}
                  token={livekitToken}
                  connect={live}
                  style={{ width: '100%', height: '100%' }}
                >
                  <HostVideo />
                </LiveKitRoom>
              </div>
            </ErrorBoundary>
            <div style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem 0' }}>
              <button className="btn btn-danger" onClick={handleEnd}>End Stream</button>
            </div>
          </>
        )}
      </div>

      {live && streamId && (
        <div className="stream-chat-area">
          <h3 style={{ marginBottom: '0.5rem' }}>Chat</h3>
          <LiveChat
            streamId={streamId.toString()}
            role="host"
            authToken={token || ''}
          />
        </div>
      )}
    </div>
  );
}

function HostVideo() {
  const { localParticipant } = useLocalParticipant();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (!localParticipant) return;
    const handler = () => forceUpdate(n => n + 1);
    localParticipant.on('trackPublished', handler);
    localParticipant.on('trackUnpublished', handler);
    localParticipant.on('trackMuted', handler);
    localParticipant.on('trackUnmuted', handler);
    return () => {
      localParticipant.off('trackPublished', handler);
      localParticipant.off('trackUnpublished', handler);
      localParticipant.off('trackMuted', handler);
      localParticipant.off('trackUnmuted', handler);
    };
  }, [localParticipant]);

  const camPub = localParticipant?.getTrackPublication(Track.Source.Camera);
  const camOn = camPub?.track instanceof LocalVideoTrack && !camPub.track.isMuted;

  useEffect(() => {
    if (!videoRef.current || !camOn || !camPub?.track) return;
    const track = camPub.track as LocalVideoTrack;
    track.attach(videoRef.current);
    return () => {
      try { track.detach(videoRef.current!); } catch {}
    };
  }, [camOn, localParticipant]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {camOn ? (
        <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
          {localParticipant ? 'Camera off' : 'Connecting to stream...'}
        </div>
      )}
      <div style={{ position: 'absolute', bottom: '1rem', left: '1rem', display: 'flex', gap: '0.5rem' }}>
        <Toolbar />
      </div>
    </div>
  );
}

function Toolbar() {
  return (
    <>
      <TrackToggleButton source={Track.Source.Camera} label="📷 Camera" />
      <TrackToggleButton source={Track.Source.Microphone} label="🎤 Mic" />
      <TrackToggleButton source={Track.Source.ScreenShare} label="🖥️ Share" />
    </>
  );
}

function TrackToggleButton({ source, label }: { source: Track.Source; label: string }) {
  const { toggle, enabled } = useTrackToggle({ source: source as any });
  return (
    <button className={`btn btn-sm ${enabled ? 'btn-primary' : 'btn-glass'}`} onClick={() => toggle()}>
      {enabled ? '✓ ' : '✗ '}{label}
    </button>
  );
}
