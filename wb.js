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
let playingId = null;
audio.addEventListener("ended", () => { playingId=null; changed(); });
audio.addEventListener("pause", () => { playingId=null; changed(); });

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
  play(url, id){ if(!url) return; if(WB.onPlay) WB.onPlay();
    if(playingId===id && !audio.paused){ audio.pause(); return; }
    audio.src=url; playingId=id||url; audio.play().catch(()=>{}); changed(); },
  stop(){ if(!audio.paused) audio.pause(); },
  isPlaying: id => playingId===id && !audio.paused,
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
        return `<div class="q"><div class="row" style="margin:0">${q.x.clip?`<button class="ico" onclick="WB.play('${esc(q.x.clip)}','q${i}')">🔊</button>`:""}<b>W${i+1}. '${esc(q.x.en)}'의 뜻은?</b> <span class="note">${q.x.type==="expr"?"표현":"단어"}</span></div>
        ${q.choices.map((c,j)=>`<div class="opt">${L[j]}. ${esc(c)}</div>`).join("")}
        <div class="row">${q.choices.map((c,j)=>`<button class="${solved&&j===q.ans?"pri":""}" ${solved||t.includes(j)?"disabled":""} data-i="${i}" data-j="${j}">${L[j]}</button>`).join("")}</div>
        ${solved?`<div class="fb"><span class="okc">✅ 정답! (${L[q.ans]})</span> ${esc(q.x.en)} = ${esc(q.x.ko)}</div>`:""}
        ${wrong?`<div class="fb"><span class="badc">❌ 오답 (${L[t[t.length-1]]})</span> ${esc(hint(q.x))} 다시 골라 보세요.</div>`:""}</div>`; }).join("")
        + `<div class="row"><button data-act="again">↺ 다시 풀기</button><button data-act="new">🔀 새 문제</button><span class="note">점수: ${st.items.filter((q,i)=>(st.tries[i]||[])[0]===q.ans).length} / ${st.items.length} (첫 시도 기준)</span></div>`;
    }
    el.addEventListener("click", e=>{ const b=e.target.closest("button"); if(!b||!el.contains(b)) return;
      if(b.dataset.act==="again"){ st.tries={}; draw(); return; }
      if(b.dataset.act==="new"){ build(); return; }
      if(b.dataset.j!==undefined){ const i=+b.dataset.i, j=+b.dataset.j, t=st.tries[i]||[]; if(t.includes(st.items[i].ans)||t.includes(j)) return; st.tries[i]=[...t,j]; draw(); } });
    build();
    return { rebuild:build, setType(t){ st.type=t; build(); } };
  }
};
window.WB = WB;
})();
