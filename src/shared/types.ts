export type User = {
  id: string;
  name: string;
  icon: string | number;
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
  | { type: "userLeft"; userId: string; userName: string }
  | { type: "gameCountdownStarted" }
  | { type: "gameStarted"; room: Room }
  | { type: "roundCreated"; round: Round }
  | { type: "topicSet"; roundId: string; topic: string }
  | {
      type: "answerSubmitted";
      roundId: string;
      userId: string;
      hasAnswered: boolean;
      answeredUserIds: string[];
      totalAnswers: number;
      totalUsers: number;
    }
  | { type: "roundOpened"; roundId: string; answers: Answer[] }
  | { type: "resultJudged"; roundId: string; unanimous: boolean }
  | { type: "gameFinished"; room: Room; winCondition: boolean }
  | { type: "roomReset"; message: string }
  | { type: "settingsUpdated"; settings: RoomSettings }
  | { type: "error"; message: string };

export type ClientMessage =
  | { type: "ping" }
  | { type: "join"; name: string; icon: string | number }
  | { type: "leave"; userId: string };

// --- API DTOs ---
export type CreateRoomResponse = {
  roomId: string;
  gmId: string;
  gmToken: string;
  gmUserId: string;
};
export type CreateRoomRequest = { name: string; icon: string | number };

export type JoinRoomRequest = { name: string; icon: string | number };
export type JoinRoomResponse = { userId: string };

// Settings Update
export type UpdateSettingsRequest = {
  gmToken: string;
  settings: Partial<RoomSettings>;
};

// Game Flow
export type StartGameRequest = { gmToken: string };

export type CreateRoundRequest = { gmToken: string };

export type SetTopicRequest = {
  roundId: string;
  topic: string;
  setterId: string;
};

export type SubmitAnswerRequest = {
  roundId: string;
  userId: string;
  value: string;
};

export type OpenRoundRequest = {
  roundId: string;
  gmToken: string;
};

export type JudgeResultRequest = {
  roundId: string;
  unanimous: boolean;
  gmToken: string;
};
