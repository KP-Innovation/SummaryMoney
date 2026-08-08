// ══════════════════════════════════════════════════════════════
//  finflow-sync — ที่เก็บข้อมูลกลางของ FinFlow (Cloudflare Worker)
//
//  หน้าที่เดียว: เก็บก้อน JSON ของแอปไว้ "ที่เดียว" ให้ทุกเครื่องอ่าน-เขียนอันเดียวกัน
//
//  กติกาสำคัญ
//   • หนึ่ง "รหัสซิงก์" = หนึ่งห้อง (Durable Object) — รหัสไม่ถูกเก็บไว้ที่ไหน
//     เก็บแค่ SHA-256 ของมันเป็นชื่อห้อง ใครไม่รู้รหัสก็หาห้องไม่เจอ
//   • เขียนทับต้องบอก baseRev ที่ตัวเองถืออยู่ ถ้าไม่ตรงกับของจริง = มีเครื่องอื่น
//     แก้ไปก่อนแล้ว → ตอบ 409 พร้อมข้อมูลจริง ให้แอปถามผู้ใช้ว่าจะเอาฝั่งไหน
//     (ห้ามทับเงียบๆ — ข้อมูลการเงินหายแล้วหาคืนไม่ได้)
//   • ทุกครั้งที่เขียน เก็บฉบับเก่าไว้ใน hist 30 ฉบับล่าสุด เผื่อกดพลาด
// ══════════════════════════════════════════════════════════════

const KEEP_HISTORY = 30;
const MAX_BODY = 6 * 1024 * 1024;      // 6 MB — ข้อมูลจริงตอนนี้ ~30 KB

// เว็บที่เรียกได้ — ที่อื่นเรียกไม่ได้เลย (กันเว็บอื่นแอบดูดข้อมูลผ่านเบราว์เซอร์ผู้ใช้)
const ALLOW_ORIGIN = [
  /^https:\/\/kp-innovation\.github\.io$/,
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
];

const cors = (origin) => {
  const ok = origin && ALLOW_ORIGIN.some(re => re.test(origin));
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'https://kp-innovation.github.io',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Sync-Code',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
};

const json = (obj, status, origin) => new Response(JSON.stringify(obj), {
  status: status || 200,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors(origin) },
});

/** ชื่อห้อง = SHA-256 ของรหัส (เติมเกลือกันเดารหัสจากตารางแฮชสำเร็จรูป) */
async function roomName(code) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('finflow-sync:' + code));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin');
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

    // เช็กว่าเซิร์ฟเวอร์ยังอยู่ — ไม่ต้องใช้รหัส
    if (url.pathname === '/v1/ping') return json({ ok: true, at: new Date().toISOString() }, 200, origin);

    if (!url.pathname.startsWith('/v1/doc') && !url.pathname.startsWith('/v1/history'))
      return json({ error: 'ไม่มีเส้นทางนี้' }, 404, origin);

    // รหัสส่งมาทางหัวข้อความ ไม่ใช่ทาง URL — URL มีโอกาสไปโผล่ใน log ของตัวกลาง
    const code = req.headers.get('X-Sync-Code') || '';
    if (!/^[A-Za-z0-9-]{12,120}$/.test(code))
      return json({ error: 'รหัสซิงก์ไม่ถูกต้อง (ต้องยาว 12 ตัวขึ้นไป)' }, 400, origin);

    if (req.method === 'PUT' && Number(req.headers.get('Content-Length') || 0) > MAX_BODY)
      return json({ error: 'ข้อมูลใหญ่เกินไป' }, 413, origin);

    const id = env.ROOM.idFromName(await roomName(code));
    const res = await env.ROOM.get(id).fetch(new Request(url, req));

    // ต่อหัว CORS ให้คำตอบที่ออกมาจากห้อง
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(cors(origin))) out.headers.set(k, v);
    return out;
  },
};

export class Room {
  constructor(ctx) {
    this.ctx = ctx;
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS doc(
      id INTEGER PRIMARY KEY CHECK(id = 1),
      rev INTEGER NOT NULL, updated TEXT NOT NULL, device TEXT, body TEXT NOT NULL)`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS hist(
      rev INTEGER PRIMARY KEY, updated TEXT NOT NULL, device TEXT, body TEXT NOT NULL)`);
  }

  /** ฉบับปัจจุบัน — rev 0 คือห้องยังว่าง */
  current() {
    const r = this.sql.exec('SELECT rev, updated, device, body FROM doc WHERE id = 1').toArray()[0];
    return r
      ? { rev: r.rev, updatedAt: r.updated, device: r.device, data: JSON.parse(r.body) }
      : { rev: 0, updatedAt: null, device: null, data: null };
  }

  async fetch(req) {
    const url = new URL(req.url);
    const head = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
    const reply = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: head });

    // ── รายการฉบับย้อนหลัง (ไม่ส่งเนื้อข้อมูล เอาแค่รายการ) ──
    if (url.pathname === '/v1/history') {
      const rows = this.sql.exec(
        'SELECT rev, updated, device, length(body) AS size FROM hist ORDER BY rev DESC').toArray();
      return reply({ current: this.current().rev, items: rows });
    }
    // ── ขอฉบับย้อนหลังหนึ่งฉบับ: /v1/history/12 ──
    const m = url.pathname.match(/^\/v1\/history\/(\d+)$/);
    if (m) {
      const r = this.sql.exec('SELECT rev, updated, device, body FROM hist WHERE rev = ?', Number(m[1])).toArray()[0];
      if (!r) return reply({ error: 'ไม่พบฉบับนี้' }, 404);
      return reply({ rev: r.rev, updatedAt: r.updated, device: r.device, data: JSON.parse(r.body) });
    }

    if (req.method === 'GET') return reply(this.current());

    if (req.method === 'PUT') {
      let b;
      try { b = await req.json(); } catch { return reply({ error: 'อ่านข้อมูลที่ส่งมาไม่ได้' }, 400); }
      if (b == null || typeof b.data !== 'object' || b.data === null)
        return reply({ error: 'ไม่มีข้อมูลที่จะบันทึก' }, 400);

      const cur = this.current();
      const force = url.searchParams.get('force') === '1';

      // มีคนอื่นเขียนแซงไปแล้ว — คืนของจริงให้ไปเทียบ อย่าเพิ่งทับ
      if (!force && cur.rev !== Number(b.baseRev || 0))
        return reply({ conflict: true, ...cur }, 409);

      const rev = cur.rev + 1;
      const updated = new Date().toISOString();
      const body = JSON.stringify(b.data);
      const device = String(b.device || '').slice(0, 40);

      if (cur.rev > 0) {
        this.sql.exec('INSERT OR REPLACE INTO hist(rev, updated, device, body) VALUES(?, ?, ?, ?)',
          cur.rev, cur.updatedAt, cur.device, JSON.stringify(cur.data));
        this.sql.exec('DELETE FROM hist WHERE rev <= ?', cur.rev - KEEP_HISTORY);
      }
      this.sql.exec(
        `INSERT INTO doc(id, rev, updated, device, body) VALUES(1, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET rev = excluded.rev, updated = excluded.updated,
                                       device = excluded.device, body = excluded.body`,
        rev, updated, device, body);

      return reply({ rev, updatedAt: updated });
    }

    return reply({ error: 'ใช้ได้แค่ GET กับ PUT' }, 405);
  }
}
