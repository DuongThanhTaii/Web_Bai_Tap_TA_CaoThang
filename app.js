(() => {
  const KEY = 'quiz.v1';
  const DURATION = 45 * 60; // giây
  const PER = 50;
  const LETTERS = ['A', 'B', 'C', 'D'];
  const Q = window.QUESTIONS;
  const QMAP = new Map(Q.map(q => [q.id, q]));
  const $app = document.getElementById('app');
  const $modal = document.getElementById('modal');

  const blank = () => ({ used: [], attempts: [], current: null, sets: [] });
  let S = load();
  let V = { name: 'home' }; // home | exam | result | review | history

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.attempts)) return Object.assign(blank(), s);
    } catch (e) {}
    return blank();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
  }

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const mmss = sec => {
    sec = Math.max(0, sec);
    return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
  };
  const fmtDate = ts => new Date(ts).toLocaleString('vi-VN');

  // ---------- đáp án đã xáo: item = {id, order:[chỉ số đáp án gốc theo vị trí A..D]} ----------
  const makeItems = ids => ids.map(id => ({ id, order: shuffle([0, 1, 2, 3]) }));
  const correctPos = it => it.order.indexOf(QMAP.get(it.id).a);
  const score = (items, answers) => items.reduce((n, it, i) => n + (answers[i] === correctPos(it) ? 1 : 0), 0);

  // ---------- modal / fullscreen ----------
  function ask(html, buttons) {
    return new Promise(res => {
      $modal.innerHTML = `<div class="box"><div class="msg">${html}</div><div class="row">${buttons
        .map((b, i) => `<button class="btn ${b.cls || ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div></div>`;
      $modal.classList.remove('hidden');
      $modal.onclick = e => {
        const b = e.target.closest('button[data-i]');
        if (!b) return;
        $modal.classList.add('hidden');
        res(buttons[+b.dataset.i].value);
      };
    });
  }
  const info = html => ask(html, [{ label: 'OK', value: true, cls: 'yellow' }]);
  const confirmBox = (html, yes = 'Đồng ý') => ask(html, [{ label: 'Hủy', value: false }, { label: yes, value: true, cls: 'pink' }]);

  function enterFS() {
    try { document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {}); } catch (e) {}
  }
  function exitFS() {
    try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch (e) {}
  }

  // ---------- bắt đầu làm bài ----------
  async function freeToStart() {
    if (!S.current) return true;
    const ok = await confirmBox('Bạn đang có một bài làm dở. Bắt đầu bài mới sẽ <b>bỏ</b> bài đó. Tiếp tục?', 'Bỏ bài cũ');
    if (ok) { S.current = null; save(); }
    return ok;
  }

  function begin(kind, name, ids, setIdx) {
    const now = Date.now();
    S.current = {
      id: uid(), kind, name, setIdx: setIdx ?? null,
      items: makeItems(shuffle(ids)), answers: ids.map(() => -1),
      startedAt: now, endAt: now + DURATION * 1000, idx: 0,
    };
    save();
    enterFS();
    V = { name: 'exam' };
    render();
  }

  async function startRandom() {
    if (!(await freeToStart())) return;
    const used = new Set(S.used);
    const pool = Q.filter(q => !used.has(q.id)).map(q => q.id);
    if (!pool.length) {
      await info('Bạn đã làm hết <b>tất cả ' + Q.length + ' câu</b>. Nhấn <b>Reset</b> để làm lại từ đầu.');
      return;
    }
    let ids = shuffle(pool).slice(0, PER);
    if (ids.length < PER) {
      const have = new Set(ids);
      const extra = shuffle(Q.map(q => q.id).filter(id => !have.has(id))).slice(0, PER - ids.length);
      await info(`Chỉ còn <b>${ids.length}</b> câu chưa làm. Đề này lấy hết ${ids.length} câu đó và bù thêm <b>${extra.length}</b> câu cũ.`);
      ids = ids.concat(extra);
    }
    begin('random', 'Đề ngẫu nhiên', ids);
  }

  async function startSet(i) {
    if (!(await freeToStart())) return;
    begin('set', S.sets[i].name, S.sets[i].ids, i);
  }

  async function resume() {
    if (!S.current) return;
    enterFS();
    V = { name: 'exam' };
    render();
  }

  function submit() {
    const c = S.current;
    if (!c) return;
    const now = Math.min(Date.now(), c.endAt);
    const att = {
      id: c.id, ts: Date.now(), kind: c.kind, name: c.name, setIdx: c.setIdx,
      items: c.items, answers: c.answers, total: c.items.length,
      score: score(c.items, c.answers), spent: Math.round((now - c.startedAt) / 1000),
    };
    S.attempts.push(att);
    const used = new Set(S.used);
    c.items.forEach(it => used.add(it.id));
    S.used = [...used];
    if (c.kind === 'set' && S.sets[c.setIdx]) {
      const st = S.sets[c.setIdx];
      st.attempts = (st.attempts || 0) + 1;
      st.best = Math.max(st.best ?? -1, att.score);
    }
    S.current = null;
    save();
    exitFS();
    V = { name: 'result', att, idx: 0 };
    render();
  }

  async function trySubmit() {
    const c = S.current;
    const blankN = c.answers.filter(a => a < 0).length;
    const msg = blankN ? `Còn <b>${blankN}</b> câu chưa làm. Vẫn nộp bài?` : 'Bạn đã làm hết các câu. Nộp bài?';
    if (await confirmBox(msg, 'Nộp bài')) submit();
  }

  async function reset() {
    if (!(await confirmBox('Xóa <b>toàn bộ</b> lịch sử, danh sách câu đã làm và các bộ đề đã soạn?', 'Reset'))) return;
    S = blank();
    save();
    exitFS();
    V = { name: 'home' };
    render();
  }

  // ---------- soạn bộ đề: chia 325 câu thành n đề rời nhau, hợp lại đủ tất cả câu ----------
  async function compose() {
    const minN = Math.ceil(Q.length / PER);
    const n = Math.floor(+document.getElementById('nSets').value);
    if (!(n >= minN && n <= Q.length)) {
      await info(`Số bộ đề phải từ <b>${minN}</b> đến <b>${Q.length}</b> (mỗi đề tối đa ${PER} câu).`);
      return;
    }
    if (S.sets.length && !(await confirmBox('Soạn lại sẽ thay thế các bộ đề hiện có và mất trạng thái đã làm của chúng. Tiếp tục?'))) return;
    const groups = Array.from({ length: n }, () => []);
    shuffle(Q.map(q => q.id)).forEach((id, i) => groups[i % n].push(id));
    S.sets = groups.map((ids, i) => ({ name: 'Bộ đề ' + (i + 1), ids, attempts: 0, best: null }));
    save();
    render();
  }

  // ---------- giao diện ----------
  function render() {
    if (V.name === 'home') $app.innerHTML = homeHTML();
    else if (V.name === 'exam') $app.innerHTML = examHTML(S.current, 'exam', S.current.idx);
    else if (V.name === 'review') $app.innerHTML = examHTML(V.att, 'review', V.idx);
    else if (V.name === 'result') $app.innerHTML = resultHTML(V.att);
    else if (V.name === 'history') $app.innerHTML = historyHTML();
    document.body.classList.toggle('in-exam', V.name === 'exam' || V.name === 'review');
    window.scrollTo(0, 0);
    if (V.name === 'exam' || V.name === 'review') {
      const sc = document.querySelector('.dotscroll'), cur = document.querySelector('.dot.cur');
      if (sc && cur && sc.scrollWidth > sc.clientWidth) {
        sc.scrollLeft = cur.offsetLeft - (sc.clientWidth - cur.offsetWidth) / 2;
      }
    }
    if (V.name === 'exam') tick();
  }

  function homeHTML() {
    const usedN = new Set(S.used).size;
    const c = S.current;
    const covered = new Set();
    S.sets.forEach(s => { if (s.attempts) s.ids.forEach(id => covered.add(id)); });
    const doneSets = S.sets.filter(s => s.attempts).length;
    return `
    <div class="page">
      <header class="hero"><h1>LUYỆN THI<br>TRẮC NGHIỆM</h1><p>${Q.length} câu · đề ${PER} câu · ${DURATION / 60} phút</p></header>
      <section class="stats">
        <div class="stat blue"><b>${usedN}/${Q.length}</b><span>câu đã làm</span></div>
        <div class="stat green"><b>${Q.length - usedN}</b><span>câu chưa gặp</span></div>
        <div class="stat pink"><b>${S.attempts.length}</b><span>lần đã làm</span></div>
      </section>
      ${c ? `<section class="card yellow"><h2>Bài đang làm dở</h2>
        <p>${esc(c.name)} · đã làm ${c.answers.filter(a => a >= 0).length}/${c.items.length} câu</p>
        <div class="row"><button class="btn green" data-act="resume">Tiếp tục</button>
        <button class="btn" data-act="discard">Bỏ bài này</button></div></section>` : ''}
      <section class="card">
        <h2>Đề ngẫu nhiên</h2>
        <p>${PER} câu chưa từng làm, đáp án được xáo lại mỗi lần.</p>
        <div class="row"><button class="btn big pink" data-act="random">Bắt đầu làm bài</button>
        <button class="btn" data-act="history">Lịch sử (${S.attempts.length})</button>
        <button class="btn red" data-act="reset">Reset</button></div>
      </section>
      <section class="card">
        <h2>Soạn bộ đề</h2>
        <p>Chia toàn bộ ${Q.length} câu thành n đề, không trùng, không sót. Giải hết các đề là đã giải hết mọi câu.</p>
        <div class="row"><label class="lbl">Số đề (n)
          <input id="nSets" type="number" min="${Math.ceil(Q.length / PER)}" max="${Q.length}" value="${S.sets.length || Math.ceil(Q.length / PER)}"></label>
        <button class="btn blue" data-act="compose">${S.sets.length ? 'Soạn lại' : 'Soạn bộ đề'}</button></div>
        ${S.sets.length ? `
        <p class="progress"><b>Tiến độ:</b> ${doneSets}/${S.sets.length} đề · phủ <b>${covered.size}/${Q.length}</b> câu</p>
        <div class="sets">${S.sets.map((s, i) => `
          <div class="set ${s.attempts ? 'done' : ''}">
            <b>${esc(s.name)}</b><span>${s.ids.length} câu</span>
            <span>${s.attempts ? `Tốt nhất ${s.best}/${s.ids.length} · ${s.attempts} lần` : 'Chưa làm'}</span>
            <button class="btn small" data-act="set" data-i="${i}">${s.attempts ? 'Làm lại' : 'Làm'}</button>
          </div>`).join('')}</div>` : ''}
      </section>
    </div>`;
  }

  function resultHTML(a) {
    const wrong = a.answers.filter((x, i) => x >= 0 && x !== correctPos(a.items[i])).length;
    const blankN = a.answers.filter(x => x < 0).length;
    const pct = Math.round(a.score / a.total * 100);
    return `
    <div class="page">
      <header class="hero"><h1>KẾT QUẢ</h1><p>${esc(a.name)} · ${fmtDate(a.ts)}</p></header>
      <section class="card yellow center">
        <div class="bigscore">${a.score}<small>/${a.total}</small></div>
        <p><b>${pct}%</b> · thời gian ${mmss(a.spent)}</p>
        <section class="stats"><div class="stat green"><b>${a.score}</b><span>đúng</span></div>
        <div class="stat red"><b>${wrong}</b><span>sai</span></div>
        <div class="stat gray"><b>${blankN}</b><span>bỏ trống</span></div></section>
        <div class="row center"><button class="btn big blue" data-act="review">Xem đáp án</button>
        <button class="btn" data-act="home">Trang chủ</button></div>
      </section>
    </div>`;
  }

  function historyHTML() {
    const list = S.attempts.slice().reverse();
    return `
    <div class="page">
      <header class="hero"><h1>LỊCH SỬ</h1><p>${list.length} lần làm</p></header>
      <div class="row"><button class="btn" data-act="home">← Trang chủ</button></div>
      <section class="hist">${list.length ? list.map(a => `
        <div class="item">
          <div><b>${esc(a.name)}</b><br><small>${fmtDate(a.ts)} · ${mmss(a.spent)}</small></div>
          <div class="sc">${a.score}/${a.total}</div>
          <button class="btn small blue" data-act="open" data-id="${a.id}">Xem lại</button>
        </div>`).join('') : '<div class="card">Chưa có lần làm nào.</div>'}</section>
    </div>`;
  }

  function examHTML(att, mode, idx) {
    const items = att.items, n = items.length, it = items[idx], q = QMAP.get(it.id);
    const ans = att.answers[idx], cp = correctPos(it);
    const review = mode === 'review';
    const dots = items.map((x, i) => {
      let cls = '';
      if (review) cls = att.answers[i] < 0 ? 'blank' : att.answers[i] === correctPos(x) ? 'ok' : 'bad';
      else if (att.answers[i] >= 0) cls = 'done';
      return `<button class="dot ${cls} ${i === idx ? 'cur' : ''}" data-act="go" data-i="${i}">${i + 1}</button>`;
    }).join('');
    const opts = it.order.map((orig, k) => {
      let cls = '', tag = '';
      if (review) {
        if (k === cp) { cls = 'ok'; tag = k === ans ? '✓ Bạn chọn · Đúng' : '✓ Đáp án đúng'; }
        else if (k === ans) { cls = 'bad'; tag = '✗ Bạn chọn'; }
      } else if (k === ans) cls = 'sel';
      return `<button class="opt ${cls}" data-act="pick" data-k="${k}" ${review ? 'disabled' : ''}>
        <span class="ltr">${LETTERS[k]}</span><span class="txt">${esc(q.o[orig])}</span>${tag ? `<em>${tag}</em>` : ''}</button>`;
    }).join('');
    const done = att.answers.filter(a => a >= 0).length;
    const right = review ? `
      <div class="timer review">${att.score}/${n}</div>
      <p class="hint">Xanh: đúng · Đỏ: sai · Xám: bỏ trống</p>
      <button class="btn" data-act="${V.from === 'history' ? 'history' : 'home'}">Thoát</button>
      <div class="qno qno-m">${idx + 1}/${n}</div>`
      : `
      <div class="label">THỜI GIAN CÒN LẠI</div>
      <div class="timer" id="timer">--:--</div>
      <p class="hint">Đã làm <b>${done}/${n}</b> câu</p>
      <button class="btn pink" data-act="submit">Nộp bài</button>
      <div class="qno qno-m">CÂU ${idx + 1}/${n}</div>`;
    return `
    <div class="exam ${review ? 'is-review' : ''}">
      <aside class="map"><h3>BẢN ĐỒ CÂU</h3><div class="dotscroll"><div class="dots">${dots}</div></div></aside>
      <main class="stage">
        <div class="qno">CÂU ${idx + 1} / ${n}</div>
        <div class="qcard"><h2>${esc(q.q)}</h2><div class="opts">${opts}</div></div>
        <div class="nav">
          <button class="btn" data-act="prev" ${idx === 0 ? 'disabled' : ''}>← Câu trước</button>
          <button class="btn blue" data-act="next" ${idx === n - 1 ? 'disabled' : ''}>Câu sau →</button>
        </div>
      </main>
      <aside class="side">${right}</aside>
    </div>`;
  }

  // ---------- đồng hồ ----------
  function tick() {
    if (V.name !== 'exam' || !S.current) return;
    const rem = Math.ceil((S.current.endAt - Date.now()) / 1000);
    const el = document.getElementById('timer');
    if (el) {
      el.textContent = mmss(rem);
      el.classList.toggle('danger', rem <= 300);
    }
    if (rem <= 0) {
      $modal.classList.add('hidden');
      submit();
    }
  }
  setInterval(tick, 250);

  // ---------- sự kiện ----------
  function go(i) {
    const c = V.name === 'exam' ? S.current : V.att;
    if (!c || i < 0 || i >= c.items.length) return;
    if (V.name === 'exam') { c.idx = i; save(); } else V.idx = i;
    render();
  }
  const curIdx = () => (V.name === 'exam' ? S.current.idx : V.idx);

  $app.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    switch (b.dataset.act) {
      case 'random': return startRandom();
      case 'set': return startSet(+b.dataset.i);
      case 'compose': return compose();
      case 'reset': return reset();
      case 'resume': return resume();
      case 'discard':
        if (await confirmBox('Bỏ bài làm dở này?')) { S.current = null; save(); render(); }
        return;
      case 'history': V = { name: 'history' }; return render();
      case 'home': V = { name: 'home' }; return render();
      case 'open': {
        const att = S.attempts.find(a => a.id === b.dataset.id);
        if (att) { V = { name: 'review', att, idx: 0, from: 'history' }; render(); }
        return;
      }
      case 'review': V = { name: 'review', att: V.att, idx: 0, from: 'result' }; return render();
      case 'go': return go(+b.dataset.i);
      case 'prev': return go(curIdx() - 1);
      case 'next': return go(curIdx() + 1);
      case 'pick': {
        if (V.name !== 'exam') return;
        const c = S.current;
        c.answers[c.idx] = +b.dataset.k;
        save();
        render();
        return;
      }
      case 'submit': return trySubmit();
    }
  });

  document.addEventListener('keydown', e => {
    if (!$modal.classList.contains('hidden') || (V.name !== 'exam' && V.name !== 'review')) return;
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === 'arrowright') go(curIdx() + 1);
    else if (k === 'arrowleft') go(curIdx() - 1);
    else if (V.name === 'exam') {
      const p = '1234'.indexOf(k) >= 0 ? '1234'.indexOf(k) : 'abcd'.indexOf(k);
      if (p >= 0 && k.length === 1) {
        S.current.answers[S.current.idx] = p;
        save();
        render();
      }
    }
  });

  // vào lại trang với bài dở đã hết giờ thì nộp luôn khi người dùng tiếp tục
  render();
})();
