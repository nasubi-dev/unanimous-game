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
              <button
                onClick={onOpenRound}
                className="bg-orange-600 hover:bg-orange-700 text-white text-base px-6 py-3 rounded shadow-lg"
              >
                回答を公開
              </button>
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
          <button
            onClick={() => onJudgeResult(true)}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white text-base px-4 py-3 rounded"
          >
            全員一致
          </button>
          <button
            onClick={() => onJudgeResult(false)}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white text-base px-4 py-3 rounded"
          >
            一致しなかった
          </button>
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
          <button
            onClick={onCreateRound}
            className="bg-blue-600 hover:bg-blue-700 text-white text-lg px-6 py-4 rounded font-medium"
          >
            次のラウンドを始める
          </button>
        </div>
      )}
    </div>
  );
}
