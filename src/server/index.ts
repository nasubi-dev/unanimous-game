import { Hono } from 'hono';
import type { Env } from './do/RoomDurable';
export { RoomDurable } from './do/RoomDurable';

const app = new Hono<{ Bindings: Env }>();

// API ルートのマウント（例）
// app.route('/api', apiRoutes);

// ヘルスチェック
app.get('/api/health', (c) => c.json({ ok: true }));

// DO への WS フォワード
app.get('/ws/:id', async (c) => {
  if (c.req.header('Upgrade') !== 'websocket') return c.text('Expected websocket', 400);
  const id = c.req.param('id');
  const objectId = c.env.ROOM_DURABLE.idFromName(id);
  const stub = c.env.ROOM_DURABLE.get(objectId);
  // DO はパスに依存しない実装なのでそのまま転送
  return stub.fetch(c.req.raw);
});

// まず静的アセットを試し、最後に SPA の index.html へフォールバック
app.all('*', async (c) => {
  const path = c.req.path;
  if (path.startsWith('/api') || path.startsWith('/ws')) {
    return c.text('Not Found', 404);
  }
  // アセット優先
  const assetRes = await c.env.ASSETS.fetch(c.req.raw);
  if (assetRes.status !== 404) return assetRes;
  // SPA フォールバック: index.html を返す
  const url = new URL(c.req.url);
  const indexUrl = new URL('/index.html', url.origin);
  const indexReq = new Request(indexUrl.toString(), { headers: c.req.raw.headers, method: 'GET' });
  return c.env.ASSETS.fetch(indexReq);
});

export default app;
