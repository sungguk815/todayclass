/**
 * 오늘의 교실 — 오프라인 담당
 *
 * 대시보드는 예전부터 '받아 온 자료'는 기기에 남겨 두었지만, 정작 페이지와
 * 글꼴은 남겨 두지 않았습니다. 그래서 학교망이 잠깐 흔들리면 자료는 있는데
 * 화면이 아예 뜨지 않는 일이 있었습니다. 이 파일이 그 부분을 맡습니다.
 *
 *  · 페이지와 글꼴을 기기에 받아 둔다
 *  · 인터넷이 있으면 항상 새 것을 쓰되, 없으면 받아 둔 것으로 화면을 띄운다
 *  · 급식·시간표 같은 '그때그때 달라지는 자료'는 여기서 건드리지 않는다
 *    (그 자료는 대시보드가 스스로 localStorage에 보관합니다)
 *
 * ※ 화면을 고쳐 새로 올릴 때는 아래 CACHE 뒤의 번호를 꼭 올리세요.
 *   번호가 그대로면 교실 기기가 옛 화면을 계속 쓸 수 있습니다.
 */

const CACHE = 'todayclass-v3';

/* 앱을 켜는 데 꼭 필요한 것들 */
const SHELL = [
  './',
  './index.html',
  './notice.html'
];

/* 글꼴처럼 한 번 받아 두면 바뀌지 않는 것 — 받아 둔 것을 먼저 쓴다 */
const STATIC_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

/* 그때그때 달라지는 자료 — 절대 보관하지 않는다 */
const LIVE_HOSTS = ['script.google.com', 'script.googleusercontent.com', 'workers.dev'];

const hostMatches = (url, list) => list.some(h => url.hostname === h || url.hostname.endsWith('.' + h));


self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 하나가 없어도 나머지는 받아 두도록 한 장씩 받는다
    await Promise.all(SHELL.map(path => cache.add(path).catch(() => {})));
    await self.skipWaiting();
  })());
});


self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});


self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch (err) { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // 급식·시간표·공지는 늘 새 것이어야 한다
  if (hostMatches(url, LIVE_HOSTS)) return;

  // 글꼴은 받아 둔 것을 먼저
  if (hostMatches(url, STATIC_HOSTS)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 우리 페이지는 받아 둔 것을 곧바로 내주고, 뒤에서 새 것을 받아 둔다
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request));
  }
});


/** 받아 둔 것이 있으면 그대로. 없으면 받아서 보관한다. */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;

  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    return hit || Response.error();
  }
}

/**
 * 받아 둔 것을 먼저 보여 주고, 뒤에서 조용히 새 것을 받아 둔다.
 * 다음에 켤 때 새 화면이 뜬다 — 교실 기기는 하루에 한 번은 껐다 켜므로
 * 이 정도면 충분히 빨리 반영된다.
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);

  const fresh = fetch(request).then(response => {
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  if (hit) {
    // 새로 받는 일은 뒤에서 계속되게 둔다
    return hit;
  }

  const response = await fresh;
  if (response) return response;

  // 인터넷도 없고 받아 둔 것도 없을 때 — 화면 문서 요청이면 첫 화면이라도 내준다
  if (request.mode === 'navigate') {
    const shell = await cache.match('./index.html');
    if (shell) return shell;
  }
  return Response.error();
}
