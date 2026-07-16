import { useState, useEffect, useRef, useCallback } from 'react';

interface LiveChatProps {
  streamId: string;
  role: 'host' | 'viewer';
  authToken: string;
}

interface ChatMessage {
  index: number;
  userId?: number;
  username: string;
  text: string;
  timestamp: number;
}

const EMOJIS = ['😊', '🎉', '💖', '👍', '🔥', '😍', '👏', '✨'];

export default function LiveChat({ streamId, role, authToken }: LiveChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const [connected, setConnected] = useState(false);
  const [liveEnded, setLiveEnded] = useState(false);
  const userScrolledRef = useRef(false);

  const connectWs = useCallback(() => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/api/live/${streamId}/ws?role=${role}&token=${encodeURIComponent(authToken)}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'init') {
          setMessages(data.messages);
        } else if (data.type === 'chat') {
          setMessages(prev => {
            if (role === 'viewer') {
              return [...prev, data].slice(-30);
            }
            return [...prev, data];
          });
        } else if (data.type === 'live_ended') {
          setLiveEnded(true);
        }
      } catch { /* ignore */ }
    };

    return ws;
  }, [streamId, role, authToken]);

  useEffect(() => {
    const ws = connectWs();
    return () => ws.close();
  }, [connectWs]);

  useEffect(() => {
    if (role === 'host' && chatRef.current && !userScrolledRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages, role]);

  const handleScroll = () => {
    if (!chatRef.current || role !== 'host') return;
    const { scrollTop, scrollHeight, clientHeight } = chatRef.current;
    userScrolledRef.current = scrollHeight - scrollTop - clientHeight > 50;
  };

  const sendMessage = (text: string) => {
    if (!text.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'chat', text: text.trim() }));
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="livechat-container">
      <div
        ref={chatRef}
        className={`chat-box ${role === 'viewer' ? 'viewer' : ''}`}
        onScroll={handleScroll}
      >
        {messages.length === 0 && (
          <div className="chat-empty">No messages yet</div>
        )}
        {messages.map(msg => (
          <div key={msg.index} className="chat-msg">
            <span className="author">{msg.username}</span>
            {msg.text}
            <span className="time">{new Date(msg.timestamp).toLocaleTimeString()}</span>
          </div>
        ))}
      </div>

      {liveEnded ? (
        <div className="chat-ended">Stream has ended</div>
      ) : (
        <>
          <div className="chat-emoji-row">
            {EMOJIS.map(emoji => (
              <button key={emoji} className="chat-emoji-btn" onClick={() => sendMessage(emoji)}>
                {emoji}
              </button>
            ))}
          </div>
          <div className="chat-input-row">
            <input
              className="input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={connected ? 'Type a message...' : 'Connecting...'}
              disabled={!connected}
            />
            <button className="btn btn-primary" onClick={() => sendMessage(input)} disabled={!connected || !input.trim()}>
              Send
            </button>
          </div>
        </>
      )}
    </div>
  );
}
