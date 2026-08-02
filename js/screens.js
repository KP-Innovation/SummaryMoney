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

  // ═══════════ ปฏิทิน — เช็กลิสต์ภาระประจำ + ของไม่คาดคิด ═══════════
  //
  //  หน้าที่หลักของหน้านี้คือ "เช็กลิสต์" ไม่ใช่แค่แสดงผล:
  //   1. ภาระประจำ ใส่ครั้งเดียวใน โปรแกรม แล้วขึ้นให้ทุกเดือนเอง
  //   2. กดติ๊กว่าจ่ายแล้วได้ตรงบนวันนั้น
  //   3. ของไม่คาดคิด (ค่าซ่อมรถ / ให้ยืมแล้วรอคืน) เพิ่มลงวันไหนก็ได้
  //  รายการที่เลยกำหนดแล้วยังไม่ติ๊ก จะถูกไฮไลต์เป็น "ค้างจ่าย"

  const DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  const daysIn = id => { const [y, m] = id.split('-').map(Number); return new Date(y, m, 0).getDate(); };

  /** จัดรายการทั้งเดือนลงตะกร้าของแต่ละวัน */
  function bucketByDay(m, dim) {
    const byDay = {}, noDay = [];
    const put = (it, kind, color, list) => {
      const e = { it, kind, color, list };
      const d = Number(it.dueDay);
      if (d >= 1 && d <= dim) (byDay[d] ||= []).push(e);
      else noDay.push(e);
    };
    m.incomes.forEach(it => put(it, 'in', '#34d399', m.incomes));
    m.oneTimes.forEach(it => put(it, 'in', '#a78bfa', m.oneTimes));
    m.expenses.forEach(it => put(it, 'out', Engine.TYPES[it.type]?.color || '#94a3b8', m.expenses));
    return { byDay, noDay };
  }

  /** วันนี้เลยกำหนดของวันนั้นไปแล้วหรือยัง (ใช้ตัดสินว่า "ค้าง") */
  function overdueRef(monthId) {
    const now = new Date();
    const nowId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (monthId < nowId) return 32;          // เดือนที่ผ่านไปแล้ว ทุกวันถือว่าเลยกำหนด
    if (monthId > nowId) return 0;           // เดือนอนาคต ยังไม่มีอะไรค้าง
    return now.getDate();
  }

  // ── ตัวสลับ รายปี / รายเดือน ──
  function calendar(host) {
    const seg = el(`<div class="card" style="display:flex;justify-content:center;padding:10px">
      <div class="seg">
        <button data-m="year">รายปี</button>
        <button data-m="month">รายเดือน</button>
      </div></div>`);
    const mode = App.state.calMode || 'year';
    seg.querySelectorAll('button').forEach(b => {
      b.classList.toggle('on', b.dataset.m === mode);
      b.onclick = () => { App.state.calMode = b.dataset.m; App.render(); };
    });
    host.appendChild(seg);
    (mode === 'year' ? yearView : monthCalendar)(host);
  }

  // ═══════════ ปฏิทินรายปี — ภาพรวม 12 เดือน + เช็กลิสต์ ═══════════
  //
  //  เจตนา: ดูรวดเดียวว่าทั้งปีมีภาระอะไรบ้าง อันไหนจ่ายแล้ว อันไหนยังค้าง
  //  ส้ม = ยังไม่จ่าย · เขียว = จ่ายแล้ว · แตะเพื่อสลับสถานะ (ตอนกดจ่ายจะถามวันที่จ่าย)
  //  จงใจไม่ลงรายละเอียดระดับวัน — ถ้าอยากดูรายวันให้สลับไปโหมด "รายเดือน"

  /** รายการที่ถือเป็น "ภาระที่ต้องจ่าย" ของเดือน (ตัดรายจ่ายผันแปรจิปาถะออก) */
  const dutiesOf = m => m.expenses.filter(e => e.type !== 'variable' && !/^—/.test(e.name));

  function yearView(host) {
    const D = Store.get();
    const year = Number((App.state.month || Store.thisMonth()).slice(0, 4));
    const now = new Date();
    const nowId = Store.thisMonth();

    const ids = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
    const boxes = ids.map(id => Store.month(id));

    let doneAll = 0, totalAll = 0, leftAmt = 0;
    boxes.forEach(m => {
      if (!m) return;
      const d = dutiesOf(m);
      totalAll += d.length;
      doneAll += d.filter(x => x.paid).length;
      leftAmt += sum(d.filter(x => !x.paid), x => x.amount);
    });

    pinnedZone(host, year);

    const head = card(`
      <div class="monthbar">
        <button class="icon-btn" id="py">‹</button>
        <div class="m-label">ปี ${year + 543}</div>
        <button class="icon-btn" id="ny">›</button>
      </div>
      <div class="kv"><span class="kv-k">จ่ายแล้วทั้งปี</span>
        <span class="kv-v num">${doneAll} / ${totalAll} รายการ</span></div>
      <div class="bar" style="margin:6px 0 12px">
        <i style="width:${totalAll ? doneAll / totalAll * 100 : 0}%;background:linear-gradient(90deg,#34d399,#38bdf8)"></i></div>
      <div class="kv"><span class="kv-k">ยังไม่จ่ายรวม</span>
        <span class="kv-v num warn">${money(leftAmt)} ฿</span></div>
      <button class="btn ghost wide" id="prep" style="margin-top:12px">เตรียมภาระประจำให้ครบทั้งปี</button>`);
    host.appendChild(head);
    head.querySelector('#py').onclick = () => { App.state.month = `${year - 1}-01`; App.render(); };
    head.querySelector('#ny').onclick = () => { App.state.month = `${year + 1}-01`; App.render(); };
    head.querySelector('#prep').onclick = () => {
      let n = 0;
      ids.forEach(id => { Store.ensureMonth(id); n += Store.applyRecurring(id); });
      Store.commit(); App.render();
      App.toast(n ? `เติมภาระประจำ ${n} รายการทั้งปี` : 'ครบอยู่แล้วทั้งปี');
    };

    const grid = el('<div class="yr-grid"></div>');
    host.appendChild(grid);

    ids.forEach((id, i) => grid.appendChild(monthBox(id, i)));

    host.appendChild(card(`<div class="hint">
      <b style="color:#fdba74">ส้ม</b> = ยังไม่จ่าย · <b style="color:#6ee7b7">เขียว</b> = จ่ายแล้ว ·
      แตะรายการเพื่อสลับสถานะ · แตะชื่อเดือนเพื่อดูรายวัน<br>
      แสดงเฉพาะภาระที่ต้องจ่ายประจำ (ไม่รวมรายจ่ายผันแปรจิปาถะ)
    </div>`));
  }

  // ── ช่องเดือนหนึ่งช่อง (ใช้ทั้งในกริดรายปีและในโซนปักหมุด) ──
  function monthBox(id, i, big = false) {
    const m = Store.month(id);
    const duties = m ? dutiesOf(m) : [];
    const done = duties.filter(x => x.paid).length;
    const others = m ? m.expenses.length - duties.length : 0;
    const nowId = Store.thisMonth();
    const pinned = isPinned(id);

    const box = el(`<div class="yr-month ${id === nowId ? 'now' : ''} ${big ? 'big' : ''}">
      <div class="yr-head">
        <span class="yr-name">${U.TH_MONTH[i]}${big ? ' ' + (Number(id.slice(0, 4)) + 543) : ''}</span>
        <span class="yr-cnt ${duties.length && done === duties.length ? 'all' : ''}">${
          duties.length ? `${done}/${duties.length}` : '—'}</span>
        <button class="yr-pin ${pinned ? 'on' : ''}" title="${pinned ? 'เอาหมุดออก' : 'ปักหมุดขึ้นบนสุด'}">📌</button>
      </div>
      <div class="yr-items"></div>
    </div>`);

    const items = box.querySelector('.yr-items');
    if (!m || !duties.length) {
      const e = el('<div class="yr-empty">แตะเพื่อเติมภาระประจำ</div>');
      e.onclick = () => { Store.ensureMonth(id); Store.applyRecurring(id); Store.commit(); App.render(); };
      items.appendChild(e);
    } else {
      duties.forEach(it => {
        const b = el(`<button class="yr-item ${it.paid ? 'done' : ''}">
          <span class="s">${it.paid ? '✓' : '○'}</span>
          <span class="t">${esc(it.name)}</span>
          <span class="a">${money(it.amount)}</span></button>`);
        b.title = it.paid && it.paidOn ? `จ่ายเมื่อ ${it.paidOn}` : 'ยังไม่จ่าย';
        b.onclick = () => togglePaid(it, id);
        items.appendChild(b);
      });
      if (others > 0) items.appendChild(el(`<div class="yr-more">+ อื่นๆ ${others} รายการ</div>`));
    }

    box.querySelector('.yr-pin').onclick = e => { e.stopPropagation(); togglePin(id); };
    const nameEl = box.querySelector('.yr-name');
    nameEl.style.cursor = 'pointer';
    nameEl.onclick = () => { App.state.month = id; App.state.calMode = 'month'; App.render(); };
    return box;
  }

  // ── โซนปักหมุด: เดือนที่สนใจถูกยกขึ้นมาไว้บนสุด ──
  //  ปักหมุดทั้งเดือน ไม่ใช่รายรายการ — เจตนาคือ "จ้องเดือนนี้เป็นพิเศษ"
  //  ช่องที่ปักจะกว้างกว่าปกติ (2 คอลัมน์) เพื่อให้อ่านเช็กลิสต์ได้สบายตา

  const isPinned = id => (Store.get().pinned || []).includes(id);

  function togglePin(id) {
    const D = Store.get();
    const on = isPinned(id);
    D.pinned = on ? D.pinned.filter(x => x !== id) : [...(D.pinned || []), id];
    D.pinned.sort();
    Store.commit(); App.render();
    App.toast(on ? 'เอาหมุดออกแล้ว' : 'ปักหมุดแล้ว — ขึ้นไปอยู่บนสุด');
  }

  function pinnedZone(host, year) {
    const D = Store.get();
    const pins = (D.pinned || []).filter(id => Number(id.slice(0, 4)) === year);
    if (!pins.length) return;

    const box = card(`<div class="card-head">
        <div class="card-title">📌 เดือนที่ปักหมุด · ${pins.length}</div>
        <span class="chip">แตะ 📌 ที่หัวเดือนเพื่อเอาออก</span>
      </div><div class="yr-grid big" id="g"></div>`, 'pin-card');
    host.appendChild(box);
    const g = box.querySelector('#g');
    pins.forEach(id => g.appendChild(monthBox(id, Number(id.slice(5)) - 1, true)));
  }


  /** กดสถานะจ่าย — ตอนติ๊กว่าจ่ายแล้วให้ใส่วันที่จ่ายด้วย */
  function togglePaid(it, monthId) {
    if (it.paid) {
      Sheet.open(it.name, body => {
        body.innerHTML = `
          <div class="hint" style="margin-bottom:14px">
            จ่ายแล้วเมื่อ <b style="color:var(--text)">${it.paidOn || 'ไม่ได้ระบุวัน'}</b>
            · ${money(it.amount)} ฿</div>
          <div class="btn-row">
            <button class="btn ghost" data-close>ปิด</button>
            <button class="btn danger" id="un">ยกเลิก — กลับเป็นยังไม่จ่าย</button>
          </div>`;
        body.querySelector('#un').onclick = () => {
          it.paid = false; delete it.paidOn;
          Store.commit(); Sheet.close(); App.render();
        };
      });
      return;
    }

    // ตั้งค่าเริ่มต้นเป็นวันครบกำหนดของเดือนนั้น ถ้าไม่มีก็วันนี้ — กดยืนยันรวดเดียวจบ
    const [y, mo] = monthId.split('-').map(Number);
    const dim = new Date(y, mo, 0).getDate();
    const day = U.clamp(Number(it.dueDay) || new Date().getDate(), 1, dim);
    const def = `${monthId}-${String(day).padStart(2, '0')}`;

    Sheet.open('จ่าย "' + it.name + '"', body => {
      body.innerHTML = `
        <div class="kv" style="padding-bottom:12px;border-bottom:1px solid var(--line)">
          <span class="kv-k">จำนวนเงิน</span>
          <span class="kv-v num neg">${money(it.amount)} ฿</span></div>
        <label class="fld" style="margin-top:14px"><span>จ่ายวันที่</span>
          <input type="date" id="dt" value="${def}"></label>
        <button class="btn wide" id="ok">ยืนยันว่าจ่ายแล้ว</button>
        <div class="hint" style="margin-top:10px">
          การกดจ่ายเป็นการติ๊กเช็กลิสต์เท่านั้น ไม่กระทบยอดเงินของเดือน
        </div>`;
      body.querySelector('#ok').onclick = () => {
        it.paid = true;
        it.paidOn = body.querySelector('#dt').value || def;
        Store.commit(); Sheet.close(); App.render();
        App.toast('ติ๊กว่าจ่ายแล้ว · ' + it.paidOn);
      };
    });
  }

  function monthCalendar(host) {
    const D = Store.get();
    const id = App.state.month;
    const m = Store.ensureMonth(id);
    const dim = daysIn(id);
    const [y, mo] = id.split('-').map(Number);
    const startDow = new Date(y, mo - 1, 1).getDay();
    const { byDay, noDay } = bucketByDay(m, dim);
    const odRef = overdueRef(id);

    const all = [...m.incomes, ...m.oneTimes, ...m.expenses];
    const paidN = all.filter(x => x.paid).length;
    const dueLeft = sum(m.expenses.filter(e => !e.paid), e => e.amount);
    const overdue = m.expenses.filter(e => !e.paid && e.dueDay && e.dueDay < odRef);

    // ── หัวเดือน + สรุปเช็กลิสต์ ──
    const head = card(`
      <div class="monthbar">
        <button class="icon-btn" id="pm">‹</button>
        <div class="m-label">${monthFull(id)}</div>
        <button class="icon-btn" id="nm">›</button>
      </div>
      <div class="kv"><span class="kv-k">ติ๊กแล้ว</span>
        <span class="kv-v num">${paidN} / ${all.length} รายการ</span></div>
      <div class="bar" style="margin:6px 0 12px">
        <i style="width:${all.length ? paidN / all.length * 100 : 0}%;background:linear-gradient(90deg,#34d399,#38bdf8)"></i></div>
      <div class="kv"><span class="kv-k">ยังไม่จ่าย</span>
        <span class="kv-v num neg">${money(dueLeft)} ฿</span></div>
      ${overdue.length ? `<div class="kv"><span class="kv-k neg">⚠ เลยกำหนดแล้วยังไม่ติ๊ก</span>
        <span class="kv-v num neg">${overdue.length} รายการ</span></div>` : ''}
      <div class="btn-row" style="margin-top:12px">
        <button class="btn ghost" id="fill">เติมภาระประจำ</button>
        <button class="btn" id="quick">+ เพิ่มรายการ</button>
      </div>`);
    host.appendChild(head);
    head.querySelector('#pm').onclick = () => App.goMonth(shiftMonth(id, -1));
    head.querySelector('#nm').onclick = () => App.goMonth(shiftMonth(id, 1));
    head.querySelector('#fill').onclick = () => {
      const n = Store.applyRecurring(id);
      Store.commit(); App.render();
      App.toast(n ? `เติมภาระประจำ ${n} รายการ` : 'ครบอยู่แล้ว ไม่มีอะไรต้องเติม');
    };
    head.querySelector('#quick').onclick = () => quickAdd(id, new Date().getDate());

    // ── ตารางปฏิทิน ──
    const grid = card(`
      <div class="cal-dow">${DOW.map((d, i) =>
        `<span class="${i === 0 || i === 6 ? 'we' : ''}">${d}</span>`).join('')}</div>
      <div class="cal-grid" id="g"></div>`);
    host.appendChild(grid);
    const g = grid.querySelector('#g');
    for (let i = 0; i < startDow; i++) g.appendChild(el('<div class="cal-cell out"></div>'));

    const now = new Date();
    const todayD = (now.getFullYear() === y && now.getMonth() + 1 === mo) ? now.getDate() : 0;

    for (let d = 1; d <= dim; d++) {
      const list = byDay[d] || [];
      const unpaid = list.filter(e => !e.it.paid);
      const isOver = d < odRef && unpaid.length > 0;
      const allPaid = list.length > 0 && unpaid.length === 0;
      const net = sum(list.filter(e => e.kind === 'in'), e => e.it.amount)
                - sum(list.filter(e => e.kind === 'out'), e => e.it.amount);

      const cell = el(`<button class="cal-cell ${list.length ? 'has' : ''} ${d === todayD ? 'today' : ''} ${isOver ? 'over' : ''} ${allPaid ? 'done' : ''}">
        <div class="cal-top">
          <span class="cal-d">${d}</span>
          ${allPaid ? '<span class="cal-tick">✓</span>' : isOver ? '<span class="cal-warn">!</span>' : ''}
        </div>
        <div class="cal-dots">${list.slice(0, 8).map(e =>
          `<i style="background:${e.color};${e.it.paid ? 'opacity:.28' : ''}"></i>`).join('')}</div>
        ${list.length ? `<div class="cal-mini">${esc(list[0].it.name)}${list.length > 1 ? ` +${list.length - 1}` : ''}</div>` : ''}
        ${net ? `<div class="cal-net num ${net < 0 ? 'neg' : 'pos'}">${signed(net)}</div>` : ''}
      </button>`);
      cell.onclick = () => daySheet(id, d);
      g.appendChild(cell);
    }

    // ── ยังไม่ได้ระบุวัน ──
    if (noDay.length) {
      const un = card(`<div class="card-head">
          <div class="card-title">ยังไม่ได้ระบุวัน · ${noDay.length} รายการ</div></div>
        <div class="hint" style="margin-bottom:8px">กำหนดวันแล้วมันจะไปโผล่บนปฏิทินเอง</div>
        <div id="rows"></div>`);
      host.appendChild(un);
      const box = un.querySelector('#rows');
      noDay.forEach(e => {
        const row = el(`<div class="row">
          <span class="sect-dot" style="background:${e.color}"></span>
          <span class="row-name">${esc(e.it.name)}</span>
          <span class="row-amt num ${e.kind === 'in' ? 'pos' : 'neg'}">${e.kind === 'in' ? '+' : '−'}${money(e.it.amount)}</span>
          <button class="mini on">ระบุวัน</button></div>`);
        row.querySelector('button').onclick = () => askDay(e.it, () => App.render());
        box.appendChild(row);
      });
    }

    // ── ภาระประจำ ──
    const rc = card(`<div class="card-head">
        <div class="card-title">ภาระประจำ · ใส่ครั้งเดียว ขึ้นทุกเดือนเอง</div></div>
      <div id="rows"></div>
      <button class="addrow" id="add">+ เพิ่มภาระประจำ</button>`);
    host.appendChild(rc);
    const rbox = rc.querySelector('#rows');
    if (!D.recurring.length) rbox.appendChild(el('<div class="empty">ยังไม่มีภาระประจำ</div>'));
    D.recurring.forEach(r => {
      const meta = Engine.TYPES[r.type] || Engine.TYPES.fixed;
      const row = el(`<div class="row" style="${r.active ? '' : 'opacity:.4'}">
        <button class="mini on" title="เปิด/ปิด">${r.active ? '☑' : '☐'}</button>
        <span class="sect-dot" style="background:${meta.color}"></span>
        <span class="row-name"></span>
        <span class="chip" style="margin-right:6px">${r.dueDay ? 'วันที่ ' + r.dueDay : 'ไม่ระบุวัน'}</span>
        <span class="row-amt num"></span></div>`);
      Edit.inline(row.querySelector('.row-name'), { get: () => r.name, set: v => { r.name = v; Store.commit(); } });
      Edit.inline(row.querySelector('.row-amt'), { type: 'money', get: () => r.amount,
        set: v => { r.amount = v; Store.commit(); App.render(); } });
      row.querySelector('button').onclick = () => { r.active = !r.active; Store.commit(); App.render(); };
      row.querySelector('.chip').style.cursor = 'pointer';
      row.querySelector('.chip').onclick = () => askDay(r, () => App.render());
      row.appendChild(Edit.delBtn(r.name, () => {
        D.recurring = D.recurring.filter(x => x !== r); Store.commit(); App.render();
      }));
      rbox.appendChild(row);
    });
    rc.querySelector('#add').onclick = () => {
      D.recurring.push({ id: U.uid('r'), name: 'ภาระใหม่', amount: 0, type: 'fixed', dueDay: 1, active: true });
      Store.commit(); App.render();
    };

    host.appendChild(card(`<div class="legend">
      ${Object.entries(Engine.TYPES).map(([, v]) =>
        `<span><i style="background:${v.color}"></i>${esc(v.label)}</span>`).join('')}
      <span><i style="background:#34d399"></i>รายรับ</span>
      <span><i style="background:#a78bfa"></i>เงินก้อนพิเศษ</span>
      <span style="opacity:.7">จุดจาง = ติ๊กแล้ว</span>
    </div>`));
  }

  /** ถามวันที่ของรายการหนึ่ง */
  function askDay(it, done) {
    Sheet.open('กำหนดวันของ "' + it.name + '"', body => {
      body.innerHTML = `
        <label class="fld"><span>วันที่ในเดือน (1–31)</span>
          <input type="number" id="d" min="1" max="31" value="${it.dueDay || ''}"></label>
        <div class="btn-row">
          <button class="btn ghost" id="clr">ล้างวัน</button>
          <button class="btn" id="ok">บันทึก</button>
        </div>`;
      body.querySelector('#ok').onclick = () => {
        const v = Number(body.querySelector('#d').value);
        it.dueDay = v >= 1 && v <= 31 ? v : undefined;
        Store.commit(); Sheet.close(); done();
      };
      body.querySelector('#clr').onclick = () => { delete it.dueDay; Store.commit(); Sheet.close(); done(); };
    });
  }

  /**
   * เพิ่มรายการไม่คาดคิด
   * "ให้ยืม" สร้างสองรายการพร้อมกัน: เงินออกวันนี้ + เงินเข้าวันที่นัดคืน
   * (ข้ามเดือนได้ ระบบจะสร้างเดือนปลายทางให้เอง) — จะได้ไม่ลืมว่ามีเงินก้อนนี้รออยู่
   */
  function quickAdd(monthId, day) {
    Sheet.open('เพิ่มรายการ', body => {
      body.innerHTML = `
        <label class="fld"><span>ประเภท</span>
          <select id="k">
            <option value="out">รายจ่ายไม่คาดคิด (เช่น ค่าซ่อมรถ)</option>
            <option value="in">รายรับพิเศษ</option>
            <option value="lend">ให้ยืม — มีกำหนดคืน</option>
          </select></label>
        <label class="fld"><span>ชื่อรายการ</span>
          <input type="text" id="n" placeholder="เช่น ค่าซ่อมรถ / ให้พี่บิวยืม"></label>
        <label class="fld"><span>จำนวนเงิน (พิมพ์สูตรได้ เช่น 1200+800)</span>
          <input type="text" id="a" inputmode="decimal" placeholder="0"></label>
        <div class="grid g2">
          <label class="fld"><span>วันที่</span>
            <input type="number" id="d" min="1" max="31" value="${day}"></label>
          <label class="fld" id="w-type"><span>หมวด</span>
            <select id="t">
              <option value="variable">ผันแปร</option>
              <option value="fixed">รายจ่ายประจำ</option>
              <option value="debt">หนี้ / บัตร</option>
              <option value="saving">เงินออม</option>
            </select></label>
        </div>
        <div id="w-back" hidden>
          <div class="grid g2">
            <label class="fld"><span>นัดคืนเดือน</span>
              <select id="bm"></select></label>
            <label class="fld"><span>นัดคืนวันที่</span>
              <input type="number" id="bd" min="1" max="31" value="${day}"></label>
          </div>
        </div>
        <button class="btn wide" id="ok">เพิ่มลงปฏิทิน</button>`;

      // ตัวเลือกเดือนคืนเงิน: เดือนนี้ + 12 เดือนข้างหน้า
      const bm = body.querySelector('#bm');
      for (let i = 0; i <= 12; i++) {
        const mid = shiftMonth(monthId, i);
        bm.appendChild(el(`<option value="${mid}">${monthFull(mid)}</option>`));
      }
      bm.value = shiftMonth(monthId, 1);

      const k = body.querySelector('#k');
      const sync = () => {
        const lend = k.value === 'lend';
        body.querySelector('#w-back').hidden = !lend;
        body.querySelector('#w-type').style.visibility = k.value === 'in' ? 'hidden' : 'visible';
      };
      k.onchange = sync; sync();

      body.querySelector('#ok').onclick = () => {
        const name = body.querySelector('#n').value.trim() || 'รายการใหม่';
        const amt = U.calc(body.querySelector('#a').value) || 0;
        const d = U.clamp(Number(body.querySelector('#d').value) || day, 1, 31);
        const kind = k.value;
        const m = Store.ensureMonth(monthId);

        if (kind === 'in') {
          m.incomes.push({ id: U.uid('i'), name, amount: amt, dueDay: d, note: '', paid: false });
        } else {
          m.expenses.push({ id: U.uid('e'), name, amount: amt, dueDay: d,
            type: kind === 'lend' ? 'variable' : body.querySelector('#t').value,
            note: kind === 'lend' ? 'ให้ยืม — รอรับคืน' : '', paid: false });
          if (kind === 'lend') {
            const backId = body.querySelector('#bm').value;
            const backD = U.clamp(Number(body.querySelector('#bd').value) || d, 1, 31);
            const bm2 = Store.ensureMonth(backId);
            bm2.incomes.push({ id: U.uid('i'), name: `${name} (รับคืน)`, amount: amt,
              dueDay: backD, note: 'เงินที่ให้ยืมไว้ ถึงกำหนดคืน', paid: false });
          }
        }
        Store.commit(); Sheet.close(); App.render();
        App.toast(kind === 'lend' ? 'เพิ่มแล้ว — ตั้งวันรับคืนไว้ให้ด้วย' : 'เพิ่มลงปฏิทินแล้ว');
      };
    });
  }

  /** รายละเอียดของวันหนึ่ง — เช็กลิสต์ + แก้ได้ทุกช่องตรงนั้น */
  function daySheet(monthId, day) {
    const D = Store.get();
    const m = Store.ensureMonth(monthId);
    const dim = daysIn(monthId);
    const odRef = overdueRef(monthId);

    const build = body => {
      const { byDay } = bucketByDay(m, dim);
      const list = byDay[day] || [];
      const inSum = sum(list.filter(e => e.kind === 'in'), e => e.it.amount);
      const outSum = sum(list.filter(e => e.kind === 'out'), e => e.it.amount);
      const left = sum(list.filter(e => e.kind === 'out' && !e.it.paid), e => e.it.amount);

      body.innerHTML = `
        <div style="padding-bottom:12px;border-bottom:1px solid var(--line)">
          <div class="kv" style="padding:2px 0"><span class="kv-k">เข้า</span>
            <span class="kv-v num pos">+${money(inSum)}</span></div>
          <div class="kv" style="padding:2px 0"><span class="kv-k">ออก</span>
            <span class="kv-v num neg">−${money(outSum)}</span></div>
          <div class="kv" style="padding:2px 0"><span class="kv-k">ยังไม่ติ๊ก</span>
            <span class="kv-v num ${left ? 'warn' : 'pos'}">${left ? money(left) + ' ฿' : 'ครบแล้ว ✓'}</span></div>
        </div>
        <div id="rows" style="margin:8px 0"></div>
        <div id="marks"></div>
        <div class="btn-row" style="margin-top:10px">
          <button class="btn ghost" id="allp">ติ๊กทั้งวัน</button>
          <button class="btn" id="qa">+ เพิ่มรายการ</button>
        </div>`;

      const rows = body.querySelector('#rows');
      if (!list.length) rows.appendChild(el('<div class="empty">วันนี้ยังไม่มีรายการ</div>'));

      list.forEach(e => {
        const over = !e.it.paid && day < odRef;
        const row = el(`<div class="row ${e.it.paid ? 'paid' : ''}">
          <button class="mini on chk" title="จ่ายแล้ว/ยังไม่จ่าย">${e.it.paid ? '☑' : '☐'}</button>
          <span class="sect-dot" style="background:${e.color}"></span>
          <span class="row-name"></span>
          <span class="row-amt num ${e.kind === 'in' ? 'pos' : 'neg'}"></span>
        </div>`);
        if (over) row.querySelector('.row-name').after(el('<div class="row-sub neg">เลยกำหนดแล้ว</div>'));
        else if (e.it.note) row.querySelector('.row-name').after(el(`<div class="row-sub">${esc(e.it.note)}</div>`));

        Edit.inline(row.querySelector('.row-name'), {
          get: () => e.it.name, set: v => { e.it.name = v; Store.commit(); App.render(); },
        });
        Edit.inline(row.querySelector('.row-amt'), {
          type: 'money', prefix: e.kind === 'in' ? '+' : '−',
          get: () => e.it.amount, set: v => { e.it.amount = v; Store.commit(); App.render(); build(body); },
        });
        row.querySelector('.chk').onclick = () => {
          e.it.paid = !e.it.paid;
          Store.commit(); App.render(); build(body);
        };
        const mv = el('<button class="mini on" title="ย้ายวัน">⇄</button>');
        mv.onclick = () => askDay(e.it, () => { App.render(); Sheet.close(); });
        row.appendChild(mv);
        row.appendChild(Edit.noteBtn(e.it, () => { App.render(); build(body); }));
        row.appendChild(Edit.delBtn(e.it.name, () => {
          const i = e.list.indexOf(e.it);
          if (i >= 0) e.list.splice(i, 1);
          Store.commit(); App.render(); build(body);
        }));
        rows.appendChild(row);
      });

      const cm = D.cards.filter(c => c.dueDay === day || c.statementDay === day);
      if (cm.length) {
        const b = body.querySelector('#marks');
        b.appendChild(el('<div class="card-title" style="margin:12px 0 6px">บัตรในวันนี้</div>'));
        cm.forEach(c => b.appendChild(el(`<div class="row">
          <span class="row-name">${esc(c.name)}</span>
          <span class="chip ${c.dueDay === day ? 'neg' : ''}">${c.dueDay === day ? 'ครบกำหนดชำระ' : 'ตัดรอบ'}</span>
        </div>`)));
      }

      body.querySelector('#allp').onclick = () => {
        const target = list.some(e => !e.it.paid);
        list.forEach(e => e.it.paid = target);
        Store.commit(); App.render(); build(body);
      };
      body.querySelector('#qa').onclick = () => quickAdd(monthId, day);
    };

    Sheet.open(`${day} ${monthFull(monthId)}`, build);
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

  return { dashboard, calendar, month: monthScreen, cards, savings, forecast, split };
})();

window.Screens = Screens;
