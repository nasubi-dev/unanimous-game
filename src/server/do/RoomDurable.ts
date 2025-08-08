/// <reference types="@cloudflare/workers-types" />
import type { Room, ServerMessage, ClientMessage } from "../../shared/types";

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
    // HTTP: /create, /join, /state
    if (request.method === "POST" && url.pathname.endsWith("/create")) {
      const body = (await request.json().catch(() => ({}))) as {
        roomId?: string;
      };
      const providedId = (body.roomId ?? "").toString().trim();
      const { roomId, gmId, gmToken } = this.initRoom(providedId);
      return Response.json({ roomId, gmId, gmToken });
    }

    if (request.method === "POST" && url.pathname.endsWith("/join")) {
      const body = (await request.json().catch(() => ({}))) as {
        name?: string;
      };
      const name = (body.name ?? "").toString().trim();
      if (!this.room)
        return new Response("Room not initialized", { status: 404 });
      if (!name) return new Response("name required", { status: 400 });
      const user = this.addUser(name);
      this.broadcast({ type: "userJoined", user } satisfies ServerMessage);
      return Response.json({ userId: user.id });
    }

    if (request.method === "GET" && url.pathname.endsWith("/state")) {
      if (!this.room)
        return new Response("Room not initialized", { status: 404 });
      return Response.json(this.room);
    }

    // 必要に応じて /start /answer /open などを実装
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      server.accept();
      this.sockets.add(server);
      server.addEventListener("close", () => this.sockets.delete(server));
      server.addEventListener("message", (ev) => this.onMessage(server, ev));
      // 接続直後に現状態を送信
      if (this.room)
        server.send(
          JSON.stringify({
            type: "state",
            room: this.room,
          } satisfies ServerMessage)
        );
      return new Response(null, { status: 101, webSocket: client } as any);
    }

    return new Response("OK");
  }

  private broadcast(payload: unknown) {
    const data = JSON.stringify(payload);
    for (const ws of this.sockets) {
      try {
        ws.send(data);
      } catch {}
    }
  }

  private initRoom(roomId?: string) {
    // roomId が指定されていればそれを採用、なければ 4桁番号を生成
    roomId ||= (Math.floor(Math.random() * 9000) + 1000).toString();
    const gmId = crypto.randomUUID();
    const gmToken = crypto.randomUUID();
    this.room = {
      id: roomId,
      gmId,
      users: [],
      settings: { topicMode: "gm", winCondition: { type: "none" } },
      status: "waiting",
      rounds: [],
    } satisfies Room;
    return { roomId, gmId, gmToken };
  }

  private addUser(name: string) {
    const user = { id: crypto.randomUUID(), name, icon: "", isGM: false };
    this.room!.users.push(user);
    return user;
  }

  private onMessage(ws: WebSocket, ev: MessageEvent) {
    try {
      const msg = JSON.parse(String(ev.data)) as ClientMessage;
      if (msg.type === "ping") {
        if (this.room)
          ws.send(
            JSON.stringify({
              type: "state",
              room: this.room,
            } satisfies ServerMessage)
          );
      }
      if (msg.type === "join") {
        if (!this.room) return;
        const user = this.addUser(msg.name);
        this.broadcast({ type: "userJoined", user } satisfies ServerMessage);
      }
    } catch (e) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "bad message",
        } satisfies ServerMessage)
      );
    }
  }
}
