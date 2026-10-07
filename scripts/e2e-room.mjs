// ルームの一連の流れ（作成→参加→開始→お題→回答→オープン→判定→退出→破棄）の疎通確認。
//
//   npx wrangler dev --port 8788 --local --var DISCONNECT_GRACE_MS:2000
//   node scripts/e2e-room.mjs
//
// ハイバネーション化した RoomDurable の疎通確認
const BASE = "http://localhost:8788";
const WS = "ws://localhost:8788";
const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function openWs(roomId, label, sink) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS}/ws/${roomId}`);
    ws.addEventListener("message", (e) => {
      const m = JSON.parse(e.data);
      sink.push({ label, type: m.type });
    });
    ws.addEventListener("close", (e) =>
      sink.push({ label, type: `CLOSE(${e.code}/${e.reason})` }),
    );
    ws.addEventListener("error", reject);
    ws.addEventListener("open", () => resolve(ws));
  });
}

const events = [];
let fail = 0;
const check = (name, ok, extra = "") => {
  log(`${ok ? "  OK  " : "  NG  "} ${name}${extra ? " :: " + extra : ""}`);
  if (!ok) fail++;
};

// 1. 部屋作成
const created = await (
  await fetch(`${BASE}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "GM", icon: 1 }),
  })
).json();
check("部屋作成", !!created.roomId && !!created.gmToken, JSON.stringify(created));
const { roomId, gmToken, gmUserId } = created;

// 2. GM の WebSocket
const gmWs = await openWs(roomId, "gm", events);
gmWs.send(JSON.stringify({ type: "identify", userId: gmUserId }));
await sleep(200);
check(
  "接続直後に state が届く",
  events.some((e) => e.label === "gm" && e.type === "state"),
);

// 3. プレイヤー参加（HTTP）
const joined = await (
  await fetch(`${BASE}/api/rooms/${roomId}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "P2", icon: 2 }),
  })
).json();
check("参加", !!joined.userId, JSON.stringify(joined));
const p2Ws = await openWs(roomId, "p2", events);
p2Ws.send(JSON.stringify({ type: "identify", userId: joined.userId }));
await sleep(200);
check(
  "GM に userJoined がブロードキャストされる",
  events.some((e) => e.label === "gm" && e.type === "userJoined"),
);

// 4. state が永続化されているか（別リクエスト経由）
let st = await (await fetch(`${BASE}/api/rooms/${roomId}/state`)).json();
check("state に2人いる", st.users.length === 2, `users=${st.users.length}`);

// 5. 設定更新
const setRes = await fetch(`${BASE}/api/rooms/${roomId}/settings`, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ gmToken, settings: { winCondition: { type: "count", value: 2 } } }),
});
check("設定更新", setRes.ok);

// 6. 不正トークンは弾かれる
const badRes = await fetch(`${BASE}/api/rooms/${roomId}/settings`, {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ gmToken: "wrong", settings: {} }),
});
check("不正 gmToken は 403", badRes.status === 403, `status=${badRes.status}`);

// 7. ゲーム開始（1.5秒のカウントダウンを含む）
const startRes = await fetch(`${BASE}/api/rooms/${roomId}/start`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ gmToken }),
});
check("ゲーム開始", startRes.ok);
await sleep(300);
check(
  "gameCountdownStarted → gameStarted → roundCreated",
  ["gameCountdownStarted", "gameStarted", "roundCreated"].every((t) =>
    events.some((e) => e.label === "p2" && e.type === t),
  ),
  JSON.stringify(events.filter((e) => e.label === "p2").map((e) => e.type)),
);

st = await (await fetch(`${BASE}/api/rooms/${roomId}/state`)).json();
check("status=playing かつ round が1つ", st.status === "playing" && st.rounds.length === 1);

// 8. お題設定 → 回答 → オープン → 判定
const round = st.rounds[0];
const topicRes = await fetch(`${BASE}/api/rooms/${roomId}/round/${round.id}/topic`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ roundId: round.id, topic: "好きな果物", setterId: round.setterId }),
});
check("お題設定", topicRes.ok, `setter=${round.setterId}`);

for (const uid of [gmUserId, joined.userId]) {
  const r = await fetch(`${BASE}/api/rooms/${roomId}/round/${round.id}/answer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roundId: round.id, userId: uid, value: "りんご" }),
  });
  check(`回答送信 ${uid.slice(0, 6)}`, r.ok);
}

const openRes = await fetch(`${BASE}/api/rooms/${roomId}/round/${round.id}/open`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ roundId: round.id, gmToken }),
});
check("オープン", openRes.ok);

const judged = await (
  await fetch(`${BASE}/api/rooms/${roomId}/round/${round.id}/result`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roundId: round.id, unanimous: true, gmToken }),
  })
).json();
check("判定（勝利条件2回なのでまだ終わらない）", judged.ok && !judged.gameFinished, JSON.stringify(judged));

// 9. 切断してもすぐには退出させない（スリープ・バックグラウンド対策）
//    DISCONNECT_GRACE_MS:2000 で起動している前提
const leftCount = () =>
  events.filter((e) => e.label === "gm" && e.type === "userLeft").length;
const p2Id = joined.userId;
const inRoom = async () =>
  (await (await fetch(`${BASE}/api/rooms/${roomId}/state`)).json()).users.some(
    (u) => u.id === p2Id,
  );

// 9a. 新しい接続で戻ってから古い接続の close が遅れて届く（iOS の復帰でよくある順番）
const p2Back = await openWs(roomId, "p2", events);
p2Back.send(JSON.stringify({ type: "identify", userId: p2Id }));
await sleep(200);
p2Ws.close();
await sleep(2600);
check("復帰後に古い接続が閉じても在籍が続く", await inRoom());

// 9b. 切断 → 猶予中に同じ userId で戻る
p2Back.close();
await sleep(400);
check("切断直後はまだ users に残る", await inRoom());
st = await (await fetch(`${BASE}/api/rooms/${roomId}/state`)).json();
check("離席中として awayUserIds に載る", st.awayUserIds?.includes(p2Id), JSON.stringify(st.awayUserIds));
const p2Again = await openWs(roomId, "p2", events);
p2Again.send(JSON.stringify({ type: "identify", userId: p2Id }));
await sleep(2600);
check("猶予中に戻れば在籍が続く", await inRoom());
st = await (await fetch(`${BASE}/api/rooms/${roomId}/state`)).json();
check("戻ったら awayUserIds から外れる", st.awayUserIds?.length === 0, JSON.stringify(st.awayUserIds));
check("戻った場合は userLeft が出ない", leftCount() === 0, `userLeft=${leftCount()}`);

// 9c. 戻らなければ猶予後に退出扱い
p2Again.close();
await sleep(3000);
st = await (await fetch(`${BASE}/api/rooms/${roomId}/state`)).json();
check("猶予が切れたら users から消える", st.users.length === 1, `users=${st.users.length}`);
check("GM に userLeft が届く", leftCount() === 1, `userLeft=${leftCount()}`);

// 10. gm-return-home で部屋が破棄される
const homeRes = await fetch(`${BASE}/api/rooms/${roomId}/gm-return-home`, {
  method: "POST",
  headers: { authorization: `Bearer ${gmToken}` },
});
check("gm-return-home", homeRes.ok);
await sleep(400);
check(
  "全接続が room_closed で閉じられる",
  events.some((e) => e.label === "gm" && e.type.startsWith("CLOSE(1000/room_closed")),
  JSON.stringify(events.filter((e) => e.type.startsWith("CLOSE")).map((e) => e.label + ":" + e.type)),
);
const goneRes = await fetch(`${BASE}/api/rooms/${roomId}/state`);
check("部屋が消えている (404)", goneRes.status === 404, `status=${goneRes.status}`);

log(`\n${fail === 0 ? "✅ 全て成功" : `❌ ${fail} 件失敗`}`);
process.exit(fail === 0 ? 0 : 1);
