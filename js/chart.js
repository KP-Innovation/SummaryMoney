// ══════════════════════════════════════════════════════════════
//  chart.js — กราฟ SVG เขียนเอง
//
//  ไม่ใช้ไลบรารีกราฟ เพราะต้องการ 2 อย่างที่ของสำเร็จรูปทำให้ยาก:
//   1) เส้นเดียวที่ "ครึ่งแรกทึบ (ของจริง) ครึ่งหลังประ (คาดการณ์)"
//   2) ทำงานได้ตอนออฟไลน์โดยไม่ต้องโหลดสคริปต์จากที่อื่น
//
//  ⚠️ วาดด้วย "พิกัดพิกเซลจริง" เสมอ ห้ามใช้ viewBox หน่วยย่อ + preserveAspectRatio="none"
//     เพราะการยืด viewBox จะยืดตัวอักษรแกนและลายเส้นประไปด้วยจนอ่านไม่ออก
//     จึงต้องวัดความกว้างจริงของกล่องที่จะเอาไปวางก่อน แล้ววาดตามนั้น
// ══════════════════════════════════════════════════════════════

const Chart = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (t, a = {}) => {
    const e = document.createElementNS(NS, t);
    for (const k in a) e.setAttribute(k, a[k]);
    return e;
  };
  const txt = (a, s) => { const e = mk('text', a); e.textContent = s; return e; };

  /**
   * กราฟเส้นกระแสเงินสด อดีต→อนาคตในภาพเดียว
   * @param mount   กล่องที่อยู่ใน DOM แล้ว (ใช้วัดความกว้าง)
   * @param series  [{ name, color, values:[n], dashFrom:index, fill, dots }]
   */
  function line(mount, series, labels, opts = {}) {
    const draw = () => {
      mount.innerHTML = '';
      const W = Math.max(240, mount.clientWidth || 320);
      const H = opts.height || 190;
      const padT = 14, padB = 24, padR = 8, padL = 8;

      const svg = mk('svg', { class: 'chart', width: W, height: H, viewBox: `0 0 ${W} ${H}` });

      const all = series.flatMap(s => s.values).filter(v => v != null && isFinite(v));
      if (!all.length) { mount.appendChild(svg); return; }
      let lo = Math.min(0, ...all), hi = Math.max(...all);
      if (hi === lo) hi = lo + 1;
      const pad = (hi - lo) * 0.14;
      lo -= pad; hi += pad;

      const n = labels.length;
      const X = i => padL + (n === 1 ? (W - padL - padR) / 2 : i * (W - padL - padR) / (n - 1));
      const Y = v => padT + (hi - v) / (hi - lo) * (H - padT - padB);

      for (let i = 0; i <= 3; i++) {
        const y = padT + i * (H - padT - padB) / 3;
        svg.appendChild(mk('line', { class: 'grid-l', x1: 0, x2: W, y1: y, y2: y }));
      }
      if (lo < 0 && hi > 0) {
        svg.appendChild(mk('line', { x1: 0, x2: W, y1: Y(0), y2: Y(0),
          stroke: 'rgba(251,113,133,.45)', 'stroke-width': 1, 'stroke-dasharray': '4 4' }));
      }

      for (const s of series) {
        const pts = s.values.map((v, i) => (v == null ? null : [X(i), Y(v)]));
        const cut = Math.max(0, s.dashFrom ?? s.values.length);
        const path = (a, b) => pts.slice(a, b).filter(Boolean)
          .map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');

        if (s.fill) {
          const d = path(0, n);
          if (d) {
            const id = 'g' + Math.random().toString(36).slice(2, 7);
            const g = mk('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 });
            g.appendChild(mk('stop', { offset: '0%', 'stop-color': s.color, 'stop-opacity': .3 }));
            g.appendChild(mk('stop', { offset: '100%', 'stop-color': s.color, 'stop-opacity': 0 }));
            svg.appendChild(g);
            svg.appendChild(mk('path', {
              d: `${d} L ${X(n - 1).toFixed(1)} ${H - padB} L ${X(0).toFixed(1)} ${H - padB} Z`,
              fill: `url(#${id})`, stroke: 'none' }));
          }
        }

        const solid = path(0, Math.min(cut + 1, n));
        if (solid) svg.appendChild(mk('path', { d: solid, fill: 'none', stroke: s.color,
          'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

        if (cut < n - 1) {
          const dashed = path(cut, n);
          if (dashed) svg.appendChild(mk('path', { d: dashed, fill: 'none', stroke: s.color,
            'stroke-width': 2.2, 'stroke-dasharray': '5 4', 'stroke-linecap': 'round', opacity: .9 }));
        }

        if (s.dots !== false) {
          pts.forEach((p, i) => p && svg.appendChild(mk('circle',
            { cx: p[0], cy: p[1], r: 2.6, fill: s.color, opacity: i > cut ? .75 : 1 })));
        }
      }

      // แกน X — เว้นป้ายให้พอดีกับความกว้างจริง ไม่ให้ตัวหนังสือทับกัน
      const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(W / 62))));
      labels.forEach((t, i) => {
        if (i % step && i !== n - 1) return;
        svg.appendChild(txt({ class: 'axis-t', x: U.clamp(X(i), 16, W - 16),
          y: H - 7, 'text-anchor': 'middle' }, t));
      });

      if (opts.onPick) {
        const half = (W - padL - padR) / Math.max(1, n - 1) / 2;
        labels.forEach((_, i) => {
          const hit = mk('rect', { class: 'dot-hit', x: X(i) - half, y: 0,
            width: half * 2, height: H - padB });
          hit.addEventListener('click', () => opts.onPick(i));
          svg.appendChild(hit);
        });
      }
      mount.appendChild(svg);
    };

    draw();
    // จอหมุน/ย่อขยาย → วาดใหม่ให้พอดีความกว้างใหม่
    if (window.ResizeObserver && !mount._ro) {
      mount._ro = new ResizeObserver(() => draw());
      mount._ro.observe(mount);
    }
    return mount;
  }

  /** วงแหวนแสดง % การใช้วงเงิน พร้อมตัวเลขตรงกลาง */
  function ring(pct, color, size = 62) {
    const r = (size - 9) / 2, c = 2 * Math.PI * r;
    const svg = mk('svg', { class: 'ring-wrap', viewBox: `0 0 ${size} ${size}`, width: size, height: size });
    const g = mk('g', { class: 'ring', transform: `rotate(-90 ${size / 2} ${size / 2})` });
    g.appendChild(mk('circle', { class: 'bg', cx: size / 2, cy: size / 2, r,
      fill: 'none', stroke: 'rgba(255,255,255,.08)', 'stroke-width': 7 }));
    g.appendChild(mk('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: color,
      'stroke-width': 7, 'stroke-linecap': 'round',
      'stroke-dasharray': `${(c * U.clamp(pct, 0, 1)).toFixed(1)} ${c.toFixed(1)}` }));
    svg.appendChild(g);
    svg.appendChild(txt({ x: size / 2, y: size / 2 + 4, 'text-anchor': 'middle',
      fill: '#eef1f6', style: 'font:800 13px var(--font);font-variant-numeric:tabular-nums' },
      Math.round(pct * 100) + '%'));
    return svg;
  }

  /** แถบสัดส่วนรายจ่ายแยกหมวด */
  function stack(parts) {
    const total = parts.reduce((t, p) => t + Math.max(0, p.value), 0) || 1;
    const bar = U.el('<div class="bar"></div>');
    for (const p of parts) {
      if (p.value <= 0) continue;
      const i = document.createElement('i');
      i.style.width = (p.value / total * 100) + '%';
      i.style.background = p.color;
      i.title = `${p.name} ${U.money(p.value)}`;
      bar.appendChild(i);
    }
    return bar;
  }

  return { line, ring, stack };
})();

window.Chart = Chart;
