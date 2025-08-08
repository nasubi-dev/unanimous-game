import type {
  CreateRoomRequest,
  CreateRoomResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  Room,
  UpdateSettingsRequest,
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

export async function createRoom(body: CreateRoomRequest): Promise<CreateRoomResponse> {
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

export async function updateSettings(id: string, body: UpdateSettingsRequest): Promise<{ ok: true }> {
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
