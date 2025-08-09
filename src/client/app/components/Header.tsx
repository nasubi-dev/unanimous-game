import { useState } from "react";
import type { Room } from "../../../shared/types";
import { HowToPlayModal } from "../components/HowToPlayModal";

interface HeaderProps {
  room?: Room;
}

export function Header({ room }: HeaderProps) {
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [copyToast, setCopyToast] = useState<string | null>(null);

  const getGameStatus = (): string | null => {
    if (!room) {
      return null; // ルームが存在しない場合は何も表示しない
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
        <div className="flex items-center max-w-6xl mx-auto">
          {/* 左端: ゲーム名 */}
          <div className="flex-1 flex-shrink-0">
            <h1 className="text-xl font-bold text-primary-text">
              全員一致
              <br />
              ゲーム
            </h1>
          </div>

          {/* 中央: ゲーム進行状況とルーム情報 - より大きな幅を確保 */}
          <div className="flex-1 flex items-center justify-center gap-4">
            <div className="flex flex-col items-center gap-2">
              {getGameStatus() && (
                <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                  {getGameStatus()}
                </span>
              )}
              {room && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">
                    ルーム: {room.id}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 右端: 遊び方ボタン */}
          <div className="flex-1 flex-shrink-0 text-right">
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

      {/* コピー完了トーストメッセージ */}
      {copyToast && (
        <div className="fixed top-16 left-1/2 transform -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded shadow-lg z-50 text-sm">
          {copyToast}
        </div>
      )}
    </>
  );
}
