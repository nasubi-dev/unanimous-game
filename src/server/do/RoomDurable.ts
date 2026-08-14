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
  ANALYTICS: AnalyticsEngineDataset;
  /** 部屋のクリーンアップ間隔（ミリ秒）。未設定なら既定値。検証用に上書きできる。 */
  IDLE_TIMEOUT_MS?: string;
  EMPTY_ROOM_CLEANUP_MS?: string;
}

/** WebSocket に紐づけてハイバネーションを跨いで保持する情報 */
type SocketAttachment = {
  userId?: string;
  connectedAt: number;
};

/** storage に永続化するメタ情報 */
type RoomMeta = {
  gmToken: string;
  createdAt: number;
  lastActivityAt: number;
};

const KEY_ROOM = "room";
const KEY_META = "meta";

/**
 * 課金される duration（DO がメモリに常駐していた時間）を最小化するための方針:
 *
 * 1. WebSocket は Hibernation API (`state.acceptWebSocket`) で受ける。
 *    メッセージが流れていない間 DO はメモリから退避され、その間は課金されない。
 * 2. 長い待ち時間は `setTimeout` ではなく `storage.setAlarm()` を使う。
 *    pending な setTimeout があると DO は絶対に退避できないため。
 * 3. インメモリ状態はハイバネーションで消えるので、真実は常に storage 側に置く。
 */
export class RoomDurable {
  private state: DurableObjectState;
  private env: Env;

  // storage のインメモリキャッシュ（ハイバネーション後は再ロードされる）
  private room: Room | null = null;
  private meta: RoomMeta | null = null;

  // ハイバネーション導入後、この待ち時間は storage.setAlarm() で待つので
  // duration には計上されない。UX を壊さない範囲で余裕を持たせてよい。
  private readonly IDLE_TIMEOUT_MS: number; // 最終操作から部屋を閉じるまで
  private readonly EMPTY_ROOM_CLEANUP_MS: number; // 接続ゼロから片付けるまで

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.IDLE_TIMEOUT_MS = Number(env.IDLE_TIMEOUT_MS) || 20 * 60 * 1000;
    this.EMPTY_ROOM_CLEANUP_MS =
      Number(env.EMPTY_ROOM_CLEANUP_MS) || 3 * 60 * 1000;
    // ハイバネーションから復帰したときのために storage から状態を復元する
    this.state.blockConcurrencyWhile(async () => {
      const [room, meta] = await Promise.all([
        this.state.storage.get<Room>(KEY_ROOM),
        this.state.storage.get<RoomMeta>(KEY_META),
      ]);
      this.room = room ?? null;
      this.meta = meta ?? null;
    });
  }

  // --- 永続化ヘルパー ------------------------------------------------------

  private async saveRoom() {
    if (this.room) await this.state.storage.put(KEY_ROOM, this.room);
  }

  private async saveMeta() {
    if (this.meta) await this.state.storage.put(KEY_META, this.meta);
  }

  /**
   * 最終操作時刻を更新し、次のクリーンアップ用アラームを張り直す。
   * アラームは setTimeout と違い DO をメモリに留めないので、待機中の課金はゼロ。
   */
  private async touchActivity() {
    if (!this.meta) return;
    this.meta.lastActivityAt = Date.now();
    await this.saveMeta();
    await this.scheduleCleanupAlarm();
  }

  /** 接続の有無に応じてクリーンアップ期限を決め、アラームを設定する */
  private async scheduleCleanupAlarm() {
    if (!this.meta) return;
    const hasSockets = this.openSockets().length > 0;
    const deadline =
      this.meta.lastActivityAt +
      (hasSockets ? this.IDLE_TIMEOUT_MS : this.EMPTY_ROOM_CLEANUP_MS);
    const current = await this.state.storage.getAlarm();
    // 秒単位のブレで毎回書き直さない（storage write を節約）
    if (current === null || Math.abs(current - deadline) > 5000) {
      await this.state.storage.setAlarm(deadline);
    }
  }

  /** 実際に開いている WebSocket のみを返す */
  private openSockets(exclude?: WebSocket): WebSocket[] {
    return this.state
      .getWebSockets()
      .filter((ws) => ws !== exclude && ws.readyState === WebSocket.OPEN);
  }

  // --- アラーム ------------------------------------------------------------

  async alarm() {
    if (!this.meta) {
      await this.state.storage.deleteAll();
      return;
    }
    const now = Date.now();
    const sockets = this.openSockets();
    const limit = sockets.length
      ? this.IDLE_TIMEOUT_MS
      : this.EMPTY_ROOM_CLEANUP_MS;
    const idleMs = now - this.meta.lastActivityAt;

    if (idleMs >= limit) {
      await this.cleanupRoom(sockets.length ? "idle" : "empty");
      return;
    }
    // まだ期限前なら残り時間で張り直す（DO は再び眠る）
    await this.state.storage.setAlarm(this.meta.lastActivityAt + limit);
  }

  /** 部屋を完全に破棄する。以降 DO は空になり、メモリからも退避できる。 */
  private async cleanupRoom(reason: "idle" | "empty") {
    const now = Date.now();
    const roomAgeMs = this.meta ? now - this.meta.createdAt : 0;
    const idleMs = this.meta ? now - this.meta.lastActivityAt : 0;

    this.sendAnalyticsEvent(`room_cleanup_${reason}`, {
      durationMs: roomAgeMs,
      idleMs,
      userCount: this.room?.users.length ?? 0,
      socketCount: this.state.getWebSockets().length,
    });

    for (const ws of this.state.getWebSockets()) {
      try {
        // 1000 + このreasonで、クライアント側は「再接続しない」と判断する
        ws.close(1000, "room_closed");
      } catch {
        /* すでに閉じている */
      }
    }

    this.room = null;
    this.meta = null;
    await this.state.storage.deleteAlarm();
    await this.state.storage.deleteAll();
  }

  // --- Analytics -----------------------------------------------------------

  /**
   * writeDataPoint は同期的にキューイングされるので await しない。
   * await すると DO をその分だけ長く起こしておくことになる。
   */
  private sendAnalyticsEvent(
    eventType: string,
    data?: {
      value?: number;
      userCount?: number;
      socketCount?: number;
      durationMs?: number;
      idleMs?: number;
    },
  ) {
    try {
      this.env.ANALYTICS.writeDataPoint({
        blobs: [eventType, this.room?.id || "unknown"],
        doubles: [
          Date.now(),
          data?.value ?? 0,
          data?.userCount ?? 0,
          data?.socketCount ?? 0,
          data?.durationMs ?? 0,
          data?.idleMs ?? 0,
        ],
        indexes: [eventType],
      });
    } catch (error) {
      console.error(`Analytics event failed for ${eventType}:`, error);
    }
  }

  // --- DO エントリポイント --------------------------------------------------

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket は最初に捌く（Hibernation で受ける）
    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocketUpgrade();
    }

    // HTTP: /create
    if (request.method === "POST" && url.pathname.endsWith("/create")) {
      const body = (await request.json().catch(() => ({}))) as {
        roomId?: string;
        name?: string;
        icon?: string | number;
      };
      const providedId = (body.roomId ?? "").toString().trim();
      const gmName = (body.name ?? "").toString().trim();
      const gmIcon = body.icon !== undefined ? body.icon : 1;
      const { roomId, gmId, gmToken } = this.initRoom(providedId);

      this.sendAnalyticsEvent("room_created", {
        value: 1,
        userCount: 0,
        socketCount: 0,
      });

      // GM をユーザーとして登録
      let gmUserId = "";
      if (gmName) {
        gmUserId = this.addUser(gmName, gmIcon, true).id;
      }
      await this.saveRoom();
      await this.touchActivity();
      return Response.json({ roomId, gmId, gmToken, gmUserId });
    }

    if (request.method === "POST" && url.pathname.endsWith("/join")) {
      const body = (await request.json().catch(() => ({}))) as {
        name?: string;
        icon?: string | number;
      };
      const name = (body.name ?? "").toString().trim();
      const icon = body.icon !== undefined ? body.icon : 1;
      if (!this.room)
        return new Response("Room not initialized", { status: 404 });
      if (!name) return new Response("name required", { status: 400 });
      const user = this.addUser(name, icon);
      await this.saveRoom();
      await this.touchActivity();

      this.sendAnalyticsEvent("player_joined", {
        value: 1,
        userCount: this.room.users.length,
        socketCount: this.openSockets().length,
      });

      this.broadcast({ type: "userJoined", user } satisfies ServerMessage);
      return Response.json({ userId: user.id });
    }

    if (request.method === "GET" && url.pathname.endsWith("/state")) {
      if (!this.room)
        return new Response("Room not initialized", { status: 404 });
      // state 取得はアイドル判定上の「操作」に数えない（ポーリングで延命させないため）
      return Response.json(this.room);
    }

    if (
      (request.method === "PATCH" || request.method === "POST") &&
      url.pathname.endsWith("/settings")
    ) {
      if (!this.room)
        return new Response("Room not initialized", { status: 404 });
      const body = (await request
        .json()
        .catch(() => ({}))) as UpdateSettingsRequest;
      if (!this.isGm(body?.gmToken))
        return new Response("forbidden", { status: 403 });
      const next = this.applySettingsPatch(
        this.room.settings,
        body.settings || {},
      );
      this.room.settings = next;
      await this.saveRoom();
      await this.touchActivity();
      this.broadcast({
        type: "settingsUpdated",
        settings: next,
      } satisfies ServerMessage);
      this.broadcast({
        type: "state",
        room: this.room,
      } satisfies ServerMessage);
      return Response.json({ ok: true });
    }

    // ゲーム開始
    if (request.method === "POST" && url.pathname.endsWith("/start")) {
      if (!this.room)
        return new Response("Room not initialized", { status: 404 });
      if (this.room.status !== "waiting")
        return new Response("Game already started", { status: 409 });

      const body = (await request.json().catch(() => ({}))) as StartGameRequest;
      if (!this.isGm(body?.gmToken))
        return new Response("forbidden", { status: 403 });
      if (this.room.users.length < 2)
        return new Response("At least 2 players required", { status: 400 });

      this.broadcast({ type: "gameCountdownStarted" } satisfies ServerMessage);

      // 1.5秒だけ DO を起こしておく（アラームを使うほどの長さではない）
      await new Promise((resolve) => setTimeout(resolve, 1500));

      this.room.status = "playing";
      const newRound = this.createRound();
      this.room.rounds.push(newRound);
      await this.saveRoom();
      await this.touchActivity();

      this.broadcast({
        type: "gameStarted",
        room: this.room,
      } satisfies ServerMessage);
      this.broadcast({
        type: "roundCreated",
        round: newRound,
      } satisfies ServerMessage);

      return Response.json({ ok: true });
    }

    // ラウンド作成
    if (request.method === "POST" && url.pathname.endsWith("/round")) {
      if (!this.room)
        return new Response("Room not initialized", { status: 404 });
      if (this.room.status !== "playing")
        return new Response("Game not started", { status: 409 });

      if (
        this.room.settings.maxRounds &&
        this.room.rounds.length >= this.room.settings.maxRounds
      ) {
        return new Response("Max rounds reached", { status: 409 });
      }

      const body = (await request
        .json()
        .catch(() => ({}))) as CreateRoundRequest;
      if (!this.isGm(body?.gmToken))
        return new Response("forbidden", { status: 403 });

      const newRound = this.createRound();
      this.room.rounds.push(newRound);
      await this.saveRoom();
      await this.touchActivity();

      this.sendAnalyticsEvent("round_started", {
        value: 1,
        userCount: this.room.users.length,
        socketCount: this.openSockets().length,
      });

      this.broadcast({
        type: "roundCreated",
        round: newRound,
      } satisfies ServerMessage);
      return Response.json({ roundId: newRound.id });
    }

    // お題設定
    if (
      request.method === "POST" &&
      url.pathname.includes("/round/") &&
      url.pathname.endsWith("/topic")
    ) {
      if (!this.room)
        return new Response("Room not initialized", { status: 404 });

      const roundId = this.roundIdFromPath(url.pathname);
      const round = this.room.rounds.find((r) => r.id === roundId);
      if (!round) return new Response("Round not found", { status: 404 });

      const body = (await request.json().catch(() => ({}))) as SetTopicRequest;
      if (!body?.setterId || !body?.topic?.trim())
        return new Response("setterId and topic required", { status: 400 });
      if (round.setterId !== body.setterId)
        return new Response("Not authorized to set topic", { status: 403 });

      round.topic = body.topic.trim();
      await this.saveRoom();
      await this.touchActivity();
      this.broadcast({
        type: "topicSet",
        roundId,
        topic: round.topic,
      } satisfies ServerMessage);
      return Response.json({ ok: true });
    }

    // 回答送信
    if (
      request.method === "POST" &&
      url.pathname.includes("/round/") &&
      url.pathname.endsWith("/answer")
    ) {
      if (!this.room)
        return new Response("Room not initialized", { status: 404 });

      const roundId = this.roundIdFromPath(url.pathname);
      const round = this.room.rounds.find((r) => r.id === roundId);
      if (!round) return new Response("Round not found", { status: 404 });
      if (round.result === "opened")
        return new Response("Round already opened", { status: 409 });

      const body = (await request
        .json()
        .catch(() => ({}))) as SubmitAnswerRequest;
      if (!body?.userId || !body?.value?.trim())
        return new Response("userId and value required", { status: 400 });

      round.answers = round.answers.filter((a) => a.userId !== body.userId);
      round.answers.push({
        userId: body.userId,
        value: body.value.trim(),
        submittedAt: Date.now(),
      });
      await this.saveRoom();
      await this.touchActivity();

      this.broadcast({
        type: "answerSubmitted",
        roundId,
        userId: body.userId,
        hasAnswered: true,
        answeredUserIds: round.answers.map((a) => a.userId),
        totalAnswers: round.answers.length,
        totalUsers: this.room.users.length,
      } satisfies ServerMessage);
      return Response.json({ ok: true });
    }

    // 回答オープン
    if (
      request.method === "POST" &&
      url.pathname.includes("/round/") &&
      url.pathname.endsWith("/open")
    ) {
      if (!this.room)
        return new Response("Room not initialized", { status: 404 });

      const roundId = this.roundIdFromPath(url.pathname);
      const round = this.room.rounds.find((r) => r.id === roundId);
      if (!round) return new Response("Round not found", { status: 404 });

      const body = (await request.json().catch(() => ({}))) as OpenRoundRequest;
      if (!this.isGm(body?.gmToken))
        return new Response("forbidden", { status: 403 });

      round.result = "opened";
      await this.saveRoom();
      await this.touchActivity();
      this.broadcast({
        type: "roundOpened",
        roundId,
        answers: round.answers,
      } satisfies ServerMessage);
      return Response.json({ ok: true });
    }

    // 結果判定
    if (
      request.method === "POST" &&
      url.pathname.includes("/round/") &&
      url.pathname.endsWith("/result")
    ) {
      if (!this.room)
        return new Response("Room not initialized", { status: 404 });

      const roundId = this.roundIdFromPath(url.pathname);
      const round = this.room.rounds.find((r) => r.id === roundId);
      if (!round) return new Response("Round not found", { status: 404 });

      const body = (await request
        .json()
        .catch(() => ({}))) as JudgeResultRequest;
      if (!this.isGm(body?.gmToken))
        return new Response("forbidden", { status: 403 });
      if (typeof body.unanimous !== "boolean")
        return new Response("unanimous must be boolean", { status: 400 });

      round.unanimous = body.unanimous;
      const winResult = this.checkWinCondition();

      this.broadcast({
        type: "resultJudged",
        roundId,
        unanimous: body.unanimous,
      } satisfies ServerMessage);

      const finished = !!(winResult.isWin || winResult.isDefeated);
      if (finished) {
        this.room.status = "finished";
        this.room.gameResult = winResult.isWin ? "win" : "lose";
        this.broadcast({
          type: "gameFinished",
          room: this.room,
          gameResult: this.room.gameResult,
        } satisfies ServerMessage);
      }
      await this.saveRoom();
      await this.touchActivity();

      return Response.json({
        ok: true,
        gameFinished: finished,
        reason: winResult.reason,
      });
    }

    // ゲームリセット（GM専用）
    if (request.method === "POST" && url.pathname.endsWith("/reset")) {
      if (!this.room)
        return new Response("Room not initialized", { status: 404 });
      if (!this.isGm(this.tokenFromHeaders(request)))
        return new Response("forbidden", { status: 403 });

      this.room.status = "waiting";
      this.room.rounds = [];
      this.room.gameResult = undefined;
      await this.saveRoom();
      await this.touchActivity();

      this.broadcast({
        type: "roomReset",
        message: "ゲームがリセットされました",
      } satisfies ServerMessage);

      this.sendAnalyticsEvent("room_reset", {
        value: 1,
        userCount: this.room.users.length,
        socketCount: this.openSockets().length,
      });

      this.broadcast({
        type: "state",
        room: this.room,
      } satisfies ServerMessage);
      return Response.json({ ok: true });
    }

    // GMがトップに戻る（部屋を畳む）
    if (request.method === "POST" && url.pathname.endsWith("/gm-return-home")) {
      if (!this.room)
        return new Response("Room not initialized", { status: 404 });
      if (!this.isGm(this.tokenFromHeaders(request)))
        return new Response("forbidden", { status: 403 });

      this.broadcast({ type: "gmReturnedHome" } satisfies ServerMessage);
      this.sendAnalyticsEvent("gm_return_home", {
        value: 1,
        userCount: this.room.users.length,
        socketCount: this.openSockets().length,
      });

      // GM が抜けた部屋を 10 分生かしておく理由はないので即座に畳む
      await this.cleanupRoom("empty");
      return Response.json({ ok: true });
    }

    return new Response("OK");
  }

  // --- WebSocket (Hibernation) ---------------------------------------------

  private async handleWebSocketUpgrade(): Promise<Response> {
    // 既に畳んだ部屋へは接続させない。
    // アップグレード自体を断ることで、アラームを持たない接続が残るのを防ぐ。
    // （接続を受けてから close すると、ハンドシェイク未完了のため相手に
    //   close フレームが届かず中途半端に開いたままになる）
    if (!this.room) {
      return new Response("Room not initialized", { status: 404 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    // accept() ではなく acceptWebSocket() を使うことで、
    // メッセージが来ていない間 DO はメモリから退避され課金されない。
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ connectedAt: Date.now() } as SocketAttachment);

    this.sendAnalyticsEvent("ws_connected", {
      value: 1,
      userCount: this.room.users.length,
      socketCount: this.openSockets().length,
    });

    // 接続直後に現状態を送る
    server.send(
      JSON.stringify({
        type: "state",
        room: this.room,
      } satisfies ServerMessage),
    );

    // 接続そのものはアイドル判定を延長しない。
    // （バックグラウンド復帰などの再接続だけで部屋が延命するのを防ぐ）
    // ただしアラームが消えていた場合に備えて張り直しておく。
    await this.scheduleCleanupAlarm();

    return new Response(null, { status: 101, webSocket: client } as any);
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(
        typeof message === "string" ? message : new TextDecoder().decode(message),
      ) as ClientMessage;
    } catch {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "bad message",
        } satisfies ServerMessage),
      );
      return;
    }

    if (msg.type === "ping") {
      // ping は「操作」ではないので延命させない。状態だけ返す。
      if (this.room)
        ws.send(
          JSON.stringify({
            type: "state",
            room: this.room,
          } satisfies ServerMessage),
        );
      return;
    }

    if (msg.type === "identify") {
      // 接続とユーザーの紐づけのみ。部屋の延命はしない。
      const att = (ws.deserializeAttachment() ?? {
        connectedAt: Date.now(),
      }) as SocketAttachment;
      att.userId = msg.userId;
      ws.serializeAttachment(att);
      return;
    }

    if (msg.type === "join") {
      if (!this.room) return;
      const user = this.addUser(msg.name, msg.icon);
      const att = (ws.deserializeAttachment() ?? {
        connectedAt: Date.now(),
      }) as SocketAttachment;
      att.userId = user.id;
      ws.serializeAttachment(att);
      await this.saveRoom();
      await this.touchActivity();
      this.broadcast({ type: "userJoined", user } satisfies ServerMessage);
      return;
    }

    if (msg.type === "leave") {
      await this.removeUserById(msg.userId);
      return;
    }
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string) {
    const att = ws.deserializeAttachment() as SocketAttachment | null;
    this.sendAnalyticsEvent("ws_disconnected", {
      durationMs: att?.connectedAt ? Date.now() - att.connectedAt : 0,
      userCount: this.room?.users.length ?? 0,
      socketCount: this.openSockets(ws).length,
    });
    await this.onSocketGone(ws, att?.userId);
  }

  async webSocketError(ws: WebSocket, _error: unknown) {
    const att = ws.deserializeAttachment() as SocketAttachment | null;
    this.sendAnalyticsEvent("ws_error", {
      durationMs: att?.connectedAt ? Date.now() - att.connectedAt : 0,
      userCount: this.room?.users.length ?? 0,
      socketCount: this.openSockets(ws).length,
    });
    await this.onSocketGone(ws, att?.userId);
  }

  /**
   * 接続が消えたときの共通処理。
   * 「接続がゼロになったら短時間で畳む」判定は users 配列ではなく
   * 実際の接続数で行う（GM は users から消えないため）。
   */
  private async onSocketGone(ws: WebSocket, userId?: string) {
    if (userId) await this.removeUserById(userId);
    if (this.openSockets(ws).length === 0 && this.meta) {
      // 誰も繋がっていないので EMPTY_ROOM_CLEANUP_MS 後に片付ける
      await this.state.storage.setAlarm(
        Date.now() + this.EMPTY_ROOM_CLEANUP_MS,
      );
    }
  }

  private broadcast(payload: unknown) {
    const data = JSON.stringify(payload);
    for (const ws of this.state.getWebSockets()) {
      try {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
      } catch {
        /* 送信できない接続は無視（close イベントで片付く） */
      }
    }
  }

  // --- ゲームロジック -------------------------------------------------------

  private isGm(token: string | null | undefined): boolean {
    return !!token && !!this.meta?.gmToken && token === this.meta.gmToken;
  }

  private tokenFromHeaders(request: Request): string {
    const authHeader = request.headers.get("authorization") || "";
    if (authHeader.startsWith("Bearer ")) return authHeader.substring(7);
    return request.headers.get("x-gm-token") || "";
  }

  private roundIdFromPath(pathname: string): string {
    const parts = pathname.split("/");
    return parts[parts.length - 2];
  }

  private createRound(): Round {
    return {
      id: crypto.randomUUID(),
      topic: "",
      setterId: this.getNextTopicSetter(),
      answers: [],
      result: "unopened",
      unanimous: null,
    };
  }

  private initRoom(roomId?: string) {
    roomId ||= (Math.floor(Math.random() * 9000) + 1000).toString();
    const gmId = crypto.randomUUID();
    const gmToken = crypto.randomUUID();
    const now = Date.now();
    this.room = {
      id: roomId,
      gmId,
      users: [],
      settings: { topicMode: "all", winCondition: { type: "count", value: 1 } },
      status: "waiting",
      rounds: [],
      gameResult: undefined,
    } satisfies Room;
    this.meta = { gmToken, createdAt: now, lastActivityAt: now };
    return { roomId, gmId, gmToken };
  }

  private addUser(name: string, icon: string | number = 1, isGM = false) {
    const user = { id: crypto.randomUUID(), name, icon, isGM };
    this.room!.users.push(user);
    return user;
  }

  private applySettingsPatch(
    current: RoomSettings,
    patch: Partial<RoomSettings>,
  ): RoomSettings {
    const out: RoomSettings = structuredClone(current);
    if (patch.topicMode) {
      if (patch.topicMode === "gm" || patch.topicMode === "all")
        out.topicMode = patch.topicMode;
    }
    if (patch.winCondition) {
      const wc = patch.winCondition as RoomSettings["winCondition"];
      if (wc.type === "none") {
        out.winCondition = { type: "none" };
      } else if (
        wc.type === "count" &&
        typeof (wc as any).value === "number" &&
        (wc as any).value >= 1
      ) {
        out.winCondition = { type: "count", value: (wc as any).value };
      } else if (
        wc.type === "consecutive" &&
        typeof (wc as any).value === "number" &&
        (wc as any).value >= 1
      ) {
        out.winCondition = { type: "consecutive", value: (wc as any).value };
      }
    }
    // maxRounds: undefined で無制限、数値(>=1)で設定
    if (Object.prototype.hasOwnProperty.call(patch, "maxRounds")) {
      const mr = (patch as any).maxRounds;
      if (mr === undefined || mr === null || mr === 0) {
        delete (out as any).maxRounds;
      } else if (typeof mr === "number" && mr >= 1 && mr <= 100) {
        (out as any).maxRounds = Math.floor(mr);
      }
    }
    return out;
  }

  private getNextTopicSetter(): string {
    if (!this.room) return "";

    if (this.room.settings.topicMode === "gm") {
      return this.room.users.find((u) => u.isGM)?.id || "";
    }

    if (this.room.settings.topicMode === "all") {
      const allUsers = this.room.users;
      if (allUsers.length === 0) return "";
      // 新しいラウンドを作る直前なので、現在のラウンド数がそのまま次のインデックス
      const nextUserIndex = this.room.rounds.length % allUsers.length;
      return allUsers[nextUserIndex]?.id || "";
    }

    return "";
  }

  private checkWinCondition(): {
    isWin: boolean;
    isDefeated?: boolean;
    reason?: string;
  } {
    if (!this.room) return { isWin: false };

    const { maxRounds } = this.room.settings;

    if (maxRounds && this.room.rounds.length >= maxRounds) {
      const winResult = this.checkWinConditionInternal();
      if (winResult.isWin) return winResult;
      return {
        isWin: false,
        isDefeated: true,
        reason: `${maxRounds}ラウンド終了時点で勝利条件を達成できませんでした`,
      };
    }

    return this.checkWinConditionInternal();
  }

  private checkWinConditionInternal(): { isWin: boolean; reason?: string } {
    if (!this.room) return { isWin: false };

    const { winCondition } = this.room.settings;
    if (winCondition.type === "none") return { isWin: false };

    const unanimousRounds = this.room.rounds.filter(
      (r) => r.unanimous === true,
    );

    if (winCondition.type === "count") {
      const isWin = unanimousRounds.length >= winCondition.value;
      return {
        isWin,
        reason: isWin
          ? `${winCondition.value}回一致を達成しました！`
          : undefined,
      };
    }

    if (winCondition.type === "consecutive") {
      let consecutiveCount = 0;
      let maxConsecutive = 0;
      for (let i = this.room.rounds.length - 1; i >= 0; i--) {
        const round = this.room.rounds[i];
        if (round.unanimous === true) {
          consecutiveCount++;
          maxConsecutive = Math.max(maxConsecutive, consecutiveCount);
        } else if (round.unanimous === false) {
          break; // 連続記録が途切れる
        }
        // unanimous === null は判定前なのでスキップ
      }
      const isWin = maxConsecutive >= winCondition.value;
      return {
        isWin,
        reason: isWin
          ? `${winCondition.value}回連続一致を達成しました！`
          : undefined,
      };
    }

    return { isWin: false };
  }

  private async removeUserById(userId: string) {
    if (!this.room) return;

    const userIndex = this.room.users.findIndex((user) => user.id === userId);
    if (userIndex === -1) return;

    const user = this.room.users[userIndex];
    if (user.isGM) return; // GM は users から外さない（部屋の所有権が壊れるため）

    this.sendAnalyticsEvent("player_left", {
      value: 1,
      userCount: Math.max(this.room.users.length - 1, 0),
      socketCount: this.openSockets().length,
    });

    this.room.users.splice(userIndex, 1);
    await this.saveRoom();

    this.broadcast({
      type: "userLeft",
      userId: user.id,
      userName: user.name,
    } satisfies ServerMessage);
    this.broadcast({
      type: "state",
      room: this.room,
    } satisfies ServerMessage);
  }
}
