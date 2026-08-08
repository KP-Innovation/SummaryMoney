// ══════════════════════════════════════════════════════════════
//  timeline.js — หน้าแรก: เส้นเวลารายเดือน
//
//  หนึ่งเดือน = เส้นแนวนอนหนึ่งเส้น วันที่ 1 → สิ้นเดือน · หนึ่งปี = 12 เส้น
//  รายการเงินชี้เป็นลูกศรออกจากเส้น ตามวันที่ที่ต้องจ่าย/ได้รับ
//      เหนือเส้น = เงินที่ยังเป็นของเรา (รายรับ · เงินออม · เงินฉุกเฉิน · ค่าผ่อน)
//      ใต้เส้น  = เงินที่จ่ายแล้วหมดไป (ค่าน้ำ ค่าไฟ ค่าหอ ค่ารักษา)
//  แกน Y คือ "แถว" ที่ผู้ใช้เพิ่มเองได้ — อนาคตมีค่าผ่อนรถก็เพิ่มแถวใหม่ได้เลย
//
//  ทำไมต้องมีหน้านี้ ทั้งที่มีปฏิทินอยู่แล้ว:
//  ปฏิทินตอบว่า "วันนี้มีอะไร" แต่ไม่ตอบว่า "ควรจ่ายอะไรก่อน และเงินจะพอไหม"
//  เส้นเวลาเรียงตามวันจริง จึงเห็นระยะห่างระหว่างเงินเข้ากับเงินออกด้วยตา
//
//  ข้อมูลใช้ชุดเดียวกับทุกหน้า (months[].incomes/oneTimes/expenses)
//  แก้ที่นี่แล้วปฏิทิน/รายเดือน/กราฟ ขยับตามทันที ไม่มีข้อมูลซ้อนสองชุด
// ══════════════════════════════════════════════════════════════

const TL = (() => {
  const { money, signed, monthShort, monthFull, shiftMonth, esc, el, clamp } = U;
  const S = () => App.state;

  const MONTHS = 12;                 // จำนวนเส้นที่แสดง = 1 ปีนับจากเดือนเริ่ม
  const AX = 32;                     // ความสูงของแถบแกนวันที่

  const dimOf  = mid => { const [y, m] = mid.split('-').map(Number); return new Date(y, m, 0).getDate(); };
  const dowOf  = (mid, d) => { const [y, m] = mid.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };
  const nowId  = () => Store.thisMonth();
  const todayD = () => new Date().getDate();
  const isoOf  = (mid, d) => `${mid}-${String(d).padStart(2, '0')}`;

  // ── รายการทั้งหมดของเดือน พร้อมบอกว่าอยู่แถวไหน / เป็นเงินเข้าหรือออก ──
  function entries(mid) {
    const m = Store.ensureMonth(mid);
    const out = [];
    const put = (it, kind, list) => out.push({ it, kind, list, mid, lane: Store.laneOf(it, kind) });
    m.incomes.forEach(it => put(it, 'in', m.incomes));
    m.oneTimes.forEach(it => put(it, 'in', m.oneTimes));
    m.expenses.forEach(it => put(it, 'out', m.expenses));
    return out;
  }

  // ══ เงินสุทธิรายเดือน ═══════════════════════════════════════
  //
  //  จุดบอดที่ต้องแก้: เอารายรับลบรายจ่ายตรงๆ ไม่มีทางตรง เพราะมีรายจ่ายจุกจิก
  //  ที่ไม่ได้ลงในเส้นเวลาเสมอ ตัวเลขจะเพี้ยนสะสมไปเรื่อยๆ
  //
  //  จึงให้ "กรอกยอดเงินจริงในบัญชีสิ้นเดือน" เป็นหมุดความจริง แล้ว
  //      เงินสุทธิ = ยอดในบัญชี + เงินเก็บฉุกเฉินสะสม
  //  เงินเก็บฉุกเฉินเป็นแถวเดียวที่ถูกนับกลับ เพราะมันแค่ย้ายบัญชี ยังเป็นเงินเรา
  //  ส่วนเงินออม/ค่าผ่อน ถึงจะอยู่เหนือเส้น ก็ไม่นับเป็นเงินเหลือ (เอาออกมาใช้ไม่ได้)
  //
  //  เดือนที่ยังไม่ได้กรอกยอดจริง จะต่อลูกโซ่จากเดือนล่าสุดที่กรอกไว้ แล้วบวก-ลบตามแผน
  function chain() {
    const D = Store.get();
    const out = new Map();
    const nid = nowId();
    let em  = Number(D.emergencyStart) || 0;
    let net = (Number(D.startBalance) || 0) + em;

    for (const m of D.months) {
      let inc = 0, exp = 0, emAdd = 0;
      for (const it of m.incomes)  inc += Number(it.amount) || 0;
      for (const it of m.oneTimes) inc += Number(it.amount) || 0;
      for (const it of m.expenses) {
        const a = Number(it.amount) || 0;
        exp += a;
        // เดือนที่ผ่านมาแล้วนับเฉพาะที่ติ๊กว่าโอนจริง · เดือนอนาคตนับตามแผน
        if (Store.laneOf(it, 'out').emergency && (it.paid || m.id > nid)) emAdd += a;
      }
      em += emAdd;
      const delta = inc - exp + emAdd;
      const has = m.balance !== null && m.balance !== undefined && m.balance !== '';
      const n = has ? (Number(m.balance) || 0) + em : net + delta;
      out.set(m.id, { net: n, prev: net, delta, actual: has, em, inc, exp });
      net = n;
    }
    return out;
  }

  // ══ คิวจ่าย — แดง / ส้ม / เหลือง ════════════════════════════
  //
  //  จัดกลุ่มรายจ่ายที่ยังไม่ติ๊กตาม "วันครบกำหนด" แล้วไล่สีตามลำดับความใกล้
  //  กลุ่มที่ใกล้ที่สุด = แดง (ต้องหาเงินก้อนนี้ก่อน) · ถัดไปส้ม · ถัดไปเหลือง
  //  พอติ๊กว่าจ่ายแล้ว รายการหลุดออกจากคิว สีจึงเลื่อนไปกลุ่มถัดไปเอง
  // คิวถูกอ่านซ้ำหลายที่ต่อการวาดหนึ่งครั้ง (การ์ดคิว · ทุกเดือน · จุดสีหน้ารายเดือน)
  // จึงคิดครั้งเดียวต่อการวาด แล้วล้างทิ้งตอน App.render() รอบถัดไป
  let _q = null;
  const bust = () => { _q = null; };

  function queue() {
    if (_q) return _q;
    const nid = nowId(), td = todayD();
    const groups = new Map();
    const scan = [nid, shiftMonth(nid, 1), shiftMonth(nid, 2)];

    for (const mid of scan) {
      for (const e of entries(mid)) {
        if (e.kind === 'in' || e.it.paid) continue;
        const d = Number(e.it.dueDay) || 0;
        if (!d) continue;
        const key = isoOf(mid, d);
        if (!groups.has(key))
          groups.set(key, { mid, day: d, key, overdue: mid === nid && d < td, items: [], total: 0 });
        const g = groups.get(key);
        g.items.push(e);
        g.total += Number(e.it.amount) || 0;
      }
    }
    const keys = [...groups.keys()].sort();
    const over = keys.filter(k => groups.get(k).overdue).map(k => groups.get(k));
    const soon = keys.filter(k => !groups.get(k).overdue).map(k => groups.get(k));

    const rank = new Map();
    over.forEach(g => { g.level = 'over'; g.items.forEach(e => rank.set(e.it.id, 'over')); });
    ['red', 'orange', 'yellow'].forEach((lv, i) => {
      if (!soon[i]) return;
      soon[i].level = lv;
      soon[i].items.forEach(e => rank.set(e.it.id, lv));
    });
    return (_q = { list: [...over, ...soon], rank });
  }

  /** ใช้จากหน้าอื่นด้วย (จุดสีหน้ารายเดือน) — คิดใหม่ทุกครั้งเพราะสถานะเปลี่ยนได้ตลอด */
  const urgencyOf = id => queue().rank.get(id) || '';

  // ══════════════════════════════════════════════════════════════
  //  หน้าจอ
  // ══════════════════════════════════════════════════════════════
  function screen(host) {
    const st = S();
    st.tlStart ??= nowId();
    st.tlRange ??= [1, 31];
    st.tlHide  ??= [];
    st.tlBands ??= [];

    const mids = Array.from({ length: MONTHS }, (_, i) => shiftMonth(st.tlStart, i));
    // มีเดือนครบก่อนค่อยคำนวณลูกโซ่ — บันทึกเฉพาะตอนที่สร้างเดือนใหม่จริงๆ
    // (เดิมบันทึกทุกครั้งที่วาดหน้า ซึ่งพอมีการซิงก์แล้วกลายเป็น "แก้ไข" ปลอมๆ
    //  ดึงข้อมูลลงมาแล้ววาดหน้า → นับเป็นการแก้ → ส่งกลับขึ้นไป วนไม่จบ)
    const made = mids.some(id => !Store.month(id));
    mids.forEach(Store.ensureMonth);
    if (made) Store.save();                   // เดือนที่เพิ่งสร้างต้องอยู่รอดข้ามการรีเฟรช

    host.appendChild(queueCard());
    host.appendChild(toolbar(mids));
    board(host, mids);
  }

  // ── การ์ดคิวจ่าย: ต้องจ่ายอะไรก่อน เงินพอไหม ──────────────────
  function queueCard() {
    const D = Store.get();
    const q = queue();
    const c = el(`<div class="card">
      <div class="card-head">
        <div class="card-title">ต้องจ่ายก่อน — เรียงตามวันครบกำหนด</div>
        <span class="chip" id="cash"></span>
      </div>
      <div id="qs"></div></div>`);

    const cash = c.querySelector('#cash');
    const hasCash = D.cashNow !== null && D.cashNow !== undefined;
    cash.innerHTML = hasCash ? `เงินในบัญชี ${money(D.cashNow)} ฿ · แตะแก้` : 'แตะเพื่อใส่เงินในบัญชี';
    cash.style.cursor = 'pointer';
    cash.onclick = cashSheet;

    const box = c.querySelector('#qs');
    if (!q.list.length) {
      box.appendChild(el('<div class="empty">ไม่มีรายการค้างจ่าย</div>'));
      return c;
    }

    let left = hasCash ? Number(D.cashNow) || 0 : null;
    q.list.slice(0, 4).forEach(g => {
      if (left !== null) left -= g.total;
      const names = g.items.map(e => esc(e.it.name)).join(' · ');
      const short = g.level === 'over' ? 'เลยกำหนด' : `${g.day} ${U.TH_MONTH[Number(g.mid.split('-')[1]) - 1]}`;
      const tail = left === null ? ''
        : left >= 0 ? `<span class="q-left pos">เหลือ ${money(left)}</span>`
                    : `<span class="q-left neg">ขาด ${money(-left)}</span>`;
      const r = el(`<div class="q-row tap">
        <i class="q-dot ${g.level}"></i>
        <div class="q-when">${short}</div>
        <div class="q-name">${names}</div>
        <div class="q-amt num">${money(g.total)}</div>
        ${tail}</div>`);
      r.onclick = () => {
        if (g.items.length === 1) itemSheet(g.items[0]);
        else pickSheet(g.items, `${short} — ${g.items.length} รายการ`);
      };
      box.appendChild(r);
    });

    if (left !== null && left < 0)
      box.appendChild(el(`<div class="q-note neg">ต้องหาเพิ่มอีก ${money(-left)} ฿ หรือดึงเงินฉุกเฉินมาใช้</div>`));
    return c;
  }

  function cashSheet() {
    const D = Store.get();
    Sheet.open('เงินในบัญชีตอนนี้', body => {
      body.innerHTML = `
        <label class="fld"><span>ยอดคงเหลือในบัญชี ณ ตอนนี้ — พิมพ์สูตรได้</span>
          <input type="text" id="v" inputmode="decimal" value="${D.cashNow ?? ''}"></label>
        <div class="hint" style="margin-bottom:14px">
          ใช้คิดว่าจ่ายคิวถัดไปแล้วจะเหลือหรือขาดเท่าไหร่ ไม่กระทบตัวเลขสุทธิรายเดือน
        </div>
        <div class="btn-row">
          <button class="btn ghost" id="clr">ล้างค่า</button>
          <button class="btn" id="ok">บันทึก</button>
        </div>`;
      body.querySelector('#ok').onclick = () => {
        const v = U.calc(body.querySelector('#v').value);
        D.cashNow = v === null ? null : v;
        Store.commit(); Sheet.close(); App.render();
      };
      body.querySelector('#clr').onclick = () => {
        D.cashNow = null; Store.commit(); Sheet.close(); App.render();
      };
    });
  }

  // ── แถบเครื่องมือ ────────────────────────────────────────────
  function toolbar(mids) {
    const st = S();
    const [a, b] = st.tlRange;
    const preset = (lo, hi, name) =>
      `<button class="tl-chipbtn ${a === lo && b === hi ? 'on' : ''}" data-lo="${lo}" data-hi="${hi}">${name}</button>`;

    const c = el(`<div class="card tl-bar">
      <div class="tl-bar-row">
        <button class="icon-btn" id="pm" title="ถอยหนึ่งเดือน">‹</button>
        <div class="tl-span">${monthShort(mids[0])}<span class="btn-t"> – ${monthShort(mids[mids.length - 1])}</span></div>
        <button class="icon-btn" id="nm" title="ถัดไปหนึ่งเดือน">›</button>
        <button class="tl-btn" id="now">วันนี้</button>
        <span style="flex:1"></span>
        <button class="tl-btn hi" id="gen" title="จำลองรายการซ้ำ">⚡<span class="btn-t"> จำลอง</span></button>
        <button class="tl-btn ${st.tlEdit ? 'on' : ''}" id="lock" title="ล็อก / ปลดล็อกการแก้บนเส้น"
          >${st.tlEdit ? '🔓' : '🔒'}<span class="btn-t"> ${st.tlEdit ? 'แก้อยู่' : 'ล็อก'}</span></button>
        <button class="tl-btn wide-only ${st.tlDense === 'compact' ? 'on' : ''}" id="dense">${st.tlDense === 'compact' ? '⇕ กระชับ' : '⇕ แยกแถว'}</button>
        <button class="tl-btn wide-only" id="lanes">แถว</button>
        <button class="tl-btn wide-only" id="bands">ช่วงจ่าย</button>
        <button class="tl-btn phone-only" id="view" title="มุมมอง">⚙<span class="btn-t"> มุมมอง</span></button>
      </div>
      <div class="tl-bar-row tl-days">
        <span class="tl-rlab" id="rlab">วันที่ ${a} – ${b}</span>
        <div class="tl-range" id="rg">
          <div class="tl-range-fill"></div>
          <button class="tl-range-h" data-h="0"></button>
          <button class="tl-range-h" data-h="1"></button>
        </div>
        <div class="tl-presets">
          ${preset(1, 31, 'ทั้งเดือน')}${preset(1, 15, 'ต้นเดือน')}${preset(16, 31, 'ปลายเดือน')}
        </div>
      </div>
    </div>`);

    c.querySelector('#pm').onclick  = () => { st.tlStart = shiftMonth(st.tlStart, -1); App.render(); };
    c.querySelector('#nm').onclick  = () => { st.tlStart = shiftMonth(st.tlStart, 1); App.render(); };
    c.querySelector('#now').onclick = () => { st.tlStart = nowId(); App.render(); };
    c.querySelector('#gen').onclick   = genSheet;
    c.querySelector('#dense').onclick = () => {
      st.tlDense = st.tlDense === 'compact' ? 'full' : 'compact';
      App.render();
    };
    c.querySelector('#lanes').onclick = laneSheet;
    c.querySelector('#bands').onclick = () => bandSheet(mids);
    c.querySelector('#lock').onclick  = () => { st.tlEdit = !st.tlEdit; App.render(); };
    c.querySelector('#view').onclick  = () => viewSheet(mids);
    for (const p of c.querySelectorAll('.tl-chipbtn'))
      p.onclick = () => { st.tlRange = [+p.dataset.lo, +p.dataset.hi]; App.render(); };

    rangeBar(c.querySelector('#rg'), c.querySelector('#rlab'));
    return c;
  }

  /** ปุ่มมุมมองที่ยุบมาจากแถบเครื่องมือบนมือถือ — แถบเครื่องมือต้องสูงคงที่ ไม่ตัดบรรทัดเด้งไปมา */
  function viewSheet(mids) {
    const st = S();
    Sheet.open('มุมมองเส้นเวลา', body => {
      const dense = st.tlDense === 'compact';
      body.innerHTML = `
        <div class="row tap" id="d"><span class="row-name">ความหนาแน่นของแถว
          <div class="row-sub">${dense ? 'กระชับ — ยุบเหลือบน 1 ล่าง 1 เห็นหลายเดือนพร้อมกัน'
                                       : 'แยกแถว — แต่ละหมวดมีแถวของตัวเอง อ่านง่ายกว่า'}</div></span>
          <span class="chip ${dense ? 'warn' : ''}">${dense ? 'กระชับ' : 'แยกแถว'}</span></div>
        <div class="row tap" id="l"><span class="row-name">แถวบนแกน Y
          <div class="row-sub">เพิ่ม / ซ่อน / เปลี่ยนสี เช่น เพิ่มค่าผ่อนรถ</div></span>
          <span style="color:var(--text-3)">›</span></div>
        <div class="row tap" id="b"><span class="row-name">ช่วงเวลาที่จ่ายได้
          <div class="row-sub">ไฮไลต์คร่อมเส้นว่าจ่ายได้ถึงวันไหนไม่เสียเครดิต</div></span>
          <span style="color:var(--text-3)">›</span></div>`;
      body.querySelector('#d').onclick = () => {
        st.tlDense = dense ? 'full' : 'compact'; Sheet.close(); App.render();
      };
      body.querySelector('#l').onclick = laneSheet;
      body.querySelector('#b').onclick = () => bandSheet(mids);
    });
  }

  /** แถบเลือกช่วงวัน — ลากสองหัวจับ ใช้ซูมเข้าไปดูครึ่งเดือนได้ */
  function rangeBar(bar, label) {
    const st = S();
    const hs = [...bar.querySelectorAll('.tl-range-h')];
    const fill = bar.querySelector('.tl-range-fill');
    const draw = () => {
      const [a, b] = st.tlRange;
      const p = d => ((d - 1) / 30) * 100;
      hs[0].style.left = p(a) + '%';
      hs[1].style.left = p(b) + '%';
      fill.style.left = p(a) + '%';
      fill.style.width = (p(b) - p(a)) + '%';
      label.textContent = `วันที่ ${a} – ${b}`;
    };
    draw();

    hs.forEach((h, i) => {
      h.addEventListener('pointerdown', ev => {
        ev.preventDefault();
        h.setPointerCapture(ev.pointerId);
        const rect = bar.getBoundingClientRect();
        const move = e => {
          const t = clamp((e.clientX - rect.left) / rect.width, 0, 1);
          let d = Math.round(t * 30) + 1;
          // กันหัวจับไขว้กัน และบังคับให้ช่วงกว้างอย่างน้อย 5 วัน ไม่งั้นซูมจนไร้ประโยชน์
          if (i === 0) d = clamp(d, 1, st.tlRange[1] - 4);
          else         d = clamp(d, st.tlRange[0] + 4, 31);
          if (d === st.tlRange[i]) return;
          st.tlRange[i] = d;
          draw();
        };
        const up = () => {
          h.removeEventListener('pointermove', move);
          h.removeEventListener('pointerup', up);
          App.render();                     // วาดใหม่ตอนปล่อยนิ้วเท่านั้น ลากจึงลื่น
        };
        h.addEventListener('pointermove', move);
        h.addEventListener('pointerup', up);
      });
    });
  }

  // ── กระดานเส้นเวลา ───────────────────────────────────────────
  function board(host, mids) {
    const st = S();

    // ⚠️ ต้องวางการ์ดลงหน้าก่อนแล้วค่อยวัดความกว้างจริง
    // เคยพลาดมาแล้วด้วยการใช้ host.clientWidth ซึ่ง "รวม padding ของ .main เข้ามาด้วย"
    // เลยคิดว่ามีที่มากกว่าจริง 52px แล้ววาดเส้นล้นจนต้องเลื่อนทั้งที่ควรพอดีจอ
    const outer = el(`<div class="card tl-card"></div>`);
    host.appendChild(outer);
    const wrap = outer.clientWidth || document.documentElement.clientWidth;
    const phone = wrap < 700;

    const labelW = phone ? 86 : wrap < 960 ? 106 : 126;
    const [d1, d2] = st.tlRange;
    const span = d2 - d1 + 1;
    // ป้ายสรุปท้ายเส้นกินที่ ~92px — ใส่เฉพาะจอที่กว้างพอ ไม่งั้นไปเบียดให้เส้นแคบจนต้องเลื่อน
    // (หัวเดือนโชว์ตัวเลขสุทธิอยู่แล้ว จอแคบจึงไม่เสียอะไร)
    const END = wrap >= 860 ? 92 : 0;
    // มือถือยอมให้เลื่อนแนวนอน (26px/วัน อ่านออก) · แท็บเล็ต/เดสก์ท็อปบีบให้เห็นครบเดือนในตาเดียว
    const avail = wrap - labelW - END - 2;
    const dayW = clamp(avail / span, phone ? 26 : 12, 64);
    const LH = phone ? 22 : 26;

    const ch = chain();
    const q = queue();
    const nid = nowId();

    // แต่ละเดือนมีแถบเลื่อนแนวนอนของตัวเอง
    // เคยทำเป็นแถบเดียวคุมทั้ง 12 เดือน (เพื่อให้วันที่ตรงกันทุกแถว) แต่ใช้จริงแล้วงง
    // เลื่อนดูปลายเดือน ส.ค. ทีเดียว เดือนอื่นเลื่อนตามหมด ทั้งที่ไม่ได้ตั้งใจแตะมัน
    if (typeof st.tlScrollX !== 'object' || !st.tlScrollX) st.tlScrollX = {};
    for (const mid of mids)
      outer.appendChild(monthLine({ mid, labelW, dayW, d1, d2, LH, ch, q, nid, phone, END }));

    // วัดหลังทุกเดือนถูกวางลงหน้าแล้ว — ตอนอยู่ใน monthLine() ยังไม่ได้ต่อกับ DOM จึงวัดไม่ได้
    for (const node of outer.querySelectorAll('.tl-month')) {
      const sc = node.querySelector('.tl-mscroll');
      sc.scrollLeft = st.tlScrollX[node.dataset.mid] || 0;   // คืนตำแหน่งเดิมหลังวาดใหม่
      node.classList.toggle('can-scroll', sc.scrollWidth > sc.clientWidth + 2);
      node.classList.toggle('at-end', sc.scrollLeft + sc.clientWidth >= sc.scrollWidth - 2);
    }
  }

  /** หนึ่งเดือน = หนึ่งเส้น */
  function monthLine(g) {
    const { mid, labelW, dayW, d1, d2, LH, ch, q, nid, END, phone } = g;
    const D = Store.get();
    const dim = dimOf(mid);
    const ents = entries(mid);
    const hide = new Set(S().tlHide);

    // วันของรายการ: รายรับที่ยังไม่ระบุวันถือเป็นวันที่ 1 (เงินเดือนวันเข้าไม่แน่นอน)
    // รายจ่ายที่ยังไม่ระบุวันวางบนเส้นไม่ได้ — เก็บไปโชว์เป็นชิป "ยังไม่ระบุวัน" ที่หัวเดือน
    const dayOf = e => Number(e.it.dueDay) || (e.kind === 'in' ? 1 : 0);
    const onLine = ents.filter(e => { const d = dayOf(e); return d >= d1 && d <= d2; });
    const noDay = ents.filter(e => !dayOf(e));

    // วาดเฉพาะแถวที่มีของจริงในช่วงที่กำลังดู — เส้นจึงเตี้ยที่สุดเท่าที่จะเป็นไปได้
    const used = new Set(onLine.map(e => e.lane.id));
    const pick = side => D.lanes.filter(l => l.side === side && !hide.has(l.id) && used.has(l.id));

    // โหมดกระชับ: ยุบทุกแถวเหลือบน 1 ล่าง 1 เพื่อให้เดือนเตี้ยที่สุด
    // (ยังคงสีของแต่ละหมวดไว้ที่ตัวลูกศร จึงยังแยกออกว่าเป็นค่าอะไร)
    // ใช้ตอนอยากกวาดตาดูหลายเดือนรวดเดียว แลกกับป้ายตัวเลขที่ต้องซ้อนกันมากขึ้น
    const dense = S().tlDense === 'compact';
    const MERGE_UP   = { id: '__up',   name: 'เข้า / เก็บ', color: '#34d399', side: 'up' };
    const MERGE_DOWN = { id: '__down', name: 'จ่ายออก',    color: '#fb7185', side: 'down' };
    const upReal = pick('up'), downReal = pick('down');
    const up   = dense ? (upReal.length   ? [MERGE_UP]   : []) : upReal;
    const down = dense ? (downReal.length ? [MERGE_DOWN] : []) : downReal;
    const rowOf = l => dense ? (l.side === 'up' ? '__up' : '__down') : l.id;

    const upH = up.length * LH;
    const axisY = upH + AX / 2;
    const totalH = Math.max(upH + AX + down.length * LH, AX + 22);
    const x = d => (clamp(d, d1, d2) - d1 + 0.5) * dayW;

    const r = ch.get(mid) || { net: 0, prev: 0, actual: false, delta: 0 };
    const isNow = mid === nid;
    const diff = r.net - r.prev;

    const node = el(`<div class="tl-month ${isNow ? 'now' : ''}">
      <div class="tl-mhead">
        <span class="tl-mname">${phone ? monthShort(mid) : monthFull(mid)}</span>
        ${isNow ? '<span class="chip" style="padding:2px 7px">เดือนนี้</span>' : ''}
        <button class="tl-sum ${r.net < 0 ? 'neg' : 'pos'}" id="sum">
          <b class="num">${signed(r.net)}</b>
          <span class="num ${diff < 0 ? 'neg' : 'pos'}">${signed(diff)}</span>
          ${r.actual ? '' : '<span class="tl-est">คาด</span>'}
        </button>
        ${noDay.length ? `<button class="tl-nod" id="nod" title="ยังไม่ระบุวัน"
          >⚠<span class="btn-t"> ยังไม่ระบุวัน</span> ${noDay.length}</button>` : ''}
        <button class="tl-add" id="add">+<span class="btn-t"> เพิ่ม</span></button>
      </div>
      <div class="tl-mscroll">
        <div class="tl-row">
          <div class="tl-labels"></div>
          <div class="tl-plot"></div>
        </div>
      </div>
    </div>`);

    node.querySelector('#sum').onclick = () => balanceSheet(mid);
    node.querySelector('#add').onclick = () => addSheet(mid, null, null);
    node.querySelector('#nod')?.addEventListener('click',
      () => pickSheet(noDay, `${monthShort(mid)} · ยังไม่ระบุวัน — แตะเพื่อใส่วัน`));

    // ── แกน Y: ชื่อแถว (ตรึงไว้ซ้ายมือ เลื่อนดูสิ้นเดือนแล้วยังรู้ว่าแถวไหน) ──
    const labs = node.querySelector('.tl-labels');
    labs.style.width = labelW + 'px';
    labs.style.height = totalH + 'px';
    const lab = (l, h) => el(`<div class="tl-lab" style="height:${h}px;--c:${l ? l.color : 'transparent'}">
        ${l ? `<i></i><span>${esc(l.name)}</span>` : ''}</div>`);
    up.forEach(l => labs.appendChild(lab(l, LH)));
    labs.appendChild(el(`<div class="tl-lab axis" style="height:${AX}px">วันที่</div>`));
    down.forEach(l => labs.appendChild(lab(l, LH)));

    const plot = node.querySelector('.tl-plot');
    plot.style.height = totalH + 'px';
    plot.style.width = ((d2 - d1 + 1) * dayW + END) + 'px';

    // ── ฉากหลัง: เสาร์-อาทิตย์จางๆ ให้กะสัปดาห์ได้โดยไม่ต้องนับ ──
    for (let d = d1; d <= Math.min(d2, dim); d++) {
      const w = dowOf(mid, d);
      if (w !== 0 && w !== 6) continue;
      plot.appendChild(el(`<div class="tl-we" style="left:${(d - d1) * dayW}px;width:${dayW}px"></div>`));
    }

    // ── ช่วงที่จ่ายได้โดยไม่เสียเครดิต (ไฮไลต์คร่อมเส้น) ──
    const bands = new Set(S().tlBands);
    for (const e of ents) {
      if (!bands.has(e.it.id)) continue;
      const s = Number(e.it.dueDay) || 0;
      if (!s) continue;
      const t = s + (Number(e.it.grace) || 0);
      if (t < d1 || s > d2) continue;
      const x1 = x(Math.max(s, d1));
      const x2 = x(Math.min(t, d2));
      plot.appendChild(el(`<div class="tl-band" style="left:${x1 - dayW / 2}px;width:${Math.max(dayW, x2 - x1 + dayW)}px;--c:${e.lane.color}">
        <i></i><span>${esc(e.it.name)} · ถึงวันที่ ${t > dim ? (t - dim) + ' เดือนหน้า' : t}</span></div>`));
    }

    // ── เส้นเวลา + เลขวันที่ ──
    plot.appendChild(el(`<div class="tl-axis" style="top:${axisY}px"></div>`));
    const step = dayW >= 18 ? 1 : dayW >= 11 ? 2 : 5;
    for (let d = d1; d <= Math.min(d2, dim); d++) {
      const on = d % step === 0 || d === 1 || d === dim;
      if (!on) continue;
      plot.appendChild(el(`<div class="tl-tick" style="left:${x(d)}px;top:${axisY}px">${d}</div>`));
    }
    if (isNow && todayD() >= d1 && todayD() <= d2)
      plot.appendChild(el(`<div class="tl-today" style="left:${x(todayD())}px"></div>`));

    // ── ลูกศรของแต่ละรายการ ──
    const laneY = {};
    up.forEach((l, i) => laneY[l.id] = { y: i * LH + LH / 2, side: 'up' });
    down.forEach((l, i) => laneY[l.id] = { y: upH + AX + i * LH + LH / 2, side: 'down' });
    // แถวบนเรียงจากไกลเส้นที่สุดลงมา — รายรับจึงอยู่บนสุดตามที่ตั้งใจ

    // รวมรายการที่แถวเดียวกันและวันเดียวกันเป็นหัวเดียว ไม่งั้นลูกศรทับกันจนอ่านไม่ออก
    const groups = new Map();
    for (const e of onLine) {
      const d = dayOf(e);
      const row = rowOf(e.lane);
      if (!laneY[row]) continue;                       // แถวถูกปิดตาไว้
      const key = row + '|' + d;
      if (!groups.has(key)) groups.set(key, { row, lane: e.lane, day: d, items: [] });
      const gp = groups.get(key);
      gp.items.push(e);
      // หัวลูกศรที่รวมหลายหมวดไว้ ใช้สีกลางของแถว จะได้ไม่หลอกตาว่าเป็นหมวดเดียว
      if (gp.lane.id !== e.lane.id) gp.lane = e.lane.side === 'up' ? MERGE_UP : MERGE_DOWN;
    }

    // ป้ายตัวเลขจะแสดงก็ต่อเมื่อไม่ชนกับป้ายก่อนหน้าในแถวเดียวกัน
    // (แคบมากก็เหลือแค่หัวลูกศร แล้วซูมด้วยแถบช่วงวันเอา)
    const lastRight = {};
    const list = [...groups.values()].sort((a, b) => a.day - b.day);

    for (const gp of list) {
      const pos = laneY[gp.row];
      const total = gp.items.reduce((t, e) => t + (Number(e.it.amount) || 0), 0);
      const allPaid = gp.items.every(e => e.it.paid);
      const lv = gp.items.map(e => q.rank.get(e.it.id)).find(Boolean) || '';
      const px = x(gp.day);
      const up_ = pos.side === 'up';
      const top = up_ ? pos.y - 7 : axisY;
      const h = up_ ? axisY - pos.y + 7 : pos.y - axisY + 7;

      const txt = money(total) + (gp.items.length > 1 ? ` ·${gp.items.length}` : '');
      const w = txt.length * 5.4 + 10;
      const show = px + 9 >= (lastRight[gp.row] || -99);
      if (show) lastRight[gp.row] = px + 9 + w;

      const mk = el(`<div class="tl-mk ${up_ ? 'up' : 'down'} ${allPaid ? 'done' : ''} ${lv}"
           style="left:${px}px;top:${top}px;height:${h}px;--c:${gp.lane.color}">
        <i class="tl-stem"></i><i class="tl-head"></i>
        ${lv && !allPaid ? '<i class="tl-urg"></i>' : ''}
        ${show ? `<span class="tl-val num">${allPaid ? '✓ ' : ''}${txt}</span>` : ''}
      </div>`);
      mk.title = gp.items.map(e => `${e.it.name} ${money(e.it.amount)}`).join('\n');

      bindMarker(mk, gp, { mid, dayW, d1, d2, dim, plot });
      plot.appendChild(mk);
    }

    if (!list.length)
      plot.appendChild(el(`<div class="tl-none" style="top:${axisY + 8}px">ยังไม่มีรายการในช่วงนี้ — กด “+ เพิ่ม” หรือปุ่ม ⚡ จำลอง</div>`));

    // ── ป้ายสรุปท้ายเส้น (เฉพาะจอที่กว้างพอ) ──
    if (END)
      plot.appendChild(el(`<div class="tl-endcap" style="left:${(d2 - d1 + 1) * dayW + 8}px;top:${axisY - 24}px">
        <span>สุทธิ</span><b class="num ${r.net < 0 ? 'neg' : 'pos'}">${signed(r.net)}</b>
        <span class="num ${diff < 0 ? 'neg' : 'pos'}">${signed(diff)}</span></div>`));

    // แตะที่ว่างบนเส้นตอนปลดล็อก = เพิ่มรายการตรงวันนั้น แถวนั้นเลย
    plot.addEventListener('click', ev => {
      if (!S().tlEdit || ev.target.closest('.tl-mk')) return;
      const rect = plot.getBoundingClientRect();
      const day = clamp(Math.floor((ev.clientX - rect.left) / dayW) + d1, 1, dim);
      const y = ev.clientY - rect.top;
      let laneId = null;
      for (const [id, p] of Object.entries(laneY)) if (Math.abs(p.y - y) <= LH / 2) laneId = id;
      addSheet(mid, day, laneId);
    });

    // ── แถบเลื่อนของเดือนนี้เอง (วัดขนาดจริงหลังถูกวางลงหน้าใน board()) ──
    const sc = node.querySelector('.tl-mscroll');
    sc.addEventListener('scroll', () => {
      S().tlScrollX[mid] = sc.scrollLeft;
      // เงาขอบขวาบอกว่ายังมีวันต่ออีก — เลื่อนสุดแล้วเงาหายไป จะได้รู้ว่าจบเดือนแล้วจริง
      node.classList.toggle('at-end', sc.scrollLeft + sc.clientWidth >= sc.scrollWidth - 2);
    }, { passive: true });
    node.dataset.mid = mid;

    return node;
  }

  /** แตะ = เปิดแผงแก้ · ลาก (เมื่อปลดล็อก) = ย้ายวัน */
  function bindMarker(mk, gp, geo) {
    const open = () => gp.items.length === 1
      ? itemSheet(gp.items[0])
      : pickSheet(gp.items, `วันที่ ${gp.day} — ${gp.items.length} รายการ`);

    mk.addEventListener('pointerdown', ev => {
      if (!S().tlEdit) return;
      ev.preventDefault(); ev.stopPropagation();
      mk.setPointerCapture(ev.pointerId);
      mk.classList.add('drag');
      const rect = geo.plot.getBoundingClientRect();
      let day = gp.day, moved = false;

      const move = e => {
        const d = clamp(Math.floor((e.clientX - rect.left) / geo.dayW) + geo.d1, 1, geo.dim);
        if (d === day) return;
        day = d; moved = true;
        mk.style.left = ((day - geo.d1 + 0.5) * geo.dayW) + 'px';
        mk.dataset.day = day;
      };
      const up = () => {
        mk.classList.remove('drag');
        mk.removeEventListener('pointermove', move);
        mk.removeEventListener('pointerup', up);
        if (!moved) { open(); return; }
        gp.items.forEach(e => { e.it.dueDay = day; e.it.locked = true; });
        Store.commit(); App.render();
        App.toast(`ย้ายไปวันที่ ${day} แล้ว`);
      };
      mk.addEventListener('pointermove', move);
      mk.addEventListener('pointerup', up);
    });

    mk.addEventListener('click', ev => {
      if (S().tlEdit) return;               // โหมดปลดล็อกจัดการใน pointerup แล้ว
      ev.stopPropagation(); open();
    });
  }

  // ── เลือกรายการเมื่อวันเดียวกันมีหลายอัน ──
  function pickSheet(items, title) {
    Sheet.open(title, body => {
      items.forEach(e => {
        const r = el(`<div class="row tap ${e.it.paid ? 'paid' : ''}">
          <i class="q-dot" style="background:${e.lane.color}"></i>
          <span class="row-name">${esc(e.it.name)}<div class="row-sub">${esc(e.lane.name)}</div></span>
          <span class="row-amt num ${e.kind === 'in' ? 'pos' : ''}">${e.kind === 'in' ? '+' : '−'}${money(e.it.amount)}</span>
        </div>`);
        r.onclick = () => itemSheet(e);
        body.appendChild(r);
      });
    });
  }

  // ══ แผงแก้รายการ ═══════════════════════════════════════════
  function itemSheet(e) {
    const { it, kind, list, mid } = e;
    const D = Store.get();
    const dim = dimOf(mid);
    const isIn = kind === 'in';
    const day = clamp(Number(it.dueDay) || 1, 1, dim);
    const defDate = it.paidOn || isoOf(mid, day);

    Sheet.open(`${monthShort(mid)} · ${it.name}`, body => {
      body.innerHTML = `
        <label class="fld"><span>ชื่อรายการ</span>
          <input type="text" id="nm" value="${esc(it.name)}"></label>

        <label class="fld"><span>จำนวนเงินตามแผน — พิมพ์สูตรได้ เช่น <b>2808+500</b></span>
          <input type="text" id="am" inputmode="decimal" value="${it.amount}"></label>

        <label class="fld"><span>แถว (แกน Y)</span>
          <select id="ln">${D.lanes.map(l =>
            `<option value="${l.id}">${l.side === 'up' ? '▲ บนเส้น' : '▼ ใต้เส้น'} · ${esc(l.name)}</option>`).join('')}
          </select></label>

        <div class="fld"><span>${isIn ? 'วันที่คาดว่าเงินเข้า' : 'วันครบกำหนดจ่าย'} — ลากเลือกได้</span>
          <div id="ds"></div></div>

        <label class="fld"><span>จ่ายช้าได้อีกกี่วันโดยไม่เสียเครดิต (0 = ต้องตรงวัน)</span>
          <input type="number" id="gr" min="0" max="31" value="${Number(it.grace) || 0}"></label>

        <label class="fld"><span>โน้ต</span>
          <textarea id="nt" placeholder="เช่น เดือนนี้โปะเพิ่ม 2,000">${esc(it.note || '')}</textarea></label>

        <div class="fld" style="border-top:1px solid var(--line);padding-top:14px">
          <span>สถานะ — ตอนนี้ ${it.paid ? (isIn ? 'เข้าแล้ว' : 'จ่ายแล้ว') : (isIn ? 'ยังไม่เข้า' : 'ยังไม่จ่าย')}</span>
          <div class="grid g2" style="gap:9px">
            <input type="text" id="real" inputmode="decimal" placeholder="${isIn ? 'เข้าจริง' : 'จ่ายจริง'} ${money(it.amount)}" value="${it.paid ? it.amount : ''}">
            <input type="date" id="dt" value="${defDate}">
          </div>
        </div>
        <div class="btn-row">
          ${it.paid
            ? `<button class="btn ghost" id="un">กลับเป็นยังไม่${isIn ? 'เข้า' : 'จ่าย'}</button>`
            : `<button class="btn" id="pay">✓ ${isIn ? 'เข้าแล้ว' : 'จ่ายแล้ว'}</button>`}
          <button class="btn ghost" id="save">บันทึกการแก้ไข</button>
        </div>

        <label class="tl-chk" style="margin-top:14px">
          <input type="checkbox" id="bd" ${S().tlBands.includes(it.id) ? 'checked' : ''}>
          <span>แสดงช่วงจ่ายของรายการนี้เป็นไฮไลต์บนเส้น</span></label>
        <label class="tl-chk">
          <input type="checkbox" id="lk" ${it.locked ? 'checked' : ''}>
          <span>ล็อกตัวเลขนี้ — ปุ่ม ⚡ จำลอง จะไม่ทับ</span></label>

        <button class="btn danger wide" id="del" style="margin-top:14px">ลบรายการนี้</button>
        <div class="hint" style="margin-top:10px">แก้ตรงนี้มีผลกับเดือนนี้เดือนเดียว</div>`;

      body.querySelector('#ln').value = Store.laneOf(it, kind).id;
      const pickDay = daystrip(body.querySelector('#ds'), mid, day);

      /** อ่านค่าจากฟอร์มลงรายการ — ใช้ร่วมกันทั้งตอนบันทึกและตอนกดสถานะ */
      const apply = () => {
        const nm = body.querySelector('#nm').value.trim();
        if (nm) it.name = nm;
        it.locked = body.querySelector('#lk').checked;
        const v = U.calc(body.querySelector('#am').value);
        // แก้ตัวเลขเอง = ล็อกให้อัตโนมัติ ไม่งั้นกดจำลองรอบหน้าตัวเลขที่แก้จะหายไป
        if (v !== null && v !== it.amount) { it.amount = v; it.locked = true; }
        it.dueDay = pickDay();
        it.grace = clamp(Number(body.querySelector('#gr').value) || 0, 0, 31);
        it.note = body.querySelector('#nt').value.trim();

        // ย้ายแถวข้ามฝั่งบน↔ล่าง = เปลี่ยนความหมายของเงิน ต้องย้ายตะกร้าจริงด้วย
        // ไม่งั้นเอนจินยังคิดเป็นรายจ่ายอยู่ทั้งที่บนเส้นมันขึ้นไปอยู่ฝั่งรายรับแล้ว
        const lid = body.querySelector('#ln').value;
        const lane = Store.lane(lid);
        it.lane = lid;
        const wantIn = lid === 'salary' || lid === 'bonus';
        if (!wantIn) it.type = lane?.side === 'up' ? 'saving' : (isIn ? 'variable' : it.type || 'variable');
        moveBasket(e, wantIn);

        const bands = new Set(S().tlBands);
        body.querySelector('#bd').checked ? bands.add(it.id) : bands.delete(it.id);
        S().tlBands = [...bands];
      };

      body.querySelector('#save').onclick = () => {
        apply(); Store.commit(); Sheet.close(); App.render(); App.toast('บันทึกแล้ว');
      };
      body.querySelector('#pay')?.addEventListener('click', () => {
        apply();
        const real = U.calc(body.querySelector('#real').value);
        if (real !== null) it.amount = real;
        it.paid = true;
        it.locked = true;                    // ตัวเลขจริงแล้ว ห้ามให้การจำลองมาทับ
        it.paidOn = body.querySelector('#dt').value || defDate;
        Store.commit(); Sheet.close(); App.render();
        App.toast(`${isIn ? 'รับแล้ว' : 'จ่ายแล้ว'} ${money(it.amount)} ฿`);
      });
      body.querySelector('#un')?.addEventListener('click', () => {
        apply(); it.paid = false; delete it.paidOn;
        Store.commit(); Sheet.close(); App.render();
      });
      body.querySelector('#del').onclick = () => {
        if (!confirm(`ลบ "${it.name}" ออกจากเดือนนี้?`)) return;
        const i = list.indexOf(it);
        if (i >= 0) list.splice(i, 1);
        Store.commit(); Sheet.close(); App.render(); App.toast('ลบแล้ว');
      };
    });
  }

  /** ย้ายรายการระหว่างตะกร้ารายรับ ↔ รายจ่าย ให้ตรงกับแถวที่เลือก */
  function moveBasket(e, wantIn) {
    const m = Store.month(e.mid);
    const isIn = e.kind === 'in';
    if (wantIn === isIn) return;
    const i = e.list.indexOf(e.it);
    if (i >= 0) e.list.splice(i, 1);
    if (wantIn) { delete e.it.type; m.incomes.push(e.it); }
    else { e.it.type ??= 'variable'; m.expenses.push(e.it); }
  }

  // ── แถบเลือกวันแบบลากนิ้ว ────────────────────────────────────
  const DOW_S = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  function daystrip(host, mid, day) {
    const dim = dimOf(mid);
    let cur = clamp(day, 1, dim);
    const n = el(`<div class="ds">
      <div class="ds-out"><div class="ds-track"><div class="ds-knob"></div></div></div>
      <div class="ds-lab"></div></div>`);
    host.appendChild(n);
    const track = n.querySelector('.ds-track');
    const knob = n.querySelector('.ds-knob');
    const lab = n.querySelector('.ds-lab');

    for (let d = 1; d <= dim; d++)
      track.appendChild(el(`<i class="ds-t ${d % 5 === 0 || d === 1 || d === dim ? 'big' : ''}"
        style="left:${((d - 0.5) / dim) * 100}%"></i>`));

    const draw = () => {
      knob.style.left = (((cur - 0.5) / dim) * 100) + '%';
      lab.innerHTML = `วันที่ <b>${cur}</b> <span>(${DOW_S[dowOf(mid, cur)]}.)</span>`;
    };
    draw();

    const set = clientX => {
      const r = track.getBoundingClientRect();
      cur = clamp(Math.round(((clientX - r.left) / r.width) * dim + 0.5), 1, dim);
      draw();
    };
    const start = ev => {
      ev.preventDefault();
      track.setPointerCapture(ev.pointerId);
      set(ev.clientX);
      const move = e => set(e.clientX);
      const up = () => { track.removeEventListener('pointermove', move); track.removeEventListener('pointerup', up); };
      track.addEventListener('pointermove', move);
      track.addEventListener('pointerup', up);
    };
    track.addEventListener('pointerdown', start);
    return () => cur;
  }

  // ══ เพิ่มรายการ ════════════════════════════════════════════
  function addSheet(mid, day, laneId) {
    const D = Store.get();
    const m = Store.ensureMonth(mid);
    Sheet.open(`เพิ่มรายการ · ${monthFull(mid)}`, body => {
      body.innerHTML = `
        <label class="fld"><span>ชื่อรายการ</span>
          <input type="text" id="nm" placeholder="เช่น ค่าซ่อมรถ / เงินเดือน"></label>
        <label class="fld"><span>จำนวนเงิน — พิมพ์สูตรได้</span>
          <input type="text" id="am" inputmode="decimal" placeholder="0"></label>
        <label class="fld"><span>แถว (แกน Y) — บนเส้นคือเงินที่ยังเป็นของเรา</span>
          <select id="ln">${D.lanes.map(l =>
            `<option value="${l.id}">${l.side === 'up' ? '▲ บนเส้น' : '▼ ใต้เส้น'} · ${esc(l.name)}</option>`).join('')}
          </select></label>
        <div class="fld"><span>วันที่ — ลากนิ้วเลือกบนเส้น</span><div id="ds"></div></div>
        <label class="fld"><span>จ่ายช้าได้อีกกี่วันโดยไม่เสียเครดิต</span>
          <input type="number" id="gr" min="0" max="31" value="0"></label>
        <div class="btn-row"><button class="btn wide" id="ok">เพิ่มลงเส้นเวลา</button></div>
        <div class="hint" style="margin-top:10px">
          เงินเดือนวันเข้าไม่แน่นอน — ใส่วันที่ 1 ไว้ก่อนได้ แล้วค่อยมาแตะแก้เป็นวันจริงพร้อมยอดจริงทีหลัง
        </div>`;

      if (laneId) body.querySelector('#ln').value = laneId;
      const pickDay = daystrip(body.querySelector('#ds'), mid, day || 1);

      body.querySelector('#ok').onclick = () => {
        const name = body.querySelector('#nm').value.trim() || 'รายการใหม่';
        const amount = U.calc(body.querySelector('#am').value) || 0;
        const lid = body.querySelector('#ln').value;
        const lane = Store.lane(lid);
        const grace = clamp(Number(body.querySelector('#gr').value) || 0, 0, 31);
        const base = { id: U.uid('t'), name, amount, lane: lid, dueDay: pickDay(),
                       grace, note: '', paid: false, locked: true };
        // แถวเงินเดือน/เงินพิเศษเท่านั้นที่เป็น "เงินเข้า" — แถวบนอื่นๆ คือเงินที่จ่ายออกไปเก็บ/โปะ
        if (lid === 'salary' || lid === 'bonus') m.incomes.push(base);
        else m.expenses.push({ ...base, type: lane?.side === 'up' ? 'saving' : 'variable' });
        Store.commit(); Sheet.close(); App.render(); App.toast('เพิ่มแล้ว');
      };
    });
  }

  // ══ ยอดเงินจริงสิ้นเดือน ════════════════════════════════════
  function balanceSheet(mid) {
    const m = Store.ensureMonth(mid);
    const ch = chain();
    const r = ch.get(mid);
    Sheet.open(`สรุปเงิน · ${monthFull(mid)}`, body => {
      body.innerHTML = `
        <div class="kv"><span class="kv-k">เข้าตามแผน</span><span class="kv-v num pos">+${money(r.inc)}</span></div>
        <div class="kv"><span class="kv-k">ออกตามแผน</span><span class="kv-v num neg">−${money(r.exp)}</span></div>
        <div class="kv"><span class="kv-k">เงินเก็บฉุกเฉินสะสม</span><span class="kv-v num">${money(r.em)}</span></div>
        <div class="kv" style="border-top:1px solid var(--line);margin-top:6px;padding-top:10px">
          <span class="kv-k">เงินสุทธิสิ้นเดือน</span>
          <span class="kv-v num ${r.net < 0 ? 'neg' : 'pos'}" style="font-size:19px">${signed(r.net)}</span></div>

        <label class="fld" style="margin-top:16px"><span>ยอดเงินจริงที่เหลือในบัญชีสิ้นเดือน</span>
          <input type="text" id="bal" inputmode="decimal" placeholder="ยังไม่ได้กรอก — ใช้ตัวเลขคาดการณ์อยู่"
                 value="${m.balance ?? ''}"></label>
        <div class="hint" style="margin-bottom:14px">
          กรอกแล้วโปรแกรมจะยึดตัวเลขนี้เป็นความจริง แล้วบวกเงินเก็บฉุกเฉินสะสมกลับเข้าไปเป็นเงินสุทธิ<br>
          เงินออม/ค่าผ่อน ถึงอยู่เหนือเส้นก็ไม่ถูกนับเป็นเงินเหลือ เพราะดึงออกมาใช้ไม่ได้
        </div>
        <div class="btn-row">
          <button class="btn ghost" id="clr">ล้างค่า</button>
          <button class="btn" id="ok">บันทึก</button>
        </div>`;
      body.querySelector('#ok').onclick = () => {
        const v = U.calc(body.querySelector('#bal').value);
        m.balance = v === null ? null : v;
        m.status = v === null ? m.status : 'actual';
        Store.commit(); Sheet.close(); App.render();
      };
      body.querySelector('#clr').onclick = () => {
        m.balance = null; Store.commit(); Sheet.close(); App.render();
      };
    });
  }

  // ══ ⚡ จำลอง — ยิงรายการซ้ำไปจนสิ้นปี ═══════════════════════
  //
  //  กติกาที่ห้ามพลาด: ไม่แตะของที่ผู้ใช้กรอกเลขจริงไปแล้ว
  //  (ติ๊กว่าจ่ายแล้ว / ล็อกไว้ / วันที่เลยไปแล้วในเดือนนี้)
  //  ไม่งั้นกดจำลองทีเดียว ตัวเลขที่อุตส่าห์บันทึกไว้หายหมด
  function genSheet() {
    const D = Store.get();
    const nid = nowId();
    Sheet.open('⚡ จำลองรายการซ้ำ', body => {
      const opts = () => Array.from({ length: 18 }, (_, i) => shiftMonth(nid, i))
        .map(id => `<option value="${id}">${monthFull(id)}</option>`).join('');
      body.innerHTML = `
        <div class="grid g2">
          <label class="fld"><span>เริ่มเดือน</span><select id="s1">${opts()}</select></label>
          <label class="fld"><span>ถึงเดือน</span><select id="s2">${opts()}</select></label>
        </div>
        <div class="fld"><span>เลือกรายการที่จะยิงซ้ำ</span><div id="ls" class="tl-picklist"></div></div>
        <button class="addrow" id="newr">+ เพิ่มรายการประจำใหม่</button>
        <div class="btn-row" style="margin-top:12px"><button class="btn wide" id="go">สร้างลงเส้นเวลา</button></div>
        <div class="hint" style="margin-top:10px">
          จำลองตั้งแต่วันนี้เป็นต้นไปเท่านั้น · รายการที่ติ๊กว่าจ่ายแล้ว หรือที่คุณกรอกตัวเลขเองไว้ จะไม่ถูกแตะ
        </div>`;

      // ปลายทางตั้งต้น = ธันวาคมของปีที่เริ่ม (ตรงกับที่ใช้จริง: จำลองยาวถึงสิ้นปี)
      const endOfYear = id => `${id.split('-')[0]}-12`;
      const s1 = body.querySelector('#s1'), s2 = body.querySelector('#s2');
      s1.value = nid;
      s2.value = [...s2.options].some(o => o.value === endOfYear(nid)) ? endOfYear(nid) : shiftMonth(nid, 11);
      s1.onchange = () => { if (s2.value < s1.value) s2.value = s1.value; };

      const box = body.querySelector('#ls');
      const draw = () => {
        box.innerHTML = '';
        if (!D.recurring.length) box.appendChild(el('<div class="empty" style="padding:16px 0">ยังไม่มีรายการประจำ</div>'));
        D.recurring.forEach(r => {
          const lane = Store.lane(r.lane) || {};
          const row = el(`<label class="tl-chk pick">
            <input type="checkbox" data-r="${r.id}" ${r.active ? 'checked' : ''}>
            <i class="q-dot" style="background:${lane.color || '#94a3b8'}"></i>
            <span class="pk-n">${esc(r.name)}<em>${esc(lane.name || '')} · วันที่ ${r.dueDay || '—'}</em></span>
            <b class="num">${money(r.amount)}</b>
            <button class="mini" data-ed="${r.id}">✎</button></label>`);
          row.querySelector('[data-ed]').onclick = ev => { ev.preventDefault(); recurringSheet(r); };
          box.appendChild(row);
        });
      };
      draw();

      body.querySelector('#newr').onclick = () => recurringSheet(null);

      body.querySelector('#go').onclick = () => {
        const picked = new Set([...box.querySelectorAll('input:checked')].map(i => i.dataset.r));
        const from = s1.value, to = s2.value;
        if (to < from) return App.toast('เดือนปลายทางต้องไม่น้อยกว่าเดือนเริ่ม');

        let added = 0, updated = 0, skipped = 0;
        const td = todayD();
        for (let id = from; id <= to; id = shiftMonth(id, 1)) {
          if (id < nid) { skipped++; continue; }             // อดีตไม่ยุ่ง
          const m = Store.ensureMonth(id);
          for (const r of D.recurring) {
            if (!picked.has(r.id)) continue;
            const dd = Number(r.dueDay) || 1;
            if (id === nid && dd < td) { skipped++; continue; }  // เลยวันไปแล้วในเดือนนี้
            const list = r.kind === 'in' ? m.incomes : m.expenses;
            const found = list.find(x => (x.rid && x.rid === r.id) || x.name === r.name);
            if (!found) { list.push(Store.fromRecurring(r)); added++; continue; }
            if (found.paid || found.locked) { skipped++; continue; }
            found.amount = Number(r.amount) || 0;
            found.dueDay = dd;
            found.lane = r.lane;
            found.grace = Number(r.grace) || 0;
            updated++;
          }
        }
        Store.commit(); Sheet.close(); App.render();
        App.toast(`สร้าง ${added} · อัปเดต ${updated} · ข้าม ${skipped} รายการ`);
      };
    });
  }

  /** แก้/เพิ่ม "ภาระประจำ" — ต้นแบบที่ปุ่มจำลองเอาไปยิงซ้ำทุกเดือน */
  function recurringSheet(r) {
    const D = Store.get();
    const isNew = !r;
    const t = r || { id: U.uid('r'), name: '', amount: 0, kind: 'out', lane: 'living',
                     type: 'fixed', dueDay: 1, grace: 0, active: true };
    Sheet.open(isNew ? 'เพิ่มรายการประจำ' : 'แก้ ' + t.name, body => {
      body.innerHTML = `
        <label class="fld"><span>ชื่อ</span><input type="text" id="nm" value="${esc(t.name)}"></label>
        <label class="fld"><span>จำนวนเงินตั้งต้น</span>
          <input type="text" id="am" inputmode="decimal" value="${t.amount}"></label>
        <label class="fld"><span>แถว</span>
          <select id="ln">${D.lanes.map(l =>
            `<option value="${l.id}">${l.side === 'up' ? '▲' : '▼'} ${esc(l.name)}</option>`).join('')}</select></label>
        <div class="grid g2">
          <label class="fld"><span>วันครบกำหนด</span>
            <input type="number" id="dd" min="1" max="31" value="${t.dueDay || 1}"></label>
          <label class="fld"><span>จ่ายช้าได้ (วัน)</span>
            <input type="number" id="gr" min="0" max="31" value="${t.grace || 0}"></label>
        </div>
        <div class="btn-row">
          ${isNew ? '' : '<button class="btn danger" id="del">ลบ</button>'}
          <button class="btn" id="ok">บันทึก</button>
        </div>`;
      body.querySelector('#ln').value = t.lane;
      body.querySelector('#ok').onclick = () => {
        t.name = body.querySelector('#nm').value.trim() || 'รายการประจำ';
        t.amount = U.calc(body.querySelector('#am').value) || 0;
        t.lane = body.querySelector('#ln').value;
        t.dueDay = clamp(Number(body.querySelector('#dd').value) || 1, 1, 31);
        t.grace = clamp(Number(body.querySelector('#gr').value) || 0, 0, 31);
        const lane = Store.lane(t.lane);
        t.kind = (t.lane === 'salary' || t.lane === 'bonus') ? 'in' : 'out';
        if (t.kind === 'out') t.type = lane?.side === 'up' ? 'saving' : (t.type || 'fixed');
        if (isNew) D.recurring.push(t);
        Store.commit(); Sheet.close(); genSheet();
      };
      body.querySelector('#del')?.addEventListener('click', () => {
        if (!confirm(`ลบภาระประจำ "${t.name}"?\nรายการที่สร้างไปแล้วในแต่ละเดือนยังอยู่`)) return;
        D.recurring = D.recurring.filter(x => x !== t);
        Store.commit(); Sheet.close(); genSheet();
      });
    });
  }

  // ══ จัดการแถว (แกน Y) ══════════════════════════════════════
  function laneSheet() {
    const D = Store.get();
    const hide = new Set(S().tlHide);
    Sheet.open('แถวบนแกน Y', body => {
      const draw = () => {
        body.innerHTML = `<div class="hint" style="margin-bottom:12px">
            ▲ บนเส้น = เงินที่ยังเป็นของเรา · ▼ ใต้เส้น = จ่ายแล้วหมดไป<br>
            ปิดตาแถวไหน แถวนั้นจะไม่ถูกวาด ช่วยให้เส้นเตี้ยลงและอ่านง่ายขึ้น
          </div><div id="ls"></div>
          <button class="addrow" id="add">+ เพิ่มแถวใหม่ (เช่น ค่าผ่อนรถ)</button>`;
        const box = body.querySelector('#ls');
        ['up', 'down'].forEach(side => {
          box.appendChild(el(`<div class="card-title" style="margin:12px 0 6px">${side === 'up' ? '▲ เหนือเส้น' : '▼ ใต้เส้น'}</div>`));
          D.lanes.filter(l => l.side === side).forEach((l, i, arr) => {
            const row = el(`<div class="row">
              <button class="mini" data-eye style="opacity:1">${hide.has(l.id) ? '🚫' : '👁'}</button>
              <i class="q-dot" style="background:${l.color}"></i>
              <span class="row-name">${esc(l.name)}${l.emergency ? ' <span class="chip" style="padding:1px 6px">นับเป็นเงินสุทธิ</span>' : ''}</span>
              <button class="mini" data-up style="opacity:1">↑</button>
              <button class="mini" data-ed style="opacity:1">✎</button>
            </div>`);
            row.querySelector('[data-eye]').onclick = () => {
              hide.has(l.id) ? hide.delete(l.id) : hide.add(l.id);
              S().tlHide = [...hide]; draw(); App.render();
            };
            row.querySelector('[data-up]').onclick = () => {
              const gi = D.lanes.indexOf(l);
              const prev = D.lanes.filter(x => x.side === side)[i - 1];
              if (!prev) return;
              const pi = D.lanes.indexOf(prev);
              D.lanes.splice(gi, 1); D.lanes.splice(pi, 0, l);
              Store.commit(); draw(); App.render();
            };
            row.querySelector('[data-ed]').onclick = () => laneEdit(l);
            box.appendChild(row);
          });
        });
        body.querySelector('#add').onclick = () => laneEdit(null);
      };
      draw();
    });
  }

  function laneEdit(l) {
    const D = Store.get();
    const isNew = !l;
    const t = l || { id: U.uid('l'), name: '', side: 'down', color: '#60a5fa' };
    const COLORS = ['#34d399','#22d3ee','#38bdf8','#818cf8','#a78bfa','#f472b6',
                    '#fb7185','#fb923c','#fbbf24','#e879f9','#94a3b8','#60a5fa'];
    Sheet.open(isNew ? 'เพิ่มแถว' : 'แก้แถว ' + t.name, body => {
      body.innerHTML = `
        <label class="fld"><span>ชื่อแถว</span><input type="text" id="nm" value="${esc(t.name)}" placeholder="เช่น ค่าผ่อนรถ"></label>
        <label class="fld"><span>อยู่ฝั่งไหนของเส้น</span>
          <select id="sd">
            <option value="up">▲ เหนือเส้น — เงินที่ยังเป็นของเรา</option>
            <option value="down">▼ ใต้เส้น — จ่ายแล้วหมดไป</option>
          </select></label>
        <div class="fld"><span>สี</span><div class="tl-colors" id="cs">
          ${COLORS.map(c => `<button data-c="${c}" style="background:${c}" class="${c === t.color ? 'on' : ''}"></button>`).join('')}
        </div></div>
        <label class="tl-chk"><input type="checkbox" id="em" ${t.emergency ? 'checked' : ''}>
          <span>เป็นเงินเก็บฉุกเฉิน — นับกลับเข้าเงินสุทธิ</span></label>
        <div class="btn-row" style="margin-top:14px">
          ${isNew ? '' : '<button class="btn danger" id="del">ลบแถว</button>'}
          <button class="btn" id="ok">บันทึก</button>
        </div>`;
      body.querySelector('#sd').value = t.side;
      let color = t.color;
      body.querySelectorAll('#cs button').forEach(b => b.onclick = () => {
        color = b.dataset.c;
        body.querySelectorAll('#cs button').forEach(x => x.classList.toggle('on', x === b));
      });
      body.querySelector('#ok').onclick = () => {
        t.name = body.querySelector('#nm').value.trim() || 'แถวใหม่';
        t.side = body.querySelector('#sd').value;
        t.color = color;
        t.emergency = body.querySelector('#em').checked;
        if (isNew) D.lanes.push(t);
        Store.commit(); Sheet.close(); laneSheet(); App.render();
      };
      body.querySelector('#del')?.addEventListener('click', () => {
        // รายการที่ผูกอยู่จะถูกเดาแถวใหม่ตอน normalize ไม่หายไปไหน
        if (!confirm(`ลบแถว "${t.name}"?\nรายการที่อยู่แถวนี้จะถูกย้ายไปแถวที่ใกล้เคียงให้เอง`)) return;
        D.lanes = D.lanes.filter(x => x !== t);
        Store.importJSON(Store.exportJSON());     // ให้ normalize เดาแถวใหม่ให้ทุกรายการ
        Sheet.close(); laneSheet(); App.render();
      });
    });
  }

  // ══ เลือกว่าจะโชว์ไฮไลต์ช่วงจ่ายของรายการไหน ═════════════════
  function bandSheet(mids) {
    const bands = new Set(S().tlBands);
    Sheet.open('ช่วงเวลาที่จ่ายได้', body => {
      const all = [];
      for (const mid of mids.slice(0, 3)) for (const e of entries(mid)) if (e.kind === 'out') all.push(e);
      body.innerHTML = `<div class="hint" style="margin-bottom:12px">
          แถบจางบนเส้นบอกว่ารายการนั้นจ่ายได้ตั้งแต่วันไหนถึงวันไหนโดยไม่เสียเครดิต<br>
          เปิดพร้อมกันหลายรายการแถบจะทับกัน — เลือกเฉพาะที่กำลังบริหารอยู่จะอ่านง่ายกว่า
        </div>
        <div class="btn-row" style="margin-bottom:12px">
          <button class="btn ghost" id="none">ปิดทั้งหมด</button>
          <button class="btn ghost" id="all">เปิดทั้งหมด (3 เดือนแรก)</button>
        </div><div id="ls"></div>`;
      const box = body.querySelector('#ls');
      let cur = '';
      all.forEach(e => {
        if (e.mid !== cur) { cur = e.mid; box.appendChild(el(`<div class="card-title" style="margin:12px 0 4px">${monthFull(e.mid)}</div>`)); }
        const to = (Number(e.it.dueDay) || 0) + (Number(e.it.grace) || 0);
        const row = el(`<label class="tl-chk pick">
          <input type="checkbox" ${bands.has(e.it.id) ? 'checked' : ''}>
          <i class="q-dot" style="background:${e.lane.color}"></i>
          <span class="pk-n">${esc(e.it.name)}<em>วันที่ ${e.it.dueDay || '—'}${e.it.grace ? ` → ${to}` : ''}</em></span>
          <b class="num">${money(e.it.amount)}</b></label>`);
        row.querySelector('input').onchange = ev => {
          ev.target.checked ? bands.add(e.it.id) : bands.delete(e.it.id);
          S().tlBands = [...bands]; App.render();
        };
        box.appendChild(row);
      });
      body.querySelector('#none').onclick = () => { S().tlBands = []; Sheet.close(); App.render(); };
      body.querySelector('#all').onclick = () => {
        S().tlBands = all.filter(e => e.it.dueDay).map(e => e.it.id);
        Sheet.close(); App.render();
      };
    });
  }

  return { screen, urgencyOf, queue, chain, itemSheet, bust };
})();

window.TL = TL;
