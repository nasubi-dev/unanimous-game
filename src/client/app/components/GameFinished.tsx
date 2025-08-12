import type { Room } from "../../../shared/types";
import { useVictoryAnimation, useVictoryConfetti, useDefeatEffect } from "../lib/useAnimations";
import { useEffect, useState } from "react";
import { AnimatedButton } from "./AnimatedButton";

interface GameFinishedProps {
  state: Room;
  selfId: string | null;
  onGoHome: () => void;
  onPlayAgain: () => void;
}

export function GameFinished({
  state,
  selfId,
  onGoHome,
  onPlayAgain,
}: GameFinishedProps) {
  const { ref, playVictoryEffect } = useVictoryAnimation();
  const { ref: bgRef, playConfetti } = useVictoryConfetti();
  const { ref: modalRef, playDefeat } = useDefeatEffect();
  const [animationPlayed, setAnimationPlayed] = useState(false);

  console.log("GameFinished render:", {
    status: state.status,
    isFinished: (state.status as any) === "finished",
    rounds: state.rounds.length,
    lastRound: state.rounds[state.rounds.length - 1],
  });

  useEffect(() => {
    // ゲームが終了状態になったときに勝利エフェクトを実行（一度だけ）
    console.log("GameFinished useEffect:", {
      status: state.status,
      playVictoryEffect: !!playVictoryEffect,
      animationPlayed,
    });

    if ((state.status as any) !== "finished" || animationPlayed) return;
    const result = state.gameResult;
    if (result === "win") {
      playVictoryEffect?.();
      playConfetti?.(3);
      setAnimationPlayed(true);
    } else if (result === "lose") {
      playVictoryEffect?.(); // 通常の登場アニメ
      // 少し遅らせてシェイク
      setTimeout(() => playDefeat?.(), 250);
      setAnimationPlayed(true);
    }
  }, [state.status, state.gameResult, playVictoryEffect, playConfetti, playDefeat, animationPlayed]);

  if ((state.status as any) !== "finished") {
    return null;
  }

  const isWin = state.gameResult === "win";

  return (
    <div className="fixed inset-0 bg-opacity-50 flex items-center justify-center z-50">
      {/* 背面紙吹雪コンテナ */}
      <div ref={bgRef} className="absolute inset-0 overflow-hidden pointer-events-none" />
      <div
        ref={ref}
        className="bg-white rounded-xl shadow-2xl p-8 mx-4 max-w-md w-full text-center"
        style={{
          opacity: 0,
          transform: "translateY(100px)",
        }}
      >
        <h3 ref={modalRef} className={`text-3xl font-bold mb-4 ${isWin ? "text-green-700" : "text-red-700"}`}>
          {isWin ? "🎉 ゲームクリア！" : "クリアならず..."}
        </h3>
        <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-4 mb-6">
          <p>全 {state.rounds.length} ラウンド実施</p>
          <p>
            全員一致回数:{" "}
            {state.rounds.filter((r) => r.unanimous === true).length} 回
          </p>
        </div>
        <div className="flex gap-3">
          <AnimatedButton
            onClick={onGoHome}
            variant="primary"
            className="flex-1"
          >
            トップに戻る
          </AnimatedButton>

          <AnimatedButton
            onClick={onPlayAgain}
            variant="success"
            className="flex-1"
          >
            もう一度
          </AnimatedButton>
        </div>
      </div>
    </div>
  );
}
