/*
 * 家計簿アプリ Service Worker（オフライン対応）
 * ・初回起動時にアプリ本体を端末に保存し、以後は電波がなくても起動できるようにします。
 * ・家計データは扱いません（家計データは IndexedDB に保存され、通信には一切使いません）。
 * ・アプリを更新したときは VERSION を変えると、次回起動時に新しい版へ入れ替わります。
 */
var VERSION = '1.1.0';
var CACHE = 'kakeibo-' + VERSION;
var ASSETS = ['./index.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];

// リダイレクトを経由したレスポンスは Safari がナビゲーションに使えないため、作り直して保存する
function cleanResponse(res) {
  if (!res.redirected) return Promise.resolve(res);
  return res.blob().then(function (body) {
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  });
}

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return Promise.all(ASSETS.map(function (url) {
      return fetch(new Request(url, { cache: 'reload' })).then(function (res) {
        if (!res.ok) throw new Error('保存に失敗しました: ' + url);
        return cleanResponse(res).then(function (clean) { return cache.put(url, clean); });
      });
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('kakeibo-') === 0 && k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // アプリの画面は端末に保存した版を優先（電波がなくても即起動）
    event.respondWith(caches.open(CACHE).then(function (cache) {
      return cache.match('./index.html').then(function (cached) {
        if (cached) return cached;
        return fetch(req).catch(function () {
          return new Response('<!DOCTYPE html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><p style="font-family:sans-serif;padding:24px">オフラインのため開けませんでした。一度インターネットに接続してから開いてください。</p>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        });
      });
    }));
    return;
  }

  event.respondWith(caches.open(CACHE).then(function (cache) {
    return cache.match(req, { ignoreSearch: true }).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        if (res.ok && res.type === 'basic') cache.put(req, res.clone());
        return res;
      });
    });
  }));
});
