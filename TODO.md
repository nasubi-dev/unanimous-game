## 計画（次の改善）

目的: 勝敗表現を分かりやすくし、終了演出（勝利クラッカー／敗北エフェクト）を実装する。

### 要件（必要最小限）
1) サーバ状態に「ゲーム結果（win/lose/none）」を明示で保持し、終了メッセージにも含める
- ルーム状態に `gameResult`（'win'|'lose'|undefined）を追加
- `gameFinished` メッセージで `defeated` に加えて `gameResult` も送る

2) 勝利時のクラッカー演出（モーダルの背面で紙吹雪）
- モーダル背面で数秒間の紙吹雪アニメーション
- パフォーマンスに配慮（GSAPタイムライン／Canvas or DOM 粒子）

3) 敗北時の演出
- モーダルにあわせた赤系のフェード／軽いシェイク演出

4) UIの利用箇所を `gameResult` ベースに統一
- 終了トースト文言、モーダル見出し／色切替を `gameResult` で判定

5) ドキュメント更新
- 仕様（勝敗判定の保持と演出）を追記

### 関連ファイル（変更候補）
- 共有型
  - `src/shared/types.ts`
- サーバ／DO
  - `src/server/do/RoomDurable.ts`
- クライアント・ルーム画面
  - `src/client/app/routes/room.tsx`
  - `src/client/app/components/GameFinished.tsx`
  - `src/client/app/components/WinConditionDisplay.tsx`（表示微調整が必要なら）
- アニメーション
  - `src/client/app/lib/animations.ts`
  - `src/client/app/lib/useAnimations.ts`
- ドキュメント
  - `docs/全員一致ゲーム.md`
  - `docs/実装手順.md`

### 受入れ基準（Doneの定義）
- 勝利時は紙吹雪がモーダル背面で再生されること
- 敗北時は赤系の演出（シェイク or フェード）が再生されること
- ルーム状態に `gameResult` が存在し、UIはこの値で勝敗表示を切り替えること
- docs に仕様差分が反映されていること