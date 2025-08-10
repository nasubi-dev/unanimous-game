interface HowToPlayModalProps {
  onClose: () => void;
}

export function HowToPlayModal({ onClose }: HowToPlayModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-primary-bg rounded-lg p-6 max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-primary-text">遊び方</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
            aria-label="閉じる"
          >
            ×
          </button>
        </div>

        {/* コンテンツ */}
        <div className="space-y-4 text-primary-text">
          <section>
            <h3 className="text-lg font-semibold mb-2">ゲームの目的</h3>
            <p>全員一致ゲームは、参加者全員が同じ回答をすることを目指すゲームです。</p>
          </section>

          <section>
            <h3 className="text-lg font-semibold mb-2">基本的な流れ</h3>
            <ol className="list-decimal list-inside space-y-2">
              <li>お題を設定します</li>
              <li>参加者全員がお題に対する回答を入力します</li>
              <li>全員の回答が出そろったら、GMが回答を公開します</li>
              <li>GMが「全員一致」か「一致しなかった」かを判定します</li>
              <li>次のラウンドに進みます</li>
            </ol>
          </section>

          <section>
            <h3 className="text-lg font-semibold mb-2">勝利条件</h3>
            <p>ゲーム開始前に設定した条件を満たすと勝利です：</p>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li><strong>回数指定：</strong> 指定回数の一致を達成</li>
              <li><strong>連続指定：</strong> 指定回数の連続一致を達成</li>
              <li><strong>条件なし：</strong> 自由に楽しむモード</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-semibold mb-2">コツ</h3>
            <ul className="list-disc list-inside space-y-1">
              <li>他の参加者の考え方を想像してみましょう</li>
              <li>シンプルで一般的な回答を心がけましょう</li>
              <li>みんなで話し合いながら進めましょう!!</li>
            </ul>
          </section>
        </div>

        {/* フッター */}
        <div className="mt-6 text-center">
          <button
            onClick={onClose}
            className="bg-violet-600 hover:bg-violet-700 text-white px-6 py-2 rounded font-medium"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
