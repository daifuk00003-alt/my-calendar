// Phase 1 の Service Worker
// オフラインキャッシュ（FR-29〜FR-31）は Phase 3 の範囲。
// ここではホーム画面への追加を成立させるための最小構成にとどめ、キャッシュは行わない。

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// 自分のファイルは常にネットワークから取り直す。
// ブラウザのキャッシュが残ると、更新したのに古い画面のままになるため。
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return; // 既定の挙動に任せる（Google API など）
  }
  event.respondWith(
    fetch(request, { cache: "no-store" }).catch(() => fetch(request))
  );
});
