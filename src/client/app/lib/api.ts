import type {
  CreateRoomRequest,
  CreateRoomResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  Room,
  UpdateSettingsRequest,
  StartGameRequest,
  CreateRoundRequest,
  SetTopicRequest,
  SubmitAnswerRequest,
  OpenRoundRequest,
  JudgeResultRequest,
} from "../../../shared/types";

const BASE = "";

export class ApiError extends Error {
  status: number;
  body?: string;
  constructor(status: number, message: string, body?: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function createRoom(
  body: CreateRoomRequest
): Promise<CreateRoomResponse> {
  const res = await fetch(`${BASE}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, "create room failed", text);
  }
  return res.json();
}

export async function joinRoom(
  id: string,
  body: JoinRoomRequest
): Promise<JoinRoomResponse> {
  const res = await fetch(`${BASE}/api/rooms/${id}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, "join room failed", text);
  }
  return res.json();
}

export async function getRoomState(id: string): Promise<Room> {
  const res = await fetch(`${BASE}/api/rooms/${id}/state`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, "get state failed", text);
  }
  return res.json();
}

export function connectWs(id: string): WebSocket {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return new WebSocket(`${proto}://${location.host}/ws/${id}`);
}

export async function updateSettings(
  id: string,
  body: UpdateSettingsRequest
): Promise<{ ok: true }> {
  const res = await fetch(`${BASE}/api/rooms/${id}/settings`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, "update settings failed", text);
  }
  return res.json();
}

export async function startGame(
  id: string,
  gmToken: string
): Promise<{ ok: true }> {
  const res = await fetch(`${BASE}/api/rooms/${id}/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ gmToken } satisfies StartGameRequest),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, "start game failed", text);
  }
  return res.json();
}

export async function createRound(
  roomId: string,
  gmToken: string
): Promise<{ roundId: string }> {
  const res = await fetch(`${BASE}/api/rooms/${roomId}/round`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ gmToken } satisfies CreateRoundRequest),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, "create round failed", text);
  }
  return res.json();
}

export async function setTopic(
  roomId: string,
  roundId: string,
  topic: string,
  setterId: string
): Promise<{ ok: true }> {
  const res = await fetch(
    `${BASE}/api/rooms/${roomId}/round/${roundId}/topic`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        roundId,
        topic,
        setterId,
      } satisfies SetTopicRequest),
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, "set topic failed", text);
  }
  return res.json();
}

export async function submitAnswer(
  roomId: string,
  roundId: string,
  userId: string,
  value: string
): Promise<{ ok: true }> {
  const res = await fetch(
    `${BASE}/api/rooms/${roomId}/round/${roundId}/answer`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        roundId,
        userId,
        value,
      } satisfies SubmitAnswerRequest),
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, "submit answer failed", text);
  }
  return res.json();
}

export async function openRound(
  roomId: string,
  roundId: string,
  gmToken: string
): Promise<{ ok: true }> {
  const res = await fetch(`${BASE}/api/rooms/${roomId}/round/${roundId}/open`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roundId, gmToken } satisfies OpenRoundRequest),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, "open round failed", text);
  }
  return res.json();
}

export async function judgeResult(
  roomId: string,
  roundId: string,
  unanimous: boolean,
  gmToken: string
): Promise<{ ok: true }> {
  const res = await fetch(
    `${BASE}/api/rooms/${roomId}/round/${roundId}/result`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        roundId,
        unanimous,
        gmToken,
      } satisfies JudgeResultRequest),
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, "judge result failed", text);
  }
  return res.json();
}

export const gmTokenStore = {
  key: (roomId: string) => `gmToken:${roomId}`,
  save(roomId: string, token: string) {
    localStorage.setItem(this.key(roomId), token);
  },
  load(roomId: string) {
    return localStorage.getItem(this.key(roomId));
  },
  clear(roomId: string) {
    localStorage.removeItem(this.key(roomId));
  },
};

export const userIdStore = {
  key: (roomId: string) => `userId:${roomId}`,
  save(roomId: string, userId: string) {
    localStorage.setItem(this.key(roomId), userId);
  },
  load(roomId: string) {
    return localStorage.getItem(this.key(roomId));
  },
  clear(roomId: string) {
    localStorage.removeItem(this.key(roomId));
  },
};

export async function resetRoom(
  roomId: string,
  gmToken: string
): Promise<{ ok: true }> {
  const res = await fetch(`${BASE}/api/rooms/${roomId}/reset`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${gmToken}`,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, "reset room failed", text);
  }
  return res.json();
}

export async function gmReturnHome(
  roomId: string,
  gmToken: string
): Promise<{ ok: true }> {
  const res = await fetch(`${BASE}/api/rooms/${roomId}/gm-return-home`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${gmToken}`,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(res.status, "gm return home failed", text);
  }
  return res.json();
}

/**
 * 退出を通知する。
 *
 * 以前はここで `connectWs()` を呼んで新しい WebSocket を張っていたが、
 * それは Durable Object を叩き起こしてアイドルタイマーを延長する動作であり、
 * タブ切り替えのたびに部屋の寿命が伸びて duration を食い潰していた。
 * 既に開いている接続があればそこに流し、無ければ接続を閉じるだけでよい
 * （サーバ側は WebSocket の close をもって退出とみなす）。
 */
export function leaveRoom(
  ws: WebSocket | null,
  userId: string
): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify({ type: "leave", userId }));
    } catch {
      /* 送れなければ close 側で処理される */
    }
  }
  try {
    ws?.close(1000, "leave");
  } catch {
    /* 既に閉じている */
  }
}
