/* 직독직해 service worker — version f8b4aac419
   HTML / JSON / JS / manifest : network-first, cache fallback (fresh lessons online, last copy offline)
   images / icons               : cache-first after first sight
   mp3                          : never precached; cached in full the first time it is played (or via
                                  "오프라인용 받기"), Range requests are answered as 206 slices of the cached file */
const V = "f8b4aac419";
const PAGES = "ea-pages-" + V, IMGS = "ea-img-v1", AUDIO = "ea-audio-v1";
const KEEP = [PAGES, IMGS, AUDIO];

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil((async () => {
  const cur = await caches.open(PAGES);
  for (const k of await caches.keys()) if (k.startsWith("ea-") && !KEEP.includes(k)) {
    // carry pages already opened offline-ready over to the new version (they are refreshed network-first anyway)
    if (k.startsWith("ea-pages-")) { const old = await caches.open(k);
      for (const r of await old.keys()) if (!(await cur.match(r))) { const res = await old.match(r); if (res) await cur.put(r, res); } }
    await caches.delete(k);
  }
  await self.clients.claim();
})()));

// the page tells us what it loaded before this worker controlled it
self.addEventListener("message", e => {
  const d = e.data || {};
  if (d.type === "cache-urls") e.waitUntil((async () => {
    const pc = await caches.open(PAGES), ic = await caches.open(IMGS);
    await Promise.all((d.urls || []).map(async u => { try {
      const url = new URL(u, self.registration.scope); if (url.origin !== location.origin || /\.mp3$/i.test(url.pathname)) return;
      const c = isImg(url) ? ic : pc; if (c === ic && await c.match(url.href)) return;
      const r = await fetch(url.href, { cache: "force-cache" }); if (r.ok) await c.put(url.href, r);
    } catch (_) {} }));
  })());
});

const isImg = u => /\.(jpe?g|png|webp|gif|svg|ico)$/i.test(u.pathname);
const isMp3 = u => /\.mp3$/i.test(u.pathname);

self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url); if (url.origin !== location.origin) return;   // LanguageTool, news links … go straight to the network
  if (isMp3(url)) return e.respondWith(audio(e, url));
  if (isImg(url)) return e.respondWith(cacheFirst(req, IMGS));
  e.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const c = await caches.open(PAGES);
  try {
    const r = await fetch(req);
    if (r.ok && r.type === "basic") c.put(req, r.clone());
    return r;
  } catch (err) {
    const hit = await c.match(req) || await c.match(req, { ignoreSearch: true })
      || (req.mode === "navigate" && (await c.match(new URL("index.html", req.url).href, { ignoreSearch: true })));
    if (hit) return hit;
    if (req.mode === "navigate") return new Response(OFFLINE_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
    throw err;
  }
}
async function cacheFirst(req, name) {
  const c = await caches.open(name), hit = await c.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const r = await fetch(req); if (r.ok) c.put(req, r.clone()); return r;
}

/* ---------- audio: one full 200 download per file, kept in the cache; ranges served from it ---------- */
const inflight = new Map();          // url -> Promise<Blob> while the first download is running
const key = url => url.origin + url.pathname;
async function store(k, blob, type) {
  const c = await caches.open(AUDIO);
  await c.put(k, new Response(blob, { status: 200, headers: { "Content-Type": type, "Content-Length": String(blob.size) } }));
  return blob;
}
function download(k) {          // used by seeks during the first play and by "오프라인용 받기"
  if (!inflight.has(k)) inflight.set(k, (async () => {
    const r = await fetch(k, { cache: "no-store" }); if (r.status !== 200) throw new Error("audio " + r.status);
    return store(k, await r.blob(), r.headers.get("Content-Type") || "audio/mpeg");
  })().finally(() => inflight.delete(k)));
  return inflight.get(k);
}
function parseRange(h, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(h || ""); if (!m) return null;
  let s, e;
  if (m[1] === "") { s = Math.max(0, size - Number(m[2])); e = size - 1; }
  else { s = Number(m[1]); e = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1); }
  return s <= e && s < size ? [s, e] : "bad";
}
function fromBlob(blob, rangeHeader) {
  const type = blob.type || "audio/mpeg";
  if (!rangeHeader) return new Response(blob, { status: 200, headers: { "Content-Type": type, "Content-Length": String(blob.size), "Accept-Ranges": "bytes" } });
  const r = parseRange(rangeHeader, blob.size);
  if (r === "bad" || !r) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${blob.size}` } });
  const [s, e] = r, part = blob.slice(s, e + 1, type);
  return new Response(part, { status: 206, headers: { "Content-Type": type, "Content-Length": String(part.size),
    "Content-Range": `bytes ${s}-${e}/${blob.size}`, "Accept-Ranges": "bytes" } });
}
async function audio(e, url) {
  const req = e.request, k = key(url), range = req.headers.get("range");
  const hit = await (await caches.open(AUDIO)).match(k);
  if (hit) return fromBlob(await hit.blob(), range);
  if (inflight.has(k)) return fromBlob(await inflight.get(k), range);
  if (range && !/^bytes=0-$/.test(range)) return fetch(req);      // e.g. Safari's bytes=0-1 probe: tiny, straight to the network
  // first play from the start: ONE full download, streamed to the player and copied into the cache at the same time
  const r = await fetch(k, { cache: "no-store" });
  if (r.status !== 200 || !r.body) return r;
  const type = r.headers.get("Content-Type") || "audio/mpeg", len = r.headers.get("Content-Length");
  const [toPlayer, toCache] = r.body.tee();
  const p = new Response(toCache).blob().then(b => store(k, b, type)); inflight.set(k, p); p.finally(() => inflight.delete(k)).catch(() => {});
  e.waitUntil(p.catch(() => {}));
  const h = { "Content-Type": type, "Accept-Ranges": "bytes" };
  if (len) h["Content-Length"] = len;
  if (range && len) return new Response(toPlayer, { status: 206, headers: { ...h, "Content-Range": `bytes 0-${len - 1}/${len}` } });
  return new Response(toPlayer, { status: 200, headers: h });
}

const OFFLINE_HTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>오프라인</title><body style="font:17px/1.6 -apple-system,sans-serif;padding:32px;text-align:center;color:#333">
<div style="font-size:48px">📴</div><h2>오프라인이에요</h2><p>이 페이지는 아직 한 번도 열지 않아서 저장돼 있지 않아요.<br>인터넷에 연결되면 다시 시도해 주세요.</p>
<p><a href="./">← 저장된 학습 목록</a></p></body>`;
