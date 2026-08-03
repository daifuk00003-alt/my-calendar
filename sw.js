// Phase 1 の Service Worker
// オフラインキャッシュ（FR-29〜FR-31）は Phase 3 の範囲。
// ここではホーム画面への追加を成立させるための最小構成にとどめ、キャッシュは行わない。

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
