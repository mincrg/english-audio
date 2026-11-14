/* 나만의 단어장 — shared by every day page and /wordbook.html (same origin → same localStorage). */
(function(){
const KEY = "ea-wordbook-v1";
const esc = s => String(s==null?"":s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const POOL = ["~을 포기하다","증가하다","결정하다","놀라운","~에 반대하여","주목할 만한","줄어들다","~에 의존하다","예상하다","가능성","영향을 미치다","확인하다","~을 대신하여","드문, 희귀한","발표하다","~에 따르면"];
/* clip patterns: 회화 aN-cK, 어휘 탭 aN-vK, 표현 탭 aN-xK, 복습 rqN / weekly */
const CLIP = kind => new RegExp("(?:^|/)clips/a\\d+-" + kind + "\\d+(?:-(?:en|ko))?\\.mp3(?:\\?|#|$)", "i");
const CONV_CLIP = CLIP("c"), VOCAB_CLIP = CLIP("v"), EXPR_CLIP = CLIP("x");
function clipOf(it){ return String(it && it.clip || ""); }
function isConv(it){ return !!(it && (it.src==="conv" || CONV_CLIP.test(clipOf(it)))); }
function kind(it){
  if(!it) return "word";
  if(isConv(it)) return "conv";
  if(VOCAB_CLIP.test(clipOf(it)) || (it.type||"word")==="word") return "word";
  return "expr";   // 표현 탭 aN-xK, 주간 복습, 그 외 non-conv expr
}
function matchFilt(it, filt){
  const f=filt||"all";
  if(f==="all") return true;
  if(f==="article") return kind(it)!=="conv";   // old combined 단어·표현
  return kind(it)===f;
}
function kindLabel(it){ return {word:"단어", expr:"표현", conv:"회화"}[kind(it)]||"단어"; }
function kindBadge(it){ return {word:"🔤", expr:"📰", conv:"💬"}[kind(it)]||""; }
function withConvSrc(it){ if(!it||it.src==="conv") return it; return isConv(it)?Object.assign({},it,{src:"conv"}):it; }
function migrate(a){
  let dirty=false;
  const out=a.map(it=>{ const n=withConvSrc(it); if(n!==it) dirty=true; return n; });
  return dirty?out:a;
}
function load(){ try{ const a=JSON.parse(localStorage.getItem(KEY)||"[]"); if(!Array.isArray(a)) return [];
    const m=migrate(a); if(m!==a) save(m); return m; }catch(e){ return []; } }
function save(a){ try{ localStorage.setItem(KEY, JSON.stringify(a)); return true; }catch(e){ alert("저장 공간을 쓸 수 없어요 (사파리 개인정보 보호 모드인지 확인해 주세요)."); return false; } }
const idOf = it => (it.type||"word")+"|"+String(it.en).trim().toLowerCase();
const listeners = [];
function changed(){ listeners.forEach(f=>{ try{ f(); }catch(e){} }); }
window.addEventListener("storage", e => { if(e.key===KEY) changed(); });

const audio = new Audio(); audio.preload="none"; audio.setAttribute("playsinline","");
/* EN/KO gap between the separate English and Korean clips (seconds), shared with every day page */
const GAP_KEY = "ea-gap-v1", GAPS = [0, 0.3, 0.6, 1, 1.5];
function getGap(){ try{ const v=parseFloat(localStorage.getItem(GAP_KEY)); return GAPS.includes(v)?v:0.3; }catch(e){ return 0.3; } }
/* a combined day clip (…/clips/a1-v2.mp3, a1-x1.mp3, rq3.mp3) has separate -en / -ko files next to it: EN→KO ×3 */
/* how many EN→KO rounds per vocab / expression item (1–3), shared like the gap */
const REPS_KEY = "ea-reps-v1", REPS = [1, 2, 3];
function getReps(){ try{ const v=parseInt(localStorage.getItem(REPS_KEY),10); return REPS.includes(v)?v:3; }catch(e){ return 3; } }
/* global playback speed, shared with every day page */
const RATE_KEY = "ea-rate-v1", RATES = [0.8, 0.9, 1, 1.2];
function getRate(){ try{ const v=parseFloat(localStorage.getItem(RATE_KEY)); return RATES.includes(v)?v:1; }catch(e){ return 1; } }
const enkoParts = (e, k) => Array.from({length:getReps()}, () => [e, k]).flat();
function isSprite(p){ return !!(p && typeof p==="object" && p.src!=null && p.start!=null && p.end!=null); }
function partsFor(url){
  if(!url) return [];
  if(url.parts) return url.parts;
  if(typeof url!=="string") return [url];
  const m=url.match(/^(.*\/clips\/(?:a\d+-[vxc]\d+|rq\d+))\.mp3$/);
  if(!m) return [url];
  return enkoParts(m[1]+"-en.mp3", m[1]+"-ko.mp3");
}
function sameSrc(a, b){ try{ return new URL(a, location.href).href===new URL(b, location.href).href; }catch(e){ return a===b; } }
let cur = null;                      // {id, url, parts, i, timer, list?, li?, paused?, held?, spriteEnd?}
let playingId = null;
const ITEM_GAP = 0.9;                // pause between items when playing the whole list
function finish(){ if(cur && cur.timer) clearTimeout(cur.timer); if(cur) cur.spriteEnd=null; cur=null; playingId=null; changed(); }
function afterPart(){ if(!cur) return;
  const more = cur.i+1 < cur.parts.length, next = cur.list && cur.li+1 < cur.list.length;
  if(more || next) cur.timer=setTimeout(advance, (more ? getGap() : ITEM_GAP)*1000); else finish(); }
/* Library (wbclips) words live inside ~3-minute sprite mp3 packs. Seeking into the pack and stopping on
   timeupdate is imprecise on iPhone/iPad Safari (stops mid-word or mid-뜻, or bleeds into the next word), so
   the pack is decoded once with Web Audio and each word plays as its own small WAV (sample-exact, normal
   'ended'). The seek path stays only as a fallback when decoding is unavailable or fails. */
const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
const SEG_PRE = 0.07, SEG_POST = 0.09;      // packs keep 0.18 s of silence between words
const packBuf = new Map(), segUrl = new Map();
function lruTouch(m, k, v){ m.delete(k); m.set(k, v); }
function decodeAB(ab){
  return new Promise((res, rej) => {
    let ctx; try{ ctx = new OAC(1, 1, 24000); }catch(e){ try{ ctx = new OAC(1, 1, 44100); }catch(e2){ rej(e2); return; } }
    try{ const pr = ctx.decodeAudioData(ab, res, rej); if(pr && pr.then) pr.then(res, rej); }catch(e){ rej(e); }
  });
}
function decodePack(src){
  if(!OAC) return Promise.reject(new Error("no web audio"));
  if(packBuf.has(src)){ const p=packBuf.get(src); lruTouch(packBuf, src, p); return p; }
  const p = fetch(src).then(r => { if(!r.ok) throw new Error("pack " + r.status); return r.arrayBuffer(); }).then(decodeAB);
  p.catch(() => { if(packBuf.get(src)===p) packBuf.delete(src); });
  packBuf.set(src, p);
  while(packBuf.size > 3) packBuf.delete(packBuf.keys().next().value);
  return p;
}
function wavURL(buf, t0, t1){
  const sr = buf.sampleRate, ch = buf.getChannelData(0);
  const a = Math.max(0, Math.floor(t0*sr)), b = Math.min(ch.length, Math.ceil(t1*sr)), n = Math.max(1, b-a);
  const v = new DataView(new ArrayBuffer(44 + n*2));
  const str = (o, t) => { for(let i=0;i<t.length;i++) v.setUint8(o+i, t.charCodeAt(i)); };
  str(0,"RIFF"); v.setUint32(4, 36+n*2, true); str(8,"WAVE"); str(12,"fmt "); v.setUint32(16,16,true); v.setUint16(20,1,true);
  v.setUint16(22,1,true); v.setUint32(24,sr,true); v.setUint32(28,sr*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true);
  str(36,"data"); v.setUint32(40, n*2, true);
  const fade = Math.min(Math.floor(sr*0.008), n>>1);       // 8 ms fade in/out: no click at the cut
  for(let i=0;i<n;i++){
    let x = ch[a+i] || 0;
    if(i < fade) x *= i/fade; else if(i >= n-fade) x *= (n-1-i)/fade;
    v.setInt16(44 + i*2, Math.max(-1, Math.min(1, x)) * 0x7fff, true);
  }
  return URL.createObjectURL(new Blob([v.buffer], {type:"audio/wav"}));
}
function segmentURL(p){
  const k = p.src + "|" + p.start + "|" + p.end;
  if(segUrl.has(k)){ const u=segUrl.get(k); lruTouch(segUrl, k, u); return Promise.resolve(u); }
  return decodePack(p.src).then(buf => {
    if(segUrl.has(k)) return segUrl.get(k);
    const u = wavURL(buf, p.start - SEG_PRE, p.end + SEG_POST);
    segUrl.set(k, u);
    while(segUrl.size > 150){ const [k0, u0] = segUrl.entries().next().value; if(sameSrc(audio.src, u0)) break; segUrl.delete(k0); try{ URL.revokeObjectURL(u0); }catch(e){} }
    return u;
  });
}
function prefetchItem(it){ try{ const ps = partsFor(it && it.url); ps.forEach(q => { if(isSprite(q)) segmentURL(q).catch(()=>{}); }); }catch(e){} }
/* iOS only lets an element start audio later (after an async decode) if it was started inside a tap once */
let unlocked = false, unlocking = false;
const SILENT = "data:audio/wav;base64,UklGRgQCAABXQVZFZm10IBAAAAABAAEAwF0AAIC7AAACABAAZGF0YeABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";   // 10 ms of silence
function unlockAudio(){
  if(unlocked) return; unlocked = true;
  try{ if(!audio.paused) return; unlocking = true; audio.src = SILENT; const pr = audio.play(); if(pr && pr.catch) pr.catch(()=>{ unlocking=false; }); }catch(e){ unlocking = false; }
}
function playSpriteSeek(p){
  cur.spriteEnd=p.end;
  const kick=()=>{
    const go=()=>{ if(!cur||cur.parts[cur.i]!==p) return; audio.play().catch(()=>{}); };
    try{ audio.currentTime=p.start; }catch(e){}
    if(Math.abs((audio.currentTime||0)-p.start)<0.12) go();
    else audio.addEventListener("seeked", go, {once:true});
  };
  if(sameSrc(audio.src, p.src) && audio.readyState>=2) kick();
  else { audio.src=p.src; audio.addEventListener("loadeddata", kick, {once:true}); audio.load(); }
}
function playPart(){
  if(!audio.paused) skipPause=true;
  const p=cur.parts[cur.i], me=cur;
  audio.defaultPlaybackRate=audio.playbackRate=getRate();
  cur.spriteEnd=null;
  if(isSprite(p)){
    if(!OAC){ unlocking=false; playSpriteSeek(p); return; }
    segmentURL(p).then(u => {
      if(cur!==me || cur.parts[cur.i]!==p) return;
      if(!audio.paused) skipPause=true;
      unlocking=false; audio.src=u; audio.defaultPlaybackRate=audio.playbackRate=getRate();
      if(!cur.paused) audio.play().catch(()=>{});      // paused while decoding: ▶ resumes this word
    }, () => { if(cur===me && cur.parts[cur.i]===p){ unlocking=false; playSpriteSeek(p); } });
  } else {
    unlocking=false; audio.src=p; audio.play().catch(()=>{});
  }
}
function loadItem(li){ const it=cur.list[li]; cur.li=li; cur.id=it.id; cur.url=it.url; cur.parts=partsFor(it.url); cur.i=0; playingId=it.id; playPart(); changed();
  if(cur.list[li+1]) prefetchItem(cur.list[li+1]); }
function advance(){ if(!cur) return; cur.timer=null;
  if(cur.i+1 < cur.parts.length){ cur.i++; playPart(); }
  else if(cur.list && cur.li+1 < cur.list.length) loadItem(cur.li+1);
  else finish(); }
audio.addEventListener("ended", () => { if(unlocking){ unlocking=false; return; } if(!cur) return; if(cur.spriteEnd!=null) return; afterPart(); });
audio.addEventListener("timeupdate", () => {
  if(!cur || cur.spriteEnd==null || cur.paused) return;
  if(audio.currentTime >= cur.spriteEnd - 0.02){
    cur.spriteEnd=null; skipPause=true; try{ audio.pause(); }catch(e){} afterPart();
  }
});
let skipPause = false;
audio.addEventListener("pause", () => { if(unlocking) return; if(skipPause){ skipPause=false; return; } if(cur && cur.list) return; if(cur && !audio.ended && !cur.timer && cur.spriteEnd==null) finish(); });
audio.addEventListener("error", () => { if(unlocking){ unlocking=false; return; } if(cur && cur.parts.length>1 && typeof cur.url==="string"){ cur.parts=[cur.url]; cur.i=0; playPart(); } });   // older days: combined clip only
window.addEventListener("storage", e => { if(e.key===GAP_KEY||e.key===REPS_KEY||e.key===RATE_KEY){ if(e.key===RATE_KEY) audio.playbackRate=getRate(); WB.refreshGap(); if(WB.onGap) WB.onGap(); } });

/* Ava/SunHi mp3 library for rows saved without a day clip (glossary / 📖 사전 뜻 ☆). */
const WB_BASE = (()=>{ const s=document.currentScript || [...document.scripts].find(x=>/wb\.js(\?|$)/.test(x.src||"")); return s ? s.src.replace(/wb\.js(\?.*)?$/,"") : "./"; })();
const normEn = s => String(s||"").replace(/[\u2018\u2019\u02BC`´]/g,"'").toLowerCase().replace(/\s+/g," ").trim();
const normKo = s => String(s||"").replace(/\s+/g," ").trim();
let clipIdx = null, clipWait = null;
function loadClips(){
  if(clipIdx) return Promise.resolve(clipIdx);
  if(!clipWait) clipWait = fetch(WB_BASE+"wbclips/index.json",{cache:"no-cache"}).then(r=>r.ok?r.json():null)
    .then(j=>{ clipIdx=j||{}; changed(); return clipIdx; })
    .catch(()=>{ clipIdx={}; return clipIdx; });
  return clipWait;
}
loadClips();
function absClip(rel){ try{ return new URL(rel, WB_BASE).href; }catch(e){ return rel; } }
function spriteHit(kind, key){
  const map=clipIdx && clipIdx[kind]; if(!map||!key) return null;
  if(map[key]) return map[key];
  if(kind!=="ko") return null;
  const hit=Object.keys(map).find(x=>x===key||x.startsWith(key+",")||x.startsWith(key+" ")||x.startsWith(key+" (")||key.startsWith(x+",")||key.startsWith(x+" ")||key.startsWith(x+" ("));
  return hit ? map[hit] : null;
}
function spriteOf(kind, text){
  const key = kind==="en" ? normEn(text) : normKo(text);
  const hit = spriteHit(kind, key);
  if(!hit) return null;
  const url = hit[2] || clipIdx[kind+"Url"] || ("wbclips/"+kind+".mp3");
  return {src: absClip(url), start:hit[0], end:hit[1]};
}
function resolveClip(it){
  if(!it) return null;
  if(it.clip) return it.clip;
  if(!clipIdx) return null;
  const en=normEn(it.en), ko=normKo(it.ko);
  const exact = ko && (clipIdx.day||{})[en+"|"+ko];
  if(exact) return absClip(exact);
  const pe=spriteOf("en", it.en), pk=ko ? spriteOf("ko", it.ko) : null;
  if(pe && pk) return {parts: enkoParts(pe, pk)};
  if(pe) return {parts: Array.from({length:getReps()},()=>pe)};   // same Ava EN even if the saved 뜻 is not in the library
  return null;
}
function hasClip(it){ return !!(it && (it.clip || resolveClip(it))); }

/* speechSynthesis EN→KO for wordbook rows still missing mp3s. Ava/SunHi are Edge neural
   names for the day mp3s — iPhone/iPad Safari usually has Samantha / Yuna; we pick those first. */
let ttsId = null, ttsTimer = null, ttsKeep = null;
function ttsClearTimer(){ if(ttsTimer){ clearTimeout(ttsTimer); ttsTimer=null; } }
function ttsStop(){ ttsClearTimer(); try{ speechSynthesis.cancel(); }catch(e){} const was=ttsId; ttsId=null; if(was!==null) changed(); }
function pickVoices(vs){
  vs = vs || [];
  const named = (re, lang) => vs.find(v=>re.test(v.name)&&lang.test(v.lang));
  const lang = re => vs.find(v=>re.test(v.lang));
  const en = named(/\bAva\b/, /^en[-_]US/i)
    || named(/\bSamantha\b/, /^en[-_]US/i)
    || named(/\bNicky\b/, /^en[-_]US/i)
    || named(/\bAllison\b/, /^en[-_]US/i)
    || named(/\bSusan\b/, /^en[-_]US/i)
    || named(/\bSamantha\b/, /^en/i)
    || lang(/^en[-_]US/i)
    || lang(/^en/i);
  const ko = named(/(SunHi|Google\s*한국어|\bYuna\b|\bSora\b)/i, /^ko/i)
    || lang(/^ko[-_]?KR/i)
    || lang(/^ko/i);
  return {en, ko};
}
function ttsSay(en, ko, id){
  try{
    const ss = window.speechSynthesis; if(!ss) return;
    if(id!=null && ttsId===id){ ttsStop(); return; }
    const busy = ss.speaking || ss.pending;      // Safari can drop/cut an utterance spoken right after cancel()
    ttsStop();
    if(cur) WB.stop();
    en = String(en||"").trim(); ko = String(ko||"").trim();
    if(!en) return;
    const reps = getReps(), gapMs = Math.max(0, getGap())*1000, rate = getRate();
    ttsId = id; changed();
    let rep = 0;
    const voices = () => pickVoices(ss.getVoices());
    function utter(text, lang, voice, next){
      if(ttsId!==id) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang; u.rate = rate;
      if(voice) u.voice = voice;
      const go = () => { if(ttsId===id) next(); };
      u.onend = go; u.onerror = go;
      ttsKeep = u;                                 // keep a reference: a collected utterance stops mid-word (Chrome/Safari)
      ss.speak(u);
    }
    function afterGap(fn){
      if(ttsId!==id) return;
      if(!gapMs) fn();
      else { ttsClearTimer(); ttsTimer=setTimeout(()=>{ ttsTimer=null; if(ttsId===id) fn(); }, gapMs); }
    }
    function round(){
      if(ttsId!==id) return;
      if(rep>=reps){ ttsId=null; changed(); return; }
      const v = voices();
      utter(en, "en-US", v.en, ()=>{
        afterGap(()=>{
          if(!ko){ rep++; afterGap(round); return; }
          utter(ko, "ko-KR", v.ko, ()=>{
            rep++;
            if(rep>=reps){ ttsId=null; changed(); return; }
            afterGap(round);
          });
        });
      });
    }
    // voices may load async on Safari — kick a refresh then start
    let started = false;
    const start = ()=>{ if(started || ttsId!==id) return; started = true; round(); };
    if(!ss.getVoices().length){
      ss.addEventListener("voiceschanged", start, {once:true});
      setTimeout(start, 250);
    } else if(busy) setTimeout(start, 150);
    else start();
  }catch(e){ ttsId=null; }
}

const WB = {
  KEY, esc, isConv, kind, kindBadge, matchFilt, kindLabel,
  all: load,
  has: it => load().some(x => x.id===idOf(it)),
  add(it){ const a=load(), id=idOf(it); if(a.some(x=>x.id===id)) return;
    const src = it.src==="conv" || isConv(it) ? "conv" : (it.src||"");
    a.unshift({id, type:it.type||"word", en:it.en, ko:it.ko, pos:it.pos||"", ex:it.ex||"", date:it.date||"", article:it.article||"", clip:it.clip||"", page:it.page||"", src, saved:new Date().toISOString()});
    if(save(a)) changed(); },
  remove(id){ if(save(load().filter(x=>x.id!==id))) changed(); },
  removeMany(ids){
    const set=new Set(ids||[]); const a=load();
    const removed=a.map((x,i)=>({x,i})).filter(p=>set.has(p.x.id));
    if(!removed.length) return [];
    if(!save(a.filter(x=>!set.has(x.id)))) return [];
    changed(); return removed;
  },
  restoreMany(removed){
    if(!removed||!removed.length) return;
    const a=load(), have=new Set(a.map(x=>x.id));
    removed.filter(p=>p&&p.x&&!have.has(p.x.id)).slice().sort((p,q)=>p.i-q.i)
      .forEach(p=>{ a.splice(Math.min(p.i, a.length), 0, p.x); have.add(p.x.id); });
    if(save(a)) changed();
  },
  toggle(it){ if(WB.has(it)) WB.remove(idOf(it)); else WB.add(it); return WB.has(it); },
  idOf, onChange: f => listeners.push(f),
  onPlay: null,                        // set by a host page to stop its own audio
  ttsSay, ttsStop, isTts: id => ttsId===id,
  loadClips, resolveClip, hasClip,
  playItem(it, id){ if(!it) return; const c=resolveClip(it); if(c) WB.play(c, id||it.id); else ttsSay(it.en, it.ko, id||it.id); },
  play(url, id){ if(!url) return; ttsStop(); if(WB.onPlay) WB.onPlay(); unlockAudio();
    const pid=id|| (typeof url==="string"?url:"item");
    if(cur && cur.id===pid){ WB.stop(); return; }
    if(cur && cur.timer) clearTimeout(cur.timer);
    cur={id:pid, url, parts:partsFor(url), i:0, timer:null}; playingId=pid; playPart(); changed(); },
  /* play-all: list = [{id,url}] in display order */
  playList(list, li=0){ list=(list||[]).filter(x=>x.url); if(!list.length) return; if(WB.onPlay) WB.onPlay(); unlockAudio();
    if(cur && cur.timer) clearTimeout(cur.timer);
    cur={list, li:0, timer:null}; loadItem(Math.max(0, Math.min(list.length-1, li))); },
  toggleList(list){ if(!cur || !cur.list){ WB.playList(list, 0); return; }
    if(cur.paused){ cur.paused=false; if(cur.held){ cur.held=false; advance(); } else audio.play().catch(()=>{}); }
    else { cur.paused=true; if(cur.timer){ clearTimeout(cur.timer); cur.timer=null; cur.held=true; } else audio.pause(); }
    changed(); },
  jump(list, d){ if(cur && cur.list){ if(cur.timer){ clearTimeout(cur.timer); cur.timer=null; } cur.paused=false; cur.held=false;
      loadItem(Math.max(0, Math.min(cur.list.length-1, cur.li+d))); } else WB.playList(list, d>0 ? 1 : 0); },
  listState: () => cur && cur.list ? {active:true, paused:!!cur.paused, li:cur.li, n:cur.list.length, id:cur.id} : {active:false},
  stop(){ if(!cur) return; finish(); audio.pause(); },
  isPlaying: id => !!cur && cur.id===id,
  partsFor,
  GAPS, gap: getGap,
  setGap(v){ try{ localStorage.setItem(GAP_KEY, String(v)); }catch(e){} WB.refreshGap(); if(WB.onGap) WB.onGap(v); },
  onGap: null,
  RATES, rate: getRate,
  setRate(r){ try{ localStorage.setItem(RATE_KEY, String(r)); }catch(e){} audio.defaultPlaybackRate=audio.playbackRate=r; if(WB.onGap) WB.onGap(); },
  REPS, reps: getReps, enkoParts,
  setReps(n){ try{ localStorage.setItem(REPS_KEY, String(n)); }catch(e){} WB.refreshGap(); if(WB.onGap) WB.onGap(); },
  gapHTML: () => `<span class="lab">반복</span><span class="seg wbreps">${REPS.map(n=>`<button data-reps="${n}" class="${n===getReps()?"on":""}" onclick="WB.setReps(${n})">${n}회</button>`).join("")}</span>
  <span class="lab">간격(초)</span><span class="seg wbgap">${GAPS.map(g=>`<button data-gap="${g}" class="${g===getGap()?"on":""}" onclick="WB.setGap(${g})">${g}</button>`).join("")}</span>`,
  refreshGap(root=document){ const g=getGap(); root.querySelectorAll(".wbgap button").forEach(b=>b.classList.toggle("on", Number(b.dataset.gap)===g));
    const n=getReps(); root.querySelectorAll(".wbreps button").forEach(b=>b.classList.toggle("on", Number(b.dataset.reps)===n)); },
  exportText(){ return JSON.stringify({app:"english-audio-wordbook",v:1,items:load()}, null, 1); },
  importText(t){ let items; try{ const o=JSON.parse(t); items=Array.isArray(o)?o:o.items; }catch(e){ throw new Error("JSON 형식이 아니에요."); }
    if(!Array.isArray(items)) throw new Error("items 목록이 없어요.");
    const a=load(), have=new Set(a.map(x=>x.id)); let n=0;
    items.forEach(it=>{ if(!it||!it.en||!it.ko) return; const id=it.id||idOf(it); if(have.has(id)) return; have.add(id); a.push(withConvSrc({...it,id})); n++; });
    save(a); changed(); return n; },

  /* ---- star button helpers ---- */
  starHTML: (it) => `<button class="ico wbstar" data-wbid="${esc(idOf(it))}" aria-label="단어장에 저장" onclick='WB._star(this)' data-wb='${esc(JSON.stringify(it))}'>${WB.has(it)?"⭐":"☆"}</button>`,
  _star(btn){ const it=JSON.parse(btn.dataset.wb); const on=WB.toggle(it); btn.textContent=on?"⭐":"☆"; WB.toast(on?"⭐ 단어장에 저장했어요":"단어장에서 뺐어요"); },
  refreshStars(root=document){ const ids=new Set(load().map(x=>x.id)); root.querySelectorAll(".wbstar").forEach(b=>b.textContent=ids.has(b.dataset.wbid)?"⭐":"☆"); },
  toast(msg, opt){ opt=opt||{};
    let t=document.getElementById("wbtoast"); if(!t){ t=document.createElement("div"); t.id="wbtoast"; document.body.appendChild(t); }
    clearTimeout(t._h);
    t.style.cssText="position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom));transform:translateX(-50%);background:#333;color:#fff;padding:8px 14px;border-radius:999px;font-size:14px;z-index:99;opacity:0;transition:opacity .2s;display:flex;gap:10px;align-items:center;max-width:min(92vw,420px);box-sizing:border-box";
    t.style.pointerEvents = opt.action ? "auto" : "none";
    t.textContent="";
    const s=document.createElement("span"); s.textContent=msg; t.appendChild(s);
    if(opt.action){
      const b=document.createElement("button"); b.type="button"; b.textContent=opt.action;
      b.style.cssText="font:inherit;font-weight:700;font-size:14px;border:0;background:transparent;color:#8ab4f8;min-height:44px;min-width:44px;padding:0 8px;cursor:pointer;-webkit-tap-highlight-color:transparent";
      b.addEventListener("click", ev=>{ ev.preventDefault(); ev.stopPropagation(); t.style.opacity="0"; t.style.pointerEvents="none"; if(opt.onAction) opt.onAction(); });
      t.appendChild(b);
    }
    t.style.opacity="1";
    t._h=setTimeout(()=>{ t.style.opacity="0"; t.style.pointerEvents="none"; }, opt.ms || (opt.action?5500:1400));
  },

  /* ---- multiple-choice review quiz over saved items ---- */
  quiz(el, opts={}){
    const st={ items:[], tries:{}, limit:opts.limit||10, type:opts.type||"all" };
    function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
    function build(){
      const all=load(), pool=all.filter(x=>matchFilt(x, st.type));
      st.items=shuffle(pool.slice()).slice(0,st.limit).map(x=>{
        const same=all.filter(y=>y.id!==x.id&&y.ko!==x.ko&&y.type===x.type).map(y=>y.ko);
        const other=all.filter(y=>y.id!==x.id&&y.ko!==x.ko).map(y=>y.ko);
        const ds=[...new Set([...shuffle(same),...shuffle(other),...shuffle(POOL.slice())])].filter(k=>k!==x.ko).slice(0,2);
        const choices=shuffle([x.ko,...ds]); return {x, choices, ans:choices.indexOf(x.ko)};
      });
      st.tries={}; draw();
    }
    function hint(x){ const where = x.date ? `${x.date}${x.article?` '${x.article}'`:""} 기사` : "저장한 기사";
      return `힌트: ${where}에 나온 ${kindLabel(x)}이에요.${x.ex?` 기사 속 쓰임: "${x.ex}"`:""}${x.pos?` (${x.pos})`:""}`; }
    function draw(){
      if(!st.items.length){ el.innerHTML=`<div class="note">${load().length? "이 종류로 저장한 항목이 없어요." : "아직 저장한 단어·표현이 없어요. 각 날짜 페이지의 ☆ 버튼을 눌러 저장해 보세요."}</div>`; return; }
      const L="ABC";
      el.innerHTML = st.items.map((q,i)=>{ const t=st.tries[i]||[], solved=t.includes(q.ans), wrong=!solved&&t.length>0;
        const sid="q"+i, speaking=WB.isPlaying(sid)||WB.isTts(sid);
        return `<div class="q"><div class="row" style="margin:0"><button class="ico" data-speak="${i}" aria-label="듣기">${speaking?"⏹ 정지":"🔊"}</button><b>W${i+1}. '${esc(q.x.en)}'의 뜻은?</b> <span class="note">${kindLabel(q.x)}</span></div>
        ${q.choices.map((c,j)=>`<div class="opt">${L[j]}. ${esc(c)}</div>`).join("")}
        <div class="row">${q.choices.map((c,j)=>`<button class="${solved&&j===q.ans?"pri":""}" ${solved||t.includes(j)?"disabled":""} data-i="${i}" data-j="${j}">${L[j]}</button>`).join("")}</div>
        ${solved?`<div class="fb"><span class="okc">✅ 정답! (${L[q.ans]})</span> ${esc(q.x.en)} = ${esc(q.x.ko)}</div>`:""}
        ${wrong?`<div class="fb"><span class="badc">❌ 오답 (${L[t[t.length-1]]})</span> ${esc(hint(q.x))} 다시 골라 보세요.</div>`:""}</div>`; }).join("")
        + `<div class="row"><button data-act="again">↺ 다시 풀기</button><button data-act="new">🔀 새 문제</button><span class="note">점수: ${st.items.filter((q,i)=>(st.tries[i]||[])[0]===q.ans).length} / ${st.items.length} (첫 시도 기준)</span></div>`;
    }
    el.addEventListener("click", e=>{ const b=e.target.closest("button"); if(!b||!el.contains(b)) return;
      if(b.dataset.act==="again"){ st.tries={}; draw(); return; }
      if(b.dataset.act==="new"){ build(); return; }
      if(b.dataset.speak!==undefined){ const i=+b.dataset.speak, q=st.items[i], sid="q"+i; if(!q) return;
        WB.playItem(q.x, sid); draw(); return; }
      if(b.dataset.j!==undefined){ const i=+b.dataset.i, j=+b.dataset.j, t=st.tries[i]||[]; if(t.includes(st.items[i].ans)||t.includes(j)) return; st.tries[i]=[...t,j]; draw(); } });
    WB.onChange(()=>{ if(el.isConnected) draw(); });
    build();
    return { rebuild:build, setType(t){ st.type=t; build(); } };
  }
};
window.WB = WB;
})();
