import { useEffect, useState } from "react";

interface GameStartCountdownProps {
  onComplete: () => void;
}

export function GameStartCountdown({ onComplete }: GameStartCountdownProps) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 1500); // 1.5秒後にゲーム開始
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 bg-white flex items-center justify-center z-50">
      <div className="text-center">
        <div className="text-6xl font-bold text-green-600 animate-bounce">
          Start!!
        </div>
      </div>
    </div>
  );
}
