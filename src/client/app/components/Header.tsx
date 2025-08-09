import { useState } from "react";
import type { Room } from "../../../shared/types";
import { HowToPlayModal } from "./HowToPlayModal";

interface HeaderProps {
  room?: Room;
}

export function Header({ room }: HeaderProps) {
  const [showHowToPlay, setShowHowToPlay] = useState(false);

  const getGameStatus = (): string => {
    if (!room) {
      return "メンバー募集";
    }

    if (room.status === "waiting") {
      return "メンバー募集";
    }

    if (room.status === "playing") {
      const currentRound = room.rounds[room.rounds.length - 1];
      if (!currentRound) {
        return "準備中";
      }

      if (!currentRound.topic) {
        return "お題設定";
      }

      if (currentRound.result === "unopened") {
        return "回答";
      }

      if (currentRound.result === "opened" && currentRound.unanimous === null) {
        return "判定";
      }

      if (currentRound.unanimous !== null) {
        return "結果発表";
      }
    }

    if (room.status === "finished") {
      return "ゲーム終了";
    }

    return "準備中";
  };

  return (
    <>
      <header className="bg-primary-bg border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          {/* 左端: ゲーム名 */}
          <div className="flex-1">
            <h1 className="text-xl font-bold text-primary-text">全員一致ゲーム</h1>
          </div>

          {/* 中央: ゲーム進行状況 */}
          <div className="flex-1 text-center">
            <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
              {getGameStatus()}
            </span>
          </div>

          {/* 右端: 遊び方ボタン */}
          <div className="flex-1 text-right">
            <button
              onClick={() => setShowHowToPlay(true)}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded text-sm font-medium"
            >
              遊び方
            </button>
          </div>
        </div>
      </header>

      {/* 遊び方モーダル */}
      {showHowToPlay && (
        <HowToPlayModal onClose={() => setShowHowToPlay(false)} />
      )}
    </>
  );
}
