# Cloudflareアナリティクス導入計画（最小限実装）

## 目的
プレイヤー数、ルーム数、ラウンド数の累計・合計データをCloudflare Analytics Engineで収集

## 収集するメトリクス
- **player_joined**: プレイヤー参加回数（累計プレイヤー数）
- **room_created**: ルーム作成回数（累計ルーム数）  
- **round_started**: ラウンド開始回数（累計ラウンド数）

## 実装方針
1. **Cloudflare Analytics Engine**のみ使用（クライアント管理画面なし）
2. **Durable Object**からメトリクス送信のみ
3. **CloudflareダッシュボードWeb UI**でデータ閲覧

## 関連ファイル（最小限）

### サーバーサイド
- `wrangler.toml` - Analytics Engineバインディング追加
- `src/server/do/RoomDurable.ts` - メトリクス送信処理追加

### 型定義
- `src/shared/types.ts` - Env型にAnalytics Engineバインディング追加

## 実装タスク

### 1. インフラ設定
- wrangler.tomlにAnalytics Engineバインディング追加
- Env型にAnalyticsEngineバインディング追加

### 2. メトリクス送信処理
- ルーム作成時に`room_created`メトリクス送信
- プレイヤー参加時に`player_joined`メトリクス送信  
- ラウンド開始時に`round_started`メトリクス送信

## 手作業での設定・確認方法

### Analytics Engine有効化（Cloudflareダッシュボード）
1. Cloudflareダッシュボード > Workers & Pages > unanimous-game
2. Settings > Bindings > Analytics Engine
3. 新しいバインディング追加: 
   - Variable name: `ANALYTICS`
   - Dataset: `unanimous-game-metrics`

### データ閲覧方法
1. Cloudflareダッシュボード > Analytics & Logs > Workers Analytics
2. または GraphQL API直接クエリ:
```graphql
{
  viewer {
    accounts(filter: {accountTag: "YOUR_ACCOUNT_ID"}) {
      analyticsEngineMetrics(
        filter: {
          dataset: "unanimous-game-metrics"
        }
      ) {
        sum {
          sampleInterval
          blob1
        }
      }
    }
  }
}
```

### デプロイ後の確認
1. `wrangler tail` でログ確認
2. Analytics Engineにデータが送信されているか確認
3. 数分後にCloudflareダッシュボードでメトリクス表示確認

## 制約
- Analytics Engine無料枠: 100,000 data points/月
- データ表示まで数分のラグあり
- 既存機能への影響なし