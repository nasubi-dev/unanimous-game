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
}

export class RoomDurable {
  private state: DurableObjectState;
  private env: Env;

  // インメモリ状態（永続化しない）
  private room: Room | null = null;
  private sockets = new Set<WebSocket>();
  private gmToken: string | null = null;
  private userSocketMap = new Map<string, WebSocket>(); // userId -> WebSocket
  private socketUserMap = new Map<WebSocket, string>(); // WebSocket -> userId

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  // Analytics用のヘルパーメソッド
  private async sendAnalyticsEvent(eventType: string, data?: any) {
    try {
      await this.env.ANALYTICS.writeDataPoint({
        blobs: [eventType, this.room?.id || "unknown"],
        doubles: [Date.now()],
        indexes: [eventType],
      });
    } catch (error) {
      console.error(`Analytics event failed for ${eventType}:`, error);
    }
  }

  // DO エントリポイント
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // HTTP: /create, /join, /state
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
      this.gmToken = gmToken;

      // Analytics: ルーム作成イベント送信
      await this.sendAnalyticsEvent("room_created");

      // GM をユーザーとして登録
      let gmUserId = "";
      if (gmName) {
        const gmUser = this.addUser(gmName, gmIcon, true);
        gmUserId = gmUser.id;
      }
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

      // Analytics: プレイヤー参加イベント送信
      await this.sendAnalyticsEvent("player_joined");

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
      if (!this.room)
        return new Response("Room not initialized", { status: 404 });
      const body = (await request
        .json()
        .catch(() => ({}))) as UpdateSettingsRequest;
      if (!body?.gmToken || body.gmToken !== this.gmToken)
        return new Response("forbidden", { status: 403 });
      const next = this.applySettingsPatch(
        this.room.settings,
        body.settings || {}
      );
      this.room.settings = next;
      // settingsUpdatedイベントと全状態の両方を送信
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
      if (!body?.gmToken || body.gmToken !== this.gmToken)
        return new Response("forbidden", { status: 403 });

      // プレイヤー数チェック（2人以上必要）
      if (this.room.users.length < 2)
        return new Response("At least 2 players required", { status: 400 });

      // まずカウントダウン開始をブロードキャスト
      this.broadcast({
        type: "gameCountdownStarted",
      } satisfies ServerMessage);

      // 1.5秒後に実際のゲーム開始処理を実行
      setTimeout(() => {
        this.room!.status = "playing";

        // 自動で最初のラウンドを作成
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

        this.room!.rounds.push(newRound);

        this.broadcast({
          type: "gameStarted",
          room: this.room!,
        } satisfies ServerMessage);
        this.broadcast({
          type: "roundCreated",
          round: newRound,
        } satisfies ServerMessage);

        // もしmaxRoundsが1の場合は、最初の結果判定で敗北がありうるため、ここでは開始のみ
      }, 1500);

      return Response.json({ ok: true });
    }

    // ラウンド作成
    if (request.method === "POST" && url.pathname.endsWith("/round")) {
      if (!this.room)
        return new Response("Room not initialized", { status: 404 });
      if (this.room.status !== "playing")
        return new Response("Game not started", { status: 409 });

      // 上限ラウンド数チェック
      if (
        this.room.settings.maxRounds &&
        this.room.rounds.length >= this.room.settings.maxRounds
      ) {
        return new Response("Max rounds reached", { status: 409 });
      }

      const body = (await request
        .json()
        .catch(() => ({}))) as CreateRoundRequest;
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

      // Analytics: ラウンド開始イベント送信
      await this.sendAnalyticsEvent("round_started");

      this.broadcast({
        type: "roundCreated",
        round: newRound,
      } satisfies ServerMessage);
      return Response.json({ roundId });
    }

    // お題設定
    if (
      request.method === "POST" &&
      url.pathname.includes("/round/") &&
      url.pathname.endsWith("/topic")
    ) {
      if (!this.room)
        return new Response("Room not initialized", { status: 404 });

      const pathParts = url.pathname.split("/");
      const roundId = pathParts[pathParts.length - 2];
      const round = this.room.rounds.find((r) => r.id === roundId);
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

      const pathParts = url.pathname.split("/");
      const roundId = pathParts[pathParts.length - 2];
      const round = this.room.rounds.find((r) => r.id === roundId);
      if (!round) return new Response("Round not found", { status: 404 });
      if (round.result === "opened")
        return new Response("Round already opened", { status: 409 });

      const body = (await request
        .json()
        .catch(() => ({}))) as SubmitAnswerRequest;
      if (!body?.userId || !body?.value?.trim())
        return new Response("userId and value required", { status: 400 });

      // 既存の回答を削除して新しい回答を追加
      round.answers = round.answers.filter((a) => a.userId !== body.userId);
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

      const pathParts = url.pathname.split("/");
      const roundId = pathParts[pathParts.length - 2];
      const round = this.room.rounds.find((r) => r.id === roundId);
      if (!round) return new Response("Round not found", { status: 404 });

      const body = (await request.json().catch(() => ({}))) as OpenRoundRequest;
      if (!body?.gmToken || body.gmToken !== this.gmToken)
        return new Response("forbidden", { status: 403 });

      round.result = "opened";
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

      const pathParts = url.pathname.split("/");
      const roundId = pathParts[pathParts.length - 2];
      const round = this.room.rounds.find((r) => r.id === roundId);
      if (!round) return new Response("Round not found", { status: 404 });

      const body = (await request
        .json()
        .catch(() => ({}))) as JudgeResultRequest;
      if (!body?.gmToken || body.gmToken !== this.gmToken)
        return new Response("forbidden", { status: 403 });
      if (typeof body.unanimous !== "boolean")
        return new Response("unanimous must be boolean", { status: 400 });

      round.unanimous = body.unanimous;

      // 勝利条件をチェック
      const winResult = this.checkWinCondition();

      this.broadcast({
        type: "resultJudged",
        roundId,
        unanimous: body.unanimous,
      } satisfies ServerMessage);

      // 勝利条件を満たした場合、または敗北した場合はゲーム終了
      if (winResult.isWin || winResult.isDefeated) {
        this.room.status = "finished";
        this.room.gameResult = winResult.isWin ? "win" : "lose";
        this.broadcast({
          type: "gameFinished",
          room: this.room,
          gameResult: this.room.gameResult,
        } satisfies ServerMessage);
        console.log("Game finished:", winResult.reason);
      }

      return Response.json({
        ok: true,
        gameFinished: winResult.isWin || winResult.isDefeated,
        reason: winResult.reason,
      });
    }

    // ゲームリセット（GM専用）
    if (request.method === "POST" && url.pathname.endsWith("/reset")) {
      if (!this.room)
        return new Response("Room not initialized", { status: 404 });

      // GM権限チェック
      const authHeader = request.headers.get("authorization") || "";
      const xGmToken = request.headers.get("x-gm-token") || "";

      let providedToken = "";
      if (authHeader.startsWith("Bearer ")) {
        providedToken = authHeader.substring(7);
      } else if (xGmToken) {
        providedToken = xGmToken;
      }

      if (!providedToken || providedToken !== this.gmToken) {
        console.log("Reset failed: invalid GM token", {
          provided: providedToken ? "***" : "none",
          expected: this.gmToken ? "***" : "none",
        });
        return new Response("forbidden", { status: 403 });
      }

      console.log("Resetting game...");

      // ゲーム状態をリセット
      this.room.status = "waiting";
      this.room.rounds = [];

      // 全員の準備状態をリセット（readyプロパティがある場合のみ）
      // this.room.users.forEach(user => {
      //   if ('ready' in user) user.ready = false;
      // });

      // リセット完了をブロードキャスト
      this.broadcast({
        type: "roomReset",
        message: "ゲームがリセットされました",
      } satisfies ServerMessage);

      // 新しい状態もブロードキャスト
      this.broadcast({
        type: "state",
        room: this.room,
      } satisfies ServerMessage);

      console.log("Game reset completed");
      return Response.json({ ok: true });
    }

    // 必要に応じて /start /answer /open などを実装
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      server.accept();
      console.log(
        `New WebSocket connection. Total connections: ${this.sockets.size + 1}`
      );

      this.sockets.add(server);
      server.addEventListener("close", () => {
        console.log(
          `WebSocket connection closed. Total connections: ${
            this.sockets.size - 1
          }`
        );
        this.sockets.delete(server);
        this.handleUserDisconnect(server);
      });
      server.addEventListener("message", (ev) => this.onMessage(server, ev));
      server.addEventListener("error", (error) => {
        console.log("WebSocket error:", error);
        this.sockets.delete(server);
        this.handleUserDisconnect(server);
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
      settings: { topicMode: "all", winCondition: { type: "count", value: 1 } },
      status: "waiting",
      rounds: [],
      gameResult: undefined,
    } satisfies Room;
    return { roomId, gmId, gmToken };
  }

  private addUser(name: string, icon: string | number = 1, isGM = false) {
    const user = { id: crypto.randomUUID(), name, icon, isGM };
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
        const user = this.addUser(msg.name, msg.icon);
        // WebSocketとユーザーIDの関連付けを保存
        this.userSocketMap.set(user.id, ws);
        this.socketUserMap.set(ws, user.id);
        this.broadcast({ type: "userJoined", user } satisfies ServerMessage);
      }
      if (msg.type === "leave") {
        this.handleUserLeave(msg.userId);
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

  private applySettingsPatch(
    current: RoomSettings,
    patch: Partial<RoomSettings>
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

    // GM固定モードの場合
    if (this.room.settings.topicMode === "gm") {
      const gm = this.room.users.find((u) => u.isGM);
      return gm?.id || "";
    }

    // 全員順番モードの場合
    if (this.room.settings.topicMode === "all") {
      // 全てのユーザー（GMを含む）を対象とする
      const allUsers = this.room.users;
      if (allUsers.length === 0) return "";

      // 既存のラウンド数を基準にして次の人を選択
      // 新しいラウンドを作成する直前なので、現在のラウンド数がそのまま次のインデックスになる
      const roundCount = this.room.rounds.length;
      const nextUserIndex = roundCount % allUsers.length;
      console.log(
        `Setting topic setter (all users): round=${
          roundCount + 1
        }, userIndex=${nextUserIndex}, userId=${
          allUsers[nextUserIndex]?.id
        }, userName=${allUsers[nextUserIndex]?.name}, isGM=${
          allUsers[nextUserIndex]?.isGM
        }`
      );
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

    const { winCondition, maxRounds } = this.room.settings;

    // maxRoundsが設定されている場合の処理
    if (maxRounds && this.room.rounds.length >= maxRounds) {
      // まず勝利条件をチェック
      const winResult = this.checkWinConditionInternal();
      if (winResult.isWin) {
        return winResult;
      }

      // 勝利条件を満たしていない場合は敗北
      return {
        isWin: false,
        isDefeated: true,
        reason: `${maxRounds}ラウンド終了時点で勝利条件を達成できませんでした`,
      };
    }

    // 通常の勝利条件チェック
    return this.checkWinConditionInternal();
  }

  private checkWinConditionInternal(): { isWin: boolean; reason?: string } {
    if (!this.room) return { isWin: false };

    const { winCondition } = this.room.settings;

    if (winCondition.type === "none") {
      return { isWin: false };
    }

    // 全員一致したラウンドのみを対象とする
    const unanimousRounds = this.room.rounds.filter(
      (r) => r.unanimous === true
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
      // 連続一致の判定
      let consecutiveCount = 0;
      let maxConsecutive = 0;

      // 最新のラウンドから逆順で連続一致をチェック
      for (let i = this.room.rounds.length - 1; i >= 0; i--) {
        const round = this.room.rounds[i];
        if (round.unanimous === true) {
          consecutiveCount++;
          maxConsecutive = Math.max(maxConsecutive, consecutiveCount);
        } else if (round.unanimous === false) {
          break; // 連続記録が途切れる
        }
        // unanimous === null の場合は判定前なのでスキップ
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

  // WebSocket接続切断時の処理
  private handleUserDisconnect(ws: WebSocket) {
    const userId = this.socketUserMap.get(ws);
    if (userId) {
      console.log(`User ${userId} disconnected via WebSocket close/error`);
      this.removeUserById(userId);
      this.socketUserMap.delete(ws);
      this.userSocketMap.delete(userId);
    }
  }

  // ユーザーの明示的な退出処理
  private handleUserLeave(userId: string) {
    console.log(`User ${userId} explicitly left`);
    this.removeUserById(userId);

    // WebSocket接続も清理
    const ws = this.userSocketMap.get(userId);
    if (ws) {
      this.socketUserMap.delete(ws);
      this.userSocketMap.delete(userId);
    }
  }

  // ユーザーID指定での削除処理
  private removeUserById(userId: string) {
    if (!this.room) return;

    const userIndex = this.room.users.findIndex((user) => user.id === userId);
    if (userIndex === -1) return;

    const user = this.room.users[userIndex];

    // GMの場合は削除しない
    if (user.isGM) {
      console.log(
        `GM ${user.name} attempted to leave, but GMs cannot be removed`
      );
      return;
    }

    console.log(`Removing user ${user.name} (${userId}) from room`);

    // ユーザーを配列から削除
    this.room.users.splice(userIndex, 1);

    // ユーザー退出をブロードキャスト
    this.broadcast({
      type: "userLeft",
      userId: user.id,
      userName: user.name,
    } satisfies ServerMessage);

    // 更新された状態もブロードキャスト
    this.broadcast({
      type: "state",
      room: this.room,
    } satisfies ServerMessage);
  }
}
