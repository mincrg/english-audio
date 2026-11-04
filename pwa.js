/* 직독직해 PWA helper: registers the service worker, hands it the files this page loaded,
   shows an update toast, and offers PWA.saveAudio / audioState / removeAudio for "오프라인용 받기". */
(function () {
  const AUDIO = "ea-audio-v1";
  const me = document.currentScript, base = new URL(".", me.src).href;      // …/english-audio/
  const PWA = window.PWA = { base, ready: null };

  function toast(html, ms) {
    let t = document.getElementById("pwa-toast");
    if (!t) { t = document.createElement("div"); t.id = "pwa-toast"; t.setAttribute("role", "status");
      t.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:calc(84px + env(safe-area-inset-bottom));z-index:60;max-width:92vw;" +
        "background:#1b1b1b;color:#fff;padding:10px 14px;border-radius:12px;font:15px/1.4 -apple-system,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.25)";
      document.body.appendChild(t); }
    t.innerHTML = html; t.hidden = false; clearTimeout(t._h); if (ms) t._h = setTimeout(() => t.hidden = true, ms);
    return t;
  }
  PWA.toast = toast;

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    if ("serviceWorker" in navigator) {
      const hadController = !!navigator.serviceWorker.controller;
      PWA.ready = navigator.serviceWorker.register(base + "sw.js", { scope: base }).then(() => navigator.serviceWorker.ready).catch(() => null);
      const send = () => navigator.serviceWorker.ready.then(reg => {
        const urls = [location.href].concat(performance.getEntriesByType("resource").map(e => e.name)
          .filter(u => u.startsWith(location.origin) && !/\.mp3(\?|$)/i.test(u)));
        (navigator.serviceWorker.controller || reg.active).postMessage({ type: "cache-urls", urls });
      });
      if (document.readyState === "complete") send(); else addEventListener("load", send);
      let reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!hadController || reloading) return;          // first install: nothing to refresh
        const t = toast('새 버전이 나왔어요. <button id="pwa-reload" style="margin-left:8px;font:inherit;padding:6px 12px;border-radius:8px;border:0;background:#8ab4f8;color:#111">새로고침</button>');
        t.querySelector("#pwa-reload").onclick = () => { reloading = true; location.reload(); };
      });
    }
  }

  /* ---------- offline audio for one day ---------- */
  const abs = u => new URL(u, location.href).href.split("?")[0];
  PWA.audioState = async (urls) => {
    if (!("caches" in window)) return { n: 0, total: urls.length, bytes: 0 };
    const c = await caches.open(AUDIO); let n = 0, bytes = 0;
    for (const u of urls) { const r = await c.match(abs(u)); if (r) { n++; bytes += Number(r.headers.get("Content-Length")) || (await r.clone().blob()).size; } }
    return { n, total: urls.length, bytes };
  };
  PWA.saveAudio = async (urls, onProgress) => {
    const c = await caches.open(AUDIO); let done = 0, failed = 0;
    const queue = urls.slice(), worker = async () => { while (queue.length) { const u = abs(queue.shift());
      try { if (!(await c.match(u))) { const r = await fetch(u, { cache: "no-store" }); if (r.status !== 200) throw 0;
          const b = await r.blob(); await c.put(u, new Response(b, { status: 200, headers: { "Content-Type": r.headers.get("Content-Type") || "audio/mpeg", "Content-Length": String(b.size) } })); }
      } catch (e) { failed++; }
      done++; onProgress && onProgress(done, urls.length, failed); } };
    await Promise.all([worker(), worker(), worker(), worker()]);
    return { done, failed };
  };
  PWA.removeAudio = async (urls) => { const c = await caches.open(AUDIO); for (const u of urls) await c.delete(abs(u)); };
})();
