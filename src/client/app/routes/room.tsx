import { useEffect, useRef, useState, useMemo } from "react";
import { useParams } from "react-router";
import {
  ApiError,
  connectWs,
  getRoomState,
  gmTokenStore,
  userIdStore,
  startGame,
  resetRoom,
  leaveRoom,
} from "../lib/api";
import type { Room, ServerMessage } from "../../../shared/types";
import {
  UsersList,
  RoomSettings,
  WinConditionDisplay,
  RoundDisplay,
  GameFinished,
  Toast,
  Expanded,
  GameStartCountdown,
  AnimatedButton,
} from "../components";

export function meta() {
  return [{ title: "Room" }];
}

export default function Room() {
  const params = useParams();
  const id = params.id!;
  const [state, setState] = useState<Room | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [showCountdown, setShowCountdown] = useState(false);

  useEffect(() => {
    // まず状態とselfIdを設定
    setSelfId(userIdStore.load(id) || null);

    // REST APIで状態を取得
    getRoomState(id)
      .then(setState)
      .catch(() => setToast("状態の取得に失敗しました"));

    // WebSocket接続を設定
    let ws = connectWs(id);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage;
        console.log("Received message:", msg);

        if (msg.type === "state") {
          console.log("State received:", msg.room);
          console.log("Setting state with status:", msg.room.status);
          setState(msg.room);
        }
        if (msg.type === "userJoined") {
          console.log("User joined:", msg.user);
          setState((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              users: [...prev.users, msg.user],
            };
          });
        }
        if (msg.type === "userLeft") {
          console.log("User left:", msg.userId, msg.userName);
          setToast(`${msg.userName}さんが退出しました`);
          setState((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              users: prev.users.filter((u) => u.id !== msg.userId),
            };
          });
        }
        if (msg.type === "gameCountdownStarted") {
          console.log("Game countdown started");
          setShowCountdown(true);
        }
        if (msg.type === "gameStarted") {
          console.log("Game started:", msg.room);
          setShowCountdown(false);
          setState(msg.room);
        }
        if (msg.type === "roundCreated") {
          console.log("Round created:", msg.round);
          setState((prev) => {
            if (!prev) return null;

            // 同じIDのラウンドが既に存在する場合は追加しない（重複防止）
            const existingRound = prev.rounds.find(
              (r) => r.id === msg.round.id
            );
            if (existingRound) {
              console.log(
                "Round already exists, skipping addition:",
                msg.round.id
              );
              return prev;
            }

            console.log(
              "Adding round to state. Previous rounds:",
              prev.rounds.length
            );
            const newState = {
              ...prev,
              rounds: [...prev.rounds, msg.round],
            };
            console.log("New state rounds:", newState.rounds.length);
            return newState;
          });
        }
        if (msg.type === "topicSet") {
          console.log("Topic set:", msg.roundId, msg.topic);
          setState((prev) => {
            if (!prev) return null;
            console.log("Setting topic for round:", msg.roundId);
            const newState = {
              ...prev,
              rounds: prev.rounds.map((r) =>
                r.id === msg.roundId ? { ...r, topic: msg.topic } : r
              ),
            };
            console.log(
              "Updated rounds with topic:",
              newState.rounds.find((r) => r.id === msg.roundId)
            );
            return newState;
          });
        }
        if (msg.type === "answerSubmitted") {
          console.log(
            "Answer submitted:",
            msg.userId,
            "Total:",
            msg.totalAnswers,
            "/",
            msg.totalUsers
          );
          // 実際の回答状況で状態を更新
          setState((prev) => {
            if (!prev) return null;
            console.log("Updating answer status for round:", msg.roundId);
            const newState = {
              ...prev,
              rounds: prev.rounds.map((r) => {
                if (r.id === msg.roundId) {
                  // answersの数だけ更新（実際の回答内容は見せない）
                  const updatedAnswers = msg.answeredUserIds.map(
                    (userId, index) => ({
                      userId: userId,
                      value: "***", // 内容は隠す
                      submittedAt: Date.now(),
                    })
                  );
                  console.log("Updated answers:", updatedAnswers);
                  return { ...r, answers: updatedAnswers };
                }
                return r;
              }),
            };
            return newState;
          });
        }
        if (msg.type === "roundOpened") {
          console.log("Round opened:", msg.roundId, msg.answers);
          setState((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              rounds: prev.rounds.map((r) =>
                r.id === msg.roundId
                  ? { ...r, result: "opened", answers: msg.answers }
                  : r
              ),
            };
          });
        }
        if (msg.type === "resultJudged") {
          console.log("Result judged:", msg.roundId, msg.unanimous);
          setState((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              rounds: prev.rounds.map((r) =>
                r.id === msg.roundId ? { ...r, unanimous: msg.unanimous } : r
              ),
            };
          });
        }
        if (msg.type === "gameFinished") {
          console.log("Game finished:", msg.winCondition);
          console.log("Game finished room status:", msg.room.status);
          setState(msg.room);
          setToast("🎉 ゲーム終了！勝利条件を達成しました！");
        }
        if (msg.type === "settingsUpdated") {
          console.log("Settings updated:", msg.settings);
          setState((prev) =>
            prev ? { ...prev, settings: msg.settings } : null
          );
        }
        if (msg.type === "roomReset") {
          console.log("Room reset:", msg.message);
          setToast("ゲームがリセットされました");
          // 2秒後にページをリロードしてリセット状態を反映
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        }
        if (msg.type === "error") {
          console.error("WebSocket error:", msg.message);
          setToast(`エラー: ${msg.message}`);
        }
      } catch (e) {
        console.error("WebSocket message error:", e);
      }
    };

    ws.onclose = () => {
      console.log("WebSocket closed, attempting reconnect...");
      // simple retry
      setTimeout(() => {
        if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
          const newWs = connectWs(id);
          wsRef.current = newWs;
        }
      }, 1000);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [id]);

  // ページを離れる際やブラウザを閉じる際にユーザーを削除
  useEffect(() => {
    const handleBeforeUnload = () => {
      const userId = selfId || userIdStore.load(id);
      if (userId && state && !state.users.find(u => u.id === userId)?.isGM) {
        // GMではない場合のみ退出処理を実行
        leaveRoom(id, userId);
      }
    };

    const handleVisibilityChange = () => {
      // ページが非表示になった時の処理
      if (document.visibilityState === 'hidden') {
        const userId = selfId || userIdStore.load(id);
        if (userId && state && !state.users.find(u => u.id === userId)?.isGM) {
          leaveRoom(id, userId);
        }
      }
    };

    // イベントリスナーを追加
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // クリーンアップ
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [id, selfId, state]);

  const handleStartGame = async () => {
    const token = gmTokenStore.load(id);
    if (!token) {
      setToast("GM権限がありません");
      return;
    }

    try {
      await startGame(id, token);
      setToast("ゲームを開始しました");
    } catch (e) {
      if (e instanceof ApiError && e.body) {
        setToast(`ゲーム開始に失敗しました: ${e.body}`);
      } else {
        setToast("ゲーム開始に失敗しました");
      }
    }
  };

  const handleGoHome = () => {
    window.location.href = "/";
  };

  const handlePlayAgain = async () => {
    const token = gmTokenStore.load(id);
    if (!token) {
      setToast("GM権限がありません");
      return;
    }

    try {
      await resetRoom(id, token);
      setToast("ゲームをリセットしています...");
    } catch (e) {
      if (e instanceof ApiError && e.body) {
        setToast(`リセットに失敗しました: ${e.body}`);
      } else {
        setToast("リセットに失敗しました");
      }
    }
  };

  const handleToastClose = () => {
    setToast(null);
  };

  // 計算されたプロパティ
  const currentRound = useMemo(() => {
    if (!state) return null;
    return state.rounds.length > 0
      ? state.rounds[state.rounds.length - 1]
      : null;
  }, [state]);

  const isGM = gmTokenStore.load(id);

  console.log("Room render:", {
    status: state?.status,
    roundsLength: state?.rounds.length,
    currentRound: currentRound?.id,
  });

  if (!state) {
    return (
      <div className="container mx-auto p-4">
        <div className="text-center">読み込み中...</div>
      </div>
    );
  }

  return (
    <Expanded room={state}>
      {/* カウントダウン表示 */}
      {showCountdown && <GameStartCountdown />}

      {/* waiting中の画面 */}
      {state.status === "waiting" && (
        <>
          <UsersList users={state.users} selfId={selfId} />

          {/* ルーム設定 */}
          <RoomSettings state={state} setState={setState} setToast={setToast} />

          {/* ゲーム開始ボタン */}
          {isGM && (
            <div className="mt-6 flex justify-center">
              <AnimatedButton
                onClick={handleStartGame}
                variant="success"
                size="lg"
                className="font-medium px-6"
              >
                ゲーム開始
              </AnimatedButton>
            </div>
          )}
        </>
      )}

      {/* ゲーム進行画面 */}
      {state.status === "playing" && (
        <div className="space-y-6">
          <WinConditionDisplay state={state} />

          <RoundDisplay
            state={state}
            currentRound={currentRound}
            selfId={selfId}
            setToast={setToast}
          />
        </div>
      )}

      <GameFinished
        state={state}
        selfId={selfId}
        onGoHome={handleGoHome}
        onPlayAgain={handlePlayAgain}
      />

      <Toast message={toast} onClose={handleToastClose} />
    </Expanded>
  );
}
