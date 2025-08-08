/// <reference types="@cloudflare/workers-types" />
import type {
  Room,
  ServerMessage,
  ClientMessage,
  UpdateSettingsRequest,
  RoomSettings,
  StartGameRequest,
  CreateRoundRequest,
  SetTopicRequest,
  SubmitAnswerRequest,
  OpenRoundRequest,
  JudgeResultRequest,
  Round,
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
      // settingsUpdatedイベントと全状態の両方を送信
      this.broadcast({ type: "settingsUpdated", settings: next } satisfies ServerMessage);
      this.broadcast({ type: "state", room: this.room } satisfies ServerMessage);
      return Response.json({ ok: true });
    }

    // ゲーム開始
    if (request.method === "POST" && url.pathname.endsWith("/start")) {
      if (!this.room) return new Response("Room not initialized", { status: 404 });
      if (this.room.status !== "waiting") 
        return new Response("Game already started", { status: 409 });
      
      const body = (await request.json().catch(() => ({}))) as StartGameRequest;
      if (!body?.gmToken || body.gmToken !== this.gmToken)
        return new Response("forbidden", { status: 403 });
      
      this.room.status = "playing";
      this.broadcast({ type: "gameStarted", room: this.room } satisfies ServerMessage);
      return Response.json({ ok: true });
    }

    // ラウンド作成
    if (request.method === "POST" && url.pathname.endsWith("/round")) {
      if (!this.room) return new Response("Room not initialized", { status: 404 });
      if (this.room.status !== "playing") 
        return new Response("Game not started", { status: 409 });
      
      const body = (await request.json().catch(() => ({}))) as CreateRoundRequest;
      if (!body?.gmToken || body.gmToken !== this.gmToken)
        return new Response("forbidden", { status: 403 });
      
      const roundId = crypto.randomUUID();
      const setterId = this.getNextTopicSetter();
      
      const newRound: Round = {
        id: roundId,
        topic: "",
        setterId,
        answers: [],
        result: "unopened",
        unanimous: null,
      };
      
      this.room.rounds.push(newRound);
      this.broadcast({ type: "roundCreated", round: newRound } satisfies ServerMessage);
      return Response.json({ roundId });
    }

    // お題設定
    if (request.method === "POST" && url.pathname.includes("/round/") && url.pathname.endsWith("/topic")) {
      if (!this.room) return new Response("Room not initialized", { status: 404 });
      
      const pathParts = url.pathname.split("/");
      const roundId = pathParts[pathParts.length - 2];
      const round = this.room.rounds.find(r => r.id === roundId);
      if (!round) return new Response("Round not found", { status: 404 });
      
      const body = (await request.json().catch(() => ({}))) as SetTopicRequest;
      if (!body?.setterId || !body?.topic?.trim()) 
        return new Response("setterId and topic required", { status: 400 });
      
      // 設定権限チェック
      if (round.setterId !== body.setterId) 
        return new Response("Not authorized to set topic", { status: 403 });
      
      round.topic = body.topic.trim();
      this.broadcast({ 
        type: "topicSet", 
        roundId, 
        topic: round.topic 
      } satisfies ServerMessage);
      return Response.json({ ok: true });
    }

    // 回答送信
    if (request.method === "POST" && url.pathname.includes("/round/") && url.pathname.endsWith("/answer")) {
      if (!this.room) return new Response("Room not initialized", { status: 404 });
      
      const pathParts = url.pathname.split("/");
      const roundId = pathParts[pathParts.length - 2];
      const round = this.room.rounds.find(r => r.id === roundId);
      if (!round) return new Response("Round not found", { status: 404 });
      if (round.result === "opened") return new Response("Round already opened", { status: 409 });
      
      const body = (await request.json().catch(() => ({}))) as SubmitAnswerRequest;
      if (!body?.userId || !body?.value?.trim()) 
        return new Response("userId and value required", { status: 400 });
      
      // 既存の回答を削除して新しい回答を追加
      round.answers = round.answers.filter(a => a.userId !== body.userId);
      round.answers.push({
        userId: body.userId,
        value: body.value.trim(),
        submittedAt: Date.now(),
      });
      
      // より詳細な情報をbroadcast - 現在の回答状況を含める
      this.broadcast({ 
        type: "answerSubmitted", 
        roundId, 
        userId: body.userId, 
        hasAnswered: true,
        answeredUserIds: round.answers.map(a => a.userId),
        totalAnswers: round.answers.length,
        totalUsers: this.room.users.length
      } satisfies ServerMessage);
      return Response.json({ ok: true });
    }

    // 回答オープン
    if (request.method === "POST" && url.pathname.includes("/round/") && url.pathname.endsWith("/open")) {
      if (!this.room) return new Response("Room not initialized", { status: 404 });
      
      const pathParts = url.pathname.split("/");
      const roundId = pathParts[pathParts.length - 2];
      const round = this.room.rounds.find(r => r.id === roundId);
      if (!round) return new Response("Round not found", { status: 404 });
      
      const body = (await request.json().catch(() => ({}))) as OpenRoundRequest;
      if (!body?.gmToken || body.gmToken !== this.gmToken)
        return new Response("forbidden", { status: 403 });
      
      round.result = "opened";
      this.broadcast({ 
        type: "roundOpened", 
        roundId, 
        answers: round.answers 
      } satisfies ServerMessage);
      return Response.json({ ok: true });
    }

    // 結果判定
    if (request.method === "POST" && url.pathname.includes("/round/") && url.pathname.endsWith("/result")) {
      if (!this.room) return new Response("Room not initialized", { status: 404 });
      
      const pathParts = url.pathname.split("/");
      const roundId = pathParts[pathParts.length - 2];
      const round = this.room.rounds.find(r => r.id === roundId);
      if (!round) return new Response("Round not found", { status: 404 });
      
      const body = (await request.json().catch(() => ({}))) as JudgeResultRequest;
      if (!body?.gmToken || body.gmToken !== this.gmToken)
        return new Response("forbidden", { status: 403 });
      if (typeof body.unanimous !== "boolean") 
        return new Response("unanimous must be boolean", { status: 400 });
      
      round.unanimous = body.unanimous;
      this.broadcast({ 
        type: "resultJudged", 
        roundId, 
        unanimous: body.unanimous 
      } satisfies ServerMessage);
      return Response.json({ ok: true });
    }

    // 必要に応じて /start /answer /open などを実装
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      server.accept();
      console.log(`New WebSocket connection. Total connections: ${this.sockets.size + 1}`);
      
      this.sockets.add(server);
      server.addEventListener("close", () => {
        console.log(`WebSocket connection closed. Total connections: ${this.sockets.size - 1}`);
        this.sockets.delete(server);
      });
      server.addEventListener("message", (ev) => this.onMessage(server, ev));
      server.addEventListener("error", (error) => {
        console.log("WebSocket error:", error);
        this.sockets.delete(server);
      });
      
      // 接続直後に現状態を送信
      if (this.room) {
        const stateMessage = JSON.stringify({
          type: "state",
          room: this.room,
        } satisfies ServerMessage);
        console.log("Sending initial state to new connection:", stateMessage);
        server.send(stateMessage);
      }
      return new Response(null, { status: 101, webSocket: client } as any);
    }

    return new Response("OK");
  }

  private broadcast(payload: unknown) {
    const data = JSON.stringify(payload);
    console.log(`Broadcasting to ${this.sockets.size} sockets:`, data);
    let sent = 0;
    for (const ws of this.sockets) {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
          sent++;
        } else {
          console.log("Removing closed socket");
          this.sockets.delete(ws);
        }
      } catch (e) {
        console.log("Error sending to socket:", e);
        this.sockets.delete(ws);
      }
    }
    console.log(`Successfully sent to ${sent} sockets`);
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

  private getNextTopicSetter(): string {
    if (!this.room) return "";
    
    // GM固定モードの場合
    if (this.room.settings.topicMode === "gm") {
      const gm = this.room.users.find(u => u.isGM);
      return gm?.id || "";
    }
    
    // 全員順番モードの場合
    if (this.room.settings.topicMode === "all") {
      const users = this.room.users.filter(u => !u.isGM);
      if (users.length === 0) return "";
      
      const roundCount = this.room.rounds.length;
      return users[roundCount % users.length]?.id || "";
    }
    
    return "";
  }
}
