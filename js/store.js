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

  const emptyMonth = id => ({
    id, status: 'predicted', incomes: [], expenses: [], oneTimes: [], note: '',
  });

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
    // เดือนที่ปักหมุดไว้ดูบนสุดของปฏิทินรายปี เก็บเป็นรหัสเดือน 'YYYY-MM'
    // กรองด้วย regex เพราะเวอร์ชันก่อนเคยเก็บเป็น "ชื่อภาระ" — ของเก่าต้องถูกทิ้ง
    d.pinned = (d.pinned || []).filter(x => /^\d{4}-\d{2}$/.test(x));

    for (const m of d.months) {
      m.status ??= 'predicted';
      m.note ??= '';
      for (const k of ['incomes', 'expenses', 'oneTimes']) {
        m[k] ??= [];
        for (const it of m[k]) {
          it.id ??= U.uid(k[0]);
          it.note ??= '';
          it.amount = Number(it.amount) || 0;
          it.paid ??= false;          // สถานะเช็กลิสต์: จ่ายแล้ว / ยังไม่จ่าย
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
                     dueDay: e.dueDay, card: e.card, active: true }));
    }
    for (const r of d.recurring) { r.id ??= U.uid('r'); r.active ??= true; }
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
    id: U.uid('e'), rid: r.id, name: r.name, amount: Number(r.amount) || 0,
    type: r.type, dueDay: r.dueDay, card: r.card, note: '', paid: false,
  });

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
           exportJSON, importJSON, reset, thisMonth, emptyMonth };
})();

window.Store = Store;
