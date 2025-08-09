import { useEffect } from 'react';
import { useCountdownAnimation } from '../lib/useAnimations';

export function GameStartCountdown() {
  const { ref, startCountdown } = useCountdownAnimation();

  useEffect(() => {
    // コンポーネントがマウントされたらアニメーション開始
    if (startCountdown) {
      startCountdown(0); // 0は単純に開始アニメーションのため
    }
  }, [startCountdown]);

  return (
    <div className="fixed inset-0 bg-white flex items-center justify-center z-50">
      <div className="text-center">
        <div 
          ref={ref}
          className="text-6xl font-bold text-green-600"
        >
          Start!!
        </div>
      </div>
    </div>
  );
}
