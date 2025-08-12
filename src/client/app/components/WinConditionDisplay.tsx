import type { Room } from "../../../shared/types";

interface WinConditionDisplayProps {
  state: Room;
}

export function WinConditionDisplay({ state }: WinConditionDisplayProps) {
  if (state.settings?.winCondition?.type === "none") {
    return null;
  }

  return (
    <div className="max-w-md mx-auto text-center space-y-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
      <h3 className="text-sm font-medium text-yellow-800 mb-2">🎯 勝利条件</h3>
      {state.settings.maxRounds && (
        <div className="text-xs text-yellow-700">
          最大ラウンド数: {state.settings.maxRounds}
        </div>
      )}
      {state.settings.winCondition.type === "count" && (
        <div className="text-yellow-700 flex justify-between items-center">
          <span>
            {state.settings.winCondition.value}回一致でクリア
          </span>
          <span>
            {state.rounds.filter((r) => r.unanimous === true).length} /{" "}
            {state.settings.winCondition.value}
          </span>
        </div>
      )}
      {state.settings.winCondition.type === "consecutive" &&
        (() => {
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
            <div className="text-yellow-700 flex justify-between items-center">
              <span>
                {state.settings.winCondition.value}回連続一致でクリア
              </span>
              <span>
                {consecutiveCount} / {state.settings.winCondition.value}
              </span>
            </div>
          );
        })()}
    </div>
  );
}
