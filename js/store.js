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

    for (const m of d.months) {
      m.status ??= 'predicted';
      m.note ??= '';
      for (const k of ['incomes', 'expenses', 'oneTimes']) {
        m[k] ??= [];
        for (const it of m[k]) {
          it.id ??= U.uid(k[0]);
          it.note ??= '';
          it.amount = Number(it.amount) || 0;
        }
      }
      for (const e of m.expenses) e.type ??= 'variable';
    }
    d.months.sort((a, b) => a.id.localeCompare(b.id));
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

  /** เดือนถัดไป/ก่อนหน้าที่ยังไม่มี — สร้างให้อัตโนมัติ เพื่อให้ทำนายต่อได้ไม่รู้จบ */
  function ensureMonth(id) {
    let m = month(id);
    if (m) return m;
    m = emptyMonth(id);
    // เดือนใหม่ยืมโครงรายจ่ายประจำจากเดือนล่าสุดมาให้ ไม่ต้องพิมพ์ใหม่ทั้งหมด
    const last = D.months[D.months.length - 1];
    if (last) {
      m.incomes = last.incomes.map(x => ({ ...x, id: U.uid('i'), status: 'predicted' }));
      m.expenses = last.expenses
        .filter(x => x.type === 'fixed' || x.type === 'debt' || x.type === 'saving')
        .map(x => ({ ...x, id: U.uid('e'), status: 'predicted' }));
    }
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

  return { load, get, month, card, ensureMonth, commit, onChange, save,
           exportJSON, importJSON, reset, thisMonth, emptyMonth };
})();

window.Store = Store;
