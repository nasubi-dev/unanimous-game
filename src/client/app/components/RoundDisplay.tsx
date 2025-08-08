import { useState } from "react";
import type { Room, Round } from "../../../shared/types";
import { gmTokenStore, setTopic, submitAnswer, openRound, judgeResult, createRound } from "../lib/api";

interface RoundDisplayProps {
  state: Room;
  currentRound: Round | null;
  selfId: string | null;
  setToast: (message: string | null) => void;
}

export function RoundDisplay({ state, currentRound, selfId, setToast }: RoundDisplayProps) {
  const [topicInput, setTopicInput] = useState("");
  const [answerInput, setAnswerInput] = useState("");
  const [submittingAnswer, setSubmittingAnswer] = useState(false);

  const isGM = gmTokenStore.load(state.id);
  
  // 計算されたプロパティ
  const canSetTopic = currentRound && !currentRound.topic && currentRound.setterId === selfId;
  const canSubmitAnswer = currentRound && currentRound.topic && !currentRound.answers.some(a => a.userId === selfId);
  const hasSubmittedAnswer = currentRound && currentRound.answers.some(a => a.userId === selfId);

  const handleSetTopic = async () => {
    if (!currentRound || !topicInput.trim()) return;
    try {
      await setTopic(state.id, currentRound.id, topicInput.trim(), selfId!);
      setTopicInput("");
      setToast("お題を設定しました");
    } catch (e) {
      setToast("お題の設定に失敗しました");
    }
  };

  const handleSubmitAnswer = async () => {
    if (!currentRound || !answerInput.trim() || !selfId) return;
    setSubmittingAnswer(true);
    try {
      await submitAnswer(state.id, currentRound.id, selfId, answerInput.trim());
      setAnswerInput("");
      setToast("回答を送信しました");
    } catch (e) {
      setToast("回答の送信に失敗しました");
    } finally {
      setSubmittingAnswer(false);
    }
  };

  const handleOpenRound = async () => {
    if (!currentRound || !isGM) return;
    try {
      await openRound(state.id, currentRound.id, isGM);
      setToast("回答を公開しました");
    } catch (e) {
      setToast("回答の公開に失敗しました");
    }
  };

  const handleJudgeResult = async (unanimous: boolean) => {
    if (!currentRound || !isGM) return;
    try {
      await judgeResult(state.id, currentRound.id, unanimous, isGM);
      setToast(unanimous ? "全員一致と判定しました" : "一致しなかったと判定しました");
    } catch (e) {
      setToast("結果の判定に失敗しました");
    }
  };

  const handleCreateRound = async () => {
    if (!isGM) return;
    try {
      await createRound(state.id, isGM);
      setToast("新しいラウンドを開始しました");
    } catch (e) {
      setToast("ラウンドの開始に失敗しました");
    }
  };

  if (!currentRound) {
    return (
      <div className="text-center p-8 text-lg text-gray-500">
        ラウンドを準備中...
      </div>
    );
  }

  return (
    <>
      <div className="p-4 border rounded-lg">
        <h3 className="font-medium mb-3 text-lg">
          ラウンド {state.rounds.length} 
          {currentRound.result === "opened" ? " (結果発表)" : ""}
        </h3>

        {/* お題設定 */}
        {canSetTopic && (
          <div className="mb-4">
            <label className="block text-base font-medium mb-2">
              お題を設定してください
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                className="flex-1 border rounded px-3 py-3 text-base"
                placeholder="お題を入力..."
              />
              <button
                onClick={handleSetTopic}
                disabled={!topicInput.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-base px-4 py-3 rounded"
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
              <span className="text-base text-blue-600 dark:text-blue-400">お題</span>
              <div className="text-xl font-medium">{currentRound.topic}</div>
            </div>
          </div>
        )}

        {/* 回答入力 */}
        {canSubmitAnswer && !hasSubmittedAnswer && (
          <div className="mb-4">
            <label className="block text-base font-medium mb-2">
              あなたの回答
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={answerInput}
                onChange={(e) => setAnswerInput(e.target.value)}
                className="flex-1 border rounded px-3 py-3 text-base"
                placeholder="回答を入力..."
              />
              <button
                onClick={handleSubmitAnswer}
                disabled={!answerInput.trim() || submittingAnswer}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white text-base px-4 py-3 rounded"
              >
                {submittingAnswer ? "送信中..." : "送信"}
              </button>
            </div>
          </div>
        )}

        {/* 回答済み表示 */}
        {hasSubmittedAnswer && currentRound.result === "unopened" && (
          <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 rounded">
            <span className="text-green-600 dark:text-green-400 text-base">✓ 回答済み</span>
          </div>
        )}

        {/* 回答状況 */}
        {currentRound.topic && (
          <div className="mb-4">
            <div className="text-base text-gray-600 dark:text-gray-400">
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
              className="bg-orange-600 hover:bg-orange-700 text-white text-base px-4 py-3 rounded"
            >
              回答を公開
            </button>
          </div>
        )}

        {/* 回答結果表示 */}
        {currentRound.result === "opened" && (
          <div className="mb-4">
            <h4 className="font-medium mb-2 text-lg">回答結果</h4>
            <div className="space-y-2">
              {currentRound.answers.map((answer, index) => {
                const user = state.users.find(u => u.id === answer.userId);
                return (
                  <div key={index} className="flex justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded">
                    <span className="font-medium text-base">{user?.name || "不明"}</span>
                    <span className="text-base">{answer.value}</span>
                  </div>
                );
              })}
            </div>

            {/* GM操作: 結果判定 */}
            {isGM && currentRound.unanimous === null && (
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => handleJudgeResult(true)}
                  className="bg-green-600 hover:bg-green-700 text-white text-base px-4 py-3 rounded"
                >
                  全員一致
                </button>
                <button
                  onClick={() => handleJudgeResult(false)}
                  className="bg-red-600 hover:bg-red-700 text-white text-base px-4 py-3 rounded"
                >
                  一致しなかった
                </button>
              </div>
            )}

            {/* 結果表示 */}
            {currentRound.unanimous !== null && (
              <div className={`mt-4 p-3 rounded text-base ${
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

      {/* 次のラウンドボタン（ゲーム終了していない場合のみ） */}
      {(state.status as any) !== "finished" && currentRound && currentRound.result === "opened" && currentRound.unanimous !== null && isGM && (
        <div className="text-center">
          <button
            onClick={handleCreateRound}
            className="bg-blue-600 hover:bg-blue-700 text-white text-lg px-6 py-4 rounded font-medium"
          >
            次のラウンドを始める
          </button>
        </div>
      )}
    </>
  );
}
