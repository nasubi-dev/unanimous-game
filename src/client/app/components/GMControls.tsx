import { AnimatedButton } from './AnimatedButton';

interface GMControlsProps {
  answeredCount: number;
  totalCount: number;
  onOpenRound: () => Promise<void>;
  onJudgeResult?: (unanimous: boolean) => Promise<void>;
  showJudgeButtons?: boolean;
  unanimous?: boolean | null;
  onCreateRound?: () => Promise<void>;
  showCreateButton?: boolean;
  fixed?: boolean;
}

export function GMControls({
  answeredCount,
  totalCount,
  onOpenRound,
  onJudgeResult,
  showJudgeButtons = false,
  unanimous,
  onCreateRound,
  showCreateButton = false,
  fixed = false,
}: GMControlsProps) {
  if (fixed) {
    return (
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4">
        <div className="max-w-md mx-auto">
          <div className="text-center space-y-3">
            <div className="flex items-center justify-center space-x-6">
              <div className="text-base text-gray-600">
                {answeredCount} / {totalCount} 人
              </div>
              <AnimatedButton
                onClick={onOpenRound}
                variant="warning"
                className="shadow-lg"
              >
                回答を公開
              </AnimatedButton>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showJudgeButtons && onJudgeResult && unanimous === null && (
        <div className="flex gap-2">
          <AnimatedButton
            onClick={() => onJudgeResult(true)}
            variant="success"
            className="flex-1"
          >
            全員一致
          </AnimatedButton>
          <AnimatedButton
            onClick={() => onJudgeResult(false)}
            variant="danger"
            className="flex-1"
          >
            一致しなかった
          </AnimatedButton>
        </div>
      )}

      {unanimous !== null && showJudgeButtons && (
        <div
          className={`p-3 rounded text-base text-center ${
            unanimous ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}
        >
          {unanimous ? "✓ 全員一致！" : "✗ 一致しませんでした"}
        </div>
      )}

      {showCreateButton && onCreateRound && (
        <div className="text-center">
          <AnimatedButton
            onClick={onCreateRound}
            variant="primary"
            size="lg"
            className="font-medium"
          >
            次のラウンドを始める
          </AnimatedButton>
        </div>
      )}
    </div>
  );
}
