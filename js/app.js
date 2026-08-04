// ══════════════════════════════════════════════════════════════
//  app.js — ตัวประกอบ: สลับหน้า + สถานะ + เมนูข้อมูล
// ══════════════════════════════════════════════════════════════

const App = (() => {
  // เปิดแอปมาเจอเส้นเวลาก่อนเสมอ — คำถามแรกของทุกวันคือ "วันนี้ต้องจ่ายอะไร"
  const state = { screen: 'timeline', month: null };

  function render() {
    const host = document.getElementById('main');
    const keepScroll = host.scrollTop;
    TL.bust();                       // คิวจ่าย/สีสถานะ ต้องคิดใหม่ทุกครั้งที่วาด
    host.innerHTML = '';
    (Screens[state.screen] || Screens.timeline)(host);
    // วาดใหม่ทั้งหน้าเพื่อความง่ายและถูกต้อง — คืนตำแหน่งเลื่อนให้ผู้ใช้ไม่รู้สึกสะดุด
    host.scrollTop = keepScroll;

    for (const b of document.querySelectorAll('.nav-item'))
      b.classList.toggle('on', b.dataset.screen === state.screen);
  }

  function go(screen) {
    state.screen = screen;
    document.getElementById('main').scrollTop = 0;
    render();
  }

  /** ไปดูเดือนที่ระบุ (สร้างให้ถ้ายังไม่มี — ทำนายไปข้างหน้าได้ไม่รู้จบ) */
  function goMonth(id) {
    Store.ensureMonth(id);
    state.month = id;
    Store.commit();
    if (state.screen === 'dashboard') render(); else go('month');
  }

  function toast(msg, ms = 2400) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, ms);
  }

  // ── เมนู "เพิ่มเติม" บนมือถือ: หน้าที่ยุบออกจากแถบล่าง ──
  function moreMenu() {
    Sheet.open('เพิ่มเติม', body => {
      for (const b of document.querySelectorAll('.nav-item.more')) {
        const row = document.createElement('div');
        row.className = 'row tap';
        row.innerHTML = `<span class="row-name">${b.querySelector('span').textContent}</span>
                         <span style="color:var(--text-3)">›</span>`;
        row.style.cursor = 'pointer';
        row.onclick = () => { Sheet.close(); go(b.dataset.screen); };
        body.appendChild(row);
      }
      const d = document.createElement('button');
      d.className = 'btn ghost wide';
      d.style.marginTop = '12px';
      d.textContent = 'ข้อมูลของฉัน — สำรอง / กู้คืน';
      d.onclick = () => { Sheet.close(); dataMenu(); };
      body.appendChild(d);
    });
  }

  // ── เมนูข้อมูล: สำรอง / กู้คืน / เริ่มใหม่ ──
  function dataMenu() {
    Sheet.open('ข้อมูลของฉัน', body => {
      const D = Store.get();
      body.innerHTML = `
        <div class="hint" style="margin-bottom:14px">
          ข้อมูลทั้งหมดเก็บอยู่ในเครื่องนี้เท่านั้น ไม่ได้ส่งไปไหน<br>
          ${D.months.length} เดือน · ${D.cards.length} บัตร · ${D.buckets.length} กระเป๋าเงินเก็บ
        </div>
        <label class="fld"><span>ยอดเงินตั้งต้น (ก่อนเดือนแรก)</span>
          <input type="text" id="sb" value="${D.startBalance}"></label>
        <label class="fld"><span>เงินเก็บฉุกเฉินที่มีอยู่ก่อนเดือนแรก</span>
          <input type="text" id="es" value="${D.emergencyStart || 0}"></label>
        <div class="btn-row">
          <button class="btn ghost" id="exp">⬇ สำรองไฟล์</button>
          <button class="btn ghost" id="imp">⬆ กู้คืน</button>
        </div>
        <div style="height:10px"></div>
        <button class="btn danger wide" id="rst">ล้างข้อมูลแล้วเริ่มจาก Excel ใหม่</button>
        <input type="file" id="file" accept="application/json" hidden>`;

      body.querySelector('#sb').onchange = e => {
        const v = U.calc(e.target.value);
        if (v !== null) { D.startBalance = v; Store.commit(); render(); toast('อัปเดตยอดตั้งต้นแล้ว'); }
      };
      body.querySelector('#es').onchange = e => {
        const v = U.calc(e.target.value);
        if (v !== null) { D.emergencyStart = v; Store.commit(); render(); toast('อัปเดตเงินฉุกเฉินตั้งต้นแล้ว'); }
      };
      body.querySelector('#exp').onclick = () => {
        const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `finflow-${new Date().toISOString().slice(0, 10)}.json`;
        a.click(); URL.revokeObjectURL(a.href);
      };
      const file = body.querySelector('#file');
      body.querySelector('#imp').onclick = () => file.click();
      file.onchange = async () => {
        if (!file.files[0]) return;
        try { Store.importJSON(await file.files[0].text()); Sheet.close(); render(); toast('กู้คืนข้อมูลแล้ว'); }
        catch (e) { toast('ไฟล์ไม่ถูกต้อง'); }
      };
      body.querySelector('#rst').onclick = () => {
        if (confirm('ล้างข้อมูลในเครื่องแล้วเริ่มจากข้อมูล Excel ใหม่?\nสิ่งที่แก้ไว้จะหายหมด')) Store.reset();
      };
    });
  }

  async function init() {
    await Store.load();
    const D = Store.get();

    // เริ่มที่เดือนปัจจุบัน ถ้าไม่มีให้ใช้เดือนล่าสุดที่มีข้อมูล
    const now = Store.thisMonth();
    state.month = D.months.some(m => m.id === now) ? now
                : (D.months[D.months.length - 1]?.id || now);

    for (const b of document.querySelectorAll('.nav-item[data-screen]'))
      b.onclick = () => go(b.dataset.screen);
    document.getElementById('nav-more').onclick = moreMenu;
    document.getElementById('btn-data').onclick = dataMenu;
    document.getElementById('scrim').onclick = Sheet.close;
    for (const b of document.querySelectorAll('[data-close]')) b.onclick = Sheet.close;
    document.addEventListener('keydown', e => { if (e.key === 'Escape') Sheet.close(); });

    render();

    if ('serviceWorker' in navigator)
      addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  return { state, render, go, goMonth, toast, init };
})();

window.App = App;
document.addEventListener('DOMContentLoaded', App.init);
