// ══════════════════════════════════════════════════════════════
//  screens.js — หน้าจอทั้งหมด
// ══════════════════════════════════════════════════════════════

const Screens = (() => {
  const { money, signed, monthShort, monthFull, shiftMonth, esc, el, sum } = U;

  const netClass = n => (n < 0 ? 'neg' : 'pos');
  const card = (inner, cls = '') => el(`<div class="card ${cls}">${inner}</div>`);

  // ── การ์ดสรุปย่อ ────────────────────────────────────────────
  function miniCard(title, value, sub, cls = '') {
    return el(`<div class="card">
      <div class="card-title">${esc(title)}</div>
      <div class="num ${cls}" style="font-size:24px;font-weight:800;letter-spacing:-.03em">${value}</div>
      <div class="sub" style="margin-top:3px">${sub}</div>
    </div>`);
  }

  // ═══════════ 1. ภาพรวม ═══════════
  function dashboard(host) {
    const D = Store.get();
    const rows = Engine.run(D);
    const cur = rows.find(r => r.id === App.state.month) || rows[rows.length - 1];
    const idx = rows.indexOf(cur);

    // ── การ์ดเดือนปัจจุบัน ──
    const c1 = card(`
      <div class="monthbar">
        <button class="icon-btn" id="pm">‹</button>
        <div class="m-label">${monthFull(cur.id)}
          <span class="chip ${cur.status === 'actual' ? '' : 'warn'}" style="margin-left:6px;vertical-align:middle">
            ${cur.status === 'actual' ? 'ตัวเลขจริง' : 'คาดการณ์'}</span>
        </div>
        <button class="icon-btn" id="nm">›</button>
      </div>
      <div class="num hero-amt ${netClass(cur.closing)}">${signed(cur.closing)} <span style="font-size:.42em;font-weight:600;opacity:.55">฿</span></div>
      <div class="sub">เหลือสุทธิปลายเดือน · ยกมา ${money(cur.opening)} ฿</div>
      <div style="height:16px"></div>
      <div class="kv"><span class="kv-k">รายรับ</span><span class="kv-v num pos">+${money(cur.income + cur.oneTime)}</span></div>
      <div class="kv"><span class="kv-k">รายจ่าย</span><span class="kv-v num neg">−${money(cur.expense)}</span></div>
      <div id="stack" style="margin-top:10px"></div>
      <div class="legend" id="lg"></div>
    `);
    host.appendChild(c1);
    c1.querySelector('#pm').onclick = () => App.goMonth(shiftMonth(cur.id, -1));
    c1.querySelector('#nm').onclick = () => App.goMonth(shiftMonth(cur.id, 1));

    const parts = Object.entries(cur.by).map(([k, v]) => ({ name: Engine.TYPES[k].label, value: v, color: Engine.TYPES[k].color }));
    c1.querySelector('#stack').appendChild(Chart.stack(parts));
    c1.querySelector('#lg').innerHTML = parts.filter(p => p.value > 0)
      .map(p => `<span><i style="background:${p.color}"></i>${esc(p.name)} ${money(p.value)}</span>`).join('');

    // ── กราฟกระแสเงินสด ──
    const lastActual = rows.map(r => r.status).lastIndexOf('actual');
    const c2 = card(`
      <div class="card-head"><div class="card-title">กระแสเงินสด · อดีต → อนาคต</div>
        <span class="chip">แตะกราฟเพื่อไปเดือนนั้น</span></div>
      <div id="ch"></div>
      <div class="legend">
        <span><i style="background:#818cf8"></i>เหลือสุทธิสะสม</span>
        <span><i style="background:#34d399"></i>รายรับ</span>
        <span><i style="background:#fb7185"></i>รายจ่าย</span>
        <span style="opacity:.7">เส้นประ = คาดการณ์</span>
      </div>`);
    host.appendChild(c2);
    Chart.line(c2.querySelector('#ch'), [
      { name: 'สะสม', color: '#818cf8', values: rows.map(r => r.closing), dashFrom: lastActual, fill: true },
      { name: 'รายรับ', color: '#34d399', values: rows.map(r => r.income + r.oneTime), dashFrom: lastActual, dots: false },
      { name: 'รายจ่าย', color: '#fb7185', values: rows.map(r => r.expense), dashFrom: lastActual, dots: false },
    ], rows.map(r => monthShort(r.id)), { height: 200, onPick: i => App.goMonth(rows[i].id) });

    // ── เตือน ──
    const al = Engine.alerts(D);
    if (al.length) {
      const c3 = card(`<div class="card-head"><div class="card-title">ควรรู้</div></div><div id="al"></div>`);
      host.appendChild(c3);
      const box = c3.querySelector('#al');
      al.slice(0, 6).forEach(a => {
        const cls = a.level === 'neg' ? 'neg' : a.level === 'warn' ? 'warn' : '';
        const n = el(`<div class="row tap" style="align-items:flex-start">
          <span class="${cls}" style="font-size:15px;width:20px">${a.icon}</span>
          <div class="row-name"><div style="font-weight:600">${esc(a.title)}</div>
            <div class="row-sub">${esc(a.detail)}</div></div>
          <span style="color:var(--text-3)">›</span></div>`);
        n.style.cursor = 'pointer';
        n.onclick = () => a.go[0] === 'month' ? App.goMonth(a.go[1]) : App.go(a.go[0]);
        box.appendChild(n);
      });
    }

    // ── การ์ดย่อ ──
    const g = el('<div class="grid g3"></div>');
    const savings = sum(D.buckets, b => b.balance);
    const debt = sum(D.cards, c => c.used);
    const sp = Engine.splitBalance(D);
    g.appendChild(miniCard('เงินเก็บรวม', money(savings), `เป้า ${money(D.savingsGoal)} ฿`, 'pos'));
    g.appendChild(miniCard('หนี้บัตรรวม', money(debt), `${D.cards.length} ใบ`, 'neg'));
    g.appendChild(miniCard('ยอดหารครึ่ง', signed(sp, 2), sp < 0 ? 'คุณเป็นฝ่ายติด' : 'อีกฝ่ายติดคุณ', netClass(sp)));
    host.appendChild(g);
  }

  // ═══════════ 2. รายเดือน ═══════════
  function monthScreen(host) {
    const D = Store.get();
    const id = App.state.month;
    const m = Store.ensureMonth(id);
    const t = Engine.totals(m);
    const rows = Engine.run(D);
    const r = rows.find(x => x.id === id);

    const head = card(`
      <div class="monthbar">
        <button class="icon-btn" id="pm">‹</button>
        <div class="m-label">${monthFull(id)}</div>
        <button class="icon-btn" id="st" title="สลับจริง/คาดการณ์">${m.status === 'actual' ? '●' : '○'}</button>
        <button class="icon-btn" id="nm">›</button>
      </div>
      <div class="num hero-amt ${netClass(r.closing)}">${signed(r.closing)}</div>
      <div class="sub">ยกมา ${money(r.opening)} · เข้า ${money(t.income + t.oneTime)} · ออก ${money(t.expense)}</div>`);
    host.appendChild(head);
    head.querySelector('#pm').onclick = () => App.goMonth(shiftMonth(id, -1));
    head.querySelector('#nm').onclick = () => App.goMonth(shiftMonth(id, 1));
    head.querySelector('#st').onclick = () => {
      m.status = m.status === 'actual' ? 'predicted' : 'actual';
      Store.commit(); App.render();
    };

    // รายรับ
    // ยอดหัวหมวดต้องนับเฉพาะรายการในหมวดนั้น — เงินก้อนพิเศษมีหมวดของตัวเองอยู่แล้ว
    host.appendChild(section('รายรับ', '#34d399', m.incomes, t.income, {
      onAdd: () => { m.incomes.push({ id: U.uid('i'), name: 'รายรับใหม่', amount: 0, note: '' }); Store.commit(); App.render(); },
      onDel: it => { m.incomes = m.incomes.filter(x => x !== it); Store.commit(); App.render(); },
    }));

    // เงินก้อนพิเศษ
    host.appendChild(section('เงินก้อนพิเศษ (คาดว่าจะได้)', '#a78bfa', m.oneTimes, sum(m.oneTimes), {
      onAdd: () => { m.oneTimes.push({ id: U.uid('o'), name: 'เงินก้อน', amount: 0, note: '' }); Store.commit(); App.render(); },
      onDel: it => { m.oneTimes = m.oneTimes.filter(x => x !== it); Store.commit(); App.render(); },
    }));

    // รายจ่ายแยกหมวด
    for (const [type, meta] of Object.entries(Engine.TYPES)) {
      const list = m.expenses.filter(e => e.type === type);
      host.appendChild(section(meta.label, meta.color, list, t.by[type], {
        hint: meta.hint,
        expense: true,
        onAdd: () => { m.expenses.push({ id: U.uid('e'), name: 'รายการใหม่', amount: 0, type, note: '' }); Store.commit(); App.render(); },
        onDel: it => { m.expenses = m.expenses.filter(x => x !== it); Store.commit(); App.render(); },
      }));
    }

    host.appendChild(card(`
      <div class="kv" style="padding:2px 0"><span class="kv-k" style="font-size:15px">เหลือสุทธิ</span>
      <span class="kv-v num ${netClass(r.closing)}" style="font-size:26px">${signed(r.closing)} ฿</span></div>`));
  }

  /** กล่องหนึ่งหมวด — พับได้ แก้ทุกช่องได้ */
  function section(name, color, items, total, o = {}) {
    const s = el(`<div class="card sect">
      <div class="sect-head">
        <span class="sect-dot" style="background:${color}"></span>
        <span class="sect-name">${esc(name)}${o.hint ? ` <span style="color:var(--text-3);font-weight:400">· ${esc(o.hint)}</span>` : ''}</span>
        <span class="sect-sum num">${money(total)}</span>
        <span class="sect-caret">▾</span>
      </div>
      <div class="rows"></div></div>`);

    s.querySelector('.sect-head').onclick = e => {
      if (e.target.closest('.mini')) return;
      s.classList.toggle('closed');
    };

    const box = s.querySelector('.rows');
    for (const it of items) {
      const row = el(`<div class="row${/^—/.test(it.name) ? ' row-child' : ''}">
        <span class="row-name"></span><span class="row-amt num"></span></div>`);
      Edit.inline(row.querySelector('.row-name'), {
        get: () => it.name, set: v => { it.name = v; Store.commit(); },
      });
      Edit.inline(row.querySelector('.row-amt'), {
        type: 'money', get: () => it.amount,
        set: v => { it.amount = v; Store.commit(); App.render(); },
      });
      if (it.note) {
        const nn = el(`<div class="row-sub">${esc(it.note)}</div>`);
        row.querySelector('.row-name').after(nn);
      }
      row.appendChild(Edit.noteBtn(it, () => App.render()));
      row.appendChild(Edit.delBtn(it.name, () => o.onDel(it)));
      box.appendChild(row);
    }
    if (!items.length) box.appendChild(el('<div class="empty">ยังไม่มีรายการ</div>'));

    const add = el('<button class="addrow">+ เพิ่มรายการ</button>');
    add.onclick = o.onAdd;
    box.appendChild(add);
    return s;
  }

  // ═══════════ 3. บัตร ═══════════
  function cards(host) {
    const D = Store.get();
    const total = sum(D.cards, c => c.used), limit = sum(D.cards, c => c.limit);

    host.appendChild(card(`
      <div class="card-title">หนี้บัตรรวม</div>
      <div class="num hero-amt neg">${money(total)}</div>
      <div class="sub">จากวงเงินรวม ${money(limit)} ฿ · ใช้ไป ${limit ? Math.round(total / limit * 100) : 0}%</div>`));

    // เรียงตามใกล้ครบกำหนดที่สุด — สิ่งที่ต้องจ่ายก่อนควรอยู่บนสุด
    const day = new Date().getDate();
    const left = c => (c.dueDay >= day ? c.dueDay - day : c.dueDay + 30 - day);
    [...D.cards].sort((a, b) => left(a) - left(b)).forEach(c => {
      const u = c.limit ? c.used / c.limit : 0;
      const col = u >= .7 ? '#fb7185' : u >= .4 ? '#fbbf24' : '#34d399';
      const n = card(`
        <div style="display:flex;gap:16px;align-items:center">
          <div id="rg"></div>
          <div style="flex:1;min-width:0">
            <div class="row-name" style="font-weight:700;font-size:16px" id="nm"></div>
            <div class="sub" style="margin-top:4px">
              ใช้ <b class="num" id="us"></b> / <span class="num" id="lm"></span> ฿</div>
            <div class="sub" style="margin-top:2px;color:var(--text-3)">
              ตัดรอบ ${c.statementDay || '—'} · ครบกำหนด ${c.dueDay || '—'} · อีก ${left(c)} วัน</div>
          </div>
          <button class="mini on" id="del">✕</button>
        </div>`);
      n.querySelector('#rg').appendChild(Chart.ring(u, col, 62));
      Edit.inline(n.querySelector('#nm'), { get: () => c.name, set: v => { c.name = v; Store.commit(); } });
      Edit.inline(n.querySelector('#us'), { type: 'money', get: () => c.used, set: v => { c.used = v; Store.commit(); App.render(); } });
      Edit.inline(n.querySelector('#lm'), { type: 'money', get: () => c.limit, set: v => { c.limit = v; Store.commit(); App.render(); } });
      n.querySelector('#del').onclick = () => {
        if (!confirm(`ลบบัตร "${c.name}" ?`)) return;
        D.cards = D.cards.filter(x => x !== c); Store.commit(); App.render();
      };
      host.appendChild(n);
    });

    const add = el('<button class="addrow">+ เพิ่มบัตร</button>');
    add.onclick = () => {
      D.cards.push({ id: U.uid('c'), name: 'บัตรใหม่', limit: 10000, used: 0, statementDay: 25, dueDay: 5 });
      Store.commit(); App.render();
    };
    host.appendChild(add);
  }

  // ═══════════ 4. เงินเก็บ ═══════════
  function savings(host) {
    const D = Store.get();
    const total = sum(D.buckets, b => b.balance);
    const pct = D.savingsGoal ? U.clamp(total / D.savingsGoal, 0, 1) : 0;
    const tl = Engine.savingsTimeline(D);
    const lastActual = Engine.run(D).map(r => r.status).lastIndexOf('actual');

    const h = card(`
      <div class="card-title">เงินเก็บรวมทุกกระเป๋า</div>
      <div class="num hero-amt pos">${money(total)}</div>
      <div class="sub">เป้าหมาย <span id="goal" class="num"></span> ฿ · ไปแล้ว ${Math.round(pct * 100)}%</div>
      <div style="height:14px"></div>
      <div class="bar"><i style="width:${pct * 100}%;background:linear-gradient(90deg,#34d399,#38bdf8)"></i></div>`);
    host.appendChild(h);
    Edit.inline(h.querySelector('#goal'), { type: 'money', get: () => D.savingsGoal, set: v => { D.savingsGoal = v; Store.commit(); App.render(); } });

    const c = card(`<div class="card-head"><div class="card-title">เงินเก็บสะสมตามเวลา</div></div><div id="ch"></div>`);
    host.appendChild(c);
    Chart.line(c.querySelector('#ch'),
      [{ name: 'สะสม', color: '#34d399', values: tl.map(x => x.balance), dashFrom: lastActual, fill: true }],
      tl.map(x => monthShort(x.id)), { height: 170 });

    D.buckets.forEach(b => {
      const n = card(`<div style="display:flex;align-items:center;gap:12px">
        <div style="flex:1;min-width:0">
          <div class="row-name" style="font-weight:700" id="nm"></div>
          <div class="sub" style="margin-top:3px">ออมเดือนละ <span class="num" id="tg"></span> ฿</div>
        </div>
        <div class="num" style="font-size:20px;font-weight:800" id="bal"></div>
        <button class="mini on" id="del">✕</button></div>`);
      Edit.inline(n.querySelector('#nm'), { get: () => b.name, set: v => { b.name = v; Store.commit(); } });
      Edit.inline(n.querySelector('#tg'), { type: 'money', get: () => b.monthlyTarget || 0, set: v => { b.monthlyTarget = v; Store.commit(); } });
      Edit.inline(n.querySelector('#bal'), { type: 'money', get: () => b.balance, set: v => { b.balance = v; Store.commit(); App.render(); } });
      n.querySelector('#del').onclick = () => {
        if (!confirm(`ลบ "${b.name}" ?`)) return;
        D.buckets = D.buckets.filter(x => x !== b); Store.commit(); App.render();
      };
      host.appendChild(n);
    });

    const add = el('<button class="addrow">+ เพิ่มกระเป๋าเงินเก็บ</button>');
    add.onclick = () => { D.buckets.push({ id: U.uid('b'), name: 'กระเป๋าใหม่', balance: 0, monthlyTarget: 0 }); Store.commit(); App.render(); };
    host.appendChild(add);
  }

  // ═══════════ 5. ทำนาย / ถ้า…แล้วจะเป็นยังไง ═══════════
  function forecast(host) {
    const D = Store.get();
    const A = D.assumptions;

    const base = Engine.run(D);
    const sim = Engine.run(D, A);
    const lastActual = base.map(r => r.status).lastIndexOf('actual');
    const endBase = base[base.length - 1]?.closing ?? 0;
    const endSim = sim[sim.length - 1]?.closing ?? 0;
    const diff = endSim - endBase;

    const top = card(`
      <div class="card-title">ปลายช่วง ${monthShort(base[base.length - 1]?.id || '')}</div>
      <div class="num hero-amt ${netClass(endSim)}">${signed(endSim)}</div>
      <div class="sub">เดิม ${money(endBase)} ฿ ·
        <span class="${diff >= 0 ? 'pos' : 'neg'}">${signed(diff)} ฿ จากสมมติฐาน</span></div>
      <div style="height:14px"></div><div id="ch"></div>
      <div class="legend">
        <span><i style="background:#3f4658"></i>ตามจริงตอนนี้</span>
        <span><i style="background:#818cf8"></i>ถ้าทำตามสมมติฐาน</span>
      </div>`);
    host.appendChild(top);
    Chart.line(top.querySelector('#ch'), [
      { name: 'เดิม', color: '#3f4658', values: base.map(r => r.closing), dashFrom: lastActual, dots: false },
      { name: 'จำลอง', color: '#818cf8', values: sim.map(r => r.closing), dashFrom: lastActual, fill: true },
    ], base.map(r => monthShort(r.id)), { height: 190 });

    const sliders = card(`<div class="card-head"><div class="card-title">ปรับสมมติฐาน</div>
      <button class="mini on" id="rs">คืนค่า</button></div>
      <label class="fld"><span>รายรับ <b id="v1" class="num"></b></span>
        <input type="range" id="s1" min="-50" max="100" step="5"></label>
      <label class="fld"><span>รายจ่ายผันแปร <b id="v2" class="num"></b></span>
        <input type="range" id="s2" min="-80" max="50" step="5"></label>
      <label class="fld"><span>ออมเพิ่มเดือนละ <b id="v3" class="num"></b> ฿</span>
        <input type="range" id="s3" min="0" max="20000" step="500"></label>
      <div class="card-title" style="margin:16px 0 8px">ถ้าปิดบัตรใบนี้</div>
      <div id="cards"></div>`);
    host.appendChild(sliders);

    const bind = (sid, vid, key, fmt) => {
      const s = sliders.querySelector('#' + sid), v = sliders.querySelector('#' + vid);
      s.value = A[key];
      v.textContent = fmt(A[key]);
      s.oninput = () => { A[key] = Number(s.value); v.textContent = fmt(A[key]); Store.commit(); App.render(); };
    };
    bind('s1', 'v1', 'incomeAdj', x => (x > 0 ? '+' : '') + x + '%');
    bind('s2', 'v2', 'expenseAdj', x => (x > 0 ? '+' : '') + x + '%');
    bind('s3', 'v3', 'extraSaving', x => money(x));
    sliders.querySelector('#rs').onclick = () => {
      D.assumptions = { incomeAdj: 0, expenseAdj: 0, extraSaving: 0, closedCards: [] };
      Store.commit(); App.render();
    };
    const cb = sliders.querySelector('#cards');
    D.cards.forEach(c => {
      const on = A.closedCards.includes(c.id);
      const b = el(`<button class="chip ${on ? 'pos' : ''}" style="margin:0 6px 6px 0;cursor:pointer;border:0;font-family:inherit">
        ${on ? '✓ ' : ''}${esc(c.name)}</button>`);
      b.onclick = () => {
        A.closedCards = on ? A.closedCards.filter(x => x !== c.id) : [...A.closedCards, c.id];
        Store.commit(); App.render();
      };
      cb.appendChild(b);
    });

    host.appendChild(card(`<div class="hint">
      สมมติฐานมีผลกับ <b>เดือนที่ยังไม่เกิดขึ้น</b> เท่านั้นในทางความหมาย —
      ตัวเลขเดือนที่ทำเครื่องหมายว่า "จริง" แล้วยังเก็บไว้เหมือนเดิมในข้อมูล
      สิ่งที่เห็นตรงนี้คือภาพจำลอง ไม่ได้ไปแก้รายการจริงของคุณ</div>`));
  }

  // ═══════════ 6. หารครึ่ง ═══════════
  function split(host) {
    const D = Store.get();
    const other = D.people.find(p => p.id !== 'me') || { id: 'other', name: 'อีกฝ่าย' };
    const net = Engine.splitBalance(D);

    host.appendChild(card(`
      <div class="card-title">ยอดค้างกับ${esc(other.name)}</div>
      <div class="num hero-amt ${netClass(net)}">${money(Math.abs(net), 2)}</div>
      <div class="sub">${net < 0 ? `คุณต้องจ่าย${esc(other.name)}` : net > 0 ? `${esc(other.name)}ต้องจ่ายคุณ` : 'เคลียร์กันหมดแล้ว'}</div>`));

    const list = card(`<div class="card-head"><div class="card-title">รายการที่หารครึ่ง</div></div><div id="rows"></div>`);
    host.appendChild(list);
    const box = list.querySelector('#rows');

    D.splits.forEach(s => {
      const half = (Number(s.total) || 0) / 2;
      const row = el(`<div class="row" style="${s.settled ? 'opacity:.42' : ''}">
        <button class="mini on" id="ck" title="เคลียร์แล้ว">${s.settled ? '☑' : '☐'}</button>
        <div class="row-name"><span id="nm"></span>
          <div class="row-sub">รวม <span class="num" id="tt"></span> · คนละ ${money(half, 2)} · จ่ายโดย <b id="who" style="cursor:pointer">${s.paidBy === 'me' ? 'คุณ' : esc(other.name)}</b></div>
        </div>
        <span class="row-amt num ${s.paidBy === 'me' ? 'pos' : 'neg'}">${s.paidBy === 'me' ? '+' : '−'}${money(half, 2)}</span>
      </div>`);
      Edit.inline(row.querySelector('#nm'), { get: () => s.name, set: v => { s.name = v; Store.commit(); } });
      Edit.inline(row.querySelector('#tt'), { type: 'money', get: () => s.total, set: v => { s.total = v; Store.commit(); App.render(); } });
      row.querySelector('#who').onclick = () => { s.paidBy = s.paidBy === 'me' ? other.id : 'me'; Store.commit(); App.render(); };
      row.querySelector('#ck').onclick = () => { s.settled = !s.settled; Store.commit(); App.render(); };
      row.appendChild(Edit.delBtn(s.name, () => { D.splits = D.splits.filter(x => x !== s); Store.commit(); App.render(); }));
      box.appendChild(row);
    });
    if (!D.splits.length) box.appendChild(el('<div class="empty">ยังไม่มีรายการ</div>'));

    const add = el('<button class="addrow">+ เพิ่มรายการหารครึ่ง</button>');
    add.onclick = () => { D.splits.push({ id: U.uid('s'), name: 'รายการใหม่', total: 0, paidBy: 'me', settled: false }); Store.commit(); App.render(); };
    box.appendChild(add);

    const clr = el('<button class="btn ghost wide" style="margin-top:6px">เคลียร์ยอดทั้งหมด (ทำเครื่องหมายว่าจ่ายกันแล้ว)</button>');
    clr.onclick = () => {
      if (!confirm('ทำเครื่องหมายทุกรายการว่าเคลียร์แล้ว?')) return;
      D.splits.forEach(s => s.settled = true); Store.commit(); App.render();
    };
    host.appendChild(clr);
  }

  return { dashboard, month: monthScreen, cards, savings, forecast, split };
})();

window.Screens = Screens;
