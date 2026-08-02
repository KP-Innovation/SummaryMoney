// ══════════════════════════════════════════════════════════════
//  engine.js — เอนจินคำนวณ (หัวใจที่แทนสูตร Excel ที่พังเป็น #REF!)
//
//  กติกาเดียวที่ใช้ทั้งระบบ:
//      ยอดยกมา + รายรับ + เงินก้อนพิเศษ − รายจ่าย = เหลือสุทธิ
//      เหลือสุทธิของเดือนนี้ = ยอดยกมาของเดือนหน้า  (ต่อกันเป็นลูกโซ่)
//
//  ทุกครั้งที่แก้อะไรก็ตาม ลูกโซ่ทั้งเส้นถูกคำนวณใหม่หมด
//  จึงไม่มีทางเกิดสภาพ "ช่องหนึ่งพัง แล้วทั้งแถวขึ้น error ค้าง"
// ══════════════════════════════════════════════════════════════

const Engine = (() => {

  const TYPES = {
    fixed:    { label: 'รายจ่ายประจำ', color: '#94a3b8', hint: 'ตัดไม่ได้' },
    variable: { label: 'ผันแปร',       color: '#fbbf24', hint: 'ปรับลดได้' },
    debt:     { label: 'หนี้ / บัตร',   color: '#fb7185', hint: 'มีกำหนดชำระ' },
    saving:   { label: 'เงินออม',       color: '#38bdf8', hint: 'ออกไปเก็บ' },
  };

  /** ยอดรวมของเดือนเดียว แยกตามหมวด */
  function totals(m, adj = null) {
    const inc = U.sum(m.incomes) * (1 + (adj?.incomeAdj || 0) / 100);
    const one = U.sum(m.oneTimes);

    const by = { fixed: 0, variable: 0, debt: 0, saving: 0 };
    for (const e of m.expenses) {
      // โหมดจำลอง: ถ้าสั่ง "ปิดบัตรใบนี้" รายจ่ายที่ผูกกับบัตรนั้นหายไปจากสมการ
      if (adj?.closedCards?.includes(e.card)) continue;
      by[e.type] = (by[e.type] || 0) + (Number(e.amount) || 0);
    }
    // ปรับรายจ่ายผันแปรตามสมมติฐาน (หมวดอื่นเป็นภาระตายตัว ปรับไม่ได้จริง)
    if (adj?.expenseAdj) by.variable *= 1 + adj.expenseAdj / 100;
    if (adj?.extraSaving) by.saving += adj.extraSaving;

    const out = by.fixed + by.variable + by.debt + by.saving;
    return { income: inc, oneTime: one, expense: out, by, net: inc + one - out };
  }

  /**
   * คำนวณทั้งไทม์ไลน์ต่อกันเป็นลูกโซ่
   * @returns [{ id, opening, closing, ...totals, status }]
   */
  function run(data, adj = null) {
    let opening = Number(data.startBalance) || 0;
    return data.months.map(m => {
      const t = totals(m, adj);
      const closing = opening + t.net;
      const row = { id: m.id, opening, closing, status: m.status, note: m.note, ...t };
      opening = closing;
      return row;
    });
  }

  /** ยอดเงินเก็บสะสม = ยอดตั้งต้นทุกกระเป๋า + เงินที่ออมเข้าไปในแต่ละเดือน */
  function savingsTimeline(data, adj = null) {
    let bal = U.sum(data.buckets, b => b.balance);
    return run(data, adj).map(r => ({ id: r.id, balance: (bal += r.by.saving), status: r.status }));
  }

  /** ยอดค้างระหว่างคน: บวก = อีกฝ่ายติดเรา, ลบ = เราติดอีกฝ่าย */
  function splitBalance(data) {
    let net = 0;
    for (const s of data.splits) {
      if (s.settled) continue;
      const half = (Number(s.total) || 0) / 2;
      net += s.paidBy === 'me' ? half : -half;
    }
    return net;
  }

  /**
   * สิ่งที่ควรรู้ก่อนสายเกินไป — เรียงตามความเร่งด่วน
   * นี่คือส่วนที่ Excel ทำแทนไม่ได้: มันไม่เคยเตือนว่าเดือนไหนจะติดลบ
   */
  function alerts(data) {
    const out = [];
    const rows = run(data);
    const today = new Date();
    const nowId = Store.thisMonth();

    for (const r of rows) {
      if (r.closing < 0 && r.id >= nowId) {
        out.push({ level: 'neg', icon: '⚠', title: `${U.monthShort(r.id)} คาดว่าติดลบ ${U.money(Math.abs(r.closing))} ฿`,
                   detail: 'เตรียมเงินสำรอง หรือลดรายจ่ายผันแปรเดือนนั้น', go: ['month', r.id] });
      }
    }
    for (const c of data.cards) {
      const u = c.limit ? c.used / c.limit : 0;
      if (u >= 0.4) {
        out.push({ level: u >= 0.7 ? 'neg' : 'warn', icon: '▭',
                   title: `${c.name} ใช้ไป ${Math.round(u * 100)}% ของวงเงิน`,
                   detail: u >= 0.7 ? 'สูงมาก กระทบเครดิตบูโร' : 'เกิน 40% แล้ว ระวังผลต่อบูโร', go: ['cards'] });
      }
    }
    // ครบกำหนดชำระใน 7 วันข้างหน้า
    const day = today.getDate();
    for (const c of data.cards) {
      if (!c.dueDay) continue;
      const left = c.dueDay >= day ? c.dueDay - day : c.dueDay + 30 - day;
      if (left <= 7) {
        out.push({ level: left <= 2 ? 'neg' : 'warn', icon: '◷',
                   title: `อีก ${left} วัน ครบกำหนด ${c.name}`,
                   detail: `ทุกวันที่ ${c.dueDay} ของเดือน`, go: ['cards'] });
      }
    }
    const sp = splitBalance(data);
    if (Math.abs(sp) > 1) {
      const other = data.people.find(p => p.id !== 'me')?.name || 'อีกฝ่าย';
      out.push({ level: 'info', icon: '⇄',
                 title: sp < 0 ? `คุณติด${other} ${U.money(Math.abs(sp), 2)} ฿` : `${other}ติดคุณ ${U.money(sp, 2)} ฿`,
                 detail: 'จากรายการที่ยังไม่เคลียร์', go: ['split'] });
    }

    const order = { neg: 0, warn: 1, info: 2 };
    return out.sort((a, b) => order[a.level] - order[b.level]);
  }

  return { TYPES, totals, run, savingsTimeline, splitBalance, alerts };
})();

window.Engine = Engine;
