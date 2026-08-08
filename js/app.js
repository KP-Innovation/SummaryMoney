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
    const sb = syncBanner();
    if (sb) host.appendChild(sb);    // เรื่องข้อมูลชนกันต้องเห็นก่อนอย่างอื่น
    const nb = quickNote();
    if (nb) host.appendChild(nb);    // โน้ตอยู่บนสุดของทุกหน้า
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

  // ══ โน้ตด่วน ══════════════════════════════════════════════
  //
  //  แถบจดอะไรก็ได้บนสุดของทุกหน้า — ไม่ผูกกับเดือนหรือรายการไหน
  //  (ต่างจากปุ่ม ✎ ของแต่ละรายการ ซึ่งเป็นโน้ตของรายการนั้นโดยเฉพาะ)
  //
  //  สองสถานะ: ย่อเป็นแถบบางๆ โชว์บรรทัดแรก / กางเป็นช่องพิมพ์
  //  ⚠️ ห้ามเรียก render() ตอนพิมพ์เด็ดขาด — DOM ถูกสร้างใหม่ทั้งหน้า
  //     เคอร์เซอร์จะเด้งหลุดกลางประโยค จึงบันทึกลง localStorage อย่างเดียว
  function quickNote() {
    const D = Store.get();
    const n = D.quickNote;
    if (n.hidden) return null;

    const first = (n.text || '').split('\n').find(s => s.trim()) || '';

    if (!n.open) {
      const bar = U.el(`<button class="qn-bar">
        <span class="qn-ico">📝</span>
        <span class="qn-prev ${first ? '' : 'ph'}">${U.esc(first || 'จดอะไรก็ได้ตรงนี้…')}</span>
        <span class="qn-caret">▾</span></button>`);
      bar.onclick = () => { n.open = true; Store.save(); render(); };
      return bar;
    }

    const box = U.el(`<div class="card qn">
      <div class="qn-head">
        <span class="qn-ico">📝</span>
        <span class="qn-title">โน้ตด่วน</span>
        <span class="qn-when" id="st">${n.updated ? 'บันทึกล่าสุด ' + n.updated : ''}</span>
        <button class="icon-btn qn-x" id="cl" title="ปิดโน้ต">✕</button>
      </div>
      <textarea class="qn-ta" id="ta" placeholder="จดอะไรก็ได้ตรงนี้ — รายการที่ต้องจ่ายก่อนหลัง เตือนตัวเอง อะไรก็ได้"></textarea>
      <div class="qn-foot">
        <button class="qn-mini" id="hide">ซ่อนแถบนี้</button>
        <button class="qn-mini" id="clr">ล้างข้อความ</button>
      </div></div>`);

    const ta = box.querySelector('#ta');
    const st = box.querySelector('#st');
    ta.value = n.text || '';

    // ยืดตามเนื้อหา แต่ไม่เกินครึ่งจอ ไม่งั้นโน้ตยาวๆ ดันเนื้อหาที่เหลือตกจอไปหมด
    const fit = () => {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight + 2, innerHeight * 0.45) + 'px';
    };
    fit();

    let t;
    ta.oninput = () => {
      fit();
      clearTimeout(t);
      t = setTimeout(() => {
        n.text = ta.value;
        n.updated = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        Store.save();
        st.textContent = 'บันทึกแล้ว ' + n.updated;
      }, 400);
    };

    /** ปิด/ซ่อน ต้องเก็บสิ่งที่เพิ่งพิมพ์ก่อนเสมอ ไม่งั้นตัวอักษรใน 400ms สุดท้ายหาย */
    const flush = () => {
      clearTimeout(t);
      n.text = ta.value;
      if (ta.value.trim()) n.updated = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    };
    box.querySelector('#cl').onclick = () => { flush(); n.open = false; Store.commit(); render(); };
    box.querySelector('#hide').onclick = () => {
      flush(); n.open = false; n.hidden = true; Store.commit(); render();
      toast('ซ่อนแล้ว — เปิดคืนได้ที่เมนู ⋯ ข้อมูลของฉัน', 4000);
    };
    box.querySelector('#clr').onclick = () => {
      if (ta.value.trim() && !confirm('ล้างข้อความในโน้ตทั้งหมด?')) return;
      clearTimeout(t);
      n.text = ''; n.updated = '';
      Store.commit(); render();
    };
    return box;
  }

  // ══ แถบแจ้งเรื่องซิงก์ ════════════════════════════════════
  //
  //  โผล่เฉพาะตอนที่ "ต้องให้คนตัดสินใจ" เท่านั้น — ซิงก์ปกติต้องเงียบ
  //  ตอนข้อมูลสองฝั่งชนกัน ห้ามเลือกให้เอง เพราะเลือกผิด = ตัวเลขการเงินหายจริง
  function syncBanner() {
    const s = Sync.info();

    if (s.state === 'conflict' && s.clash) {
      const R = s.clash, L = Store.get();
      const first = s.clashFirst;
      const bar = U.el(`<div class="card sync-clash">
        <div class="sc-head">${first ? '☁️ รหัสนี้มีข้อมูลอยู่แล้ว — จะใช้ของฝั่งไหน'
                                     : '⚠️ ข้อมูลสองฝั่งไม่ตรงกัน — เลือกว่าจะเก็บฝั่งไหน'}</div>
        <div class="sc-grid">
          <div class="sc-side">
            <div class="sc-t">บนคลาวด์</div>
            <div class="sc-m">${U.esc(Sync.when(R.updatedAt))}</div>
            <div class="sc-m">จาก ${U.esc(R.device || 'ไม่ทราบเครื่อง')} · ${U.esc(Sync.sizeOf(R.data))}</div>
          </div>
          <div class="sc-side">
            <div class="sc-t">ในเครื่องนี้</div>
            <div class="sc-m">${U.esc(first ? 'ข้อมูลเดิมของเครื่องนี้ (ยังไม่เคยซิงก์)'
                                            : s.dirty ? 'มีการแก้ที่ยังไม่ได้ส่งขึ้น' : 'ตรงกับที่เคยส่งไป')}</div>
            <div class="sc-m">${U.esc(s.device)} · ${U.esc(Sync.sizeOf(L))}</div>
          </div>
        </div>
        <div class="sc-btns">
          <button class="btn" id="take">⬇ ใช้ของบนคลาวด์</button>
          <button class="btn ghost" id="give">⬆ ส่งของเครื่องนี้ทับ</button>
          <button class="btn ghost" id="bk">💾 สำรองทั้งสองฝั่งก่อน</button>
        </div>
        <div class="hint" style="margin-top:8px">เลือกแล้วอีกฝั่งจะถูกทับ — ไม่แน่ใจให้กดสำรองไฟล์ไว้ก่อน</div>
      </div>`);
      bar.querySelector('#take').onclick = () => Sync.resolve('remote');
      bar.querySelector('#give').onclick = () => Sync.resolve('local');
      bar.querySelector('#bk').onclick = () => {
        Sync.backupFile(Store.get(), 'เครื่องนี้');
        Sync.backupFile(R.data, 'คลาวด์');
        toast('สำรองไว้ทั้งสองไฟล์แล้ว');
      };
      return bar;
    }

    if (s.state === 'error') {
      const bar = U.el(`<button class="qn-bar sync-err">
        <span class="qn-ico">☁️</span>
        <span class="qn-prev">${U.esc(s.note)} — แตะเพื่อลองใหม่</span></button>`);
      bar.onclick = () => (s.dirty ? Sync.push() : Sync.pull({ loud: true }));
      return bar;
    }
    return null;
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
      d.textContent = 'ข้อมูลของฉัน — ซิงก์ / สำรอง / กู้คืน';
      d.onclick = () => { Sheet.close(); dataMenu(); };
      body.appendChild(d);
    });
  }

  // ══ กล่องตั้งค่าซิงก์ (อยู่ในเมนูข้อมูล) ══════════════════
  const SYNC_STATE_TEXT = { idle: '✓ ตรงกันแล้ว', busy: '⟳ กำลังซิงก์…',
                            error: '⚠ ต่อไม่ได้', conflict: '⚠ ข้อมูลชนกัน', off: '' };

  function syncBoxHTML(s) {
    if (!s.on) return `
      <div class="card sync-box">
        <div class="sy-head"><span>☁️ ซิงก์ข้ามเครื่อง</span><span class="sy-off">ปิดอยู่</span></div>
        <div class="hint">ตอนนี้ข้อมูลอยู่ในเครื่องนี้เท่านั้น เปิดจากมือถือหรือคอมเครื่องอื่น
          จะไม่เห็นสิ่งที่แก้ไว้ที่นี่<br>เปิดซิงก์แล้วทุกเครื่องที่ใส่รหัสเดียวกันจะใช้ข้อมูลก้อนเดียวกัน</div>
        <div class="btn-row" style="margin-top:12px">
          <button class="btn" id="sy-new">เปิดใช้ (สร้างรหัสใหม่)</button>
          <button class="btn ghost" id="sy-join">ใส่รหัสที่มีอยู่</button>
        </div>
        <div id="sy-join-box" hidden style="margin-top:10px">
          <label class="fld"><span>รหัสซิงก์จากเครื่องแรก</span>
            <input type="text" id="sy-code" placeholder="เช่น abcde-fghij-klmno-pqrst" autocapitalize="off" spellcheck="false"></label>
          <button class="btn wide" id="sy-go">เชื่อมต่อ</button>
        </div>
      </div>`;

    return `
      <div class="card sync-box">
        <div class="sy-head"><span>☁️ ซิงก์ข้ามเครื่อง</span>
          <span class="sy-on ${s.state}">${SYNC_STATE_TEXT[s.state] || ''}</span></div>
        <div class="hint">${U.esc(s.note || 'ข้อมูลเก็บไว้ที่เดียว ทุกเครื่องที่ใส่รหัสนี้เห็นเหมือนกัน')}<br>
          อัปเดตล่าสุด ${U.esc(Sync.when(s.at))}${s.rev ? ` · ฉบับที่ ${s.rev}` : ''}
          ${s.dirty ? ' · <b style="color:var(--warn,#fbbf24)">ยังมีของค้างส่ง</b>' : ''}</div>
        <div class="sy-code" id="sy-show">${U.esc(s.code)}</div>
        <div class="btn-row">
          <button class="btn ghost" id="sy-copy">📋 คัดลอกรหัส</button>
          <button class="btn ghost" id="sy-link">🔗 คัดลอกลิงก์เปิดบนมือถือ</button>
        </div>
        <div class="btn-row" style="margin-top:8px">
          <button class="btn ghost" id="sy-now">⟳ ซิงก์เดี๋ยวนี้</button>
          <button class="btn ghost" id="sy-stop">หยุดซิงก์เครื่องนี้</button>
        </div>
        <div class="hint" style="margin-top:8px">ใครมีรหัสนี้เปิดดูข้อมูลได้ — ส่งให้เฉพาะเครื่องตัวเอง</div>
      </div>`;
  }

  async function copyText(text, okMsg) {
    try { await navigator.clipboard.writeText(text); toast(okMsg); }
    catch {                                   // บางเบราว์เซอร์บนมือถือไม่ให้คัดลอกตรงๆ
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast(okMsg); } catch { toast('คัดลอกไม่ได้ — กดค้างที่รหัสเพื่อคัดลอกเอง'); }
      ta.remove();
    }
  }

  function wireSyncBox(body) {
    const redraw = () => { Sheet.close(); dataMenu(); };

    body.querySelector('#sy-new')?.addEventListener('click', async () => {
      const code = Sync.newCode();
      await Sync.connect(code);
      redraw(); render();
      toast('เปิดซิงก์แล้ว — เอารหัสนี้ไปใส่ในเครื่องอื่น', 4000);
    });
    body.querySelector('#sy-join')?.addEventListener('click', () => {
      const box = body.querySelector('#sy-join-box');
      box.hidden = false;
      box.querySelector('#sy-code').focus();
    });
    body.querySelector('#sy-go')?.addEventListener('click', async () => {
      const code = body.querySelector('#sy-code').value.trim();
      if (code.replace(/-/g, '').length < 12) return toast('รหัสสั้นเกินไป');
      await Sync.connect(code);
      redraw(); render();
    });
    body.querySelector('#sy-copy')?.addEventListener('click', () => copyText(Sync.info().code, 'คัดลอกรหัสแล้ว'));
    body.querySelector('#sy-link')?.addEventListener('click', () => copyText(Sync.info().link, 'คัดลอกลิงก์แล้ว — เปิดลิงก์นี้บนมือถือได้เลย'));
    body.querySelector('#sy-now')?.addEventListener('click', async () => {
      await (Sync.info().dirty ? Sync.push() : Sync.pull({ loud: true }));
      redraw(); render();
    });
    body.querySelector('#sy-stop')?.addEventListener('click', () => {
      if (!confirm('หยุดซิงก์เฉพาะเครื่องนี้?\nข้อมูลบนคลาวด์และเครื่องอื่นยังอยู่ครบ')) return;
      Sync.disconnect(); redraw();
      toast('หยุดซิงก์แล้ว — เครื่องนี้กลับไปเก็บข้อมูลของตัวเอง');
    });
  }

  // ── เมนูข้อมูล: สำรอง / กู้คืน / เริ่มใหม่ ──
  function dataMenu() {
    Sheet.open('ข้อมูลของฉัน', body => {
      const D = Store.get();
      const s = Sync.info();
      body.innerHTML = `
        <div class="hint" style="margin-bottom:14px">
          ${D.months.length} เดือน · ${D.cards.length} บัตร · ${D.buckets.length} กระเป๋าเงินเก็บ
        </div>
        ${syncBoxHTML(s)}
        <label class="fld"><span>ยอดเงินตั้งต้น (ก่อนเดือนแรก)</span>
          <input type="text" id="sb" value="${D.startBalance}"></label>
        <label class="fld"><span>เงินเก็บฉุกเฉินที่มีอยู่ก่อนเดือนแรก</span>
          <input type="text" id="es" value="${D.emergencyStart || 0}"></label>
        ${D.quickNote.hidden ? '<button class="btn ghost wide" id="qn" style="margin-bottom:12px">📝 แสดงแถบโน้ตด่วนอีกครั้ง</button>' : ''}
        <div class="btn-row">
          <button class="btn ghost" id="exp">⬇ สำรองไฟล์</button>
          <button class="btn ghost" id="imp">⬆ กู้คืน</button>
        </div>
        <div style="height:10px"></div>
        <button class="btn danger wide" id="rst">ล้างข้อมูลแล้วเริ่มจาก Excel ใหม่</button>
        <input type="file" id="file" accept="application/json" hidden>`;

      wireSyncBox(body);

      body.querySelector('#sb').onchange = e => {
        const v = U.calc(e.target.value);
        if (v !== null) { D.startBalance = v; Store.commit(); render(); toast('อัปเดตยอดตั้งต้นแล้ว'); }
      };
      body.querySelector('#es').onchange = e => {
        const v = U.calc(e.target.value);
        if (v !== null) { D.emergencyStart = v; Store.commit(); render(); toast('อัปเดตเงินฉุกเฉินตั้งต้นแล้ว'); }
      };
      body.querySelector('#qn')?.addEventListener('click', () => {
        D.quickNote.hidden = false;
        D.quickNote.open = true;
        Store.commit(); Sheet.close(); render();
      });
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
        const on = Sync.info().on;
        const warn = 'ล้างข้อมูลในเครื่องแล้วเริ่มจากข้อมูล Excel ใหม่?\nสิ่งที่แก้ไว้จะหายหมด'
          + (on ? '\n\n⚠️ เปิดซิงก์อยู่ — ข้อมูลบนคลาวด์และเครื่องอื่นจะถูกล้างตามไปด้วย' : '');
        if (!confirm(warn)) return;
        if (on) Sync.markReset();     // ไม่งั้นรีโหลดเสร็จมันจะดึงของเก่าจากคลาวด์กลับมาทันที
        Store.reset();
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

    // ซิงก์เริ่มหลังวาดหน้าจอเสร็จ และไม่ await — เน็ตช้าต้องไม่ทำให้เปิดแอปช้าตาม
    Sync.onState(s => {
      const dot = document.getElementById('sync-dot');
      if (dot) { dot.className = 'sync-dot ' + s; dot.hidden = (s === 'off'); }

      //  วาดใหม่เฉพาะตอน "แถบเตือนควรอยู่/ควรหาย แต่บนจอยังไม่ตรง" เท่านั้น
      //  เทียบกับของจริงบนจอ ไม่ใช่เทียบสถานะก่อนหน้า — วาดเสร็จแล้วเงื่อนไขจะเป็นเท็จเอง
      //  จึงวนซ้ำไม่ได้ (เคยพลาดจนวาดซ้อนกันเองไม่รู้จบ)
      const want = (s === 'conflict' || s === 'error');
      const has  = !!document.querySelector('.sync-clash, .sync-err');
      const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '');
      if (want !== has && !typing) setTimeout(render, 0);   // เลื่อนออกไป กันวาดซ้อนระหว่างที่ยังทำงานค้างอยู่
    });
    Sync.init();

    if ('serviceWorker' in navigator)
      addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  return { state, render, go, goMonth, toast, init };
})();

window.App = App;
document.addEventListener('DOMContentLoaded', App.init);
