import { useState, useRef, useEffect } from "react";
import type { Room, Round } from "../../../shared/types";
import {
  gmTokenStore,
  setTopic,
  submitAnswer,
  openRound,
  judgeResult,
  createRound,
} from "../lib/api";
import { UserCard, TopicDisplay, AnswerInput, GMControls, AnimatedButton } from "./";
import { useAnswerReveal } from "../lib/useAnimations";
import { getRandomTopic } from "../lib/topics";

interface RoundDisplayProps {
  state: Room;
  currentRound: Round | null;
  selfId: string | null;
  setToast: (message: string | null) => void;
}

export function RoundDisplay({
  state,
  currentRound,
  selfId,
  setToast,
}: RoundDisplayProps) {
  const [topicInput, setTopicInput] = useState("");
  const topicInputRef = useRef<HTMLInputElement>(null);
  const [animationExecuted, setAnimationExecuted] = useState<string | null>(null);

  // 回答公開アニメーション用のフック
  const { containerRef: answersContainerRef, revealAnswers } = useAnswerReveal<HTMLDivElement>();

  const isGM = gmTokenStore.load(state.id);

  // 回答が公開されたときのアニメーション実行（一度だけ）
  useEffect(() => {
    if (currentRound?.result === "opened" && currentRound.id !== animationExecuted) {
      // このラウンドでまだアニメーションが実行されていない場合のみ実行
      if (revealAnswers) {
        revealAnswers('.answer-card', 0.5, 0.4);
        setAnimationExecuted(currentRound.id);
      }
    }
  }, [currentRound?.result, currentRound?.id, revealAnswers, animationExecuted]);

  // 新しいラウンドが始まったときにアニメーション実行フラグをリセット
  useEffect(() => {
    if (currentRound?.result === "unopened") {
      setAnimationExecuted(null);
    }
  }, [currentRound?.result]);

  // 計算されたプロパティ
  const canSetTopic =
    currentRound && !currentRound.topic && currentRound.setterId === selfId;
  const canSubmitAnswer =
    currentRound &&
    currentRound.topic &&
    !currentRound.answers.some((a) => a.userId === selfId);
  const hasSubmittedAnswer =
    currentRound && currentRound.answers.some((a) => a.userId === selfId);

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

  const handleUseAppTopic = () => {
    const randomTopic = getRandomTopic();
    setTopicInput(randomTopic);
    // フォーカスを設定して、ユーザーが編集可能にする
    setTimeout(() => {
      topicInputRef.current?.focus();
    }, 0);
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
      {/* ラウンド数表示 */}
      <div className="text-center mb-4">
        <div className="inline-block bg-violet-100 px-4 py-2 rounded-full">
          <span className="text-violet-700 font-semibold">
            Round {state.rounds.length}
            {state.settings?.maxRounds && (
              <span className="text-violet-500 ml-1">/ {state.settings.maxRounds}</span>
            )}
          </span>
        </div>
      </div>

      {/* お題考案者以外への待機画面 */}
      {currentRound &&
        !currentRound.topic &&
        currentRound.setterId !== selfId && (
          <div className="max-w-md mx-auto text-center space-y-6">
            <div className="text-xl font-medium text-gray-700">
              {state.users.find((u) => u.id === currentRound.setterId)?.name ||
                "誰か"}
              さんが
            </div>
            <div className="text-2xl font-bold text-violet-600 animate-pulse">
              お題を考え中...
            </div>
            <div className="text-sm text-gray-500">しばらくお待ちください</div>
          </div>
        )}

      {/* お題設定画面 */}
      {canSetTopic && (
        <div className="max-w-md mx-auto text-center space-y-6">
          <div className="text-xl font-medium text-gray-700">お題考え中...</div>

          <div className="space-y-4">
            <div className="text-base font-medium text-left">
              お題を設定してください
            </div>
            
            {/* アプリ内のお題を使うボタン */}
            <div className="mb-3">
              <AnimatedButton
                onClick={handleUseAppTopic}
                size="sm"
                className="w-[300px] text-sm border-2 border-violet-200 hover:border-violet-300 bg-violet-50 hover:bg-violet-100 text-violet-700 transition-all duration-200 focus:ring-violet-300"
              >
                🎲 アプリ内のお題を使う
              </AnimatedButton>
            </div>

            <input
              ref={topicInputRef}
              type="text"
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && topicInput.trim()) {
                  handleSetTopic();
                }
              }}
              className="w-full border rounded px-3 py-3 text-base text-center"
              placeholder="お題を入力..."
              autoFocus
            />
            <AnimatedButton
              onClick={handleSetTopic}
              disabled={!topicInput.trim()}
              variant="primary"
              className="w-full disabled:bg-gray-400 disabled:hover:bg-gray-400"
            >
              設定
            </AnimatedButton>
          </div>
        </div>
      )}

      {/* 回答入力画面 */}
      {currentRound.topic &&
        !hasSubmittedAnswer &&
        canSubmitAnswer &&
        currentRound.result === "unopened" && (
          <div className="max-w-md mx-auto space-y-6">
            {/* お題表示 */}
            <TopicDisplay topic={currentRound.topic} />

            {/* 回答状況表示（回答入力中でも表示） */}
            {currentRound.answers.length > 0 && (
              <div className="bg-gray-50 p-4 rounded">
                <div className="text-sm text-gray-600 text-center">
                  回答済み ({currentRound.answers.length}/{state.users.length}
                  人)
                </div>
              </div>
            )}

            {/* 回答入力 */}
            <AnswerInput
              onSubmit={async (answer) => {
                if (!currentRound || !selfId) return;
                await submitAnswer(state.id, currentRound.id, selfId, answer);
                setToast("回答を送信しました");
              }}
            />
          </div>
        )}

      {/* 回答状況表示（お題がある場合は常に表示） */}
      {currentRound.topic &&
        currentRound.result === "unopened" &&
        (hasSubmittedAnswer || !canSubmitAnswer) && (
          <div className="space-y-6">
            {/* お題表示 */}
            <TopicDisplay topic={currentRound.topic} />

            {/* 参加者のカード表示 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto pb-24 pt-6">
              {state.users.map((user) => {
                const hasAnswered = currentRound.answers.some(
                  (a) => a.userId === user.id
                );
                return (
                  <UserCard
                    key={user.id}
                    user={user}
                    hasAnswered={hasAnswered}
                  />
                );
              })}
            </div>
          </div>
        )}

      {/* GM操作: 固定表示（最下部） */}
      {isGM &&
        currentRound.topic &&
        currentRound.result === "unopened" &&
        (hasSubmittedAnswer || !canSubmitAnswer) && (
          <GMControls
            answeredCount={currentRound.answers.length}
            totalCount={state.users.length}
            onOpenRound={async () => {
              await openRound(state.id, currentRound.id, isGM);
            }}
            fixed={true}
          />
        )}

      {/* 回答結果表示 */}
      {currentRound.result === "opened" && (
        <div className="space-y-6">
          {/* お題表示 */}
          <TopicDisplay topic={currentRound.topic} />

          <div className="mb-6">
            <h4 className="font-medium mb-6 text-lg text-center">回答結果</h4>
            <div 
              ref={answersContainerRef}
              className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto pt-2"
              style={{ perspective: '1000px' }}
            >
              {state.users.map((user) => {
                const answer = currentRound.answers.find(
                  (a) => a.userId === user.id
                );
                return (
                  <div 
                    key={user.id} 
                    className="answer-card"
                    style={{ 
                      opacity: 0,
                      transform: 'rotateY(-180deg)',
                      transformStyle: 'preserve-3d'
                    }}
                  >
                    <UserCard
                      user={user}
                      answer={answer?.value}
                      mode="result"
                    />
                  </div>
                );
              })}
            </div>

            {/* GM操作と結果表示 */}
            <div className="max-w-2xl mx-auto">
              {isGM && (
                <div className="mt-4">
                  <GMControls
                    answeredCount={currentRound.answers.length}
                    totalCount={state.users.length}
                    onOpenRound={async () => {}} // 使用しない
                    onJudgeResult={async (unanimous) => {
                      await judgeResult(
                        state.id,
                        currentRound.id,
                        unanimous,
                        isGM
                      );
                      setToast(
                        unanimous
                          ? "全員一致と判定しました"
                          : "一致しなかったと判定しました"
                      );
                    }}
                    showJudgeButtons={true}
                    unanimous={currentRound.unanimous}
                  />
                </div>
              )}

              {/* 非GM用の結果表示 */}
              {!isGM && currentRound.unanimous !== null && (
                <div
                  className={`mt-4 p-3 rounded text-base text-center ${
                    currentRound.unanimous
                      ? "bg-green-50 text-green-700"
                      : "bg-red-50 text-red-700"
                  }`}
                >
                  {currentRound.unanimous
                    ? "✓ 全員一致！"
                    : "✗ 一致しませんでした"}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 次のラウンドボタン（ゲーム終了していない場合のみ） */}
      {(state.status as any) !== "finished" &&
        currentRound &&
        currentRound.result === "opened" &&
        currentRound.unanimous !== null &&
        // 上限ラウンド数に達していない場合のみ表示
        (!state.settings?.maxRounds || state.rounds.length < state.settings.maxRounds) &&
        isGM && (
          <GMControls
            answeredCount={0}
            totalCount={0}
            onOpenRound={async () => {}} // 使用しない
            onCreateRound={async () => {
              try {
                await createRound(state.id, isGM);
                setToast("新しいラウンドを開始しました");
              } catch (e) {
                setToast("ラウンドを開始できません（上限に達しました）");
              }
            }}
            showCreateButton={true}
          />
        )}
    </>
  );
}
