export type User = {
  id: string;
  name: string;
  icon: string;
  isGM: boolean;
};

export type RoomSettings = {
  topicMode: "gm" | "all";
  winCondition:
    | { type: "count"; value: number }
    | { type: "consecutive"; value: number }
    | { type: "none" };
};

export type Answer = {
  userId: string;
  value: string;
  submittedAt: number;
};

export type Round = {
  id: string;
  topic: string;
  setterId: string;
  answers: Answer[];
  result: "unopened" | "opened";
  unanimous: boolean | null;
};

export type Room = {
  id: string; // 4桁番号
  gmId: string;
  users: User[];
  settings: RoomSettings;
  status: "waiting" | "playing" | "finished";
  rounds: Round[];
};

// --- WS/Event types (minimal for first step) ---
export type ServerMessage =
  | { type: "state"; room: Room }
  | { type: "userJoined"; user: User }
  | { type: "error"; message: string };

export type ClientMessage = { type: "ping" } | { type: "join"; name: string };

// --- API DTOs ---
export type CreateRoomResponse = {
  roomId: string;
  gmId: string;
  gmToken: string;
};

export type JoinRoomRequest = { name: string };
export type JoinRoomResponse = { userId: string };
