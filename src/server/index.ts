import { Hono } from "hono";
import type { Env } from "./do/RoomDurable";
export { RoomDurable } from "./do/RoomDurable";

const app = new Hono<{ Bindings: Env }>();

// API: rooms
app.post('/api/rooms', async (c) => {
  // 4桁の roomId を生成し、その名前で DO を作成
  const roomId = (Math.floor(Math.random() * 9000) + 1000).toString();
  const id = c.env.ROOM_DURABLE.idFromName(roomId);
  const stub = c.env.ROOM_DURABLE.get(id);
  const res = await stub.fetch(new URL('/create', 'http://do').toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ roomId }),
  });
  // DO からは { roomId, gmId, gmToken } が返る
  return new Response(await res.text(), { status: res.status, headers: { 'content-type': 'application/json' } });
});

app.post("/api/rooms/:id/join", async (c) => {
  const idParam = c.req.param("id");
  const id = c.env.ROOM_DURABLE.idFromName(idParam);
  const stub = c.env.ROOM_DURABLE.get(id);
  const res = await stub.fetch(new URL("/join", "http://do").toString(), {
    method: "POST",
    body: await c.req.raw.text(),
    headers: { "content-type": "application/json" },
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
});

app.get("/api/rooms/:id/state", async (c) => {
  const idParam = c.req.param("id");
  const id = c.env.ROOM_DURABLE.idFromName(idParam);
  const stub = c.env.ROOM_DURABLE.get(id);
  const res = await stub.fetch(new URL("/state", "http://do").toString());
  return new Response(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
});

// ヘルスチェック
app.get("/api/health", (c) => c.json({ ok: true }));

// DO への WS フォワード
app.get("/ws/:id", async (c) => {
  if (c.req.header("Upgrade") !== "websocket")
    return c.text("Expected websocket", 400);
  const id = c.req.param("id");
  const objectId = c.env.ROOM_DURABLE.idFromName(id);
  const stub = c.env.ROOM_DURABLE.get(objectId);
  // DO はパスに依存しない実装なのでそのまま転送
  return stub.fetch(c.req.raw);
});

// まず静的アセットを試し、最後に SPA の index.html へフォールバック
app.all("*", async (c) => {
  const path = c.req.path;
  if (path.startsWith("/api") || path.startsWith("/ws")) {
    return c.text("Not Found", 404);
  }
  // アセット優先
  const assetRes = await c.env.ASSETS.fetch(c.req.raw);
  if (assetRes.status !== 404) return assetRes;
  // SPA フォールバック: index.html を返す
  const url = new URL(c.req.url);
  const indexUrl = new URL("/index.html", url.origin);
  const indexReq = new Request(indexUrl.toString(), {
    headers: c.req.raw.headers,
    method: "GET",
  });
  return c.env.ASSETS.fetch(indexReq);
});

export default app;
