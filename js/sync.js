// ══════════════════════════════════════════════════════════════
//  sync.js — ซิงก์ข้อมูลข้ามเครื่องผ่าน Cloudflare Worker
//
//  โจทย์: เดิมข้อมูลอยู่ใน localStorage ของเครื่องใครเครื่องมัน เปิดจากมือถือ
//  จะเห็นข้อมูลตั้งต้นจาก Excel ไม่ใช่ของที่แก้ล่าสุด — ตอนนี้เก็บไว้ "ที่เดียว"
//
//  หลักคิดที่ยึดไว้ 3 ข้อ
//   1. ในเครื่องยังเก็บครบเหมือนเดิม คลาวด์เป็นแค่ตัวกลาง — เน็ตล่ม/ไม่ได้ต่อ ก็ใช้แอปได้ปกติ
//   2. ห้ามทับข้อมูลใครเงียบๆ — ถ้าสองเครื่องแก้ซ้อนกัน ต้องถามก่อนเสมอ
//   3. รหัสซิงก์คือกุญแจ ใครมีรหัสก็เห็นข้อมูล — จึงสุ่มให้ยาว ไม่ให้ตั้งเอง
// ══════════════════════════════════════════════════════════════

const Sync = (() => {
  const API = 'https://finflow-sync.patcharapol2298.workers.dev';
  const CFG = 'finflow.sync.v1';
  const RESET_FLAG = 'finflow.sync.reset';   // ธงบอกว่าเพิ่งล้างข้อมูลตั้งใจ (ข้ามการดึงกลับ)
  const PULL_EVERY = 60000;      // ดึงของใหม่ทุก 1 นาทีตอนเปิดหน้าอยู่
  const PUSH_WAIT  = 1200;       // พิมพ์เสร็จรอ 1.2 วิ ค่อยส่ง (กันส่งทุกตัวอักษร)

  //  rev  = เลขฉบับล่าสุดที่เครื่องนี้ "รู้จัก"  (0 = ยังไม่เคยซิงก์)
  //  dirty= แก้ในเครื่องแล้วแต่ยังส่งขึ้นไม่สำเร็จ
  let C = { code: '', rev: 0, dirty: false, at: '', device: '' };

  let state = 'off';             // off | idle | busy | error | conflict
  let note = '';                 // ข้อความสถานะสั้นๆ ให้คนอ่าน
  let clash = null;              // ฉบับบนคลาวด์ที่ชนกับของเครื่องนี้
  let clashFirst = false;        // ชนตอนเพิ่งกดเชื่อมต่อครั้งแรก (ไม่ใช่แก้ซ้อนกันจริง)
  let pushT = null, pullT = null, retryT = null, lastPull = 0;
  let pushing = false;           // กันส่งซ้อนกันสองสาย (baseRev จะเพี้ยนจนชนกันเอง)
  let sent = '';                 // ข้อมูลก้อนล่าสุดที่ "ตรงกับคลาวด์แล้ว" ไว้เทียบว่าแก้จริงหรือเปล่า
  const subs = [];

  const onState = f => subs.push(f);
  const emit = () => subs.forEach(f => f(state, note));
  const set = (s, n) => { state = s; note = n || ''; emit(); };

  const cfgSave = () => { try { localStorage.setItem(CFG, JSON.stringify(C)); } catch {} };
  function cfgLoad() {
    try { Object.assign(C, JSON.parse(localStorage.getItem(CFG) || '{}')); } catch {}
    if (!C.device) { C.device = guessDevice(); cfgSave(); }
  }

  function guessDevice() {
    const ua = navigator.userAgent;
    if (/iPhone/i.test(ua))        return 'iPhone';
    if (/iPad/i.test(ua))          return 'iPad';
    if (/Android/i.test(ua))       return 'มือถือ Android';
    if (/Macintosh/i.test(ua))     return 'Mac';
    if (/Windows/i.test(ua))       return 'คอมพิวเตอร์';
    return 'เครื่องอื่น';
  }

  /** รหัสสุ่ม 20 ตัว ตัดตัวที่อ่านสับสน (0 O 1 l I) ออก เพราะต้องพิมพ์ข้ามเครื่องจริง */
  function newCode() {
    const AB = 'abcdefghijkmnpqrstuvwxyz23456789';
    const r = crypto.getRandomValues(new Uint8Array(20));
    const s = [...r].map(x => AB[x % AB.length]).join('');
    return `${s.slice(0, 5)}-${s.slice(5, 10)}-${s.slice(10, 15)}-${s.slice(15, 20)}`;
  }

  const when = iso => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }); }
    catch { return iso; }
  };
  const sizeOf = d => (d && d.months ? `${d.months.length} เดือน` : 'ไม่ทราบขนาด');

  // ══ คุยกับเซิร์ฟเวอร์ ═══════════════════════════════════════
  async function api(path, opts = {}) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 15000);
    try {
      const res = await fetch(API + path, {
        ...opts,
        signal: ac.signal,
        headers: { 'Content-Type': 'application/json', 'X-Sync-Code': C.code, ...(opts.headers || {}) },
      });
      const body = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, body };
    } finally { clearTimeout(t); }
  }

  // ══ ดึงลง ═══════════════════════════════════════════════════
  /**
   * @param first  true = เพิ่งกดเชื่อมต่อครั้งแรกบนเครื่องนี้
   *               ห้ามทับของในเครื่องเงียบๆ ต้องให้ผู้ใช้เลือกเองว่าเอาฝั่งไหน
   */
  async function pull({ first = false, loud = false } = {}) {
    if (!C.code) return;
    lastPull = Date.now();
    set('busy', 'กำลังตรวจข้อมูลบนคลาวด์…');
    let r;
    try { r = await api('/v1/doc'); }
    catch { return set('error', 'ต่อคลาวด์ไม่ได้ — ใช้ข้อมูลในเครื่องไปก่อน'); }

    if (!r.ok) return set('error', r.body.error || `คลาวด์ตอบผิดพลาด (${r.status})`);

    const R = r.body;

    // ห้องยังว่าง — เครื่องนี้เป็นเครื่องแรก ส่งของขึ้นไปตั้งต้น
    if (R.rev === 0) return push({ force: true });

    // ตรงกันอยู่แล้ว
    if (R.rev === C.rev && !C.dirty) return set('idle', 'ข้อมูลตรงกับคลาวด์แล้ว');
    if (R.rev === C.rev && C.dirty)  return push();

    // คลาวด์ใหม่กว่า
    if (R.rev > C.rev) {
      if (!C.dirty && !first) {                 // ของเครื่องนี้ไม่มีอะไรค้าง เอาของใหม่มาใช้เลย
        Store.applyRemote(R.data);
        sent = JSON.stringify(Store.get());
        C.rev = R.rev; C.at = R.updatedAt; C.dirty = false; cfgSave();
        set('idle', `ดึงข้อมูลล่าสุดจาก${R.device ? R.device : 'คลาวด์'}แล้ว`);
        App.render();
        if (loud) App.toast('อัปเดตข้อมูลจากคลาวด์แล้ว');
        return;
      }
      clash = R; clashFirst = first;             // แก้ค้างไว้ทั้งสองฝั่ง — ต้องถาม
      return set('conflict', first ? 'ห้องนี้มีข้อมูลอยู่แล้ว — จะใช้ของฝั่งไหน'
                                   : 'ข้อมูลบนคลาวด์กับในเครื่องไม่ตรงกัน');
    }

    // rev ในเครื่องล้ำหน้ากว่าคลาวด์ = ห้องถูกล้างหรือเปลี่ยนรหัส ถามก่อนเช่นกัน
    clash = R; clashFirst = first;
    set('conflict', 'ฉบับบนคลาวด์เก่ากว่าที่เครื่องนี้เคยส่งไป');
  }

  // ══ ส่งขึ้น ═══════════════════════════════════════════════════
  /** ส่งไม่สำเร็จต้องลองใหม่เองเสมอ — ไม่งั้นเน็ตสะดุดทีเดียวแล้วค้างไม่ซิงก์ยาว */
  function retryLater(ms = 10000) {
    clearTimeout(retryT);
    retryT = setTimeout(() => { if (C.dirty && state !== 'conflict') push(); }, ms);
  }

  async function push({ force = false } = {}) {
    if (!C.code) return;
    clearTimeout(pushT);
    // มีสายที่กำลังส่งอยู่ — รอให้จบก่อนค่อยว่ากัน และถ้าสายนั้นส่งของครบแล้วก็ไม่ต้องส่งซ้ำ
    if (pushing) { pushT = setTimeout(() => { if (C.dirty || force) push({ force }); }, 600); return; }
    pushing = true;
    set('busy', 'กำลังบันทึกขึ้นคลาวด์…');
    const snap = JSON.stringify(Store.get());
    let r;
    try {
      r = await api('/v1/doc' + (force ? '?force=1' : ''), {
        method: 'PUT',
        body: `{"baseRev":${C.rev},"device":${JSON.stringify(C.device)},"data":${snap}}`,
      });
    } catch {
      C.dirty = true; cfgSave(); pushing = false;
      retryLater();
      return set('error', 'ส่งขึ้นคลาวด์ไม่ได้ — เก็บไว้ในเครื่องแล้ว เดี๋ยวลองใหม่ให้');
    } finally { pushing = false; }

    if (r.status === 409) {                     // มีเครื่องอื่นเขียนแซง
      clash = r.body; clashFirst = false;
      C.dirty = true; cfgSave();
      return set('conflict', 'มีเครื่องอื่นแก้ข้อมูลไปก่อนแล้ว');
    }
    if (!r.ok) {
      C.dirty = true; cfgSave();
      retryLater(30000);                        // เซิร์ฟเวอร์มีปัญหา ไม่ต้องรัวถี่
      return set('error', r.body.error || `บันทึกไม่สำเร็จ (${r.status})`);
    }

    clash = null; sent = snap; clearTimeout(retryT);
    C.rev = r.body.rev; C.at = r.body.updatedAt; C.dirty = false; cfgSave();
    set('idle', 'บันทึกขึ้นคลาวด์แล้ว');
  }

  /**
   * แอปบันทึกอะไรก็ตาม → ตั้งเวลาส่งขึ้น (รวบหลายการแก้ให้เป็นครั้งเดียว)
   * แต่ต้องกรอง "การบันทึกที่ไม่ได้เปลี่ยนอะไรจริง" ทิ้งก่อน — บางหน้าบันทึกตอนวาดจอ
   * ถ้าปล่อยผ่าน เครื่อง ก. ดึงของเครื่อง ข. มาแล้วส่งกลับ เครื่อง ข. ก็ดึงแล้วส่งกลับ วนไปเรื่อยๆ
   */
  function bump() {
    if (!C.code) return;
    if (JSON.stringify(Store.get()) === sent) return;
    C.dirty = true; cfgSave();
    if (state !== 'conflict') set('busy', 'มีการแก้ไข รอส่งขึ้นคลาวด์…');
    clearTimeout(pushT);
    pushT = setTimeout(() => { if (state !== 'conflict') push(); }, PUSH_WAIT);
  }

  // ══ ตัดสินตอนข้อมูลชนกัน ════════════════════════════════════
  function resolve(side) {
    if (!clash) return;
    if (side === 'remote') {
      Store.applyRemote(clash.data);
      sent = JSON.stringify(Store.get());
      C.rev = clash.rev; C.at = clash.updatedAt; C.dirty = false; cfgSave();
      clash = null; clashFirst = false;
      set('idle', 'ใช้ข้อมูลจากคลาวด์แล้ว');
      App.render(); App.toast('ดึงข้อมูลจากคลาวด์มาใช้แล้ว');
    } else {
      C.rev = clash.rev;                        // ยึด rev ล่าสุดของห้องแล้วทับ
      clash = null; clashFirst = false;
      push({ force: true }).then(() => { App.render(); App.toast('ส่งข้อมูลเครื่องนี้ทับแล้ว'); });
    }
  }

  /** โหลดไฟล์สำรองก่อนตัดสินใจ — ของหายแล้วเรียกคืนไม่ได้ */
  function backupFile(data, tag) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `finflow-${tag}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(a.href);
  }

  // ══ เปิด/ปิดการซิงก์ ═════════════════════════════════════════
  async function connect(code) {
    C.code = String(code || '').trim();
    C.rev = 0; C.dirty = false; C.at = ''; clash = null; sent = '';
    cfgSave();
    await pull({ first: true, loud: true });
    start();
  }
  function disconnect() {
    clearTimeout(pushT); clearTimeout(retryT); clearInterval(pullT);
    C = { code: '', rev: 0, dirty: false, at: '', device: C.device };
    cfgSave(); clash = null; clashFirst = false; sent = '';
    set('off', '');
  }

  function start() {
    clearInterval(pullT);
    if (!C.code) return;
    pullT = setInterval(() => {
      if (document.visibilityState === 'visible' && state !== 'conflict') pull();
    }, PULL_EVERY);
  }

  // ══ เริ่มทำงาน ══════════════════════════════════════════════
  function init() {
    cfgLoad();
    Store.onSave(bump);                          // ทุกการบันทึกในแอป = ส่งขึ้นคลาวด์
    watch();

    // เปิดลิงก์ที่มี #sync=รหัส → ตั้งค่าให้เลย (วิธีย้ายไปมือถือแบบไม่ต้องพิมพ์รหัส)
    const m = location.hash.match(/[#&]sync=([A-Za-z0-9-]{12,120})/);
    if (m) {
      history.replaceState(null, '', location.pathname + location.search);
      connect(m[1]);
      return;
    }

    if (!C.code) return set('off', '');

    // เพิ่งกด "ล้างข้อมูลเริ่มจาก Excel ใหม่" ทั้งที่เปิดซิงก์อยู่
    // = ตั้งใจให้ของบนคลาวด์เริ่มใหม่ด้วย ไม่ใช่ให้คลาวด์ดึงของเก่ากลับมา
    if (localStorage.getItem(RESET_FLAG)) {
      localStorage.removeItem(RESET_FLAG);
      C.rev = 0; cfgSave();
      push({ force: true }); start();
      return;
    }

    set('idle', '');
    pull();
    start();
  }

  /**
   * ดักจังหวะสำคัญของหน้าเว็บ — ต้องผูกไว้เสมอ แม้ตอนนี้ยังไม่ได้เปิดซิงก์
   *
   * ที่ต้องรีบส่งตอนหน้าจอถูกซ่อน เพราะเบราว์เซอร์ (โดยเฉพาะบนมือถือ) จะหยุดจับเวลา
   * ของแท็บที่ไม่ได้อยู่หน้าจอ — ถ้าปล่อยให้รอครบ 1.2 วิตามปกติ พอสลับไปแอปอื่นทันที
   * ตัวจับเวลาจะถูกแช่ไว้ ของที่เพิ่งแก้ก็ค้างไม่ได้ขึ้นคลาวด์
   */
  function watch() {
    addEventListener('visibilitychange', () => {
      if (!C.code) return;
      if (document.visibilityState === 'hidden') {
        clearTimeout(pushT);
        if (C.dirty && state !== 'conflict') push();      // ส่งเดี๋ยวนี้ อย่ารอ
        return;
      }
      if (state === 'conflict') return;
      if (C.dirty) push();                                 // กลับมาแล้วยังมีของค้าง
      else if (Date.now() - lastPull > 15000) pull();      // อาจมีเครื่องอื่นแก้ไประหว่างนั้น
    });
    addEventListener('pagehide', () => {
      if (C.code && C.dirty && state !== 'conflict') push();
    });
    addEventListener('online', () => { if (!C.code) return; C.dirty ? push() : pull(); });
  }

  const info = () => ({
    on: !!C.code, code: C.code, rev: C.rev, at: C.at, dirty: C.dirty,
    device: C.device, state, note, clash, clashFirst,
    link: location.origin + location.pathname + '#sync=' + C.code,
  });

  return { init, connect, disconnect, pull, push, resolve, info, onState,
           newCode, backupFile, when, sizeOf,
           markReset: () => localStorage.setItem(RESET_FLAG, '1'),
           get clash() { return clash; } };
})();

window.Sync = Sync;
