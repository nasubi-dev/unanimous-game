/// <reference types="@cloudflare/workers-types" />
import type { Room } from '../../shared/types';

export interface Env {
  ROOM_DURABLE: DurableObjectNamespace;
  ASSETS: Fetcher;
}

export class RoomDurable {
  private state: DurableObjectState;
  private env: Env;

  // インメモリ状態（永続化しない）
  private room: Room | null = null;
  private sockets = new Set<WebSocket>();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  // DO エントリポイント
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // 必要に応じて /join /start /answer /open などを実装
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      server.accept();
      this.sockets.add(server);
      server.addEventListener('close', () => this.sockets.delete(server));
      // 接続直後に現状態を送信
      if (this.room) server.send(JSON.stringify({ type: 'state', room: this.room }));
  return new Response(null, { status: 101, webSocket: client } as any);
    }

    return new Response('OK');
  }

  private broadcast(payload: unknown) {
    const data = JSON.stringify(payload);
    for (const ws of this.sockets) {
      try { ws.send(data); } catch {}
    }
  }
}
