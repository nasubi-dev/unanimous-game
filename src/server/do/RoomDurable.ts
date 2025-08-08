/// <reference types="@cloudflare/workers-types" />
import type {
  Room,
  ServerMessage,
  ClientMessage,
  UpdateSettingsRequest,
  RoomSettings,
} from "../../shared/types";

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
  private gmToken: string | null = null;

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
        name?: string;
      };
      const providedId = (body.roomId ?? "").toString().trim();
      const gmName = (body.name ?? "").toString().trim();
      const { roomId, gmId, gmToken } = this.initRoom(providedId);
  this.gmToken = gmToken;
      // GM をユーザーとして登録
      let gmUserId = "";
      if (gmName) {
        const gmUser = this.addUser(gmName, true);
        gmUserId = gmUser.id;
      }
      return Response.json({ roomId, gmId, gmToken, gmUserId });
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

    if (
      (request.method === "PATCH" || request.method === "POST") &&
      url.pathname.endsWith("/settings")
    ) {
      if (!this.room) return new Response("Room not initialized", { status: 404 });
      const body = (await request.json().catch(() => ({}))) as UpdateSettingsRequest;
      if (!body?.gmToken || body.gmToken !== this.gmToken)
        return new Response("forbidden", { status: 403 });
      const next = this.applySettingsPatch(this.room.settings, body.settings || {});
      this.room.settings = next;
      // シンプルに state 全体を再送
      this.broadcast({ type: "state", room: this.room } satisfies ServerMessage);
      return Response.json({ ok: true });
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

  private addUser(name: string, isGM = false) {
    const user = { id: crypto.randomUUID(), name, icon: "", isGM };
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

  private applySettingsPatch(current: RoomSettings, patch: Partial<RoomSettings>): RoomSettings {
    const out: RoomSettings = structuredClone(current);
    if (patch.topicMode) {
      if (patch.topicMode === "gm" || patch.topicMode === "all") out.topicMode = patch.topicMode;
    }
    if (patch.winCondition) {
      const wc = patch.winCondition as RoomSettings["winCondition"];
      if (wc.type === "none") {
        out.winCondition = { type: "none" };
      } else if (wc.type === "count" && typeof (wc as any).value === "number" && (wc as any).value >= 1) {
        out.winCondition = { type: "count", value: (wc as any).value };
      } else if (wc.type === "consecutive" && typeof (wc as any).value === "number" && (wc as any).value >= 1) {
        out.winCondition = { type: "consecutive", value: (wc as any).value };
      }
    }
    return out;
  }
}
