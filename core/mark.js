// Browser-side helper: draws a red box, an arrow and a number label around each changed element,
// so a screenshot shows exactly where the change is. Nothing to install; paste the file into the page.
//   chrome-devtools MCP:  evaluate_script  function: () => { <this file>; return aaMark([...]) }
//   Claude app browser:   javascript_tool  text:     <this file>; aaMark([...])
// aaMark([{ selector: '#save', label: 'ปุ่มบันทึก' }]) scrolls the first element into view, draws, and returns
// [{ selector, label, inView, element: {x,y,width,height}, box: {x,y,width,height} }] in viewport pixels.
// aaUnmark() removes every node aaMark added.
(() => {
  const ATTR = 'data-aa-mark';
  const PAD = 8;
  const STROKE = 3;
  const ARROW = 64;
  const LABEL_W = 120;
  const LABEL_H = 24;
  const RED = '#dc2626';
  const SVG = 'http://www.w3.org/2000/svg';

  function aaUnmark() {
    document.querySelectorAll(`[${ATTR}]`).forEach((n) => n.remove());
  }

  const hit = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

  // Arrow tip on the box edge and tail ARROW px outside it, for one side.
  function arrowFor(box, side) {
    const midX = box.x + box.width / 2;
    const midY = box.y + box.height / 2;
    const tip = { left: [box.x, midY], right: [box.x + box.width, midY], top: [midX, box.y], bottom: [midX, box.y + box.height] }[side];
    const step = { left: [-ARROW, 0], right: [ARROW, 0], top: [0, -ARROW], bottom: [0, ARROW] }[side];
    const tail = [tip[0] + step[0], tip[1] + step[1]];
    // Rough area of the arrow plus its label, used only to avoid other boxes.
    const area = { x: Math.min(tip[0], tail[0]) - LABEL_W * (side === 'left' ? 1 : side === 'right' ? 0 : 0.5), y: Math.min(tip[1], tail[1]) - LABEL_H, width: Math.abs(step[0]) + LABEL_W, height: Math.abs(step[1]) + LABEL_H * 2 };
    return { side, tip, tail, area };
  }

  // The side with the most room in the viewport whose arrow and label do not cover another marked box.
  function pickArrow(box, others) {
    const room = { left: box.x, right: innerWidth - box.x - box.width, top: box.y, bottom: innerHeight - box.y - box.height };
    const sides = Object.keys(room).sort((a, b) => room[b] - room[a]).map((side) => arrowFor(box, side));
    return sides.find((a) => !others.some((o) => hit(a.area, o))) || sides[0];
  }

  function aaMark(items) {
    aaUnmark();
    const found = items.map((it) => ({ ...it, el: document.querySelector(it.selector) }));
    const missing = found.filter((f) => !f.el).map((f) => f.selector);
    if (missing.length) throw new Error(`aaMark: no element matches ${missing.join(', ')}`);
    found[0].el.scrollIntoView({ block: 'center', inline: 'center' });

    // Absolute to the document, not fixed, so the marks stay on their element if the page scrolls later.
    const layer = document.createElement('div');
    layer.setAttribute(ATTR, '');
    layer.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147483647';
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute(ATTR, '');
    svg.style.cssText = `position:absolute;left:0;top:0;overflow:visible;width:1px;height:1px`;
    svg.innerHTML = `<defs><marker id="aa-mark-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${RED}"/></marker></defs>`;
    layer.appendChild(svg);
    document.documentElement.appendChild(layer);

    const rects = found.map((f) => f.el.getBoundingClientRect());
    const boxes = rects.map((r) => ({ x: r.left - PAD, y: r.top - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 }));
    const taken = [...boxes];
    return found.map((f, i) => {
      const r = rects[i];
      const box = boxes[i];
      const ox = scrollX;
      const oy = scrollY;

      const frame = document.createElement('div');
      frame.setAttribute(ATTR, '');
      frame.style.cssText = `position:absolute;box-sizing:border-box;left:${box.x + ox}px;top:${box.y + oy}px;width:${box.width}px;height:${box.height}px;border:${STROKE}px solid ${RED};border-radius:6px`;
      layer.appendChild(frame);

      const { side, tip, tail, area } = pickArrow(box, taken.filter((b) => b !== box));
      taken.push(area);
      const line = document.createElementNS(SVG, 'line');
      line.setAttribute('x1', tail[0] + ox);
      line.setAttribute('y1', tail[1] + oy);
      line.setAttribute('x2', tip[0] + ox);
      line.setAttribute('y2', tip[1] + oy);
      line.setAttribute('stroke', RED);
      line.setAttribute('stroke-width', STROKE + 1);
      line.setAttribute('marker-end', 'url(#aa-mark-head)');
      svg.appendChild(line);

      // Number badge plus label at the arrow's tail.
      const tag = document.createElement('div');
      tag.setAttribute(ATTR, '');
      tag.textContent = f.label ? `${i + 1} ${f.label}` : String(i + 1);
      tag.style.cssText = `position:absolute;left:${tail[0] + ox}px;top:${tail[1] + oy}px;background:${RED};color:#fff;font:600 14px/1.4 system-ui,sans-serif;padding:2px 8px;border-radius:9999px;white-space:nowrap;transform:translate(${side === 'left' ? '-100%' : side === 'right' ? '0' : '-50%'},${side === 'top' ? '-100%' : side === 'bottom' ? '0' : '-50%'})`;
      layer.appendChild(tag);

      const inView = r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
      return { selector: f.selector, label: f.label || '', inView, element: { x: r.left, y: r.top, width: r.width, height: r.height }, box };
    });
  }

  window.aaMark = aaMark;
  window.aaUnmark = aaUnmark;
})();
