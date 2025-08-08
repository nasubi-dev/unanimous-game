import type {
  CreateRoomRequest,
  CreateRoomResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  Room,
} from "../../../shared/types";

const BASE = "";

export async function createRoom(body: CreateRoomRequest): Promise<CreateRoomResponse> {
  const res = await fetch(`${BASE}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("create room failed");
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
  if (!res.ok) throw new Error("join room failed");
  return res.json();
}

export async function getRoomState(id: string): Promise<Room> {
  const res = await fetch(`${BASE}/api/rooms/${id}/state`);
  if (!res.ok) throw new Error("get state failed");
  return res.json();
}

export function connectWs(id: string): WebSocket {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return new WebSocket(`${proto}://${location.host}/ws/${id}`);
}
