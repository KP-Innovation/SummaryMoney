// ══════════════════════════════════════════════════════════════
//  store.js — ที่เก็บข้อมูลทั้งหมด
//
//  หลักคิด: ทุกอย่างเป็น "ก้อนข้อมูลที่มี id ของตัวเอง" ไม่ใช่พิกัดเซลล์
//  ลบรายการทิ้งหนึ่งอันจึงไม่มีทางทำให้ยอดอื่นพังเป็น #REF! เหมือนใน Excel
//  ยอดรวมทุกตัวคำนวณสดจาก array เสมอ ไม่มีการเก็บผลลัพธ์ค้างไว้
// ══════════════════════════════════════════════════════════════

const Store = (() => {
  const KEY = 'finflow.v1';
  let D = null;                       // ข้อมูลทั้งหมด
  const subs = [];                    // ผู้ฟังการเปลี่ยนแปลง
  const saveSubs = [];                // ผู้ฟังการบันทึก (ตัวซิงก์ขึ้นคลาวด์)
  let quiet = false;                  // true = บันทึกลงเครื่องเฉยๆ ไม่ต้องส่งขึ้นคลาวด์

  const emptyMonth = id => ({
    id, status: 'predicted', incomes: [], expenses: [], oneTimes: [], note: '',
    balance: null,                    // ยอดเงินจริงในบัญชีสิ้นเดือน (ผู้ใช้กรอกเอง)
  });

  // ══ แถวของไทม์ไลน์ (แกน Y) ══════════════════════════════════
  //
  //  side:'up'  = เงินที่ยัง "เป็นของเรา" อยู่ — รายรับ เงินออม เงินก้อนที่โปะหนี้เป็นทรัพย์สิน
  //  side:'down'= เงินที่จ่ายแล้วหมดไป — ค่าน้ำค่าไฟค่ากิน
  //  emergency:true คือแถวเงินเก็บฉุกเฉิน — แถวเดียวที่ถูกนับกลับเข้ามาเป็น "เงินสุทธิ"
  //  ผู้ใช้เพิ่ม/ลบ/เปลี่ยนสี/สลับบน-ล่างได้เองทั้งหมด นี่แค่ชุดตั้งต้น
  const DEFAULT_LANES = [
    { id: 'salary',    name: 'เงินเดือน',        side: 'up',   color: '#34d399' },
    { id: 'bonus',     name: 'เงินพิเศษ',        side: 'up',   color: '#22d3ee' },
    { id: 'emergency', name: 'เงินเก็บฉุกเฉิน',  side: 'up',   color: '#818cf8', emergency: true },
    { id: 'saving',    name: 'จ่ายออมเงิน',      side: 'up',   color: '#38bdf8' },
    { id: 'install',   name: 'จ่ายค่าผ่อน',      side: 'up',   color: '#a78bfa' },
    { id: 'home',      name: 'ค่าที่อยู่',        side: 'down', color: '#fb7185' },
    { id: 'utility',   name: 'น้ำ-ไฟ-เน็ต',      side: 'down', color: '#fbbf24' },
    { id: 'card',      name: 'บัตร / หนี้',      side: 'down', color: '#f472b6' },
    { id: 'car',       name: 'ค่ารถ / เดินทาง',  side: 'down', color: '#fb923c' },
    { id: 'health',    name: 'ค่ารักษาพยาบาล',   side: 'down', color: '#e879f9' },
    { id: 'living',    name: 'ค่ากิน / ใช้จ่าย',  side: 'down', color: '#94a3b8' },
  ];

  /**
   * เดาว่ารายการหนึ่งควรอยู่แถวไหน — ใช้ครั้งเดียวตอนย้ายข้อมูลเก่าเข้าไทม์ไลน์
   * เดาผิดได้ ไม่เป็นไร เพราะเปิดแผงรายการแล้วเปลี่ยนแถวเองได้ทันที
   */
  function guessLane(it, kind) {
    const n = String(it.name || '');
    if (kind === 'in') return /พิเศษ|โบนัส|ก้อน|คืน|ขาย|ยืม/.test(n) ? 'bonus' : 'salary';
    if (it.type === 'saving') return /ฉุกเฉิน|สำรอง|emergency/i.test(n) ? 'emergency' : 'saving';
    if (/ผ่อน|กยศ|สินเชื่อ|Flash|โปะ/i.test(n))                        return 'install';
    if (/หอ|ห้อง|บ้าน|เช่า|คอนโด|ส่วนกลาง/.test(n))                    return 'home';
    if (/ไฟ|น้ำ(?!มัน)|เน็ต|3BB|internet|AIS|ทรู|โทรศัพท์|มือถือ/i.test(n)) return 'utility';
    if (/รถ|น้ำมัน|ทางด่วน|จอด|วินฯ|BTS|MRT|แท็กซี่/i.test(n))          return 'car';
    if (/หมอ|พยาบาล|ยา|คลินิก|ทันตกรรม|สุขภาพ|ประกันชีวิต/.test(n))      return 'health';
    if (it.type === 'debt' || it.card)                                  return 'card';
    return 'living';
  }

  /** เติม id ให้ทุกรายการ — seed จาก Excel ไม่มี id มาให้ */
  function normalize(d) {
    d.startBalance ??= 0;
    d.months ??= [];
    d.cards ??= [];
    d.buckets ??= [];
    d.people ??= [];
    d.splits ??= [];
    d.savingsGoal ??= 0;
    d.assumptions ??= { incomeAdj: 0, expenseAdj: 0, extraSaving: 0, closedCards: [] };
    d.recurring ??= [];
    d.lanes ??= DEFAULT_LANES.map(x => ({ ...x }));
    d.emergencyStart ??= 0;           // เงินเก็บฉุกเฉินที่มีอยู่ก่อนเดือนแรก
    d.cashNow ??= null;               // เงินในบัญชี ณ วันนี้ (ใช้คิดคิวจ่าย)
    // โน้ตด่วนบนสุดของแอป — ข้อความอิสระ ไม่ผูกกับเดือนหรือรายการไหน
    d.quickNote ??= { text: '', open: false, hidden: false, updated: '' };
    // เดือนที่ปักหมุดไว้ดูบนสุดของปฏิทินรายปี เก็บเป็นรหัสเดือน 'YYYY-MM'
    // กรองด้วย regex เพราะเวอร์ชันก่อนเคยเก็บเป็น "ชื่อภาระ" — ของเก่าต้องถูกทิ้ง
    d.pinned = (d.pinned || []).filter(x => /^\d{4}-\d{2}$/.test(x));

    const laneIds = new Set(d.lanes.map(l => l.id));
    /** แถวของรายการ — ถ้าแถวที่เดาได้ถูกลบไปแล้ว ต้องตกลงแถวแรกของฝั่งที่ถูกต้อง
        ห้ามปล่อยให้ชี้ไปแถวที่ไม่มีอยู่ ไม่งั้นรายการจะหายจากไทม์ไลน์เงียบๆ */
    const fitLane = (it, kind) => {
      const g = guessLane(it, kind);
      if (laneIds.has(g)) return g;
      const side = kind === 'in' ? 'up' : 'down';
      return (d.lanes.find(l => l.side === side) || d.lanes[0])?.id;
    };
    for (const m of d.months) {
      m.status ??= 'predicted';
      m.note ??= '';
      if (m.balance === undefined) m.balance = null;
      for (const k of ['incomes', 'expenses', 'oneTimes']) {
        m[k] ??= [];
        for (const it of m[k]) {
          it.id ??= U.uid(k[0]);
          it.note ??= '';
          it.amount = Number(it.amount) || 0;
          it.paid ??= false;          // สถานะเช็กลิสต์: จ่ายแล้ว / ยังไม่จ่าย
          it.grace ??= 0;             // จ่ายช้าได้อีกกี่วันโดยไม่เสียเครดิต
          // แถวบนไทม์ไลน์ — เดาให้ครั้งแรก แล้วผู้ใช้แก้เองได้
          // ถ้าแถวที่เคยผูกไว้ถูกลบทิ้ง ต้องเดาใหม่ ไม่งั้นรายการจะหายจากไทม์ไลน์
          if (!it.lane || !laneIds.has(it.lane))
            it.lane = fitLane(it, k === 'expenses' ? 'out' : 'in');
        }
      }
      for (const e of m.expenses) e.type ??= 'variable';
    }
    d.months.sort((a, b) => a.id.localeCompare(b.id));

    // ── ภาระประจำ ──
    // ถ้ายังไม่เคยตั้ง ให้เดาจากเดือนล่าสุด: รายจ่ายประจำ/หนี้/เงินออม คือของที่มาทุกเดือนอยู่แล้ว
    // ผู้ใช้แก้/เพิ่ม/ลบได้อิสระทีหลัง — นี่แค่ตั้งต้นให้ไม่ต้องพิมพ์ใหม่ทั้งชุด
    if (!d.recurring.length && d.months.length) {
      const last = d.months[d.months.length - 1];
      d.recurring = last.expenses
        .filter(e => ['fixed', 'debt', 'saving'].includes(e.type) && !/^—/.test(e.name))
        .map(e => ({ id: U.uid('r'), name: e.name, amount: e.amount, type: e.type,
                     dueDay: e.dueDay, card: e.card, lane: e.lane, grace: 0,
                     kind: 'out', active: true }));
    }
    for (const r of d.recurring) {
      r.id ??= U.uid('r');
      r.active ??= true;
      r.kind ??= 'out';
      r.grace ??= 0;
      if (!r.lane || !laneIds.has(r.lane)) r.lane = fitLane(r, r.kind);
    }
    for (const c of d.cards) { c.id ??= U.uid('c'); c.used = Number(c.used) || 0; }
    for (const b of d.buckets) { b.id ??= U.uid('b'); b.balance = Number(b.balance) || 0; }
    for (const s of d.splits) { s.id ??= U.uid('s'); s.total = Number(s.total) || 0; s.settled ??= false; }
    return d;
  }

  async function load() {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      try { D = normalize(JSON.parse(raw)); return D; }
      catch (e) { console.warn('อ่านข้อมูลที่บันทึกไว้ไม่ได้ ใช้ข้อมูลตั้งต้นแทน', e); }
    }
    // ครั้งแรก: ดึงข้อมูลจริงที่แปลงมาจาก Excel
    try {
      D = normalize(await fetch('data/seed.json').then(r => r.json()));
    } catch (e) {
      D = normalize({ startBalance: 0, months: [emptyMonth(thisMonth())] });
    }
    save();
    return D;
  }

  const thisMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(D)); }
    catch (e) { console.warn('บันทึกไม่สำเร็จ', e); }
    if (!quiet) for (const f of saveSubs) f(D);
  }
  const onSave = f => saveSubs.push(f);

  /**
   * เอาข้อมูลจากคลาวด์มาทับของในเครื่อง
   * ต้องปิดเสียง (quiet) ระหว่างบันทึก ไม่งั้นตัวซิงก์จะเห็นว่า "มีการแก้ไข"
   * แล้วส่งของที่เพิ่งดึงลงมากลับขึ้นไปใหม่วนไม่จบ
   */
  function applyRemote(raw) {
    D = normalize(raw);
    quiet = true; save(); quiet = false;
    subs.forEach(f => f(D));
  }

  /** แก้ข้อมูลแล้วแจ้งให้หน้าจอวาดใหม่ */
  function commit(fn) {
    if (fn) fn(D);
    save();
    subs.forEach(f => f(D));
  }
  const onChange = f => subs.push(f);

  const get = () => D;
  const month = id => D.months.find(m => m.id === id);
  const card = id => D.cards.find(c => c.id === id);

  /** สร้างรายการจากภาระประจำหนึ่งอัน (ยังไม่จ่าย เพราะเดือนใหม่ยังไม่ได้จ่าย) */
  const fromRecurring = r => ({
    id: U.uid(r.kind === 'in' ? 'i' : 'e'), rid: r.id, name: r.name,
    amount: Number(r.amount) || 0, type: r.type, dueDay: r.dueDay, card: r.card,
    lane: r.lane, grace: Number(r.grace) || 0, note: '', paid: false,
  });

  // ── แถวไทม์ไลน์ ──
  const lane = id => D.lanes.find(l => l.id === id);
  /** แถวของรายการหนึ่ง — ถ้าแถวหายไปให้ตกไปแถวสุดท้ายฝั่งที่ถูกต้อง ไม่ใช่หายไปเฉยๆ */
  function laneOf(it, kind) {
    return lane(it.lane)
        || lane(guessLane(it, kind))
        || D.lanes.find(l => l.side === (kind === 'in' ? 'up' : 'down'))
        || D.lanes[0];
  }
  const lanesBySide = side => D.lanes.filter(l => l.side === side);

  /**
   * เติมภาระประจำที่ยังไม่มีลงในเดือนที่ระบุ
   * เทียบด้วย rid ก่อน แล้วค่อยเทียบชื่อ — รายการเก่าที่มาจาก Excel ยังไม่มี rid
   * จึงต้องดูชื่อด้วย ไม่งั้นจะได้ "ค่าห้อง" ซ้ำสองบรรทัด
   */
  function applyRecurring(id) {
    const m = month(id);
    if (!m) return 0;
    let added = 0;
    for (const r of D.recurring) {
      if (!r.active) continue;
      const has = m.expenses.some(e => (e.rid && e.rid === r.id) || e.name === r.name);
      if (has) continue;
      m.expenses.push(fromRecurring(r));
      added++;
    }
    return added;
  }

  /** เดือนถัดไป/ก่อนหน้าที่ยังไม่มี — สร้างให้อัตโนมัติ เพื่อให้ทำนายต่อได้ไม่รู้จบ */
  function ensureMonth(id) {
    let m = month(id);
    if (m) return m;
    m = emptyMonth(id);
    // เดือนใหม่ได้ภาระประจำครบชุดทันที + ยกโครงรายรับจากเดือนล่าสุดมาให้แก้ต่อ
    m.expenses = D.recurring.filter(r => r.active).map(fromRecurring);
    const last = D.months[D.months.length - 1];
    if (last) m.incomes = last.incomes.map(x => ({ ...x, id: U.uid('i'), paid: false }));
    D.months.push(m);
    D.months.sort((a, b) => a.id.localeCompare(b.id));
    return m;
  }

  const exportJSON = () => JSON.stringify(D, null, 2);
  function importJSON(text) {
    D = normalize(JSON.parse(text));
    commit();
  }
  function reset() { localStorage.removeItem(KEY); location.reload(); }

  return { load, get, month, card, ensureMonth, applyRecurring, commit, onChange, save,
           onSave, applyRemote,
           exportJSON, importJSON, reset, thisMonth, emptyMonth,
           lane, laneOf, lanesBySide, guessLane, fromRecurring, DEFAULT_LANES };
})();

window.Store = Store;
