import { Hono } from 'hono';
import type { Env } from './do/RoomDurable';
export { RoomDurable } from './do/RoomDurable';
// React Router のサーバビルドを読み込み、SSR ハンドラを作成
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - ビルド成果物のため型解決は省略
import serverBuild from '../client/build/server/index.js';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - ランタイムで解決される
import { createRequestHandler } from 'react-router';

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

// SSR: React Router のハンドラ
const handleRequest = createRequestHandler(serverBuild, 'cloudflare');

// まず静的アセットを試し、最後に SSR にフォールバック
app.all('*', async (c) => {
  const path = c.req.path;
  if (path.startsWith('/api') || path.startsWith('/ws')) {
    return c.text('Not Found', 404);
  }
  // アセット優先
  const assetRes = await c.env.ASSETS.fetch(c.req.raw);
  if (assetRes.status !== 404) return assetRes;
  // SSR へ
  return handleRequest(c.req.raw, c.env, c.executionCtx);
});

export default app;
