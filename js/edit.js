// ══════════════════════════════════════════════════════════════
//  edit.js — แก้ไขทุกช่องได้ทันทีตรงที่มันอยู่
//
//  เจตนา: ให้ความรู้สึกเหมือนแก้เซลล์ใน Excel — คลิกแล้วพิมพ์ทับได้เลย
//  แต่ต่างตรงที่ช่องตัวเลขรับสูตรย่อได้ (พิมพ์ 3000+500 แล้วมันคิดให้)
//  และการแก้ช่องหนึ่งไม่มีทางทำให้ช่องอื่นพัง เพราะยอดรวมคำนวณสดเสมอ
// ══════════════════════════════════════════════════════════════

const Edit = (() => {

  /**
   * ทำให้ element หนึ่งแก้ไขได้ในที่
   * @param opts.get  ค่าปัจจุบัน
   * @param opts.set  ฟังก์ชันรับค่าใหม่
   * @param opts.type 'text' | 'money'
   */
  function inline(node, { get, set, type = 'text', prefix = '', suffix = '' }) {
    node.classList.add('ed');
    node.tabIndex = 0;

    const show = () => {
      const v = get();
      node.textContent = type === 'money' ? prefix + U.money(v) + suffix : (v || '—');
    };
    show();

    const begin = () => {
      if (node.isContentEditable) return;
      const cur = get();
      node.contentEditable = 'true';
      node.spellcheck = false;
      // ช่องเงิน: โชว์ตัวเลขดิบให้พิมพ์ทับ/ต่อสูตรได้เลย ไม่มีคอมมาเกะกะ
      node.textContent = type === 'money' ? (cur === 0 ? '' : String(cur)) : (cur || '');
      node.focus();
      document.execCommand?.('selectAll', false, null);
    };

    const end = (keep) => {
      if (!node.isContentEditable) return;
      const raw = node.textContent.trim();
      node.contentEditable = 'false';
      if (keep) {
        if (type === 'money') {
          const v = U.calc(raw);
          if (v !== null) set(v);
          else if (raw === '') set(0);
        } else if (raw) set(raw);
      }
      show();
    };

    node.addEventListener('click', begin);
    node.addEventListener('focus', begin);
    node.addEventListener('blur', () => end(true));
    node.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); node.blur(); }
      if (e.key === 'Escape') { e.preventDefault(); end(false); node.blur(); }
    });
    return node;
  }

  /** ปุ่มโน้ต — จุดสีเหลืองถ้ามีข้อความอยู่แล้ว */
  function noteBtn(obj, onSave) {
    const b = U.el(`<button class="mini ${obj.note ? 'on' : ''}" title="โน้ต">✎</button>`);
    b.onclick = ev => {
      ev.stopPropagation();
      Sheet.open('โน้ต — ' + (obj.name || ''), body => {
        body.innerHTML = `
          <label class="fld"><span>ข้อความ</span>
            <textarea id="nt" placeholder="เช่น เดือนนี้จ่ายแทนพี่บิวไปก่อน">${U.esc(obj.note || '')}</textarea>
          </label>
          <div class="btn-row">
            <button class="btn ghost" data-close>ยกเลิก</button>
            <button class="btn" id="nt-save">บันทึก</button>
          </div>`;
        body.querySelector('#nt-save').onclick = () => {
          obj.note = body.querySelector('#nt').value.trim();
          Store.commit(); Sheet.close(); onSave?.();
        };
      });
    };
    return b;
  }

  /** ปุ่มลบ พร้อมถามยืนยัน */
  function delBtn(label, onDel) {
    const b = U.el('<button class="mini" title="ลบ">✕</button>');
    b.onclick = ev => {
      ev.stopPropagation();
      if (!confirm(`ลบ "${label}" ?`)) return;
      onDel();
    };
    return b;
  }

  return { inline, noteBtn, delBtn };
})();

/** แผงลอยกลาง ใช้ร่วมกันทุกหน้า */
const Sheet = (() => {
  const node = () => document.getElementById('sheet');
  function open(title, build) {
    document.getElementById('sheet-title').textContent = title;
    const body = document.getElementById('sheet-body');
    body.innerHTML = '';
    build(body);
    body.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
    node().hidden = false;
    document.getElementById('scrim').hidden = false;
  }
  function close() {
    node().hidden = true;
    document.getElementById('scrim').hidden = true;
  }
  return { open, close };
})();

window.Edit = Edit;
window.Sheet = Sheet;
