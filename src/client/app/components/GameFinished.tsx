import type { Room } from "../../../shared/types";

interface GameFinishedProps {
  state: Room;
}

export function GameFinished({ state }: GameFinishedProps) {
  if ((state.status as any) !== "finished") {
    return null;
  }

  return (
    <div className="text-center bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6 mt-4">
      <h3 className="text-xl font-bold text-green-700 dark:text-green-300 mb-2">
        🎉 ゲーム終了！
      </h3>
      <p className="text-green-600 dark:text-green-400 mb-4">
        勝利条件を達成しました！お疲れ様でした。
      </p>
      <div className="text-sm text-green-600 dark:text-green-400">
        <p>全 {state.rounds.length} ラウンド実施</p>
        <p>全員一致回数: {state.rounds.filter(r => r.unanimous === true).length} 回</p>
      </div>
    </div>
  );
}
