import type { Room } from "../../../shared/types";

interface WinConditionDisplayProps {
  state: Room;
}

export function WinConditionDisplay({ state }: WinConditionDisplayProps) {
  if (state.settings?.winCondition?.type === "none") {
    return null;
  }

  return (
    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
      <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">
        🎯 勝利条件
      </h3>
      {state.settings.winCondition.type === "count" && (
        <div className="text-yellow-700 dark:text-yellow-300">
          <p>目標: {state.settings.winCondition.value}回一致でクリア</p>
          <p>現在: {state.rounds.filter(r => r.unanimous === true).length} / {state.settings.winCondition.value} 回達成</p>
        </div>
      )}
      {state.settings.winCondition.type === "consecutive" && (() => {
        // 連続一致回数を計算
        let consecutiveCount = 0;
        for (let i = state.rounds.length - 1; i >= 0; i--) {
          if (state.rounds[i].unanimous === true) {
            consecutiveCount++;
          } else if (state.rounds[i].unanimous === false) {
            break;
          }
          // unanimous === null の場合は判定待ちなのでスキップ
        }
        return (
          <div className="text-yellow-700 dark:text-yellow-300">
            <p>目標: {state.settings.winCondition.value}回連続一致でクリア</p>
            <p>現在: {consecutiveCount} / {state.settings.winCondition.value} 回連続達成</p>
          </div>
        );
      })()}
    </div>
  );
}
