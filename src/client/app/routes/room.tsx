import { useEffect, useRef, useState, useMemo } from "react";
import { useParams } from "react-router";
import {
  ApiError,
  connectWs,
  getRoomState,
  gmTokenStore,
  userIdStore,
  joinRoom,
  startGame,
  resetRoom,
  leaveRoom,
  gmReturnHome,
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
  return [
    { title: "ルーム - 全員一致ゲーム - nasubi.dev" },
    { name: "description", content: "全員一致ゲームのルーム画面。仲間と一緒にお題に挑戦しよう！" },
    { property: "og:title", content: "ルーム - 全員一致ゲーム - nasubi.dev" },
    { property: "og:description", content: "全員一致ゲームのルーム画面。仲間と一緒にお題に挑戦しよう！" },
    { property: "og:image", content: "https://zennin-icchi.nasubi.dev/ogp/normal.png" },
    { name: "twitter:title", content: "ルーム - 全員一致ゲーム - nasubi.dev" },
    { name: "twitter:description", content: "全員一致ゲームのルーム画面。仲間と一緒にお題に挑戦しよう！" },
    { name: "twitter:image", content: "https://zennin-icchi.nasubi.dev/ogp/twitter.png" },
  ];
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

    // --- WebSocket 接続管理 ---------------------------------------------
    // 以前は close のたびに無条件で1秒後に再接続しており、
    // サーバがアイドルで部屋を畳んでも即座に叩き起こしてしまっていた。
    // ここでは「サーバが意図的に閉じた場合は再接続しない」「それ以外は指数バックオフ」
    // 「非表示中は再接続しない」の3点で、無駄な Durable Object の起動を止める。
    let disposed = false;
    let retry = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let rejoining = false;
    const isHidden = () => document.visibilityState === "hidden";

    /** バックグラウンド復帰などで自分が部屋から消えていたら入り直す */
    const ensureMembership = async (room: Room) => {
      const userId = userIdStore.load(id);
      if (!userId) return; // そもそもこの部屋に参加していない
      if (room.users.some((u) => u.id === userId)) return; // 在籍中
      if (rejoining) return;
      rejoining = true;
      try {
        const name = localStorage.getItem("playerName");
        if (!name) return;
        const iconRaw = localStorage.getItem("playerIcon");
        let icon: string | number = 1;
        try {
          icon = iconRaw ? JSON.parse(iconRaw) : 1;
        } catch {
          icon = 1;
        }
        const jr = await joinRoom(id, { name, icon, rejoin: true });
        userIdStore.save(id, jr.userId);
        setSelfId(jr.userId);
        identify(jr.userId);
      } catch {
        /* 部屋がもう無い場合などは何もしない */
      } finally {
        rejoining = false;
      }
    };

    const identify = (userId: string) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "identify", userId }));
      }
    };

    const handleMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage;

        if (msg.type === "state") {
          setState(msg.room);
          void ensureMembership(msg.room);
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
          console.log("Game finished:", msg.gameResult);
          console.log("Game finished room status:", msg.room.status);
          setState(msg.room);
          if (msg.gameResult === "lose") {
            setToast("😢 ゲーム終了。勝利条件を達成できませんでした");
          } else if (msg.gameResult === "win") {
            setToast("🎉 ゲーム終了！勝利条件を達成しました！");
          } else {
            setToast("ゲーム終了");
          }
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
        if (msg.type === "gmReturnedHome") {
          console.log("GM returned home, redirecting to top page...");
          setToast("GMがトップに戻りました");
          // 1秒後にトップページにリダイレクト
          setTimeout(() => {
            window.location.href = "/";
          }, 1000);
        }
        if (msg.type === "error") {
          console.error("WebSocket error:", msg.message);
          setToast(`エラー: ${msg.message}`);
        }
      } catch (e) {
        console.error("WebSocket message error:", e);
      }
    };

    const open = () => {
      if (disposed) return;
      const ws = connectWs(id);
      wsRef.current = ws;

      ws.onopen = () => {
        retry = 0;
        const userId = userIdStore.load(id);
        if (userId) identify(userId);
      };

      ws.onmessage = handleMessage;

      ws.onerror = () => {
        /* close で後始末される */
      };

      ws.onclose = async (ev) => {
        if (disposed) return;
        // サーバが部屋を畳んだ／自分から抜けた場合は再接続しない
        if (
          ev.code === 1000 &&
          (ev.reason === "room_closed" || ev.reason === "leave")
        ) {
          if (ev.reason === "room_closed") setToast("ルームが終了しました");
          return;
        }
        // 非表示中は再接続しない（復帰時に visibilitychange で張り直す）
        if (isHidden()) return;
        if (retry >= 6) return;

        // 部屋がもう存在しないなら再接続しない。
        // 旧実装はここで無条件に再接続しており、サーバがアイドルで畳んだ部屋を
        // そのたびに叩き起こしていた。
        try {
          if ((await fetch(`/api/rooms/${id}/state`)).status === 404) {
            setToast("ルームが終了しました");
            return;
          }
        } catch {
          /* ネットワーク断のときは再接続を試す */
        }
        if (disposed || isHidden()) return;

        const delay = Math.min(30000, 1000 * 2 ** retry) + Math.random() * 500;
        retry++;
        retryTimer = setTimeout(open, delay);
      };
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      const ws = wsRef.current;
      if (
        !ws ||
        ws.readyState === WebSocket.CLOSED ||
        ws.readyState === WebSocket.CLOSING
      ) {
        retry = 0;
        open();
      }
    };

    // 注: バックグラウンド遷移では意図的に何もしない。
    // 以前は visibilitychange で leaveRoom() を呼び、そこで新しい WebSocket を
    // 張っていたため、スマホでホームに戻るたびに Durable Object を起こして
    // アイドルタイマーを再延長していた。ハイバネーション対応後は接続を
    // 開けたままでも課金されないので、そのまま維持するのが最も安く、UXも良い。
    // タブを閉じた場合はブラウザが接続を切り、サーバ側の close ハンドラが退出扱いにする。

    open();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      const userId = userIdStore.load(id);
      if (userId) leaveRoom(wsRef.current, userId);
      else wsRef.current?.close(1000, "leave");
      wsRef.current = null;
    };
  }, [id]);

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

  const handleGoHome = async () => {
    const token = gmTokenStore.load(id);
    if (!token) {
      setToast("GM権限がありません");
      return;
    }

    try {
      await gmReturnHome(id, token);
      setToast("トップに戻ります...");
    } catch (e) {
      if (e instanceof ApiError && e.body) {
        setToast(`処理に失敗しました: ${e.body}`);
      } else {
        setToast("処理に失敗しました");
      }
    }
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
          <UsersList
            users={state.users}
            selfId={selfId}
            awayUserIds={state.awayUserIds}
          />

          {/* ルーム設定 */}
          <RoomSettings state={state} setState={setState} setToast={setToast} />

          {/* ゲーム開始ボタン */}
          {isGM && (
            <div className="mt-6 flex flex-col items-center gap-2">
              <AnimatedButton
                onClick={handleStartGame}
                variant="success"
                size="lg"
                className="font-medium px-6"
                disabled={state.users.length < 2}
              >
                ゲーム開始
              </AnimatedButton>
              {state.users.length < 2 && (
                <p className="text-sm text-red-500">
                  ゲームを開始するには2人以上のプレイヤーが必要です
                </p>
              )}
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
