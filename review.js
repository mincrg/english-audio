/* 직독직해 주말 복습 shared blocks (토요일 복습 page + 일요일 주간 복습 page):
   - quiz: multiple choice + recall with instant answers          RV.quizHTML(id, items)
   - ✍️ 영작 미션 (text kept in localStorage ea-write-v1[date])     RV.writeHTML(id, W, date)
   - 🎤 말해 보기 self-check (keyword checkpoints, model answer;  RV.speakHTML(id, P, date)
     answer kept in ea-conv-v1[date].sp; nothing is sent anywhere)
   Pages re-render a block with RV.draw(id) after each action; RV.onChange(fn) reports progress. */
window.RV = (function () {
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
  const ls = {get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }};
  const jget = k => { try { const o = JSON.parse(ls.get(k) || "{}"); return o && typeof o === "object" ? o : {}; } catch (e) { return {}; } };
  const B = {}; let changed = () => {};
  function draw(id) { const b = B[id], el = document.getElementById(id); if (b && el) el.innerHTML = b.html(); }
  /* ---------------- quiz ---------------- */
  const normA = s => String(s || "").toLowerCase().replace(/[’‘`´]/g, "'").replace(/[^a-z0-9]+/g, " ").trim();
  function quizHTML(id, items) {
    const st = (B[id] && B[id].st) || items.map(() => ({t: [], v: "", ok: false, shown: false, hint: false, wrong: 0}));
    B[id] = {st, items, html: () => qRender(id)}; return `<div id="${id}">${qRender(id)}</div>`; }
  function qDone(x, s) { return x.type === "recall" ? (s.ok || s.shown) : s.t.includes(x.answer); }
  function qRender(id) {
    const {st, items} = B[id];
    const body = items.map((x, n) => { const s = st[n], tag = x.tag ? `<span class="tagc">${esc(x.tag)}</span>` : "";
      if (x.type === "recall") { const fin = s.ok || s.shown;
        return `<div class="q rc"><div><b>Q${n + 1}. ✏️ ${esc(x.q)}</b>${tag}</div>
        <div class="rcin"><input type="text" id="${id}-in${n}" value="${esc(s.v)}" ${fin ? "disabled" : ""} placeholder="Type the English expression" aria-label="영어 표현 입력"
          autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done"
          oninput="RV._qv('${id}',${n},this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();RV.qCheck('${id}',${n})}"></div>
        <div class="row"><button class="pri" onclick="RV.qCheck('${id}',${n})" ${fin ? "disabled" : ""}>Check</button><button onclick="RV.qHint('${id}',${n})" ${fin || s.hint ? "disabled" : ""}>💡 Hint</button><button onclick="RV.qShow('${id}',${n})" ${fin ? "disabled" : ""}>👀 Show answer</button></div>
        ${s.ok ? `<div class="fb"><span class="okc">✅ Correct! (${esc(x.answer)})</span> ${esc(x.reason || "")}</div>` : ""}
        ${s.shown && !s.ok ? `<div class="fb"><span class="badc">Answer: ${esc(x.answer)}</span> ${esc(x.reason || "")}</div>` : ""}
        ${!fin && s.wrong ? `<div class="fb"><span class="badc">❌ Not yet ('${esc(s.last || "")}')</span> Try again.</div>` : ""}
        ${!fin && s.hint && x.hint ? `<div class="fb note">💡 ${esc(x.hint)}</div>` : ""}</div>`; }
      const solved = s.t.includes(x.answer), wrong = !solved && s.t.length;
      return `<div class="q"><div><b>Q${n + 1}. ${esc(x.q)}</b>${tag}</div>${x.options.map((o, i) => `<div class="opt">${"ABC"[i]}. ${esc(o)}</div>`).join("")}
      <div class="row">${x.options.map((o, i) => { const L = "ABC"[i]; return `<button class="${solved && L === x.answer ? "pri" : ""}" ${solved || s.t.includes(L) ? "disabled" : ""} onclick="RV.qPick('${id}',${n},'${L}')">${L}</button>`; }).join("")}</div>
      ${solved ? `<div class="fb"><span class="okc">✅ Correct! (${x.answer})</span> ${esc(x.reason || "")}</div>` : ""}
      ${wrong ? `<div class="fb"><span class="badc">❌ Not quite (${s.t[s.t.length - 1]})</span> ${esc(x.hint || "")} Try again.</div>` : ""}</div>`; }).join("");
    const done = items.filter((x, n) => qDone(x, st[n])).length, first = items.filter((x, n) => x.type !== "recall" ? st[n].t.length === 1 && st[n].t[0] === x.answer : st[n].ok && !st[n].wrong).length;
    return body + `<div class="note ${done === items.length ? "okc" : ""}">${done === items.length ? `🎉 ${items.length}문제 모두 끝! 한 번에 맞힌 문제 ${first}개` : `${done}/${items.length} 완료`}</div>
      <div class="row"><button onclick="RV.qReset('${id}')">↺ Try again</button></div>`; }
  function qAfter(id, n, focus) { draw(id); changed(); if (focus) { const e = document.getElementById(id + "-in" + n); if (e) { e.focus(); e.select(); } } }
  const api = {
    _qv: (id, n, v) => { B[id].st[n].v = v; },
    qPick: (id, n, L) => { const s = B[id].st[n]; if (s.t.includes(B[id].items[n].answer) || s.t.includes(L)) return; s.t.push(L); qAfter(id, n); },
    qCheck: (id, n) => { const el = document.getElementById(id + "-in" + n), s = B[id].st[n], x = B[id].items[n]; s.v = el ? el.value : s.v;
      if (!s.v.trim()) { el && el.focus(); return; }
      if ([x.answer, ...(x.accept || [])].some(a => normA(a) === normA(s.v))) s.ok = true; else { s.wrong++; s.last = s.v.trim(); s.hint = true; }
      qAfter(id, n, !s.ok); },
    qHint: (id, n) => { B[id].st[n].hint = true; draw(id); },
    qShow: (id, n) => { const el = document.getElementById(id + "-in" + n), s = B[id].st[n]; s.v = el ? el.value : s.v; s.shown = true; qAfter(id, n); },
    qReset: id => { B[id].st.forEach(s => Object.assign(s, {t: [], v: "", ok: false, shown: false, hint: false, wrong: 0})); draw(id); changed(); },
    quizDone: id => !!B[id] && B[id].items.every((x, n) => qDone(x, B[id].st[n])),
  };
  /* ---------------- ✍️ writing mission ---------------- */
  const WM_KEY = "ea-write-v1";
  function writeHTML(id, W, date) { B[id] = {W, date, html: () => wRender(id)}; return `<div id="${id}">${wRender(id)}</div>`; }
  function wRender(id) { const {W, date} = B[id], v = jget(WM_KEY)[date] || "";
    return `<div class="wm"><h4>✍️ 영작 미션</h4>
    <div class="wmx">${W.expressions.map(e => `<span class="tagc big">${esc(e)}</span>`).join("")}</div>
    <p>${esc(W.prompt)}</p>
    <textarea id="${id}-t" rows="4" maxlength="1200" placeholder="여기에 영어로 써 보세요" aria-label="영작" autocapitalize="sentences" spellcheck="true" oninput="RV.wSave('${id}',this.value)">${esc(v)}</textarea>
    <div class="row"><button class="pri" id="${id}-g" onclick="RV.gCheck('${id}')">✅ Check</button><button onclick="RV.wCopy('${id}')">📋 복사</button><span class="note" id="${id}-s">${v.trim() ? "✓ 이 기기에 저장됨" : ""}</span></div>
    <div class="note">🔎 문법·철자만 검사해요(Check 누르면 글이 LanguageTool로 전송돼요). 더 자연스러운 표현은 채팅으로 보내면 고쳐 드려요.</div>
    <div class="gres" id="${id}-r" aria-live="polite"></div>
    ${W.example ? `<details><summary>예시 문장 보기</summary><p class="wmex">${esc(W.example)}</p></details>` : ""}
    <div class="note">💬 쓴 문장을 채팅으로 답장해 주시면 첨삭해 드려요. 정답은 따로 없어요.</div></div>`; }
  Object.assign(api, {
    wSave: (id, v) => { const a = jget(WM_KEY), d = B[id].date; if (v.trim()) a[d] = v; else delete a[d]; ls.set(WM_KEY, JSON.stringify(a));
      const s = document.getElementById(id + "-s"); if (s) s.textContent = v.trim() ? "✓ 이 기기에 저장됨" : ""; const r = document.getElementById(id + "-r"); if (r && !api._busy) r.innerHTML = ""; changed(); },
    wCopy: id => { const t = document.getElementById(id + "-t"); if (!t || !t.value.trim()) return; t.select();
      (navigator.clipboard ? navigator.clipboard.writeText(t.value) : Promise.reject()).then(() => window.WB && WB.toast && WB.toast("📋 복사했어요"), () => { try { document.execCommand("copy"); } catch (e) {} }); },
    wDone: id => !!B[id] && !!(jget(WM_KEY)[B[id].date] || "").trim(),
    gCheck: async id => { const t = document.getElementById(id + "-t"), btn = document.getElementById(id + "-g"), out = document.getElementById(id + "-r"); if (!t || api._busy) return;
      const text = t.value.trim(), show = h => { out.innerHTML = h; };
      if (!text) { show(`<div class="note">✏️ Write your sentences first.</div>`); t.focus(); return; }
      if (text.length > 1000) { show(`<div class="note badc">✂️ Too long (${text.length} chars). Please keep it under 1000 characters.</div>`); return; }
      const off = `<div class="note badc">📴 오프라인이에요. 문법 검사는 인터넷에 연결되면 쓸 수 있어요. 쓴 글은 이 기기에 저장돼 있어요.</div>`;
      if (navigator.onLine === false) { show(off); return; }
      api._busy = true; btn.disabled = true; show(`<div class="note">⏳ Checking…</div>`);
      const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 8000);
      try { const r = await fetch("https://api.languagetool.org/v2/check", {method: "POST", signal: ac.signal, headers: {"Content-Type": "application/x-www-form-urlencoded"}, body: new URLSearchParams({language: "en-US", text})});
        if (!r.ok) throw new Error(r.status === 429 ? "rate" : "http");
        const M = ((await r.json()).matches || []).filter(m => m.length > 0).sort((a, b) => a.offset - b.offset);
        if (!M.length) show(`<div class="okc">👍 No grammar or spelling issues found</div>`);
        else { let h = "", p = 0; M.forEach((m, i) => { if (m.offset < p) return; h += esc(text.slice(p, m.offset)) + `<mark class="gerr">${esc(text.substr(m.offset, m.length))}<sup>${i + 1}</sup></mark>`; p = m.offset + m.length; }); h += esc(text.slice(p));
          show(`<div class="gtxt">${h}</div><ol class="glist">${M.map(m => `<li><span class="gbad">${esc(text.substr(m.offset, m.length))}</span> → ${(m.replacements || []).slice(0, 2).map(x => `<span class="gsug">${esc(x.value) || "(delete)"}</span>`).join(" / ") || "<i>no suggestion</i>"}<span class="gmsg">${esc(m.message || "")}</span></li>`).join("")}</ol>`); }
      } catch (e) { show(navigator.onLine === false || e instanceof TypeError ? off : `<div class="note badc">${e.name === "AbortError" ? "⌛ The checker took too long (8 s)." : e.message === "rate" ? "🚦 Too many checks right now." : "⚠️ Couldn't reach the checker."} Please try again in a minute.</div>`); }
      finally { clearTimeout(tm); api._busy = false; btn.disabled = false; } },
  });
  /* ---------------- 🎤 speak prompt self-check ---------------- */
  const CV_KEY = "ea-conv-v1";
  const cvNorm = t => " " + String(t || "").toLowerCase().replace(/[\u2018\u2019\u201B\u2032`´]/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
  const cvHit = (v, x) => { const y = cvNorm(x); return y.trim().length > 0 && cvNorm(v).includes(y); };
  const au = new Audio(); au.preload = "none"; let auKey = null;
  au.addEventListener("ended", () => { auKey = null; Object.keys(B).forEach(k => B[k].P && draw(k)); });
  function speakHTML(id, P, date, clips) { const old = B[id] || {}; B[id] = {P, date, clips: clips || {}, chk: old.chk, show: old.show, html: () => sRender(id)}; return `<div id="${id}">${sRender(id)}</div>`; }
  const spBtn = (id, w, label) => `<button class="ico" aria-label="${label}" onclick="RV.sPlay('${id}','${w}')">${auKey === id + w ? "⏹ 정지" : "🔊"}</button>`;
  function sRender(id) { const b = B[id], P = b.P, v = (jget(CV_KEY)[b.date] || {}).sp || "";
    let res = "";
    if (b.chk) { const tg = P.t.map(t => { const hit = cvHit(v, t) || cvHit(v, t.replace(/[.…!?]+$/, "").split(/[,…]/)[0]);
        return `<div class="tcl ${hit ? "ok" : "no"}">${hit ? "✅" : "⚠️"} <b>${esc(t)}</b> — ${hit ? "표현을 썼어요!" : "이 표현을 넣어 다시 말해 보세요."}</div>`; }).join("");
      const cps = P.c.map(c => { const hit = c.a.some(x => cvHit(v, x)); return `<div class="tcl ${hit ? "ok" : "no"}">${hit ? "✅" : "⚠️"} <b>${esc(c.l)}</b> — ${esc(hit ? c.ok : c.no)}</div>`; }).join("");
      const n = v.trim().split(/\s+/).filter(Boolean).length;
      res = `<div class="tcres">${tg}${cps}<div class="tcl ${n >= 15 ? "ok" : "no"}">${n >= 15 ? "✅" : "⚠️"} <b>길이</b> — ${n}단어 ${n >= 15 ? "· 2~3문장 분량 좋아요" : "· 이유나 예를 한 문장 더 붙여 보세요"}</div></div>`; }
    const model = b.chk || b.show ? `<div class="tcm"><div class="cvq"><div><span class="note">모범 답안</span><br>${esc(P.m)}<br><span class="note">${esc(P.mk)}</span></div>${b.clips.m ? spBtn(id, "m", "모범 답안 듣기") : ""}</div></div>` : "";
    return `<div class="cvp"><h4>🎤 말해 보기</h4>
      <div class="cvq"><div><b>${esc(P.q)}</b><br><span class="note">${esc(P.qk)}</span></div>${b.clips.q ? spBtn(id, "q", "질문 듣기") : ""}</div>
      <div class="wmx">${P.t.map(t => `<span class="tagc big">${esc(t)}</span>`).join("")}</div>
      <div class="note">위 표현을 넣어 대화하듯 2~3문장으로 답해 보세요. 아이폰 키보드의 🎤(받아쓰기)로 말해도 돼요.</div>
      <textarea id="${id}-t" rows="4" maxlength="1000" placeholder="Answer like you're talking to a friend…" aria-label="말해 보기 답" autocapitalize="sentences" spellcheck="true" oninput="RV.sSave('${id}',this.value)">${esc(v)}</textarea>
      <div class="row"><button class="pri" onclick="RV.sCheck('${id}')">✅ 확인</button><button onclick="RV.sShow('${id}')">👀 모범 답안 보기</button>${b.chk || b.show ? `<button onclick="RV.sReset('${id}')">↺ 다시</button>` : ""}</div>
      <div class="note">확인은 이 기기 안에서만 표현이 들어갔는지 살펴봐요(전송 없음). 문법 채점은 하지 않아요.</div>
      <div aria-live="polite">${res}${model}</div></div>`; }
  Object.assign(api, {
    sSave: (id, v) => { const o = jget(CV_KEY), d = o[B[id].date] || (o[B[id].date] = {}); if (v.trim()) d.sp = v; else delete d.sp; if (!Object.keys(d).length) delete o[B[id].date]; ls.set(CV_KEY, JSON.stringify(o)); },
    sCheck: id => { const el = document.getElementById(id + "-t"); if (!el || !el.value.trim()) { el && el.focus(); return; } api.sSave(id, el.value); B[id].chk = true; draw(id); changed(); },
    sShow: id => { B[id].show = true; draw(id); changed(); },
    sReset: id => { B[id].chk = B[id].show = false; draw(id); const el = document.getElementById(id + "-t"); if (el) el.focus({preventScroll: true}); },
    sDone: id => !!B[id] && !!(B[id].chk || B[id].show),
    sPlay: (id, w) => { const k = id + w; if (auKey === k) { api.stop(); return; } if (window.WB) WB.stop(); if (api.onPlay) api.onPlay();
      au.src = B[id].clips[w]; au.play().catch(() => {}); auKey = k; draw(id); },
    stop: () => { if (auKey) { au.pause(); auKey = null; Object.keys(B).forEach(k => B[k].P && draw(k)); } },
  });
  return Object.assign(api, {esc, draw, quizHTML, writeHTML, speakHTML, onChange: fn => { changed = fn; }, onPlay: null, _busy: false});
})();
