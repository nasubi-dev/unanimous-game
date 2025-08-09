const CACHE_NAME = "unanimous-game-v1";

// インストール時
self.addEventListener("install", (event) => {
  event.waitUntil(
    self.skipWaiting()
  );
});

// アクティベート時
self.addEventListener("activate", (event) => {
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

// フェッチ時（ネットワーク必須）
self.addEventListener("fetch", (event) => {
  // すべてのリクエストはネットワーク経由で処理
  // PWAインストール要件を満たすためのService Worker
});
