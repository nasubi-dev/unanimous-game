import type { Room } from "../../../shared/types";
import { useVictoryAnimation } from "../lib/useAnimations";
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

    if (
      (state.status as any) === "finished" &&
      playVictoryEffect &&
      !animationPlayed
    ) {
      console.log("Playing victory animation!");
      playVictoryEffect();
      setAnimationPlayed(true);
    }
  }, [state.status, playVictoryEffect, animationPlayed]);

  if ((state.status as any) !== "finished") {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-opacity-50 flex items-center justify-center z-50">
      <div
        ref={ref}
        className="bg-white rounded-xl shadow-2xl p-8 mx-4 max-w-md w-full text-center"
        style={{
          opacity: 0,
          transform: "translateY(100px)",
        }}
      >
        <h3 className="text-3xl font-bold text-green-700 mb-4">
          🎉 ゲーム終了！
        </h3>
        <p className="text-lg text-green-600 mb-6">
          勝利条件を達成しました！
          <br />
          お疲れ様でした。
        </p>
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
