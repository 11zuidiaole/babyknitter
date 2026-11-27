// 形状模板：每个作品由几个零件组成。
// 每个零件 = 轮廓 path + 外框 box [x0,y0,x1,y1] + 织的方向 dir（down/up/left/right）
// 以后 AI 生成的形状也用同一种格式。

const SHAPES = {
  sock: {
    name: '袜子',
    viewBox: '0 0 540 350',
    parts: [
      { name: '袜口', aliases: ['cuff', 'ribbing', '罗纹', '袜口'], path: 'M120 20H220V80H120Z', box: [120, 20, 220, 80], dir: 'down', label: [232, 54] },
      { name: '袜筒', aliases: ['leg', '袜筒', '腿'], path: 'M120 80H220V240H120Z', box: [120, 80, 220, 240], dir: 'down', label: [232, 165] },
      { name: '脚跟', aliases: ['heel', '脚跟', '后跟'], path: 'M120 240H220V330H160Q120 330 120 290Z', box: [120, 240, 220, 330], dir: 'down', label: [62, 292] },
      { name: '脚面', aliases: ['foot', 'gusset', '脚面', '脚掌', '脚背'], path: 'M220 240H460V330H220Z', box: [220, 240, 460, 330], dir: 'right', label: [320, 350] },
      { name: '脚尖', aliases: ['toe', '脚尖'], path: 'M460 240Q515 240 515 285Q515 330 460 330Z', box: [460, 240, 515, 330], dir: 'right', label: [470, 230] },
    ],
    defaults: [
      ['袜口', 12, '下1上1单螺纹', 60],
      ['袜筒', 40, '全部下针', 60],
      ['脚跟', 20, '往返织：滑1针，下1针，重复', 30],
      ['脚面', 50, '全部下针', 60],
      ['脚尖', 12, '每圈在四个位置各减1针', ''],
    ],
  },
  mitten: {
    name: '手套',
    viewBox: '0 0 320 430',
    parts: [
      { name: '罗纹', aliases: ['cuff', 'ribbing', '罗纹', '手腕', '袖口'], path: 'M100 340H240V410H100Z', box: [100, 340, 240, 410], dir: 'up', label: [250, 380] },
      { name: '手掌', aliases: ['hand', 'body', '手掌', '手身', '主体'], path: 'M100 130H240V340H100Z', box: [100, 130, 240, 340], dir: 'up', label: [250, 240] },
      { name: '顶部', aliases: ['top', 'decrease', '顶部', '收针', '指尖'], path: 'M100 130Q100 30 170 30Q240 30 240 130Z', box: [100, 30, 240, 130], dir: 'up', label: [250, 70] },
      { name: '拇指', aliases: ['thumb', 'gusset', '拇指', '大拇指'], path: 'M100 300L58 245Q40 215 58 198Q78 186 100 214Z', box: [40, 186, 100, 300], dir: 'up', label: [6, 260] },
    ],
    defaults: [
      ['罗纹', 15, '下1上1单螺纹', 34],
      ['手掌', 40, '全部下针', 34],
      ['顶部', 8, '每圈两侧各减2针', ''],
      ['拇指', 15, '全部下针', 12],
    ],
  },
  hat: {
    name: '帽子',
    viewBox: '0 0 320 340',
    parts: [
      { name: '帽檐', aliases: ['brim', 'ribbing', '帽檐', '罗纹'], path: 'M60 270H260V320H60Z', box: [60, 270, 260, 320], dir: 'up', label: [268, 300] },
      { name: '帽身', aliases: ['body', '帽身', '主体'], path: 'M60 130H260V270H60Z', box: [60, 130, 260, 270], dir: 'up', label: [268, 205] },
      { name: '帽顶', aliases: ['crown', 'top', 'decrease', '帽顶', '收针'], path: 'M60 130Q60 30 160 30Q260 30 260 130Z', box: [60, 30, 260, 130], dir: 'up', label: [268, 70] },
    ],
    defaults: [
      ['帽檐', 20, '下2上2双螺纹', 96],
      ['帽身', 40, '全部下针', 96],
      ['帽顶', 16, '分8份，每份末尾左上二并一', ''],
    ],
  },
  scarf: {
    name: '围巾',
    viewBox: '0 0 200 460',
    parts: [
      { name: '围巾', aliases: ['scarf', 'body', '围巾', '主体'], path: 'M60 20H140V440H60Z', box: [60, 20, 140, 440], dir: 'down', label: [148, 230] },
    ],
    defaults: [['围巾', 300, '全部下针（起伏针）', 40]],
  },
  panel: {
    name: '长方形片',
    viewBox: '0 0 300 360',
    parts: [
      { name: '下摆', aliases: ['hem', 'ribbing', '下摆', '罗纹'], path: 'M50 290H250V330H50Z', box: [50, 290, 250, 330], dir: 'up', label: [256, 314] },
      { name: '主体', aliases: ['body', '主体', '衣身', '大身'], path: 'M50 30H250V290H50Z', box: [50, 30, 250, 290], dir: 'up', label: [256, 160] },
    ],
    defaults: [
      ['下摆', 12, '下1上1单螺纹', 80],
      ['主体', 100, '正面下针，反面上针', 80],
    ],
  },
  none: {
    name: '不要图',
    viewBox: null,
    parts: [{ name: '全部', aliases: [], path: '', box: null, dir: 'down' }],
    defaults: [['全部', 20, '全部下针', '']],
  },
};

const SVGNS = 'http://www.w3.org/2000/svg';

function el(tag, attrs, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

// 把零件的外框按圈数切成一条一条
function sliceBox(box, dir, n) {
  const [x0, y0, x1, y1] = box;
  const out = [];
  for (let i = 0; i < n; i++) {
    if (dir === 'down') { const h = (y1 - y0) / n; out.push([x0, y0 + i * h, x1 - x0, h]); }
    else if (dir === 'up') { const h = (y1 - y0) / n; out.push([x0, y1 - (i + 1) * h, x1 - x0, h]); }
    else if (dir === 'right') { const w = (x1 - x0) / n; out.push([x0 + i * w, y0, w, y1 - y0]); }
    else { const w = (x1 - x0) / n; out.push([x1 - (i + 1) * w, y0, w, y1 - y0]); }
  }
  return out;
}

// 画图：返回一个 update(done) 函数，用来刷新高亮
function buildDiagram(container, shapeKey, rows) {
  container.innerHTML = '';
  const shape = (shapeKey && typeof shapeKey === 'object') ? shapeKey : (SHAPES[shapeKey] || SHAPES.none);
  const rects = new Array(rows.length);

  if (!shape.viewBox) return buildBars(container, rows);

  const svg = el('svg', { viewBox: shape.viewBox, class: 'diagram', role: 'img', 'aria-label': shape.name + '进度图' }, container);
  const vbw = +shape.viewBox.split(/\s+/)[2] || 400;
  const fs = Math.max(12, Math.round(vbw / 24));
  const defs = el('defs', {}, svg);
  const uid = 'c' + Math.random().toString(36).slice(2, 8);

  shape.parts.forEach((part, pi) => {
    const idx = [];
    rows.forEach((r, i) => { if (r.part === part.name) idx.push(i); });
    const cp = el('clipPath', { id: uid + pi }, defs);
    el('path', { d: part.path }, cp);
    const g = el('g', { 'clip-path': `url(#${uid}${pi})` }, svg);
    if (idx.length === 0) {
      el('path', { d: part.path, class: 'r-empty' }, g);
    } else {
      const thin = sliceBox(part.box, part.dir, idx.length);
      idx.forEach((ri, k) => {
        const [x, y, w, h] = thin[k];
        rects[ri] = el('rect', { x, y, width: w, height: h, class: 'r', 'data-p': pi % 3 }, g);
      });
    }
    el('path', { d: part.path, class: 'outline' }, svg);
    if (part.label) {
      const t = el('text', { x: part.label[0], y: part.label[1], class: 'plabel', 'font-size': fs }, svg);
      t.textContent = part.name;
    }
  });

  return function update(done) {
    rects.forEach((r, i) => {
      if (!r) return;
      r.classList.toggle('done', i < done);
      r.classList.toggle('cur', i === done);
    });
  };
}

// 没有形状的时候：每个零件一条进度条
function buildBars(container, rows) {
  const wrap = document.createElement('div');
  wrap.className = 'bars';
  container.appendChild(wrap);
  const groups = [];
  rows.forEach((r, i) => {
    let g = groups[groups.length - 1];
    if (!g || g.name !== r.part) { g = { name: r.part, idx: [] }; groups.push(g); }
    g.idx.push(i);
  });
  const cells = new Array(rows.length);
  groups.forEach((g, gi) => {
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `<div class="bar-name">${esc(g.name || '全部')}</div>`;
    const bar = document.createElement('div');
    bar.className = 'bar';
    g.idx.forEach(i => {
      const c = document.createElement('span');
      c.dataset.p = gi % 3;
      bar.appendChild(c);
      cells[i] = c;
    });
    row.appendChild(bar);
    wrap.appendChild(row);
  });
  return function update(done) {
    cells.forEach((c, i) => {
      c.classList.toggle('done', i < done);
      c.classList.toggle('cur', i === done);
    });
  };
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- 我的模型 ----------
// 用户存的形状放在 data.models，注册进 SHAPES，key 是 "m:<id>"
function registerModels() {
  Object.keys(SHAPES).forEach(k => { if (k.startsWith('m:')) delete SHAPES[k]; });
  ((typeof data !== 'undefined' && data.models) || []).forEach(m => {
    SHAPES['m:' + m.id] = { name: m.name, viewBox: m.viewBox, parts: m.parts, defaults: [], mine: true };
  });
}

// 根据零件外框算 viewBox，顺便放好零件名字
function fitShape(parts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  parts.forEach(p => { x0 = Math.min(x0, p.box[0]); y0 = Math.min(y0, p.box[1]); x1 = Math.max(x1, p.box[2]); y1 = Math.max(y1, p.box[3]); });
  const cx = (x0 + x1) / 2;
  parts.forEach(p => {
    const right = (p.box[0] + p.box[2]) / 2 >= cx;
    p.label = right ? [p.box[2] + 6, (p.box[1] + p.box[3]) / 2 + 5] : [p.box[0] - 6 - p.name.length * 15, (p.box[1] + p.box[3]) / 2 + 5];
  });
  const pad = 10, labelW = 90;
  return `${x0 - labelW} ${y0 - pad} ${x1 - x0 + labelW * 2} ${y1 - y0 + pad * 2}`;
}
