import { useState } from "react";
import type { Room, Round } from "../../../shared/types";
import { gmTokenStore, setTopic, submitAnswer, openRound, judgeResult, createRound } from "../lib/api";
import { getIconPath } from "../lib/icons";

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
      {/* お題設定画面 */}
      {canSetTopic && (
        <div className="max-w-md mx-auto text-center space-y-6">
          <div className="text-xl font-medium text-gray-700">
            お題考え中...
          </div>
          
          <div className="space-y-4">
            <div className="text-base font-medium text-left">
              お題を設定してください
            </div>
            <input
              type="text"
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              className="w-full border rounded px-3 py-3 text-base text-center"
              placeholder="お題を入力..."
            />
            <button
              onClick={handleSetTopic}
              disabled={!topicInput.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-base px-4 py-3 rounded"
            >
              設定
            </button>
          </div>
        </div>
      )}

      {/* 回答入力画面 */}
      {currentRound.topic && !hasSubmittedAnswer && canSubmitAnswer && currentRound.result === "unopened" && (
        <div className="max-w-md mx-auto space-y-6">
          {/* お題表示（中央揃え） */}
          <div className="text-center">
            <div className="bg-blue-50 p-4 rounded">
              <div className="text-base text-blue-600 mb-2">お題</div>
              <div className="text-xl font-medium">{currentRound.topic}</div>
            </div>
          </div>

          {/* 回答入力（縦並び） */}
          <div className="space-y-4">
            <div className="text-base font-medium text-center">
              あなたの回答
            </div>
            <input
              type="text"
              value={answerInput}
              onChange={(e) => setAnswerInput(e.target.value)}
              className="w-full border rounded px-3 py-3 text-base text-center"
              placeholder="回答を入力..."
            />
            <button
              onClick={handleSubmitAnswer}
              disabled={!answerInput.trim() || submittingAnswer}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white text-base px-4 py-3 rounded"
            >
              {submittingAnswer ? "送信中..." : "送信"}
            </button>
          </div>
        </div>
      )}

      {/* 回答状況表示（お題がある場合は常に表示） */}
      {currentRound.topic && currentRound.result === "unopened" && (hasSubmittedAnswer || !canSubmitAnswer) && (
        <div className="space-y-6">
          {/* お題表示（中央揃え） */}
          <div className="text-center">
            <div className="bg-blue-50 p-4 rounded max-w-md mx-auto">
              <div className="text-base text-blue-600 mb-2">お題</div>
              <div className="text-xl font-medium">{currentRound.topic}</div>
            </div>
          </div>

          {/* 参加者のカード表示 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto pb-24">
            {state.users.map(user => {
              const hasAnswered = currentRound.answers.some(a => a.userId === user.id);
              return (
                <div 
                  key={user.id}
                  className={`p-4 rounded-lg border-2 ${
                    hasAnswered 
                      ? "bg-green-50 border-green-200" 
                      : "bg-gray-50 border-gray-200"
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <div className="text-2xl">
                      <img
                        src={`${getIconPath(user.icon)}`}
                        alt={typeof user.icon === "string" ? user.icon : `Icon ${user.icon}`}
                        className="w-8 h-8"
                      />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-base">{user.name}</div>
                      <div className={`text-sm ${
                        hasAnswered ? "text-green-600" : "text-gray-500"
                      }`}>
                        {hasAnswered ? "✓ 回答済み" : "回答待ち..."}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* GM以外のユーザーの回答状況表示 */}
      {!isGM && currentRound.topic && currentRound.result === "unopened" && (hasSubmittedAnswer || !canSubmitAnswer) && (
        <div className="text-center mt-6 pb-24">
          <div className="text-base text-gray-600">
            回答状況: {currentRound.answers.length} / {state.users.length} 人
          </div>
          <div className="mt-2">
            {state.users.map(user => (
              <span 
                key={user.id} 
                className={`inline-block w-3 h-3 rounded-full mr-1 ${
                  currentRound.answers.some(a => a.userId === user.id) 
                    ? "bg-green-500" 
                    : "bg-gray-300"
                }`}
                title={user.name}
              />
            ))}
          </div>
        </div>
      )}

      {/* GM操作: 固定表示（最下部） */}
      {isGM && currentRound.topic && currentRound.result === "unopened" && (hasSubmittedAnswer || !canSubmitAnswer) && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4">
          <div className="max-w-md mx-auto">
            <div className="text-center space-y-3">
              {/* 回答済み情報 */}
              <div className="text-base text-gray-600">
                ✓ 回答済み
              </div>

              {/* 回答状況と回答を公開ボタンの配置 */}
              <div className="flex items-center justify-center space-x-6">
                {/* 回答状況（左側） */}
                <div className="text-base text-gray-600">
                  {currentRound.answers.length} / {state.users.length} 人
                </div>

                {/* 回答を公開ボタン（中央） */}
                <button
                  onClick={handleOpenRound}
                  className="bg-orange-600 hover:bg-orange-700 text-white text-base px-6 py-3 rounded shadow-lg"
                >
                  回答を公開
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 回答結果表示 */}
      {currentRound.result === "opened" && (
        <div className="max-w-md mx-auto">
          {/* お題表示（中央揃え） */}
          <div className="text-center mb-6">
            <div className="bg-blue-50 p-4 rounded">
              <div className="text-base text-blue-600 mb-2">お題</div>
              <div className="text-xl font-medium">{currentRound.topic}</div>
            </div>
          </div>

          <div className="mb-6">
            <h4 className="font-medium mb-4 text-lg text-center">回答結果</h4>
            <div className="space-y-2">
              {state.users.map((user, index) => {
                const answer = currentRound.answers.find(a => a.userId === user.id);
                return (
                  <div key={index} className="flex justify-between p-3 bg-gray-50 rounded">
                    <span className="font-medium text-base">{user.name}</span>
                    <span className="text-base">
                      {answer ? answer.value : "未回答"}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* GM操作: 結果判定 */}
            {isGM && currentRound.unanimous === null && (
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => handleJudgeResult(true)}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white text-base px-4 py-3 rounded"
                >
                  全員一致
                </button>
                <button
                  onClick={() => handleJudgeResult(false)}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white text-base px-4 py-3 rounded"
                >
                  一致しなかった
                </button>
              </div>
            )}

            {/* 結果表示 */}
            {currentRound.unanimous !== null && (
              <div className={`mt-4 p-3 rounded text-base text-center ${
                currentRound.unanimous 
                  ? "bg-green-50 text-green-700" 
                  : "bg-red-50 text-red-700"
              }`}>
                {currentRound.unanimous ? "✓ 全員一致！" : "✗ 一致しませんでした"}
              </div>
            )}
          </div>
        </div>
      )}

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
