/* 나만의 단어장 — shared by every day page and /wordbook.html (same origin → same localStorage). */
(function(){
const KEY = "ea-wordbook-v1";
const esc = s => String(s==null?"":s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const POOL = ["~을 포기하다","증가하다","결정하다","놀라운","~에 반대하여","주목할 만한","줄어들다","~에 의존하다","예상하다","가능성","영향을 미치다","확인하다","~을 대신하여","드문, 희귀한","발표하다","~에 따르면"];
function load(){ try{ const a=JSON.parse(localStorage.getItem(KEY)||"[]"); return Array.isArray(a)?a:[]; }catch(e){ return []; } }
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
function partsFor(url){ const m=String(url||"").match(/^(.*\/clips\/(?:a\d+-[vxc]\d+|rq\d+))\.mp3$/); if(!m) return [url]; return enkoParts(m[1]+"-en.mp3", m[1]+"-ko.mp3"); }
let cur = null;                      // {id, url, parts, i, timer, list?, li?, paused?, held?}  list = play-all queue [{id,url}]
let playingId = null;
const ITEM_GAP = 0.9;                // pause between items when playing the whole list
function finish(){ if(cur && cur.timer) clearTimeout(cur.timer); cur=null; playingId=null; changed(); }
function playPart(){ if(!audio.paused) skipPause=true; audio.src=cur.parts[cur.i]; audio.defaultPlaybackRate=audio.playbackRate=getRate(); audio.play().catch(()=>{}); }
function loadItem(li){ const it=cur.list[li]; cur.li=li; cur.id=it.id; cur.url=it.url; cur.parts=partsFor(it.url); cur.i=0; playingId=it.id; playPart(); changed(); }
function advance(){ if(!cur) return; cur.timer=null;
  if(cur.i+1 < cur.parts.length){ cur.i++; playPart(); }
  else if(cur.list && cur.li+1 < cur.list.length) loadItem(cur.li+1);
  else finish(); }
audio.addEventListener("ended", () => { if(!cur) return;
  const more = cur.i+1 < cur.parts.length, next = cur.list && cur.li+1 < cur.list.length;
  if(more || next) cur.timer=setTimeout(advance, (more ? getGap() : ITEM_GAP)*1000); else finish(); });
let skipPause = false;
audio.addEventListener("pause", () => { if(skipPause){ skipPause=false; return; } if(cur && cur.list) return; if(cur && !audio.ended && !cur.timer) finish(); });
audio.addEventListener("error", () => { if(cur && cur.parts.length>1){ cur.parts=[cur.url]; cur.i=0; playPart(); } });   // older days: combined clip only
window.addEventListener("storage", e => { if(e.key===GAP_KEY||e.key===REPS_KEY||e.key===RATE_KEY){ if(e.key===RATE_KEY) audio.playbackRate=getRate(); WB.refreshGap(); if(WB.onGap) WB.onGap(); } });


/* speechSynthesis EN→KO for wordbook rows saved without mp3 clips (glossary ☆). Ava/SunHi are Edge neural
   names for the day mp3s — iPhone Safari usually has other en-US / ko-KR system voices; we pick the best available. */
let ttsId = null, ttsTimer = null;
function ttsClearTimer(){ if(ttsTimer){ clearTimeout(ttsTimer); ttsTimer=null; } }
function ttsStop(){ ttsClearTimer(); try{ speechSynthesis.cancel(); }catch(e){} const was=ttsId; ttsId=null; if(was!==null) changed(); }
function pickVoices(vs){
  vs = vs || [];
  const en = vs.find(v=>/\bAva\b/.test(v.name)&&/^en[-_]US/i.test(v.lang))
    || vs.find(v=>/^en[-_]US/i.test(v.lang))
    || vs.find(v=>/^en/i.test(v.lang));
  const ko = vs.find(v=>/(SunHi|Google\s*한국어|\bYuna\b)/i.test(v.name)&&/^ko/i.test(v.lang))
    || vs.find(v=>/^ko[-_]?KR/i.test(v.lang))
    || vs.find(v=>/^ko/i.test(v.lang));
  return {en, ko};
}
function ttsSay(en, ko, id){
  try{
    const ss = window.speechSynthesis; if(!ss) return;
    if(id!=null && ttsId===id){ ttsStop(); return; }
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
    if(!ss.getVoices().length){
      const kick = ()=>{ if(ttsId===id) round(); };
      ss.addEventListener("voiceschanged", kick, {once:true});
      setTimeout(kick, 250);
    } else round();
  }catch(e){ ttsId=null; }
}

const WB = {
  KEY, esc,
  all: load,
  has: it => load().some(x => x.id===idOf(it)),
  add(it){ const a=load(), id=idOf(it); if(a.some(x=>x.id===id)) return;
    a.unshift({id, type:it.type||"word", en:it.en, ko:it.ko, pos:it.pos||"", ex:it.ex||"", date:it.date||"", article:it.article||"", clip:it.clip||"", page:it.page||"", saved:new Date().toISOString()});
    if(save(a)) changed(); },
  remove(id){ if(save(load().filter(x=>x.id!==id))) changed(); },
  toggle(it){ if(WB.has(it)) WB.remove(idOf(it)); else WB.add(it); return WB.has(it); },
  idOf, onChange: f => listeners.push(f),
  onPlay: null,                        // set by a host page to stop its own audio
  ttsSay, ttsStop, isTts: id => ttsId===id,
  play(url, id){ if(!url) return; ttsStop(); if(WB.onPlay) WB.onPlay();
    const pid=id||url;
    if(cur && cur.id===pid){ WB.stop(); return; }
    if(cur && cur.timer) clearTimeout(cur.timer);
    cur={id:pid, url, parts:partsFor(url), i:0, timer:null}; playingId=pid; playPart(); changed(); },
  /* play-all: list = [{id,url}] in display order */
  playList(list, li=0){ list=(list||[]).filter(x=>x.url); if(!list.length) return; if(WB.onPlay) WB.onPlay();
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
    items.forEach(it=>{ if(!it||!it.en||!it.ko) return; const id=it.id||idOf(it); if(have.has(id)) return; have.add(id); a.push({...it,id}); n++; });
    save(a); changed(); return n; },

  /* ---- star button helpers ---- */
  starHTML: (it) => `<button class="ico wbstar" data-wbid="${esc(idOf(it))}" aria-label="단어장에 저장" onclick='WB._star(this)' data-wb='${esc(JSON.stringify(it))}'>${WB.has(it)?"⭐":"☆"}</button>`,
  _star(btn){ const it=JSON.parse(btn.dataset.wb); const on=WB.toggle(it); btn.textContent=on?"⭐":"☆"; WB.toast(on?"⭐ 단어장에 저장했어요":"단어장에서 뺐어요"); },
  refreshStars(root=document){ const ids=new Set(load().map(x=>x.id)); root.querySelectorAll(".wbstar").forEach(b=>b.textContent=ids.has(b.dataset.wbid)?"⭐":"☆"); },
  toast(msg){ let t=document.getElementById("wbtoast"); if(!t){ t=document.createElement("div"); t.id="wbtoast";
      t.style.cssText="position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom));transform:translateX(-50%);background:#333;color:#fff;padding:8px 14px;border-radius:999px;font-size:14px;z-index:99;opacity:0;transition:opacity .2s;pointer-events:none"; document.body.appendChild(t); }
    t.textContent=msg; t.style.opacity="1"; clearTimeout(t._h); t._h=setTimeout(()=>t.style.opacity="0",1400); },

  /* ---- multiple-choice review quiz over saved items ---- */
  quiz(el, opts={}){
    const st={ items:[], tries:{}, limit:opts.limit||10, type:opts.type||"all" };
    function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
    function build(){
      const all=load(), pool=all.filter(x=>st.type==="all"||x.type===st.type);
      st.items=shuffle(pool.slice()).slice(0,st.limit).map(x=>{
        const same=all.filter(y=>y.id!==x.id&&y.ko!==x.ko&&y.type===x.type).map(y=>y.ko);
        const other=all.filter(y=>y.id!==x.id&&y.ko!==x.ko).map(y=>y.ko);
        const ds=[...new Set([...shuffle(same),...shuffle(other),...shuffle(POOL.slice())])].filter(k=>k!==x.ko).slice(0,2);
        const choices=shuffle([x.ko,...ds]); return {x, choices, ans:choices.indexOf(x.ko)};
      });
      st.tries={}; draw();
    }
    function hint(x){ const where = x.date ? `${x.date}${x.article?` '${x.article}'`:""} 기사` : "저장한 기사";
      return `힌트: ${where}에 나온 ${x.type==="expr"?"표현":"단어"}이에요.${x.ex?` 기사 속 쓰임: "${x.ex}"`:""}${x.pos?` (${x.pos})`:""}`; }
    function draw(){
      if(!st.items.length){ el.innerHTML=`<div class="note">${load().length? "이 종류로 저장한 항목이 없어요." : "아직 저장한 단어·표현이 없어요. 각 날짜 페이지의 ☆ 버튼을 눌러 저장해 보세요."}</div>`; return; }
      const L="ABC";
      el.innerHTML = st.items.map((q,i)=>{ const t=st.tries[i]||[], solved=t.includes(q.ans), wrong=!solved&&t.length>0;
        const sid="q"+i, speaking=WB.isPlaying(sid)||WB.isTts(sid);
        return `<div class="q"><div class="row" style="margin:0"><button class="ico" data-speak="${i}" aria-label="듣기">${speaking?"⏹ 정지":"🔊"}</button><b>W${i+1}. '${esc(q.x.en)}'의 뜻은?</b> <span class="note">${q.x.type==="expr"?"표현":"단어"}</span></div>
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
        if(q.x.clip) WB.play(q.x.clip, sid); else WB.ttsSay(q.x.en, q.x.ko, sid); draw(); return; }
      if(b.dataset.j!==undefined){ const i=+b.dataset.i, j=+b.dataset.j, t=st.tries[i]||[]; if(t.includes(st.items[i].ans)||t.includes(j)) return; st.tries[i]=[...t,j]; draw(); } });
    WB.onChange(()=>{ if(el.isConnected) draw(); });
    build();
    return { rebuild:build, setType(t){ st.type=t; build(); } };
  }
};
window.WB = WB;
})();
