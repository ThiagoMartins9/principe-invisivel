/* O Príncipe Invisível — Service Worker
 *
 * Estratégia (P4.1 — refinada):
 *  - PRECACHE       : assets imutáveis (ícones, ranks PNG, manifest, icon.svg)
 *                     são gravados no install para uso offline da primeira hora.
 *  - NETWORK-FIRST  : navegação / HTML (index.html). Sempre busca primeiro a
 *                     versão fresca do servidor; só cai no cache se estiver
 *                     offline. Resolve o problema de "usuário preso na versão
 *                     antiga" do single-file build.
 *  - STALE-WHILE-REVALIDATE : Google Fonts (CSS + WOFF2). Cache dedicado,
 *                     responde instantâneo e atualiza em background. Tolera
 *                     respostas opacas (CORS sem credentials).
 *  - CACHE-FIRST    : demais assets same-origin (imagens, futuras fontes
 *                     auto-hospedadas, etc.).
 *  - UPDATE FLOW    : NÃO chama self.skipWaiting() automaticamente. O cliente
 *                     (main.js) detecta o SW em "waiting", pergunta ao usuário
 *                     ("Recarregar?") e envia { type: 'SKIP_WAITING' } via
 *                     postMessage. Só aí o novo SW assume o controle.
 *
 *  Para invalidar caches antigos basta bumpar VERSION abaixo.
 */
const VERSION  = 'v10';
const PRECACHE = `principe-precache-${VERSION}`;
const RUNTIME  = `principe-runtime-${VERSION}`;
const FONTS    = `principe-fonts-${VERSION}`;

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  // Ícones do PWA — SVG (escalável) + PNGs nas variantes any/maskable + apple
  './icon.svg',
  './icon-maskable.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './ranks/rank-1.png',
  './ranks/rank-2.png',
  './ranks/rank-3.png',
  './ranks/rank-4.png',
  './ranks/rank-5.png',
  './ranks/rank-6.png',
  './ranks/rank-7.png',
  // Fontes auto-hospedadas (subset latin) — pré-cacheadas para uso offline
  // desde a primeira instalação. Substituem o link para Google Fonts.
  './assets/fonts/cinzel-latin-500-normal.woff2',
  './assets/fonts/cinzel-latin-600-normal.woff2',
  './assets/fonts/cinzel-latin-700-normal.woff2',
  './assets/fonts/cormorant-garamond-latin-400-normal.woff2',
  './assets/fonts/cormorant-garamond-latin-400-italic.woff2',
  './assets/fonts/cormorant-garamond-latin-500-normal.woff2',
  './assets/fonts/cormorant-garamond-latin-600-normal.woff2',
  './assets/fonts/inter-latin-400-normal.woff2',
  './assets/fonts/inter-latin-500-normal.woff2',
  './assets/fonts/inter-latin-600-normal.woff2',
  './assets/fonts/inter-latin-700-normal.woff2'
];

// Mantido por compatibilidade: se ainda houver requisição cross-origin para
// Google Fonts (ex.: cache antigo, link externo), tratamos com SWR. Após a
// migração para fontes locais este caminho deixa de ser exercido.
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

/* ---------- INSTALL ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then(async (cache) => {
      // tolera assets ausentes individualmente sem abortar o install
      await Promise.all(
        PRECACHE_URLS.map((u) => cache.add(u).catch(() => { /* ignore */ }))
      );
    })
  );
  // Importante: NÃO chamamos skipWaiting() aqui. O usuário decide via UI.
});

/* ---------- ACTIVATE ---------- */
self.addEventListener('activate', (event) => {
  const KEEP = new Set([PRECACHE, RUNTIME, FONTS]);
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !KEEP.has(k)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ---------- MESSAGE: handshake de update ---------- */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* ---------- HELPERS ---------- */
function isNavigationRequest(request) {
  if (request.mode === 'navigate') return true;
  const accept = request.headers.get('accept') || '';
  return request.method === 'GET' && accept.includes('text/html');
}

function isFontRequest(url) {
  return FONT_HOSTS.includes(url.hostname);
}

async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      const cache = await caches.open(PRECACHE);
      cache.put(request, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (isNavigationRequest(request)) {
      const fallback = await caches.match('./index.html');
      if (fallback) return fallback;
    }
    throw err;
  }
}

async function cacheFirst(request, runtimeCacheName) {
  // Procura em qualquer cache (incluindo PRECACHE) antes de ir à rede.
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      const cache = await caches.open(runtimeCacheName);
      cache.put(request, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch (err) {
    // Sem rede e sem cache: deixa subir o erro pro chamador.
    throw err;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((res) => {
      // Fontes cross-origin sem CORS retornam type 'opaque' — ainda cacheamos.
      if (res && (res.ok || res.type === 'opaque')) {
        cache.put(request, res.clone()).catch(() => {});
      }
      return res;
    })
    .catch(() => cached); // sem rede: usa o que tinha
  return cached || networkPromise;
}

/* ---------- FETCH ---------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1) Navegação / HTML → network-first (resolve "usuário preso na v anterior")
  if (isNavigationRequest(req)) {
    event.respondWith(networkFirst(req));
    return;
  }

  // 2) Google Fonts → stale-while-revalidate em cache dedicado
  if (isFontRequest(url)) {
    event.respondWith(staleWhileRevalidate(req, FONTS));
    return;
  }

  // 3) Same-origin (imagens, ranks, manifest, futuras fontes locais) → cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(req, RUNTIME));
    return;
  }

  // 4) Outros cross-origin (Supabase, etc.) → passa direto pra rede sem cachear.
});
