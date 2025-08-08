import { useEffect, useRef, useState, useMemo } from "react";
import { useParams } from "react-router";
import { 
  ApiError, 
  connectWs, 
  getRoomState, 
  gmTokenStore, 
  updateSettings, 
  userIdStore,
  startGame,
  createRound,
  setTopic,
  submitAnswer,
  openRound,
  judgeResult
} from "../lib/api";
import type { Room, Round, ServerMessage } from "../../../shared/types";

export function meta() {
  return [{ title: "Room" }];
}

export default function Room() {
  const params = useParams();
  const id = params.id!;
  const [state, setState] = useState<Room | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selfId, setSelfId] = useState<string | null>(null);

  // ゲーム関連の状態
  const [topicInput, setTopicInput] = useState("");
  const [answerInput, setAnswerInput] = useState("");
  const [submittingAnswer, setSubmittingAnswer] = useState(false);

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
    
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as ServerMessage;
        console.log("WebSocket message received:", msg);
        
        if (msg.type === "state") {
          console.log("Updating state from WebSocket:", msg.room);
          setState(msg.room);
        }
        if (msg.type === "userJoined") {
          console.log("User joined:", msg.user);
          setState((prev) => prev ? ({
            ...prev,
            users: [...prev.users, msg.user],
          }) : null);
        }
        if (msg.type === "gameStarted") {
          console.log("Game started:", msg.room);
          setState(msg.room);
        }
        if (msg.type === "roundCreated") {
          console.log("Round created:", msg.round);
          setState((prev) => {
            if (!prev) return null;
            console.log("Adding round to state. Previous rounds:", prev.rounds.length);
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
              rounds: prev.rounds.map(r => 
                r.id === msg.roundId ? { ...r, topic: msg.topic } : r
              ),
            };
            console.log("Updated rounds with topic:", newState.rounds.find(r => r.id === msg.roundId));
            return newState;
          });
        }
        if (msg.type === "answerSubmitted") {
          console.log("Answer submitted:", msg.userId, "Total:", msg.totalAnswers, "/", msg.totalUsers);
          // 実際の回答状況で状態を更新
          setState((prev) => {
            if (!prev) return null;
            console.log("Updating answer status for round:", msg.roundId);
            const newState = {
              ...prev,
              rounds: prev.rounds.map(r => {
                if (r.id === msg.roundId) {
                  // answersの数だけ更新（実際の回答内容は見せない）
                  const updatedAnswers = msg.answeredUserIds.map((userId, index) => ({
                    userId: userId,
                    value: "***", // 内容は隠す
                    submittedAt: Date.now()
                  }));
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
              rounds: prev.rounds.map(r => 
                r.id === msg.roundId ? { ...r, result: "opened", answers: msg.answers } : r
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
              rounds: prev.rounds.map(r => 
                r.id === msg.roundId ? { ...r, unanimous: msg.unanimous } : r
              ),
            };
          });
        }
        if (msg.type === "settingsUpdated") {
          console.log("Settings updated:", msg.settings);
          setState((prev) => prev ? ({ ...prev, settings: msg.settings }) : null);
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
      }
    };
  }, [id]);

  // ヘルパー関数
  const isGM = !!gmTokenStore.load(id);
  
  // より明確なcurrentRoundの選択ロジック
  const currentRound = useMemo(() => {
    if (!state?.rounds || state.rounds.length === 0) return null;
    
    // 未開封のラウンドを優先
    const unopenedRound = state.rounds.find(r => r.result === "unopened");
    if (unopenedRound) return unopenedRound;
    
    // 未開封がなければ最新のラウンド
    return state.rounds[state.rounds.length - 1];
  }, [state?.rounds]);
  
  const canSetTopic = useMemo(() => {
    return currentRound && currentRound.setterId === selfId && !currentRound.topic;
  }, [currentRound, selfId]);
  
  const canSubmitAnswer = useMemo(() => {
    return currentRound && currentRound.topic && currentRound.result === "unopened";
  }, [currentRound]);
  
  const hasSubmittedAnswer = useMemo(() => {
    return currentRound?.answers.some(a => a.userId === selfId) || false;
  }, [currentRound?.answers, selfId]);

  console.log("Render state:", {
    status: state?.status,
    roundsCount: state?.rounds?.length,
    currentRound: currentRound ? {
      id: currentRound.id,
      topic: currentRound.topic,
      result: currentRound.result,
      answersCount: currentRound.answers.length
    } : null,
    isGM,
    selfId
  });

  // ゲーム関連のハンドラー
  const handleStartGame = async () => {
    const token = gmTokenStore.load(id);
    if (!token || !state) return;
    
    try {
      await startGame(state.id, token);
      setToast("ゲームを開始しました");
    } catch (e) {
      const err = e as ApiError;
      setToast(err.status === 403 ? "GM権限がありません" : "ゲーム開始に失敗しました");
    }
  };

  const handleCreateRound = async () => {
    const token = gmTokenStore.load(id);
    if (!token || !state) return;
    
    try {
      await createRound(state.id, token);
      setToast("新しいラウンドを作成しました");
    } catch (e) {
      const err = e as ApiError;
      setToast("ラウンド作成に失敗しました");
    }
  };

  const handleSetTopic = async () => {
    if (!currentRound || !selfId || !topicInput.trim()) return;
    
    try {
      await setTopic(id, currentRound.id, topicInput.trim(), selfId);
      setTopicInput("");
      setToast("お題を設定しました");
    } catch (e) {
      const err = e as ApiError;
      setToast("お題設定に失敗しました");
    }
  };

  const handleSubmitAnswer = async () => {
    if (!currentRound || !selfId || !answerInput.trim()) return;
    
    setSubmittingAnswer(true);
    try {
      await submitAnswer(id, currentRound.id, selfId, answerInput.trim());
      setAnswerInput("");
      setToast("回答を送信しました");
    } catch (e) {
      const err = e as ApiError;
      setToast("回答送信に失敗しました");
    } finally {
      setSubmittingAnswer(false);
    }
  };

  const handleOpenRound = async () => {
    const token = gmTokenStore.load(id);
    if (!token || !currentRound) return;
    
    try {
      await openRound(id, currentRound.id, token);
      setToast("回答を公開しました");
    } catch (e) {
      const err = e as ApiError;
      setToast("回答公開に失敗しました");
    }
  };

  const handleJudgeResult = async (unanimous: boolean) => {
    const token = gmTokenStore.load(id);
    if (!token || !currentRound) return;
    
    try {
      await judgeResult(id, currentRound.id, unanimous, token);
      setToast(unanimous ? "全員一致と判定しました" : "一致しなかったと判定しました");
    } catch (e) {
      const err = e as ApiError;
      setToast("結果判定に失敗しました");
    }
  };

  if (!state) return <div className="p-4">Loading...</div>;
  return (
    <div className="p-4">
      {toast && (
        <div className="mb-3 inline-block bg-red-600 text-white text-sm px-3 py-2 rounded">
          {toast}
        </div>
      )}
      <h1 className="text-2xl font-semibold">Room #{state.id}</h1>
      <h2 className="mt-4 mb-2 font-medium">Users</h2>
      <ul className="space-y-1">
        {state.users?.map((u: any) => (
          <li key={u.id} className="flex items-center gap-2">
            <span className={selfId === u.id ? "me" : undefined}>{u.name}</span>
            {u.isGM && (
              <span className="text-[10px] bg-amber-500 text-white rounded px-1 py-0.5 uppercase tracking-wide">
                GM
              </span>
            )}
          </li>
        ))}
      </ul>

      {/* ルーム設定（waiting中のみ） */}
      {state.status === "waiting" && (
        <div className="mt-6 p-4 rounded border border-gray-200 dark:border-gray-700 max-w-xl">
          <h3 className="font-medium mb-3">ルーム設定{gmTokenStore.load(state.id) ? "（GM専用）" : ""}</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm mb-1">お題の出題者</label>
              <div className="flex items-center gap-4">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="topicMode"
                    checked={state.settings?.topicMode === "gm"}
                    onChange={() => setState((s) => s ? ({ ...s, settings: { ...s.settings, topicMode: "gm" } }) : null)}
                    disabled={!gmTokenStore.load(state.id)}
                  />
                  <span>GMが決める</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="topicMode"
                    checked={state.settings?.topicMode === "all"}
                    onChange={() => setState((s) => s ? ({ ...s, settings: { ...s.settings, topicMode: "all" } }) : null)}
                    disabled={!gmTokenStore.load(state.id)}
                  />
                  <span>全員一周する</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm mb-1">勝利条件</label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <select
                    value={state.settings?.winCondition?.type}
                    onChange={(e) => {
                      const t = e.target.value as "count" | "consecutive" | "none";
                      setState((s) => s ? ({
                        ...s,
                        settings: {
                          ...s.settings,
                          winCondition: t === "none" ? { type: "none" } : { type: t, value: s.settings?.winCondition && s.settings.winCondition.type !== "none" ? s.settings.winCondition.value : 1 },
                        },
                      }) : null);
                    }}
                    className="border rounded p-2"
                    disabled={!gmTokenStore.load(state.id)}
                  >
                    <option value="count">n回一致クリア</option>
                    <option value="consecutive">n回連続一致</option>
                    <option value="none">勝利条件なし</option>
                  </select>
                  {state.settings?.winCondition?.type !== "none" && (
                    <input
                      type="number"
                      min={1}
                      value={state.settings.winCondition.value}
                      onChange={(e) =>
                        setState((s) => s ? ({
                          ...s,
                          settings: {
                            ...s.settings,
                            winCondition: {
                              type: s.settings?.winCondition?.type as "count" | "consecutive",
                              value: Math.max(1, Number(e.target.value || 1)),
                            },
                          },
                        }) : null)
                      }
                      className="w-20 border rounded p-2"
                      disabled={!gmTokenStore.load(state.id)}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="pt-2">
              {gmTokenStore.load(state.id) && (
                <button
                  disabled={saving}
                  onClick={async () => {
                    const token = gmTokenStore.load(state.id);
                    if (!token) {
                      setToast("GM権限がありません");
                      return;
                    }
                    setSaving(true);
                    try {
                      await updateSettings(state.id, {
                        gmToken: token,
                        settings: state.settings,
                      });
                      setToast("設定を保存しました");
                    } catch (e) {
                      const err = e as ApiError;
                      setToast(err.status === 403 ? "GM権限がありません (403)" : "設定の保存に失敗しました");
                    } finally {
                      setSaving(false);
                    }
                  }}
                  className={`rounded px-4 py-2 text-white ${
                    saving ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  設定を保存
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ゲーム開始ボタン */}
      {state.status === "waiting" && isGM && (
        <div className="mt-6">
          <button
            onClick={handleStartGame}
            className="bg-green-600 hover:bg-green-700 text-white rounded px-6 py-3 font-medium"
          >
            ゲーム開始
          </button>
        </div>
      )}

      {/* ゲーム進行画面 */}
      {state.status === "playing" && (
        <div className="mt-6 space-y-6">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            デバッグ: status={state.status}, rounds={state.rounds.length}, currentRound={currentRound?.id || 'none'}
          </div>
          
          {/* 現在のラウンド */}
          {currentRound ? (
            <div className="p-4 border rounded-lg">
              <h3 className="font-medium mb-3">
                ラウンド {state.rounds.length} 
                {currentRound.result === "opened" ? " (結果発表)" : ""}
              </h3>

              {/* お題設定 */}
              {canSetTopic && (
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">
                    お題を設定してください
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={topicInput}
                      onChange={(e) => setTopicInput(e.target.value)}
                      className="flex-1 border rounded px-3 py-2"
                      placeholder="お題を入力..."
                    />
                    <button
                      onClick={handleSetTopic}
                      disabled={!topicInput.trim()}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded"
                    >
                      設定
                    </button>
                  </div>
                </div>
              )}

              {/* お題表示 */}
              {currentRound.topic && (
                <div className="mb-4">
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
                    <span className="text-sm text-blue-600 dark:text-blue-400">お題</span>
                    <div className="text-lg font-medium">{currentRound.topic}</div>
                  </div>
                </div>
              )}

              {/* 回答入力 */}
              {canSubmitAnswer && !hasSubmittedAnswer && (
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">
                    あなたの回答
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={answerInput}
                      onChange={(e) => setAnswerInput(e.target.value)}
                      className="flex-1 border rounded px-3 py-2"
                      placeholder="回答を入力..."
                    />
                    <button
                      onClick={handleSubmitAnswer}
                      disabled={!answerInput.trim() || submittingAnswer}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded"
                    >
                      {submittingAnswer ? "送信中..." : "送信"}
                    </button>
                  </div>
                </div>
              )}

              {/* 回答済み表示 */}
              {hasSubmittedAnswer && currentRound.result === "unopened" && (
                <div className="mb-4">
                  <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded text-green-700 dark:text-green-300">
                    ✓ 回答を送信しました
                  </div>
                </div>
              )}

              {/* 回答状況 */}
              {currentRound.topic && (
                <div className="mb-4">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    回答状況: {currentRound.answers.length} / {state.users.length} 人
                  </div>
                  <div className="mt-1">
                    {state.users.map(user => (
                      <span 
                        key={user.id} 
                        className={`inline-block w-3 h-3 rounded-full mr-1 ${
                          currentRound.answers.some(a => a.userId === user.id) 
                            ? "bg-green-500" 
                            : "bg-gray-300 dark:bg-gray-600"
                        }`}
                        title={user.name}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* GM操作: 回答オープン */}
              {isGM && currentRound.topic && currentRound.result === "unopened" && (
                <div className="mb-4">
                  <button
                    onClick={handleOpenRound}
                    className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded"
                  >
                    回答を公開
                  </button>
                </div>
              )}

              {/* 回答結果表示 */}
              {currentRound.result === "opened" && (
                <div className="mb-4">
                  <h4 className="font-medium mb-2">回答結果</h4>
                  <div className="space-y-2">
                    {currentRound.answers.map((answer, index) => {
                      const user = state.users.find(u => u.id === answer.userId);
                      return (
                        <div key={index} className="flex justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                          <span className="font-medium">{user?.name || "不明"}</span>
                          <span>{answer.value}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* GM操作: 結果判定 */}
                  {isGM && currentRound.unanimous === null && (
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => handleJudgeResult(true)}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
                      >
                        全員一致
                      </button>
                      <button
                        onClick={() => handleJudgeResult(false)}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
                      >
                        一致しなかった
                      </button>
                    </div>
                  )}

                  {/* 結果表示 */}
                  {currentRound.unanimous !== null && (
                    <div className={`mt-4 p-3 rounded ${
                      currentRound.unanimous 
                        ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300" 
                        : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"
                    }`}>
                      {currentRound.unanimous ? "✓ 全員一致！" : "✗ 一致しませんでした"}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* ラウンドがない場合の新しいラウンド作成 */
            isGM && (
              <div className="text-center">
                <button
                  onClick={handleCreateRound}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded font-medium"
                >
                  最初のラウンドを始める
                </button>
              </div>
            )
          )}

          {/* 次のラウンドボタン */}
          {currentRound && currentRound.result === "opened" && currentRound.unanimous !== null && isGM && (
            <div className="text-center">
              <button
                onClick={handleCreateRound}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded font-medium"
              >
                次のラウンドを始める
              </button>
            </div>
          )}
        </div>
      )}

      {/* 自分のユーザー名をハイライト */}
      <style>{`.me { background: color-mix(in oklab, var(--color-amber-500, #f59e0b) 20%, transparent); padding: 2px 4px; border-radius: 4px; }`}</style>
    </div>
  );
}
