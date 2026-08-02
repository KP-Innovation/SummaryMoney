// ══════════════════════════════════════════════════════════════
//  util.js — ตัวช่วยพื้นฐาน
// ══════════════════════════════════════════════════════════════

const U = (() => {
  const TH_MONTH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.',
                    'ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const TH_FULL  = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                    'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

  /** '2026-03' → 'มี.ค. 69' (พ.ศ. ย่อ) */
  const monthShort = id => {
    const [y, m] = id.split('-').map(Number);
    return `${TH_MONTH[m - 1]} ${String(y + 543).slice(2)}`;
  };
  const monthFull = id => {
    const [y, m] = id.split('-').map(Number);
    return `${TH_FULL[m - 1]} ${y + 543}`;
  };
  /** เลื่อนเดือน: ('2026-11', 1) → '2026-12' */
  const shiftMonth = (id, n) => {
    const [y, m] = id.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  /** 12345.67 → '12,346' (ปัดเป็นจำนวนเต็ม อ่านง่ายกว่าบนการ์ด) */
  const money = (n, dec = 0) => {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString('th-TH', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  };
  const signed = (n, dec = 0) => (n > 0 ? '+' : '') + money(n, dec);

  /**
   * รับค่าที่พิมพ์เข้ามาแบบเครื่องคิดเลขย่อๆ: "3000+500-120*2"
   * เจตนา: ผู้ใช้เคยชินกับการพิมพ์สูตรใน Excel — ไม่ต้องมาคิดเองก่อนกรอก
   * รับเฉพาะตัวเลขกับ + - * / ( ) เท่านั้น จึงไม่มีทางรันโค้ดอื่นได้
   */
  const calc = (raw) => {
    const s = String(raw).replace(/[,\s฿]/g, '');
    if (!s) return null;
    if (/^-?\d*\.?\d*$/.test(s)) return s === '' || s === '-' ? null : Number(s);
    if (!/^[-+*/().\d]+$/.test(s)) return null;
    try {
      const v = Function('"use strict";return (' + s + ')')();
      return typeof v === 'number' && isFinite(v) ? Math.round(v * 100) / 100 : null;
    } catch { return null; }
  };

  const uid = (p = 'x') => p + '_' + Math.random().toString(36).slice(2, 9);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sum = (arr, f = x => x.amount) => arr.reduce((t, x) => t + (Number(f(x)) || 0), 0);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const el = (html) => {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };

  return { TH_MONTH, monthShort, monthFull, shiftMonth, money, signed, calc, uid, esc, sum, clamp, el };
})();

window.U = U;
