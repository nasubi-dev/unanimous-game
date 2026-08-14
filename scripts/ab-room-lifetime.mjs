// 旧実装と新実装で「部屋がどれだけ生き続けるか」を同一シナリオで実測する A/B テスト。
//
// 旧実装を起動するには git 2b74bbf 時点の src/server を別ディレクトリに取り出し、
// RoomDurable の IDLE_TIMEOUT_MS / EMPTY_ROOM_CLEANUP_MS を 6000 / 3000 に書き換えて
// wrangler dev を立てる（新実装は env var で同じ値に揃えられる）。
//
//   node scripts/ab-room-lifetime.mjs 8791 old
//   node scripts/ab-room-lifetime.mjs 8792 new
//
// 旧実装 vs 新実装の「部屋が生き続ける時間」を同一シナリオで実測する。
//
// 使い方: node ab.mjs <port> <old|new>
//
// タイムアウトは両実装とも IDLE=6秒 / EMPTY=3秒 に揃えてある。
// 実運用では IDLE=30分 なので、観測された延命回数 × 30分 が本来の被害額になる。

const port = process.argv[2];
const label = process.argv[3];
const BASE = `http://localhost:${port}`;
const WSB = `ws://localhost:${port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = async (id) =>
  (await fetch(`${BASE}/api/rooms/${id}/state`)).status === 200;

const IDLE_MS = 6000;

/** 旧クライアントの leaveRoom(): 退出を伝えるためだけに新しいWSを張る */
function oldLeaveRoom(roomId, userId) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${WSB}/ws/${roomId}`);
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "leave", userId }));
      ws.close();
      resolve();
    });
    ws.addEventListener("error", () => resolve());
  });
}

/** 新クライアント: バックグラウンド遷移では何もしない */
async function newLeaveRoom() {
  /* no-op */
}

const backgroundEvent = label === "old" ? oldLeaveRoom : newLeaveRoom;

// --- シナリオ -------------------------------------------------------------
// GM と プレイヤー1名。プレイヤーがスマホで 2秒おきに 8回 アプリを切り替える。
// サーバ側の「操作」は一切行わない（＝本来なら IDLE_MS 後に部屋は死ぬべき）。

const created = await (
  await fetch(`${BASE}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "GM", icon: 1 }),
  })
).json();
const roomId = created.roomId;

const gmWs = new WebSocket(`${WSB}/ws/${roomId}`);
await new Promise((r) => gmWs.addEventListener("open", r));

const joined = await (
  await fetch(`${BASE}/api/rooms/${roomId}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "P2", icon: 2 }),
  })
).json();
const p2Ws = new WebSocket(`${WSB}/ws/${roomId}`);
await new Promise((r) => p2Ws.addEventListener("open", r));

const t0 = Date.now();
let wakeups = 0;

// 16秒間、2秒おきにバックグラウンド遷移を発生させる（= IDLE_MS の 2.6倍の時間）
for (let i = 0; i < 8; i++) {
  await sleep(2000);
  await backgroundEvent(roomId, joined.userId);
  wakeups++;
}

const aliveAfterBackgrounding = await alive(roomId);
const elapsedAtCheck = ((Date.now() - t0) / 1000).toFixed(1);

// 以降は完全に放置して、部屋が死ぬまでの時間を測る
let death = null;
for (let i = 0; i < 120; i++) {
  if (!(await alive(roomId))) {
    death = (Date.now() - t0) / 1000;
    break;
  }
  await sleep(500);
}
try {
  gmWs.close();
  p2Ws.close();
} catch {}

// 接続を切ってからも生き続けるかを見る（旧実装の Leak D）
let deathAfterDisconnect = null;
if (death === null) {
  for (let i = 0; i < 40; i++) {
    if (!(await alive(roomId))) {
      deathAfterDisconnect = (Date.now() - t0) / 1000;
      break;
    }
    await sleep(500);
  }
}

const total = death ?? deathAfterDisconnect;
console.log(
  JSON.stringify({
    impl: label,
    idleTimeoutSec: IDLE_MS / 1000,
    backgroundEvents: wakeups,
    aliveAfter16sOfBackgrounding: aliveAfterBackgrounding,
    checkedAtSec: Number(elapsedAtCheck),
    roomLifetimeSec: total === null ? ">36 (まだ生存)" : Number(total.toFixed(1)),
    diedWhileConnected: death !== null,
  }),
);
