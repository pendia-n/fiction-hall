export class LiveRoom {
  private state: DurableObjectState;
  private sessions: Map<WebSocket, { role: string; userId?: number; username?: string }>;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.sessions = new Map();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST') {
      if (url.pathname === '/start') {
        await this.state.storage.setAlarm(Date.now() + 20 * 60 * 1000);
        return new Response('alarm set');
      }
      if (url.pathname === '/end') {
        await this.state.storage.deleteAlarm();
        this.broadcast({ type: 'live_ended' });
        this.closeAll();
        await this.clearMessages();
        return new Response('stream ended');
      }
      if (url.pathname === '/gift') {
        const fromUsername = url.searchParams.get('from') || 'Someone';
        const amount = url.searchParams.get('amount') || '0';
        const count = (await this.state.storage.get<number>('msg_count')) || 0;
        const msgIndex = count + 1;
        const msg = {
          type: 'chat',
          index: msgIndex,
          userId: 0,
          username: '🎁',
          text: `${fromUsername} gifted $${amount}!`,
          timestamp: Date.now(),
        };
        await this.state.storage.put(`msg:${msgIndex}`, msg);
        await this.state.storage.put('msg_count', msgIndex);
        this.broadcast(msg);
        return new Response('gift broadcast');
      }
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Not found', { status: 404 });
    }

    const role = url.searchParams.get('role') || 'viewer';
    const userId = url.searchParams.get('userId') ? parseInt(url.searchParams.get('userId')!) : undefined;
    const username = url.searchParams.get('username') || undefined;
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.sessions.set(server, { role, userId, username });
    server.accept();

    server.addEventListener('message', (event) => {
      (async () => {
        try {
          const data = JSON.parse(event.data as string);
          if (data.type === 'chat' && data.text?.trim()) {
            await this.handleChatMessage(data.text, server);
          }
        } catch { /* ignore */ }
      })();
    });

    server.addEventListener('close', () => {
      this.sessions.delete(server);
    });

    this.sendInitialMessages(server, role);

    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleChatMessage(text: string, server: WebSocket) {
    const session = this.sessions.get(server);
    const count = (await this.state.storage.get<number>('msg_count')) || 0;
    const msgIndex = count + 1;
    const msg = {
      type: 'chat',
      index: msgIndex,
      userId: session?.userId,
      username: session?.username || 'unknown',
      text,
      timestamp: Date.now(),
    };
    await this.state.storage.put(`msg:${msgIndex}`, msg);
    await this.state.storage.put('msg_count', msgIndex);
    this.broadcast(msg);
  }

  private async sendInitialMessages(server: WebSocket, role: string) {
    const msgCount = (await this.state.storage.get<number>('msg_count')) || 0;
    if (msgCount === 0) return;

    let keys: string[];
    if (role === 'host') {
      keys = [];
      for (let i = 1; i <= msgCount; i++) keys.push(`msg:${i}`);
    } else {
      const start = Math.max(1, msgCount - 29);
      keys = [];
      for (let i = start; i <= msgCount; i++) keys.push(`msg:${i}`);
    }

    const stored = await this.state.storage.get<any>(keys);
    const messages = keys.map(k => stored[k]).filter(Boolean);
    if (messages.length > 0) {
      server.send(JSON.stringify({ type: 'init', messages }));
    }
  }

  private broadcast(msg: any) {
    const str = JSON.stringify(msg);
    const dead: WebSocket[] = [];
    for (const [ws] of this.sessions) {
      try { ws.send(str); } catch { dead.push(ws); }
    }
    for (const ws of dead) this.sessions.delete(ws);
  }

  private closeAll() {
    for (const [ws] of this.sessions) {
      try { ws.close(); } catch { /* ignore */ }
    }
    this.sessions.clear();
  }

  private async clearMessages() {
    const entries = await this.state.storage.list({ prefix: 'msg:' });
    if (entries.size > 0) {
      await this.state.storage.delete([...entries.keys()]);
    }
  }

  async alarm() {
    this.broadcast({ type: 'live_ended' });
    this.closeAll();
    await this.clearMessages();
    await this.state.storage.delete('msg_count');
  }
}
