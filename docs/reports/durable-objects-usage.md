# Durable Objects duration 逼迫の調査

対象アラート: `duration` が 1 日の無料枠 `101,562,500,000` の 90% に到達（2026-08-14）

## 0. 無料枠の単位を読み解く

Cloudflare の Durable Objects 無料枠は **13,000 GB-s / 日**。DO 1 インスタンスは 128 MB (= 0.128 GB) 固定なので

```
13,000 GB-s ÷ 0.128 GB = 101,562.5 DO稼働秒
101,562.5 秒 × 10^6 = 101,562,500,000   ← アラートの数値と一致
```

つまり **アラートの `duration` は「DO がメモリに常駐していたマイクロ秒」** であり、
1 日の予算は

> **DO 稼働 合計 28.2 時間 / 日**

これが本件の物差しになる。リクエスト数（無料枠 100 万/日）ではなく「DO が起きていた時間の合計」だけが問題。

## 1. 結論（実測つき）

**部屋数ではなく、1 部屋あたりの継続時間が原因。**
しかも「放置すると続く」のではなく、**スマホの画面切り替えのたびに部屋の寿命が能動的に延長されていた**（後述 Leak E）。

旧実装と新実装を同一シナリオで実測した（`scripts/ab-room-lifetime.mjs`）。
両者ともアイドルタイムアウトを 6 秒に揃え、「プレイヤーが 2 秒おきに 8 回アプリを切り替える」
＝ 16 秒間、サーバ側の操作は一切なし、という条件。

| | 旧実装 | 新実装 |
| --- | --- | --- |
| 16 秒後に部屋が生きているか | **生きている** | **既に破棄済み** |
| 部屋の生存時間 | 22.3 秒（＝ 最後の切り替え 16 秒 ＋ アイドル 6 秒） | 6 秒（アイドル設定どおり） |
| バックグラウンド遷移による DO 起動回数 | 8 回 | 0 回 |

旧実装では、アイドルタイムアウトの **2.6 倍の時間が経っても部屋が生きていた**。
切り替えを続ける限り無限に延命する。本番のタイムアウトは 30 分なので、

```
旧: 最後にアプリを切り替えた時刻 + 30分 まで DO が起きたまま課金され続ける
新: 最後の「実際のゲーム操作」+ 20分。しかもその待機中は DO が眠っており課金ゼロ
```

以下、この結論に至った内訳。

## 1.1 「部屋数」か「継続時間」かの見積もり

DO の課金時間は **同時接続数やユーザー数と無関係**で、その DO がメモリに乗っていた壁時計時間だけで決まる。
本アプリの 1 部屋 = 1 DO なので、

```
1日の duration = Σ(各部屋の生存時間)
```

28.2 時間 / 日を使い切るには、例えば

| シナリオ | 1部屋の生存時間 | 枯渇に必要な部屋数/日 |
| --- | --- | --- |
| 理想（プレイ中だけ課金） | 20 分 | 85 部屋 |
| 現状（プレイ 20 分＋アイドル 30 分） | 50 分 | **34 部屋** |
| 放置タブありの現状（後述 Leak C） | 60〜90 分 | **19〜28 部屋** |

「アクセス数がそれほどない」のに 90% に到達している以上、**部屋数ではなく 1 部屋あたりの生存時間が支配的**、というのが調査前の仮説。以下のコード上の欠陥がそれを裏付け、§1 の実測で確認された。

## 2. コード上で特定した duration リーク

### Leak A（最大）: WebSocket Hibernation を使っていない

`src/server/do/RoomDurable.ts:622` で `server.accept()` を呼んでいる。これは**標準 WebSocket** で、
接続が 1 本でも生きている限り DO はメモリから追い出されず、その全時間が duration に計上される。

Cloudflare の **WebSocket Hibernation API** (`state.acceptWebSocket()`) を使うと、
メッセージが流れていない間 DO はメモリから退避され、**その間は duration が課金されない**。
本ゲームはメッセージ頻度が極めて低い（お題入力・回答送信・オープン程度）ので、効果は桁違いに大きい。

### Leak B: 30 分のアイドルタイマーが `setTimeout`

`RoomDurable.ts:77` `resetIdleTimeout()` は `setTimeout` を使う。
**pending な `setTimeout` がある間、DO は絶対にメモリから退避できない。**
つまり全員が接続を切った後も、必ず 30 分ぶん課金され続ける。
`storage.setAlarm()` なら DO は眠ったまま指定時刻に起こされるので、待機中の課金はゼロ。

さらに `IDLE_TIMEOUT_MS = 30分` (`RoomDurable.ts:40`) 自体がゲーム 1 回の実プレイ時間より長く、
「アイドル待ち」が課金の主成分になっている。

### Leak C: クライアントの再接続がタイムアウトを打ち消す

`src/client/app/routes/room.tsx:256` の `ws.onclose` は 1 秒後に無条件で再接続する。

```
DO が 30 分アイドルで cleanupRoom() → ソケットを close
  → クライアントが 1 秒後に再接続
  → DO 再起動 & resetIdleTimeout() でさらに 30 分課金
```

放置タブ 1 つで **最低 60 分**の DO 稼働が発生する。
（再接続後のソケットにはハンドラが再設定されていないため無限ループにはならないが、その分「再接続後は状態が届かない」バグでもある）

### Leak D: GM が消えないので「空室クリーンアップ」が永久に発火しない

`RoomDurable.ts:958` `removeUserById()` は `user.isGM` なら早期 return する。
その結果 `room.users.length === 0` に到達せず、`RoomDurable.ts:990` の
**5 分の空室クリーンアップ (`EMPTY_ROOM_CLEANUP_MS`) が一度も走らない。**
GM が立てた部屋（＝全部屋）は必ず 30 分のアイドルタイムアウトを待つことになる。

### Leak E（決定的）: `leaveRoom()` が毎回「新しい WebSocket」を張っていた

これが本命。旧 `src/client/app/lib/api.ts` の実装:

```ts
export function leaveRoom(roomId: string, userId: string): void {
  const ws = connectWs(roomId);   // ← 退出を伝えるためだけに新規接続を張る
  ws.onopen = () => { ws.send(JSON.stringify({ type: "leave", userId })); ws.close(); };
}
```

そして旧 `room.tsx` はこれを **`visibilitychange` (hidden) のたびに呼んでいた**。
つまり、

```
スマホでホームに戻る / アプリを切り替える / 画面ロックする
  → visibilitychange(hidden)
  → leaveRoom() が新しい WebSocket を張る
  → DO の fetch() が走り resetIdleTimeout() で アイドルタイマーが 30分に戻る
```

**ユーザーが画面を切り替えるだけで、部屋の寿命が毎回 30 分ずつ延長されていた。**
ユーザーの「スマホで一度ホームに戻って帰ってこない場合も Room を継続し続けている」という
見立ては正しく、しかも実際には「継続する」どころか「切り替えるたびに延命する」動作だった。

PWA / モバイルでは `visibilitychange` は非常に高頻度で発火するため、
数人が数十分プレイするだけで DO は何時間も起きたままになる。

### Leak F: 1 リクエストあたりのログが過剰

`console.log` が全ハンドラと `broadcast()` 内（`RoomDurable.ts:687`）にあり、
毎ブロードキャストで JSON 全文を出力している。duration への寄与は小さいが CPU time と
Workers Logs の消費を無駄に押し上げている。

## 3. 実施した対処

すべて `8702cb7` / `4859053` で実装済み。

| # | Leak | 対処 |
| --- | --- | --- |
| 1 | A | **WebSocket Hibernation API へ移行**。`server.accept()` → `state.acceptWebSocket()`。あわせて部屋の状態を `state.storage` に永続化し、`webSocketMessage` / `webSocketClose` / `webSocketError` ハンドラでハイバネーション復帰に対応 |
| 2 | B | **アイドルタイマーを `setTimeout` から `storage.setAlarm()` へ置換**。待機中は DO が眠るので duration ゼロ |
| 3 | D | **空室判定を `users.length` ではなく実際の WebSocket 接続数で行う**。GM は `users` から外れない仕様なので、旧実装では空室クリーンアップが構造的に発火し得なかった |
| 4 | E | **`leaveRoom()` から新規 WebSocket 生成を削除**し、既存接続に流すだけに変更。さらに `visibilitychange(hidden)` での `leaveRoom()` 呼び出し自体を廃止（ハイバネーション後は接続を維持したままでも課金されないため、維持する方が安く UX も良い） |
| 5 | C | **再接続を指数バックオフ化**（最大6回）。サーバが畳んだ場合の `close(1000, "room_closed")` では再接続しない。非表示中も再接続せず、復帰時に張り直す |
| 6 | — | `/state` のポーリングでアイドルタイマーを延長しないようにした |
| 7 | — | `gm-return-home` で部屋を即座に破棄 |
| 8 | F | `broadcast` ごとの JSON 全文ログなど過剰なログを削除 |
| 9 | — | 接続時に `identify` を送り、切断＝退出として扱えるようにした。バックグラウンド復帰で自分が消えていたら自動で入り直す |

タイムアウト値は `IDLE_TIMEOUT_MS` = 20 分 / `EMPTY_ROOM_CLEANUP_MS` = 3 分（wrangler の
env var で上書き可能）。ハイバネーション後はこの待ち時間が課金されないので、
無理に短縮せず UX を優先している。

### 期待効果

課金対象は「DO がメッセージを処理している時間」だけになる。
1 ゲームあたりの操作は多く見積もっても数百回、1 回あたり数ミリ秒なので、

```
旧: 1部屋あたり 50〜90分 の DO 稼働   →  1日 20〜35部屋 で無料枠を使い切る
新: 1部屋あたり 数秒 の DO 稼働       →  1日 数千部屋 でも余裕
```

つまり **2〜3 桁の削減**を見込んでいる。

### 検証済み事項（ローカル）

**A/B 実測** — `scripts/ab-room-lifetime.mjs`。§1 の表のとおり、旧実装は
バックグラウンド遷移だけで部屋がアイドルタイムアウトの 2.6 倍生き延びるのに対し、
新実装は設定どおりに破棄される。

```bash
# 旧実装（git 2b74bbf 時点のコードをタイムアウトだけ縮めて起動したサーバに対して）
node scripts/ab-room-lifetime.mjs 8791 old
# → {"aliveAfter16sOfBackgrounding":true,"roomLifetimeSec":22.3}

# 新実装
npx wrangler dev --port 8792 --local --var IDLE_TIMEOUT_MS:6000 --var EMPTY_ROOM_CLEANUP_MS:3000
node scripts/ab-room-lifetime.mjs 8792 new
# → {"aliveAfter16sOfBackgrounding":false,"roomLifetimeSec":16}
```

**機能退行がないこと** — `scripts/e2e-room.mjs`（20項目）と
`scripts/e2e-cleanup.mjs`（7項目）で全て成功。

- 部屋作成→参加→設定→開始→お題→回答→オープン→判定 の一連の流れがハイバネーション対応後も動く
- ハイバネーションを跨いで状態が失われない（storage 永続化）
- 不正な `gmToken` は 403
- WebSocket 切断でプレイヤーが `users` から消え、他プレイヤーに `userLeft` が届く
- 接続ゼロで `EMPTY_ROOM_CLEANUP_MS` 後に部屋が破棄される
- `ping` と `/state` ポーリングでは部屋が延命しない
- 実際の操作があればアイドルタイマーが正しく延びる
- 破棄時にクライアントへ `close(1000, "room_closed")` が届く

## 4. デプロイ後の検証手順

`scripts/cf-usage.mjs` で以下を突き合わせる。

- **GraphQL** `durableObjectsPeriodicGroups.sum.activeTime` … 実際の課金 duration（時間別）
- **Analytics Engine** `room_cleanup_*` の `durationMs` / `idleMs` … 1 部屋あたりの生存時間と、そのうちアイドルが占める割合
- **Analytics Engine** `room_created` の件数 … 1 日の部屋数

```bash
npm run cf:usage -- 7
```

判定基準:

- `Σ部屋生存時間 ≈ activeTime` かつ `avg_idle_min` が生存時間の大半 → **継続時間（アイドル尾引き）が主因**
- `rooms_created` が 1 日数百件規模 → **部屋数が主因**
- `ws_connects` が `rooms_created` に対して極端に多い → **Leak C / E の接続叩き起こしが主因**

デプロイ後は同じコマンドで **日次 `duration` が桁で落ちていること**を確認する。
`durationMs`（部屋の生存時間）は変わらなくてよい — 変わるべきなのは
「生存している部屋が DO をメモリに載せ続けていない」ことなので、見るのは `activeTime` の方。
