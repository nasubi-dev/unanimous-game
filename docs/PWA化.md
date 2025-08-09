# PWA化実装方針

## 現状の確認

### 既存のPWA要素
現在のアプリにはすでに以下のPWA要素が実装されています：

1. **Web App Manifest** (`/src/client/public/manifest.json`)
   - ✅ 必要な設定項目が適切に記載済み
   - アイコン（192x192、512x512）
   - 表示モード：standalone
   - テーマカラー、背景色

2. **Service Worker** (`/src/client/public/sw.js`)
   - ✅ 基本的なSWが実装済み
   - インストール・アクティベート処理
   - 現在はキャッシュ機能なし（ネットワーク必須）

3. **PWAライブラリ** (`/src/client/app/lib/pwa.ts`)
   - ✅ Service Worker登録関数
   - ✅ PWA検出関数
   - ✅ インストールプロンプト処理（基本実装）

### 課題・不足している要素

1. **Service Worker未登録**
   - PWAライブラリは存在するが、root.tsxで呼び出されていない
   - アプリ起動時にSW登録が実行されない

2. **Manifest参照なし**
   - HTMLのheadでmanifest.jsonが参照されていない

3. **PWAメタタグ不足**
   - apple-touch-icon
   - theme-color
   - その他PWA用メタタグ

4. **インストールプロンプト未実装**
   - showInstallButton関数がTODOのまま

5. **オフライン対応**
   - 現在はネットワーク必須
   - 最低限のオフライン機能なし

## 実装方針

### Phase 1: 基本PWA機能の有効化

#### 1.1 Manifest参照の追加
`src/client/app/root.tsx`に以下を追加：
```tsx
export const links: Route.LinksFunction = () => [
  // 既存のlinks...
  { rel: "manifest", href: "/manifest.json" },
  { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
  { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
  { rel: "apple-touch-icon", href: "/icon-192.png" },
];
```

#### 1.2 PWAメタタグの追加
```tsx
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja"> {/* 日本語アプリなのでja */}
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#3b82f6" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="全員一致" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
```

#### 1.3 Service Worker登録の実装
`src/client/app/root.tsx`のApp関数内で：
```tsx
import { useEffect } from 'react';
import { registerServiceWorker, checkForPWAPrompt } from './lib/pwa';

export default function App() {
  useEffect(() => {
    registerServiceWorker();
    checkForPWAPrompt();
  }, []);

  return <Outlet />;
}
```

### Phase 2: インストールプロンプトUI

#### 2.1 インストールボタンコンポーネント作成
`src/client/app/components/PWAInstallButton.tsx`を作成：
- インストール可能時に表示するボタン
- インストール済み判定
- カスタムデザイン

#### 2.2 PWAライブラリの改善
`src/client/app/lib/pwa.ts`の`showInstallButton`関数を実装：
- インストールボタンの動的追加
- プロンプト表示制御
- インストール完了後の処理

### Phase 3: 基本オフライン対応

#### 3.1 Service Workerの改善
重要なリソースの軽いキャッシュ戦略：
```javascript
const CACHE_NAME = "unanimous-game-v2";
const ESSENTIAL_CACHE = [
  "/", 
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png"
];

// インストール時に必要最低限をキャッシュ
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ESSENTIAL_CACHE))
      .then(() => self.skipWaiting())
  );
});

// ネットワーク優先、失敗時はキャッシュ
self.addEventListener("fetch", (event) => {
  if (event.request.method === 'GET') {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match(event.request))
    );
  }
});
```

### Phase 4: ユーザビリティ向上

#### 4.1 PWA状態表示
- PWAインストール済み判定
- オフライン/オンライン状態表示
- 更新通知

#### 4.2 アイコンの最適化
- アイコンサイズの追加（144x144、384x384など）
- マスカブルアイコン対応

#### 4.3 設定画面
- PWA関連設定
- キャッシュクリア機能

## 技術的考慮事項

### React Router v7対応
- SSRではなくSPAモードでの運用
- クライアントサイドでのPWA初期化

### Cloudflare Workers対応
- Service WorkerとCloudflare Workersの競合回避
-適切なキャッシュヘッダー設定

### モバイル対応
- タッチ操作最適化
- 縦向き固定（manifest設定済み）
- セーフエリア対応

## 実装優先度

1. **High**: Phase 1（基本PWA機能） - PWAとして認識されるため
2. **Medium**: Phase 2（インストールプロンプト） - UX向上
3. **Low**: Phase 3（オフライン対応） - リアルタイムゲームなので必須度低
4. **Low**: Phase 4（追加機能） - Nice to have

## 注意事項

- HTTPSでの運用が必須
- Service Workerの更新時は慎重に（キャッシュ無効化）
- ゲームの性質上、リアルタイム通信が必要なため完全オフライン化は困難
- PWA要件を満たす最低限の実装を優先