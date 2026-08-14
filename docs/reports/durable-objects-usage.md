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

## 1. 「部屋数」か「継続時間」か

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

「アクセス数がそれほどない」のに 90% に到達している以上、**部屋数ではなく 1 部屋あたりの生存時間が支配的**、というのが調査前の仮説。以下のコード上の欠陥がそれを裏付ける。

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

### Leak E: PWA / モバイルでバックグラウンドに回っても WS を閉じない

`room.tsx:289` の `visibilitychange` は `leaveRoom()`（HTTP）を呼ぶだけで **WebSocket を閉じていない**。
ユーザーの見立て通り「ホームに戻ったまま帰ってこない」ケースで、
OS が接続を切るまで（iOS Safari では数分〜十数分、PWA だとさらに長い）Leak A により課金が続く。
しかも `leaveRoom` で users からは消えるが GM は消えない（Leak D）ため部屋は生き残る。

### Leak F: 1 リクエストあたりのログが過剰

`console.log` が全ハンドラと `broadcast()` 内（`RoomDurable.ts:687`）にあり、
毎ブロードキャストで JSON 全文を出力している。duration への寄与は小さいが CPU time と
Workers Logs の消費を無駄に押し上げている。

## 3. 対処方針（優先度順）

| # | 対処 | 期待効果 |
| --- | --- | --- |
| 1 | **WebSocket Hibernation API へ移行**（`state.acceptWebSocket`＋状態を `storage` に永続化） | 待機中の課金がほぼゼロに。duration を 1〜2 桁削減 |
| 2 | **`setTimeout` のアイドルタイマーを `storage.setAlarm()` に置換** | アイドル待ちの 30 分ぶんの課金が消える |
| 3 | **アイドルタイムアウトを 30 分 → 10 分に短縮**、空室は 1 分で片付け | 尾を引く時間を 1/3 に |
| 4 | **GM も切断で users から外す**（部屋の所有権は `gmToken` で保持） | 空室クリーンアップが実際に動くようになる |
| 5 | **クライアント: 再接続を指数バックオフ＋上限付きにし、サーバ都合の close(1000) では再接続しない** | 放置タブによる DO の叩き起こしを停止 |
| 6 | **クライアント: `visibilitychange` で WS を閉じ、復帰時に張り直す** | PWA バックグラウンド滞留の課金を停止 |
| 7 | ログを削減 | CPU time / Logs 節約 |

## 4. 検証手順

`scripts/cf-usage.mjs` で以下を突き合わせる。

- **GraphQL** `durableObjectsPeriodicGroups.sum.activeTime` … 実際の課金 duration（時間別）
- **Analytics Engine** `room_cleanup_*` の `durationMs` / `idleMs` … 1 部屋あたりの生存時間と、そのうちアイドルが占める割合
- **Analytics Engine** `room_created` の件数 … 1 日の部屋数

```bash
node scripts/cf-usage.mjs 7
```

判定基準:

- `Σ部屋生存時間 ≈ activeTime` かつ `avg_idle_min` が生存時間の大半 → **継続時間（アイドル尾引き）が主因**
- `rooms_created` が 1 日数百件規模 → **部屋数が主因**
- `ws_connects` が `rooms_created` に対して極端に多い → **Leak C の再接続ループが主因**
