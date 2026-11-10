/* 직독직해 built-in EN→KO dictionary (사전 뜻) — shared by the day pages and the 토요일 복습 page.
   Data: SITE/dict/en-ko.json (fetched on the first tap only, then kept by the service worker for offline use).
   Format: {"v":..., "e":{"word":"뜻1|뜻2|뜻3"}, "f":{"irregular form":"lemma"}}
   Sources: Wiktionary (CC BY-SA 4.0, via kaikki.org/wiktextract) + this site's lesson glossaries + a small hand-made list of
   function words. lookup(word) tries the word, then simple lemmas (plurals, -ed, -ing, -er/-est, -ly, 's, irregular forms). */
(function(){
  const VER = "62fb921de0";
  let P = null, DATA = null;
  function base(){ const s = document.currentScript || [...document.scripts].find(x => /\/dict\.js/.test(x.src)); return s ? s.src.replace(/dict\.js.*$/, "") : "../"; }
  const BASE = base();
  function load(){ if (DATA) return Promise.resolve(DATA);
    if (!P) P = fetch(BASE + "dict/en-ko.json?v=" + VER).then(r => { if (!r.ok) throw new Error("dict " + r.status); return r.json(); })
      .then(j => (DATA = j)).catch(e => { P = null; throw e; });
    return P; }
  const norm = w => String(w || "").replace(/[\u2018\u2019\u02BC`´]/g, "'").toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "");   // "U.S." → "u.s"
  /* candidate lemmas, most likely first */
  function cands(w){
    const out = [], add = x => { if (x && (x.length > 1 || x === "a" || x === "i") && !out.includes(x)) out.push(x); };
    let x = norm(w); add(x);
    if (/'s$/.test(x)) { x = x.slice(0, -2); add(x); }
    else if (/s'$/.test(x)) { x = x.slice(0, -1); add(x); }
    const V = "aeiou", dbl = s => s.length > 2 && s[s.length-1] === s[s.length-2] && !V.includes(s[s.length-1]) ? s.slice(0, -1) : null;
    const rules = s => {
      const r = [];
      if (/ies$/.test(s)) r.push(s.slice(0, -3) + "y");
      if (/(ches|shes|sses|xes|zes|oes)$/.test(s)) r.push(s.slice(0, -2));
      if (/ves$/.test(s)) { r.push(s.slice(0, -3) + "f"); r.push(s.slice(0, -3) + "fe"); }
      if (/s$/.test(s) && !/ss$/.test(s)) r.push(s.slice(0, -1));
      if (/ied$/.test(s)) r.push(s.slice(0, -3) + "y");
      if (/ed$/.test(s)) { const b = s.slice(0, -2); r.push(b, b + "e"); if (dbl(b)) r.push(dbl(b)); }
      if (/ing$/.test(s)) { const b = s.slice(0, -3); r.push(b, b + "e"); if (dbl(b)) r.push(dbl(b)); if (/y$/.test(b)) r.push(b.slice(0, -1) + "ie"); }
      if (/ier$/.test(s)) r.push(s.slice(0, -3) + "y");
      if (/iest$/.test(s)) r.push(s.slice(0, -4) + "y");
      if (/er$/.test(s)) { const b = s.slice(0, -2); r.push(b, b + "e"); if (dbl(b)) r.push(dbl(b)); }
      if (/est$/.test(s)) { const b = s.slice(0, -3); r.push(b, b + "e"); if (dbl(b)) r.push(dbl(b)); }
      if (/ily$/.test(s)) r.push(s.slice(0, -3) + "y");
      if (/ally$/.test(s)) r.push(s.slice(0, -4));
      if (/ly$/.test(s)) { r.push(s.slice(0, -2)); r.push(s.slice(0, -2) + "le"); }
      if (/ness$/.test(s)) r.push(s.slice(0, -4));
      return r; };
    rules(x).forEach(add);
    return out; }
  /* first hit wins; when the surface form itself is an entry ('minutes' = 회의록) and a base form also exists
     ('minute' = 분), the base form comes along as `also` so both readings are shown */
  function find(D, w){
    const hits = [];
    for (const c of cands(w)) {
      let l = D.e[c] ? c : (D.f && D.f[c] && D.e[D.f[c]] ? D.f[c] : null);
      if (l && !hits.some(h => h.lemma === l)) hits.push({lemma: l, ko: D.e[l].split("|")});
      const ir = D.e[c] && D.f && D.f[c] && D.e[D.f[c]] ? D.f[c] : null;      // 'fell' = 베다 and ← fall, 'found' ← find
      if (ir && !hits.some(h => h.lemma === ir)) { const h = {lemma: ir, ko: D.e[ir].split("|")}; return Object.assign(h, {also: hits.find(x => x.lemma === c)}); }   // irregular form: base meaning first
      if (hits.length === 2) break;
    }
    if (!hits.length) return null;
    const r = hits[0], first = cands(w)[0];
    if (hits[1] && r.lemma === first) r.also = hits[1];
    return r; }
  /* → {lemma, ko:[...], parts?} or null; hyphenated words fall back to their parts */
  async function lookup(w){
    const D = await load(); const r = find(D, w); if (r) return r;
    if (/-/.test(w)) { const ps = w.split("-").filter(s => /[a-z]/i.test(s)).map(s => ({w: s, r: find(D, s)}));
      if (ps.length && ps.some(p => p.r)) return {lemma: null, ko: [], parts: ps.map(p => ({w: p.w, lemma: p.r ? p.r.lemma : null, ko: p.r ? p.r.ko.slice(0, 2) : []}))}; }
    return null; }
  /* word tokens a page makes tappable: U.S.-style abbreviations, words with ' and hyphens; never pure numbers */
  const TOKEN = /(?:[A-Za-z]\.){2,}|[A-Za-z]+(?:['\u2019][A-Za-z]+)*(?:-[A-Za-z]+(?:['\u2019][A-Za-z]+)*)*/g;
  window.EADict = {TOKEN, load, lookup, cands, find, credit: "사전: Wiktionary(CC BY-SA 4.0) 기반"};
})();
