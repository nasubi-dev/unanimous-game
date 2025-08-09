# 全員一致ゲーム Tauri化対応計画

## 概要

本プロジェクトをTauriを導入してマルチプラットフォーム対応（Web、PWA、デスクトップアプリ）させる手順書です。

## 現在の構成

- **フロントエンド**: React + Vite + React Router + TailwindCSS + GSAP
- **バックエンド**: Cloudflare Workers + Durable Objects  
- **通信**: WebSocket（リアルタイム通信）
- **配信**: Cloudflare Workers上でSPA形式

## 実装フェーズ

### Phase 1: PWA対応（優先度：高）

#### 1.1 PWA Manifest追加

`src/client/public/manifest.json` を作成：

```json
{
  "name": "全員一致ゲーム",
  "short_name": "全員一致",
  "description": "みんなで楽しむ全員一致ゲーム",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#3b82f6",
  "orientation": "portrait-primary",
  "categories": ["games", "entertainment"],
  "icons": [
    {
      "src": "icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable any"
    },
    {
      "src": "icon-512.png", 
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable any"
    }
  ]
}
```

#### 1.2 Service Worker追加

`src/client/public/sw.js` を作成：

```javascript
const CACHE_NAME = 'unanimous-game-v1';
const OFFLINE_URL = '/offline.html';

const urlsToCache = [
  '/',
  '/offline.html',
  '/index.html',
  // 静的アセットは自動的にキャッシュ
];

// インストール時
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        return self.skipWaiting();
      })
  );
});

// アクティベート時
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// フェッチ時（ネットワークファースト戦略）
self.addEventListener('fetch', (event) => {
  // WebSocketリクエストは無視
  if (event.request.url.includes('websocket') || event.request.url.includes('ws://') || event.request.url.includes('wss://')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // レスポンスが有効な場合はキャッシュに保存
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseClone);
            });
        }
        return response;
      })
      .catch(() => {
        // ネットワークエラーの場合はキャッシュから取得
        return caches.match(event.request)
          .then((response) => {
            if (response) {
              return response;
            }
            // HTMLリクエストの場合はオフラインページを返す
            if (event.request.headers.get('accept').includes('text/html')) {
              return caches.match(OFFLINE_URL);
            }
          });
      })
  );
});
```

#### 1.3 オフラインページ追加

`src/client/public/offline.html` を作成：

```html
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>オフライン - 全員一致ゲーム</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-align: center;
            padding: 20px;
        }
        .offline-container {
            background: rgba(255, 255, 255, 0.1);
            padding: 2rem;
            border-radius: 1rem;
            backdrop-filter: blur(10px);
        }
        .retry-btn {
            background: #3b82f6;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            margin-top: 1rem;
            font-size: 16px;
        }
        .retry-btn:hover {
            background: #2563eb;
        }
    </style>
</head>
<body>
    <div class="offline-container">
        <h1>🌐 オフラインです</h1>
        <p>インターネット接続を確認してください</p>
        <p>全員一致ゲームは接続が復旧したら自動的に再開できます</p>
        <button class="retry-btn" onclick="window.location.reload()">再試行</button>
    </div>
</body>
</html>
```

#### 1.4 PWA用アイコン作成

必要なアイコンサイズ：
- `icon-192.png` (192x192px)
- `icon-512.png` (512x512px)
- `apple-touch-icon.png` (180x180px)

#### 1.5 HTML head修正

`src/client/index.html` にPWA用メタタグ追加：

```html
<head>
  <!-- 既存のメタタグ -->
  
  <!-- PWA用メタタグ -->
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#3b82f6">
  
  <!-- Apple用 -->
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="全員一致">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  
  <!-- Microsoft用 -->
  <meta name="msapplication-TileColor" content="#3b82f6">
  <meta name="msapplication-config" content="/browserconfig.xml">
</head>
```

#### 1.6 Service Worker登録

`src/client/app/lib/pwa.ts` を作成：

```typescript
export const isPWACapable = (): boolean => {
  return 'serviceWorker' in navigator && 'PushManager' in window;
};

export const isPWAInstalled = (): boolean => {
  return window.matchMedia('(display-mode: standalone)').matches ||
         (window.navigator as any).standalone === true;
};

export const registerServiceWorker = async (): Promise<void> => {
  if (!isPWACapable()) {
    console.log('PWA not supported');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // 新しいバージョンが利用可能
            if (confirm('新しいバージョンが利用可能です。更新しますか？')) {
              window.location.reload();
            }
          }
        });
      }
    });

    console.log('Service Worker registered:', registration);
  } catch (error) {
    console.error('Service Worker registration failed:', error);
  }
};

export const checkForPWAPrompt = (): void => {
  let deferredPrompt: any;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    // カスタムインストールボタンの表示など
    showInstallButton(deferredPrompt);
  });
};

const showInstallButton = (deferredPrompt: any): void => {
  // TODO: インストールプロンプトUIの実装
  console.log('PWA install prompt available');
};
```

#### 1.7 アプリケーション統合

`src/client/app/root.tsx` にPWA初期化を追加：

```tsx
import { useEffect } from 'react';
import { registerServiceWorker, checkForPWAPrompt } from './lib/pwa';

export default function App() {
  useEffect(() => {
    // PWA初期化
    registerServiceWorker();
    checkForPWAPrompt();
  }, []);

  // 既存のコード...
}
```

### Phase 2: Tauri導入

#### 2.1 Tauri依存関係追加

```bash
# プロジェクトルートで実行
npm install -D @tauri-apps/cli
npm install @tauri-apps/api
```

#### 2.2 Tauri初期化

```bash
npm run tauri init
```

初期化時の設定：
- アプリ名: `全員一致ゲーム`
- ウィンドウタイトル: `全員一致ゲーム`
- Web assets: `../src/client/build/client`
- Dev server URL: `http://localhost:5173`
- Dev command: `npm run dev:client`
- Build command: `npm run build:client`

#### 2.3 Tauri設定

`src-tauri/tauri.conf.json` を設定：

```json
{
  "build": {
    "beforeDevCommand": "cd src/client && npm run dev",
    "beforeBuildCommand": "npm run build:client",
    "devPath": "http://localhost:5173",
    "distDir": "../src/client/build/client",
    "withGlobalTauri": false
  },
  "package": {
    "productName": "全員一致ゲーム",
    "version": "0.1.0"
  },
  "tauri": {
    "allowlist": {
      "all": false,
      "shell": {
        "all": false,
        "open": true
      },
      "window": {
        "all": false,
        "close": true,
        "hide": true,
        "maximize": true,
        "minimize": true,
        "unmaximize": true,
        "unminimize": true,
        "show": true,
        "startDragging": true,
        "setResizable": true,
        "setTitle": true
      },
      "app": {
        "all": false,
        "show": true,
        "hide": true
      },
      "path": {
        "all": true
      },
      "dialog": {
        "all": false,
        "message": true,
        "ask": true,
        "confirm": true
      }
    },
    "bundle": {
      "active": true,
      "targets": "all",
      "identifier": "com.unanimousgame.app",
      "icon": [
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/icon.icns",
        "icons/icon.ico"
      ],
      "resources": [],
      "externalBin": [],
      "copyright": "",
      "category": "Game",
      "shortDescription": "全員一致ゲーム",
      "longDescription": "みんなで楽しむ全員一致ゲーム。リアルタイムマルチプレイヤーゲーム。"
    },
    "security": {
      "csp": null
    },
    "updater": {
      "active": false
    },
    "windows": [
      {
        "fullscreen": false,
        "resizable": true,
        "title": "全員一致ゲーム",
        "width": 450,
        "height": 800,
        "minWidth": 400,
        "minHeight": 600,
        "center": true,
        "decorations": true,
        "alwaysOnTop": false,
        "skipTaskbar": false
      }
    ]
  }
}
```

#### 2.4 プラットフォーム検出ライブラリ

`src/client/app/lib/platform.ts` を作成：

```typescript
import { invoke } from '@tauri-apps/api/tauri';
import { appWindow } from '@tauri-apps/api/window';

export const isTauri = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI__' in window;
};

export const isPWA = (): boolean => {
  return window.matchMedia('(display-mode: standalone)').matches ||
         (window.navigator as any).standalone === true;
};

export const isMobile = (): boolean => {
  return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

export const getDeviceInfo = () => ({
  isTauri: isTauri(),
  isPWA: isPWA(),
  isMobile: isMobile(),
  platform: isTauri() ? 'tauri' : isPWA() ? 'pwa' : 'web',
});

// Tauri固有の機能
export const tauriUtils = {
  // ウィンドウ制御
  minimizeWindow: async () => {
    if (isTauri()) {
      await appWindow.minimize();
    }
  },
  
  maximizeWindow: async () => {
    if (isTauri()) {
      await appWindow.toggleMaximize();
    }
  },
  
  closeWindow: async () => {
    if (isTauri()) {
      await appWindow.close();
    }
  },

  // アプリ情報取得
  getAppVersion: async (): Promise<string> => {
    if (isTauri()) {
      return await invoke('get_app_version');
    }
    return 'web';
  }
};

// ユーティリティフック
export const usePlatform = () => {
  return getDeviceInfo();
};
```

#### 2.5 統一API層

`src/client/app/lib/unified-api.ts` を作成：

```typescript
import { isTauri } from './platform';

// ストレージ統一API
export const storage = {
  setItem: async (key: string, value: string): Promise<void> => {
    if (isTauri()) {
      // 将来的にTauri固有のストレージAPIを使用可能
      localStorage.setItem(key, value);
    } else {
      localStorage.setItem(key, value);
    }
  },
  
  getItem: async (key: string): Promise<string | null> => {
    if (isTauri()) {
      return localStorage.getItem(key);
    } else {
      return localStorage.getItem(key);
    }
  },

  removeItem: async (key: string): Promise<void> => {
    if (isTauri()) {
      localStorage.removeItem(key);
    } else {
      localStorage.removeItem(key);
    }
  }
};

// 通知統一API
export const notifications = {
  show: async (title: string, body: string): Promise<void> => {
    if (isTauri()) {
      // Tauri通知API (将来実装)
      console.log('Tauri notification:', { title, body });
    } else if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    } else {
      console.log('Notification:', { title, body });
    }
  },

  requestPermission: async (): Promise<boolean> => {
    if (isTauri()) {
      // Tauri通知許可 (将来実装)
      return true;
    } else if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  }
};
```

#### 2.6 ビルドスクリプト統合

`package.json` にスクリプト追加：

```json
{
  "scripts": {
    "build:client": "cd src/client && npm run build",
    "dev": "npm run build:client && wrangler dev",
    "dev:client": "cd src/client && npm run dev",
    "dev:tauri": "npm run tauri dev",
    "build:web": "npm run build:client && wrangler deploy",
    "build:tauri": "npm run tauri build",
    "build:all": "npm run build:client && npm run build:tauri",
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build"
  }
}
```

### Phase 3: UI/UX調整

#### 3.1 レスポンシブ対応強化

プラットフォームに応じたスタイル調整：

```tsx
import { usePlatform } from '../lib/platform';

export function AdaptiveLayout({ children }: { children: React.ReactNode }) {
  const { isTauri, isPWA, isMobile } = usePlatform();
  
  const containerClass = `
    ${isTauri ? 'tauri-app' : ''}
    ${isPWA ? 'pwa-app' : ''}
    ${isMobile ? 'mobile-app' : 'desktop-app'}
  `;
  
  return (
    <div className={containerClass}>
      {children}
    </div>
  );
}
```

#### 3.2 ウィンドウコントロール（Tauri用）

```tsx
import { tauriUtils } from '../lib/platform';

export function TauriWindowControls() {
  const { isTauri } = usePlatform();
  
  if (!isTauri) return null;
  
  return (
    <div className="window-controls flex gap-2 p-2">
      <button 
        onClick={tauriUtils.minimizeWindow}
        className="w-3 h-3 bg-yellow-400 rounded-full"
      />
      <button 
        onClick={tauriUtils.maximizeWindow}
        className="w-3 h-3 bg-green-400 rounded-full"
      />
      <button 
        onClick={tauriUtils.closeWindow}
        className="w-3 h-3 bg-red-400 rounded-full"
      />
    </div>
  );
}
```

### Phase 4: デプロイメント戦略

#### 4.1 CI/CD設定（GitHub Actions）

`.github/workflows/build-and-deploy.yml`:

```yaml
name: Build and Deploy

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build-web:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: |
        npm ci
        cd src/client && npm ci
    
    - name: Build client
      run: npm run build:client
    
    - name: Deploy to Cloudflare Workers
      if: github.ref == 'refs/heads/main'
      run: npm run build:web
      env:
        CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}

  build-tauri:
    strategy:
      matrix:
        platform: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${{ matrix.platform }}
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install Rust
      uses: dtolnay/rust-toolchain@stable
    
    - name: Install dependencies (Ubuntu only)
      if: matrix.platform == 'ubuntu-latest'
      run: |
        sudo apt-get update
        sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.0-dev libappindicator3-dev librsvg2-dev patchelf
    
    - name: Install dependencies
      run: |
        npm ci
        cd src/client && npm ci
    
    - name: Build Tauri app
      run: npm run build:tauri
    
    - name: Upload artifacts
      uses: actions/upload-artifact@v3
      with:
        name: tauri-app-${{ matrix.platform }}
        path: |
          src-tauri/target/release/bundle/*/*
```

#### 4.2 リリース戦略

1. **Web版**: Cloudflare Workersで常時配信
2. **PWA**: Web版に自動的にPWA manifest適用
3. **デスクトップ版**: GitHub Releasesで配信
4. **自動更新**: Tauri Updater（将来実装）

## テスト戦略

### 手動テスト項目

#### PWA機能
- [ ] オフライン動作確認
- [ ] ホーム画面への追加
- [ ] スタンドアローンモードでの動作
- [ ] Service Workerの更新機能

#### Tauri機能  
- [ ] デスクトップアプリの起動
- [ ] ウィンドウ操作（最小化、最大化、閉じる）
- [ ] WebSocket通信の動作
- [ ] プラットフォーム検出の正常動作

#### マルチプラットフォーム
- [ ] Web、PWA、Tauriでの機能一致
- [ ] レスポンシブデザインの動作
- [ ] 各プラットフォームでのパフォーマンス

## 今後の拡張予定

### 短期（1-2ヶ月）
- [ ] PWA対応完了
- [ ] Tauri基本実装
- [ ] CI/CD構築

### 中期（3-6ヶ月）  
- [ ] プッシュ通知対応
- [ ] オフライン機能拡張
- [ ] Tauri固有機能活用（ファイルシステムアクセスなど）

### 長期（6ヶ月以上）
- [ ] モバイルアプリ化（Tauri Mobile）
- [ ] 自動更新機能
- [ ] ネイティブ統合機能

## トラブルシューティング

### よくある問題と解決方法

1. **Service Workerのキャッシュ問題**
   - ブラウザのキャッシュをクリア
   - `sw.js` のバージョン更新

2. **Tauriビルドエラー**
   - Rust環境の確認
   - プラットフォーム固有の依存関係インストール

3. **WebSocket接続問題**  
   - CORS設定確認
   - プロキシ設定確認

4. **PWAインストール プロンプトが表示されない**
   - HTTPS環境での実行確認
   - manifest.json の構文確認

## 参考リソース

- [Tauri公式ドキュメント](https://tauri.app/)
- [PWA Builder](https://www.pwabuilder.com/)
- [Web App Manifest Generator](https://app-manifest.firebaseapp.com/)
- [Service Worker Cookbook](https://github.com/mdn/serviceworker-cookbook)

---

最終更新日: 2025年8月10日
