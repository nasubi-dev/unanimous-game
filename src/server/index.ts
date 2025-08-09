import { Hono } from "hono";
import type { Env } from "./do/RoomDurable";
export { RoomDurable } from "./do/RoomDurable";

const app = new Hono<{ Bindings: Env }>();

// API: rooms
app.post("/api/rooms", async (c) => {
  // 入力: { name, icon }
  const body = await c.req
    .json<{ name?: string; icon?: string | number }>()
    .catch(() => ({} as any));
  const name = (body?.name ?? "").toString().trim();
  const icon = body?.icon;
  if (!name) return c.text("name required", 400);
  // 4桁の roomId を生成し、その名前で DO を作成
  const roomId = (Math.floor(Math.random() * 9000) + 1000).toString();
  const id = c.env.ROOM_DURABLE.idFromName(roomId);
  const stub = c.env.ROOM_DURABLE.get(id);
  const res = await stub.fetch(new URL("/create", "http://do").toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roomId, name, icon }),
  });
  // DO からは { roomId, gmId, gmToken } が返る
  return new Response(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
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

// ルーム設定更新（GM専用）
app.patch("/api/rooms/:id/settings", async (c) => {
  const idParam = c.req.param("id");
  const id = c.env.ROOM_DURABLE.idFromName(idParam);
  const stub = c.env.ROOM_DURABLE.get(id);
  const res = await stub.fetch(new URL("/settings", "http://do").toString(), {
    method: "PATCH",
    body: await c.req.raw.text(),
    headers: { "content-type": "application/json" },
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
});

// ゲーム開始（GM専用）
app.post("/api/rooms/:id/start", async (c) => {
  const idParam = c.req.param("id");
  const id = c.env.ROOM_DURABLE.idFromName(idParam);
  const stub = c.env.ROOM_DURABLE.get(id);
  const res = await stub.fetch(new URL("/start", "http://do").toString(), {
    method: "POST",
    body: await c.req.raw.text(),
    headers: { "content-type": "application/json" },
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
});

// ラウンド作成（GM専用）
app.post("/api/rooms/:id/round", async (c) => {
  const idParam = c.req.param("id");
  const id = c.env.ROOM_DURABLE.idFromName(idParam);
  const stub = c.env.ROOM_DURABLE.get(id);
  const res = await stub.fetch(new URL("/round", "http://do").toString(), {
    method: "POST",
    body: await c.req.raw.text(),
    headers: { "content-type": "application/json" },
  });
  return new Response(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
});

// お題設定
app.post("/api/rooms/:id/round/:roundId/topic", async (c) => {
  const idParam = c.req.param("id");
  const roundId = c.req.param("roundId");
  const id = c.env.ROOM_DURABLE.idFromName(idParam);
  const stub = c.env.ROOM_DURABLE.get(id);
  const res = await stub.fetch(
    new URL(`/round/${roundId}/topic`, "http://do").toString(),
    {
      method: "POST",
      body: await c.req.raw.text(),
      headers: { "content-type": "application/json" },
    }
  );
  return new Response(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
});

// 回答送信
app.post("/api/rooms/:id/round/:roundId/answer", async (c) => {
  const idParam = c.req.param("id");
  const roundId = c.req.param("roundId");
  const id = c.env.ROOM_DURABLE.idFromName(idParam);
  const stub = c.env.ROOM_DURABLE.get(id);
  const res = await stub.fetch(
    new URL(`/round/${roundId}/answer`, "http://do").toString(),
    {
      method: "POST",
      body: await c.req.raw.text(),
      headers: { "content-type": "application/json" },
    }
  );
  return new Response(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
});

// 回答オープン（GM専用）
app.post("/api/rooms/:id/round/:roundId/open", async (c) => {
  const idParam = c.req.param("id");
  const roundId = c.req.param("roundId");
  const id = c.env.ROOM_DURABLE.idFromName(idParam);
  const stub = c.env.ROOM_DURABLE.get(id);
  const res = await stub.fetch(
    new URL(`/round/${roundId}/open`, "http://do").toString(),
    {
      method: "POST",
      body: await c.req.raw.text(),
      headers: { "content-type": "application/json" },
    }
  );
  return new Response(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
});

// 結果判定（GM専用）
app.post("/api/rooms/:id/round/:roundId/result", async (c) => {
  const idParam = c.req.param("id");
  const roundId = c.req.param("roundId");
  const id = c.env.ROOM_DURABLE.idFromName(idParam);
  const stub = c.env.ROOM_DURABLE.get(id);
  const res = await stub.fetch(
    new URL(`/round/${roundId}/result`, "http://do").toString(),
    {
      method: "POST",
      body: await c.req.raw.text(),
      headers: { "content-type": "application/json" },
    }
  );
  return new Response(await res.text(), {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
});

// ルームリセット（GM専用）
app.post("/api/rooms/:id/reset", async (c) => {
  const idParam = c.req.param("id");
  const id = c.env.ROOM_DURABLE.idFromName(idParam);
  const stub = c.env.ROOM_DURABLE.get(id);
  const res = await stub.fetch(new URL("/reset", "http://do").toString(), {
    method: "POST",
    body: await c.req.raw.text(),
    headers: Object.fromEntries(c.req.raw.headers.entries()),
  });
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
