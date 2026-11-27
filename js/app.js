// ---------- 存储 ----------
const KEY = 'babyknitter.v1';
let data = load();
if (!data.models) data.models = [];

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { projects: [] }; }
  catch { return { projects: [] }; }
}
function localSave() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { console.warn(e); }
}
function save() {
  localSave();
  if (typeof Cloud !== 'undefined') Cloud.schedulePush();
}
const shapeOf = p => p.customShape || p.shape;
async function getImg(id) {
  let u = await IMG.get(id).catch(() => null);
  if (!u && typeof Cloud !== 'undefined') u = await Cloud.fetchImage(id);
  return u;
}
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

// ---------- 页面切换 ----------
let wakeLock = null;
function show(id) {
  $$('.view').forEach(v => v.hidden = v.id !== id);
  window.scrollTo(0, 0);
  if (id === 'knit') requestWake(); else releaseWake();
  if (id === 'home') renderHome();
}
$$('[data-go]').forEach(b => b.addEventListener('click', () => show(b.dataset.go)));

// ---------- 首页 ----------
function renderHome() {
  const list = $('#projectList');
  list.innerHTML = '';
  const ps = [...data.projects].sort((a, b) => (b.updated || 0) - (a.updated || 0));
  $('#emptyHome').hidden = ps.length > 0;
  ps.forEach(p => {
    const c = document.createElement('button');
    c.className = 'pcard';
    const meta = p.counter
      ? `已织 ${p.done} 行${p.target ? ' / ' + p.target : ''}`
      : (p.done >= p.rows.length ? '织完啦' : (p.rows[p.done].step ? `步骤：${p.rows[p.done].text}` : `第 ${roundNo(p.rows, p.done)} / ${roundCount(p.rows)} 圈 · ${p.rows[p.done].part || ''}`));
    c.innerHTML = `<div class="thumb"></div><h3>${esc(p.name)}</h3><div class="meta">${esc(meta)}</div>`;
    if (!p.counter) {
      const up = buildDiagram(c.querySelector('.thumb'), shapeOf(p), p.rows);
      up(p.done);
    } else {
      const th = c.querySelector('.thumb');
      th.innerHTML = `<div style="font-size:48px;font-weight:700;color:var(--accent)">${p.done}</div>`;
      if (p.images && p.images[0]) getImg(p.images[0]).then(u => { if (u) th.innerHTML = `<img src="${u}" alt="" style="max-height:120px;max-width:100%;border-radius:8px">`; }).catch(() => {});
    }
    c.addEventListener('click', () => openKnit(p.id));
    list.appendChild(c);
  });
}

$('#exportBtn').addEventListener('click', async () => {
  const images = {};
  for (const p of data.projects) for (const id of (p.images || [])) {
    try { const u = await IMG.get(id); if (u) images[id] = u; } catch {}
  }
  const blob = new Blob([JSON.stringify({ ...data, images })], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `babyknitter-备份-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});
$('#importFile').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    const ids = new Set(data.projects.map(p => p.id));
    let n = 0;
    for (const p of (d.projects || [])) {
      if (p) p.updated = Date.now();
      if (!p || !p.id || ids.has(p.id)) continue;
      for (const id of (p.images || [])) if (d.images && d.images[id]) await IMG.put(id, d.images[id]);
      data.projects.push(p); n++;
    }
    save(); renderHome();
    alert(`导入了 ${n} 个作品`);
  } catch { alert('这个文件读不了，确定是 babyknitter 导出的备份吗？'); }
  e.target.value = '';
});

// ---------- 新建作品 ----------
// 分段：plain = 连续几圈一样；group = 几圈一组重复几次
let cShape = 'sock', cSrc = 'ai', cSections = [], cImgs = [], cNotes = [], aiDone = false, cDirty = false;

$('#newBtn').addEventListener('click', () => {
  $('#fName').value = '';
  $('#pasteText').value = '';
  $('#pastePreview').innerHTML = '';
  $('#countTarget').value = '';
  $('#createError').textContent = '';
  ['#aiStatus', '#aiStatus2'].forEach(x => { $(x).textContent = ''; $(x).classList.remove('err'); });
  $('#aiNotes').innerHTML = '';
  cImgs = []; cNotes = []; aiDone = false; cDirty = false;
  renderCThumbs();
  delete SHAPES.ai;
  SHAPES.none.parts = [{ name: '全部', aliases: [], path: '', box: null, dir: 'down' }];
  setShape('sock');
  setSrc('ai');
  show('create');
});

function renderShapePicker() {
  const sel = $('#shapeSelect');
  const opt = (k, label) => `<option value="${esc(k)}"${k === cShape ? ' selected' : ''}>${esc(label)}</option>`;
  const keys = Object.keys(SHAPES);
  sel.innerHTML =
    (SHAPES.ai ? `<optgroup label="这次 AI 画的">${opt('ai', SHAPES.ai.name)}</optgroup>` : '') +
    (keys.some(k => k.startsWith('m:')) ? `<optgroup label="我的模型">${keys.filter(k => k.startsWith('m:')).map(k => opt(k, SHAPES[k].name)).join('')}</optgroup>` : '') +
    `<optgroup label="内置">${keys.filter(k => !k.startsWith('m:') && k !== 'ai' && k !== 'none').map(k => opt(k, SHAPES[k].name)).join('')}</optgroup>` +
    opt('none', '不要图（只显示进度条）');
  const sh = SHAPES[cShape];
  $('#shapeName').textContent = cShape === 'ai' ? `AI 画的：${sh.name}` : (sh.mine ? `我的模型：${sh.name}` : sh.name);
  $('#saveModelRow').hidden = cShape !== 'ai';
  $('#shapeHint').textContent = cShape === 'ai' ? '觉得画得还行就存下来，以后读同一种东西的图解会直接用这个形状。' : '';
  $('#shapeSelLabel').textContent = aiDone ? '不满意的话换一个' : '选一个模型';
  renderShapePreview();
}
function renderShapePreview() {
  const box = $('#shapePreview');
  if (!box) return;
  const rows = (cSrc === 'sections' || cSrc === 'ai') ? expandSections(cSections) : [];
  buildDiagram(box, SHAPES[cShape], rows)(-1);
}
$('#shapeSelect').addEventListener('change', e => setShape(e.target.value));
$('#saveModelBtn').addEventListener('click', () => saveModel(SHAPES.ai, true));

function saveModel(shape, fromCreate) {
  if (!shape || !shape.parts || !shape.viewBox) return;
  const name = prompt('给这个模型起个名字（比如：露指手套、毛衣、背心）', shape.name.replace(/^AI 画的形状$/, ''));
  if (!name || !name.trim()) return;
  const m = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: name.trim(), viewBox: shape.viewBox, parts: JSON.parse(JSON.stringify(shape.parts)), updated: Date.now() };
  (data.models = data.models || []).push(m);
  registerModels();
  save();
  if (fromCreate) setShape('m:' + m.id);
  alert(`存好了：「${m.name}」`);
}

// 管理我的模型
function renderModels() {
  const box = $('#modelsList');
  box.innerHTML = '';
  const ms = data.models || [];
  if (!ms.length) { box.innerHTML = '<p class="muted">还没有。AI 读完图解以后，在「示意图」那里点「存成我的模型」。</p>'; return; }
  ms.forEach(m => {
    const d = document.createElement('div');
    d.className = 'model-item';
    d.innerHTML = `<div class="model-thumb"></div><div class="model-name">${esc(m.name)}<div class="muted">${m.parts.map(p => esc(p.name)).join('、')}</div></div>`;
    buildDiagram(d.querySelector('.model-thumb'), SHAPES['m:' + m.id], [])(-1);
    const rn = document.createElement('button'); rn.className = 'link'; rn.textContent = '改名';
    rn.addEventListener('click', () => { const n = prompt('新名字', m.name); if (n && n.trim()) { m.name = n.trim(); m.updated = Date.now(); registerModels(); save(); renderModels(); } });
    const del = document.createElement('button'); del.className = 'link danger-link'; del.textContent = '删除';
    del.addEventListener('click', () => {
      if (!confirm(`删除模型「${m.name}」？已经在织的作品不受影响。`)) return;
      data.models = data.models.filter(x => x !== m);
      (data.deletedModels = data.deletedModels || {})[m.id] = Date.now();
      registerModels(); save(); renderModels();
    });
    d.appendChild(rn); d.appendChild(del);
    box.appendChild(d);
  });
}
$('#modelsBtn').addEventListener('click', () => { renderModels(); $('#modelsDialog').showModal(); });
$('#modelsClose').addEventListener('click', () => $('#modelsDialog').close());
function setShape(k) {
  cShape = k;
  const names = SHAPES[k].parts.map(p => p.name);
  if (!cDirty && !aiDone) {
    const defs = SHAPES[k].defaults.length ? SHAPES[k].defaults : SHAPES[k].parts.map(p => [p.name, 10, '全部下针', '']);
    cSections = defs.map(([part, count, text, sts]) => ({ type: 'plain', part, count, text, sts }));
  } else {
    cSections.forEach(s => { if (!names.includes(s.part)) s.part = names[0]; });
  }
  renderShapePicker();
  renderSections();
  fillPartSelect($('#gPart'));
  if (cSrc === 'paste') updatePreview();
}
function fillPartSelect(sel, value) {
  sel.innerHTML = SHAPES[cShape].parts.map(p => `<option${p.name === value ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
}

function setSrc(s) {
  cSrc = s;
  $$('#srcTabs button').forEach(b => b.classList.toggle('on', b.dataset.src === s));
  $$('.src').forEach(d => d.hidden = d.dataset.src !== s);
  const showSecs = s === 'sections' || (s === 'ai' && aiDone);
  $('#imgField').hidden = s !== 'ai';
  $('#saveProject').hidden = s === 'ai' && !aiDone;
  $('#aiRow').hidden = s !== 'ai';
  $('#aiStatus').hidden = s !== 'ai';
  $('#imgFieldLabel').textContent = s === 'ai' ? '图解截图（可以多张，一次最多读 8 张）' : '图解截图（可以不传，织的时候方便对照）';
  $('#shapeField').hidden = !(showSecs || s === 'paste');
  $('#secArea').hidden = !showSecs;
  $('#aiNotes').hidden = !(showSecs && $('#aiNotes').innerHTML);
  $('#secLabel').textContent = aiDone && showSecs ? 'AI 读出来的分段（哪里不对直接改）' : '分段';
  $('#secTotal').textContent = showSecs ? totalText() : '';
  renderShapePicker();
  if (s === 'paste') updatePreview();
}
$$('#srcTabs button').forEach(b => b.addEventListener('click', () => setSrc(b.dataset.src)));

// 分段 → 一圈一圈
function expandSections(secs) {
  const rows = [];
  secs.forEach((s, si) => {
    if (s.type === 'step') {
      rows.push({ part: s.part, text: s.text || '（没写做法）', sts: '', note: s.note || '', orig: '', sec: si, step: true });
      return;
    }
    if (s.type === 'group') {
      let run = s.start === '' || s.start == null || isNaN(+s.start) ? null : +s.start;
      const times = Math.min(Math.max(0, +s.times || 0), 500);
      for (let t = 0; t < times; t++) s.rows.forEach((r, j) => {
        if (run !== null) run += (+r.change || 0);
        rows.push({ part: s.part, text: r.text || '（没写做法）', sts: run === null ? '' : run, note: t === 0 && j === 0 ? (s.note || '') : '', orig: '', sec: si, g: [t, times, j, s.rows.length] });
      });
    } else {
      const n = Math.min(Math.max(0, +s.count || 0), 2000);
      for (let i = 0; i < n; i++) rows.push({ part: s.part, text: s.text || '（没写做法）', sts: s.sts === '' || s.sts == null ? '' : +s.sts, note: i === 0 ? (s.note || '') : '', orig: '', sec: si });
    }
  });
  return rows;
}
function totalText() {
  const rows = expandSections(cSections);
  const n = roundCount(rows), st = rows.length - n;
  return rows.length ? `一共 ${n} 圈${st ? `，另外 ${st} 个步骤` : ''}` : '';
}
function touched() { cDirty = true; $('#secTotal').textContent = totalText(); clearTimeout(touched.t); touched.t = setTimeout(renderShapePreview, 300); }

function partSelect(s) {
  const sel = document.createElement('select');
  fillPartSelect(sel, s.part);
  sel.addEventListener('change', () => { s.part = sel.value; touched(); });
  return sel;
}
function xBtn(label, fn) {
  const x = document.createElement('button');
  x.className = 'x'; x.textContent = '×'; x.setAttribute('aria-label', label);
  x.addEventListener('click', fn);
  return x;
}

function renderSections() {
  const box = $('#sectionList');
  box.innerHTML = cSections.some(x => x._open && x.type !== 'group') ? `<div class="sec-row head"><span>部位</span><span>圈数</span><span>做法</span><span>织完针数</span><span></span></div>` : '';
  cSections.forEach((s, i) => {
    const del = () => { cSections.splice(i, 1); touched(); renderSections(); };
    if (!s._open) {
      // 收起时只显示一行摘要，点一下展开修改
      const d = document.createElement('div');
      d.className = 'sec-sum' + (s.flag ? ' flag' : '');
      let txt;
      if (s.type === 'step') {
        txt = `<b>${esc(s.part)}</b> · <span class="step-tag">步骤</span><div class="sum-t">${esc(s.text)}</div>`;
      } else if (s.type === 'group') {
        const ch = s.rows.reduce((a, r) => a + (+r.change || 0), 0) * (+s.times || 0);
        const range = s.start !== '' && s.start != null && !isNaN(+s.start) ? ` · ${s.start}→${+s.start + ch}针` : '';
        txt = `<b>${esc(s.part)}</b> · ${s.rows.length}圈一组 × ${esc(s.times)}${range}<div class="sum-t">${s.rows.map(r => esc(r.text)).join(' / ')}</div>`;
      } else {
        txt = `<b>${esc(s.part)}</b> · ${esc(s.count)}圈${s.sts !== '' && s.sts != null ? ` · → ${esc(s.sts)}针` : ''}<div class="sum-t">${esc(s.text)}</div>`;
      }
      d.innerHTML = `<div class="sum-main"><span class="sum-n">${i + 1}</span><div>${txt}${s.note ? `<div class="sum-note">${esc(s.note)}</div>` : ''}</div><span class="sum-edit">改</span></div>`;
      d.addEventListener('click', () => { s._open = true; renderSections(); });
      box.appendChild(d);
      return;
    }
    const closeBtn = () => { const b = document.createElement('button'); b.className = 'link sec-close'; b.textContent = '收起'; b.addEventListener('click', () => { s._open = false; renderSections(); }); return b; };
    if (s.type === 'group') {
      const g = document.createElement('div');
      g.className = 'grp' + (s.flag ? ' flag' : '');
      const head = document.createElement('div');
      head.className = 'grp-head';
      head.appendChild(partSelect(s));
      head.insertAdjacentHTML('beforeend', `<span>下面 ${s.rows.length} 圈一组，重复</span><input type="number" min="1" class="g-times" value="${esc(s.times)}"><span>次，开始时</span><input type="number" class="g-start" placeholder="针数" value="${esc(s.start ?? '')}"><span>针</span>`);
      head.appendChild(closeBtn());
      head.appendChild(xBtn('删掉这组', del));
      head.querySelector('.g-times').addEventListener('input', e => { s.times = e.target.value; touched(); foot(); });
      head.querySelector('.g-start').addEventListener('input', e => { s.start = e.target.value; touched(); foot(); });
      g.appendChild(head);
      s.rows.forEach((r, j) => {
        const row = document.createElement('div');
        row.className = 'grp-row';
        row.innerHTML = `<span>${j + 1}</span><input class="t" value="${esc(r.text)}" placeholder="做法"><input class="c" type="number" value="${esc(r.change || 0)}" title="这圈加减几针（减针填负数）">`;
        row.querySelector('.t').addEventListener('input', e => { r.text = e.target.value; touched(); });
        row.querySelector('.c').addEventListener('input', e => { r.change = e.target.value; touched(); foot(); });
        row.appendChild(xBtn('删掉这圈', () => { if (s.rows.length > 1) { s.rows.splice(j, 1); touched(); renderSections(); } }));
        g.appendChild(row);
      });
      const f = document.createElement('div');
      f.className = 'grp-foot';
      g.appendChild(f);
      function foot() {
        const total = (+s.times || 0) * s.rows.length;
        const ch = s.rows.reduce((a, r) => a + (+r.change || 0), 0) * (+s.times || 0);
        f.innerHTML = `<span>共 ${total} 圈${s.start !== '' && s.start != null && !isNaN(+s.start) ? `，${s.start} 针 → ${+s.start + ch} 针` : ''}${s.note ? ' · ' + esc(s.note) : ''}</span><span><span class="muted">右边数字 = 这圈加减几针</span> <button class="link">＋ 组里加一圈</button></span>`;
        f.querySelector('.link').addEventListener('click', () => { s.rows.push({ text: '全部下针', change: 0 }); touched(); renderSections(); });
      }
      foot();
      box.appendChild(g);
      return;
    }
    if (s.type === 'step') {
      const row = document.createElement('div');
      row.className = 'step-row';
      row.appendChild(partSelect(s));
      row.insertAdjacentHTML('beforeend', `<span class="step-tag">步骤</span><input class="s-text" value="${esc(s.text)}" placeholder="比如：断线，穿过剩下的针拉紧">`);
      row.querySelector('.s-text').addEventListener('input', e => { s.text = e.target.value; touched(); });
      row.appendChild(xBtn('删掉这个步骤', del));
      box.appendChild(row);
      const cb = closeBtn(); cb.style.display = 'block'; cb.style.margin = '-2px 0 10px auto';
      box.appendChild(cb);
      return;
    }
    const row = document.createElement('div');
    row.className = 'sec-row' + (s.flag ? ' flag' : '');
    row.appendChild(partSelect(s));
    row.insertAdjacentHTML('beforeend', `
      <input type="number" min="1" value="${esc(s.count)}" class="s-count" aria-label="圈数">
      <input value="${esc(s.text)}" class="s-text" placeholder="做法" aria-label="做法" title="${esc(s.note || '')}">
      <input type="number" value="${esc(s.sts ?? '')}" class="s-sts" placeholder="针数" aria-label="织完针数">`);
    row.querySelector('.s-count').addEventListener('input', e => { s.count = e.target.value; touched(); });
    row.querySelector('.s-text').addEventListener('input', e => { s.text = e.target.value; touched(); });
    row.querySelector('.s-sts').addEventListener('input', e => { s.sts = e.target.value; touched(); });
    row.appendChild(xBtn('删掉这段', del));
    box.appendChild(row);
    const cb = closeBtn(); cb.style.display = 'block'; cb.style.margin = '-2px 0 10px auto';
    box.appendChild(cb);
    if (s.note) box.insertAdjacentHTML('beforeend', `<div class="hint ${s.flag ? 'warn' : ''}" style="margin:-4px 0 8px;font-size:13px;${s.flag ? 'color:var(--danger)' : ''}">↑ ${esc(s.note)}</div>`);
  });
  $('#secTotal').textContent = $('#secArea').hidden ? '' : totalText();
}
const lastPart = () => (cSections[cSections.length - 1] || {}).part || SHAPES[cShape].parts[0].name;
$('#addSection').addEventListener('click', () => {
  cSections.push({ type: 'plain', part: lastPart(), count: 10, text: '全部下针', sts: '', _open: true });
  touched(); renderSections();
});
$('#addStep').addEventListener('click', () => {
  cSections.push({ type: 'step', part: lastPart(), text: '', _open: true });
  touched(); renderSections();
});
$('#addGroup').addEventListener('click', () => {
  cSections.push({ type: 'group', _open: true, part: lastPart(), times: 4, start: '', rows: [{ text: '全部下针', change: 0 }, { text: '全部下针', change: 0 }, { text: '两侧各加1针', change: 2 }] });
  touched(); renderSections();
});

$('#openGen').addEventListener('click', () => { fillPartSelect($('#gPart'), lastPart()); $('#genBox').hidden = false; });
$('#genClose').addEventListener('click', () => $('#genBox').hidden = true);
$('#genAdd').addEventListener('click', () => {
  const start = +$('#gStart').value, every = Math.max(1, +$('#gEvery').value || 1), change = +$('#gChange').value, target = +$('#gTarget').value;
  if (!start || !change || !target || (target - start) / change <= 0) { alert('生成不了：检查一下起始针数、目标针数和每组加几针（减针要填负数）。'); return; }
  const first = $('#gWhere').value === 'first';
  const plain = $('#gPlain').value || '全部下针', chText = $('#gChangeText').value || '加减针';
  const rows = Array.from({ length: every }, (_, i) => (first ? i === 0 : i === every - 1) ? { text: chText, change } : { text: plain, change: 0 });
  cSections.push({ type: 'group', part: $('#gPart').value, times: Math.ceil((target - start) / change), start, rows });
  $('#genBox').hidden = true;
  touched(); renderSections();
});

// 粘贴解析
function partOfFactory(shapeKey) {
  const shape = SHAPES[shapeKey];
  return line => {
    const bracketed = /^\s*(?:#+|【|\[|<)|[】\]>：:]\s*$/.test(line);
    const clean = line.replace(/[#【】\[\]<>：:*\s]/g, '').toLowerCase();
    if (!clean) return null;
    if (shapeKey === 'none') return bracketed ? line.replace(/[#【】\[\]<>：:*]/g, '').trim() : null;
    for (const p of shape.parts) {
      if (p.aliases.some(a => clean === a.toLowerCase() || (clean.length <= 12 && clean.includes(a.toLowerCase())))) return p.name;
    }
    return null;
  };
}
function parseCurrentPaste() {
  return parsePattern($('#pasteText').value, {
    partOf: partOfFactory(cShape),
    defaultPart: SHAPES[cShape].parts[0].name,
    doTranslate: $('#doTranslate').checked,
  });
}
let pvTimer;
function updatePreview() {
  clearTimeout(pvTimer);
  pvTimer = setTimeout(() => {
    const box = $('#pastePreview');
    if (!$('#pasteText').value.trim()) { box.innerHTML = ''; return; }
    const r = parseCurrentPaste();
    const byPart = {};
    r.rows.forEach(x => byPart[x.part] = (byPart[x.part] || 0) + 1);
    const summary = Object.entries(byPart).map(([k, v]) => `${k} ${v}圈`).join('，');
    box.innerHTML = `
      <div class="pv-head">认出了 ${r.rows.length} 圈${summary ? '：' + esc(summary) : ''}${r.notes.length ? `，另外 ${r.notes.length} 行当作说明` : ''}</div>
      ${r.warnings.map(w => `<div class="pv-warn">⚠ ${esc(w)}</div>`).join('')}
      ${r.rows.length ? `<ol>${r.rows.map((x, i) => `<li><b>${i + 1} · ${esc(x.part)}</b><span>${esc(x.text)}${x.sts !== '' ? ` → ${x.sts}针` : ''}</span></li>`).join('')}</ol>` : '<div class="pv-warn">一圈都没认出来。每行开头要有圈数，比如「第1圈：」或「Rnd 1:」。格式太乱的话点上面「让 AI 整理成分段」。</div>'}`;
  }, 200);
}
$('#pasteText').addEventListener('input', updatePreview);
$('#doTranslate').addEventListener('change', updatePreview);

$('#saveProject').addEventListener('click', async () => {
  const err = $('#createError');
  err.textContent = '';
  const name = $('#fName').value.trim() || SHAPES[cShape].name;
  const p = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, shape: cShape, rows: [], done: 0, notes: [], created: Date.now(), updated: Date.now() };

  if (cSrc === 'count') {
    p.counter = true;
    p.target = +$('#countTarget').value || 0;
  } else if (cSrc === 'paste') {
    const r = parseCurrentPaste();
    if (!r.rows.length) { err.textContent = '还没认出任何一圈，看看上面的提示。'; return; }
    p.rows = r.rows; p.notes = r.notes;
  } else {
    if (cSrc === 'ai' && !aiDone) { err.textContent = cImgs.length ? '先点「让 AI 读截图」。不想用 AI 的话，选「自己分段填」或「只计数」。' : '先传截图。'; return; }
    p.rows = expandSections(cSections);
    p.notes = cNotes.slice();
    if (!p.rows.length) { err.textContent = '至少要有一段，圈数大于 0。'; return; }
  }
  if ((cShape === 'ai' || cShape.startsWith('m:')) && SHAPES[cShape] && !p.counter) p.customShape = JSON.parse(JSON.stringify(SHAPES[cShape]));
  p.images = [];
  try {
    for (const url of cImgs) {
      const id = p.id + '-' + Math.random().toString(36).slice(2, 8);
      await IMG.put(id, url);
      p.images.push(id);
      if (typeof Cloud !== 'undefined') Cloud.uploadImage(id, url);
    }
  } catch (e) { err.textContent = '截图没存上（可能是浏览器空间不够）。'; return; }
  data.projects.push(p);
  save();
  openKnit(p.id);
});

// ---------- 编织模式 ----------
let cur = null, updateDiagram = () => {};

function openKnit(id) {
  cur = data.projects.find(p => p.id === id);
  if (!cur) return show('home');
  $('#kName').textContent = cur.name;
  const stage = $('#stage');
  stage.classList.toggle('counter-only', !!cur.counter);
  $('#diagram').hidden = !!cur.counter;
  $('#allRowsBox').hidden = !!cur.counter;
  if (!cur.counter) {
    updateDiagram = buildDiagram($('#diagram'), shapeOf(cur), cur.rows);
    renderAllRows();
  }
  show('knit');
  renderKnit();
  renderKImgs();
}

// 把一圈一圈按段分好：有 sec 用 sec，没有就把连续做法一样的圈合成一段
function sectionsOf(rows) {
  const out = [];
  rows.forEach((r, i) => {
    const key = r.sec != null ? 's' + r.sec : 'p' + r.part + '|' + r.text;
    const last = out[out.length - 1];
    if (last && last.key === key) last.end = i;
    else out.push({ key, start: i, end: i, part: r.part, group: r.g ? { times: r.g[1], len: r.g[3] } : null });
  });
  out.forEach(sec => {
    const r = rows[sec.start];
    const n = sec.end - sec.start + 1;
    sec.step = !!r.step;
    sec.label = r.step ? `步骤：${r.text}` : sec.group ? `${sec.group.len} 圈一组 × ${sec.group.times}` : (n > 1 ? `${n} 圈：${r.text}` : r.text);
  });
  return out;
}
let knitSecs = [];

function renderKnit() {
  const p = cur;
  const card = $('#card');
  if (p.counter) {
    $('#kSec').textContent = '只计数';
    $('#kNum').textContent = p.done;
    $('#kText').textContent = p.target ? `目标 ${p.target} 行` : '';
    ['#kGrp', '#kOrig', '#kNote', '#kSts', '#kNext'].forEach(s => $(s).textContent = '');
    $('#kBar').style.width = p.target ? Math.min(100, p.done / p.target * 100) + '%' : '0';
    $('#kTotal').textContent = p.target && p.done >= p.target ? '到目标啦' : '';
    card.classList.remove('changed');
    return;
  }
  const N = p.rows.length;
  const i = Math.min(p.done, N);
  updateDiagram(i);
  updateAllRows();
  $('#kBar').style.width = (i / N * 100) + '%';
  const NR = roundCount(p.rows);
  $('#kTotal').textContent = `总共第 ${Math.min(roundNo(p.rows, i) + (p.rows[i] && p.rows[i].step ? 1 : 0), NR)} / ${NR} 圈`;
  if (i >= N) {
    $('#kSec').textContent = '';
    $('#kNum').textContent = '织完啦';
    $('#kText').textContent = '全部圈都完成了。';
    $('#kTotal').textContent = `一共 ${NR} 圈`;
    ['#kGrp', '#kOrig', '#kNote', '#kSts', '#kNext'].forEach(s => $(s).textContent = '');
    card.classList.remove('changed');
    return;
  }
  const r = p.rows[i];
  const si = knitSecs.findIndex(x => i >= x.start && i <= x.end);
  const sec = knitSecs[si];
  const inSec = i - sec.start + 1, secLen = sec.end - sec.start + 1;
  $('#kSec').textContent = `${r.part} · 第 ${si + 1} / ${knitSecs.length} 段`;
  $('#kNum').textContent = r.step ? '步骤' : `这段第 ${inSec} / ${secLen} 圈`;
  card.classList.toggle('step', !!r.step);
  $('#doneBtn').textContent = r.step ? '做完了 ✓' : '织完这圈 ✓';
  $('#kGrp').textContent = r.g ? `第 ${r.g[0] + 1} / ${r.g[1]} 组 · 组里第 ${r.g[2] + 1} / ${r.g[3]} 圈` : '';
  const prev = p.rows[i - 1];
  // 组里每圈本来就轮流变，只在加减针那圈或者新的一段开始时提醒
  const changed = !r.step && i > 0 && prev.text !== r.text &&
    (!r.g || (r.g[0] === 0 && r.g[2] === 0) || (r.sts !== '' && prev.sts !== '' && r.sts !== prev.sts));
  card.classList.toggle('changed', changed);
  $('#kText').textContent = r.text;
  $('#kOrig').textContent = r.orig ? '原文：' + r.orig : '';
  $('#kNote').textContent = r.note || '';
  $('#kSts').textContent = r.sts !== '' && r.sts != null ? `织完应该是 ${r.sts} 针` : '';
  const nx = p.rows[i + 1];
  let nextTxt = r.step ? '做完点一下继续' : '这是最后一圈';
  if (nx) {
    if (nx.step) nextTxt = `${r.step ? '下一个' : '织完这圈以后'}步骤：${nx.text}`;
    else if (i === sec.end) nextTxt = `这段最后一圈。下一段：${nx.part !== r.part ? '【' + nx.part + '】' : ''}${knitSecs[si + 1].label}`;
    else nextTxt = `下一圈：${nx.text}`;
  }
  $('#kNext').textContent = nextTxt;
}

function step(d) {
  if (!cur) return;
  const max = cur.counter ? Infinity : cur.rows.length;
  const nd = Math.max(0, Math.min(max, cur.done + d));
  if (nd === cur.done) return;
  cur.done = nd;
  cur.updated = Date.now();
  save();
  renderKnit();
  if (!wakeLock) requestWake();
  if (d > 0) {
    const f = $('#flash');
    f.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on')));
    if (navigator.vibrate) navigator.vibrate(20);
  }
}

$('#stage').addEventListener('click', e => {
  if (e.target.closest('#undoBtn')) return;
  step(1);
});
$('#undoBtn').addEventListener('click', e => { e.stopPropagation(); step(-1); });

document.addEventListener('keydown', e => {
  if ($('#knit').hidden || $('#rowDialog').open || $('#imgDialog').open) return;
  if (e.target.closest && e.target.closest('input, textarea, select')) return;
  if (e.repeat) { e.preventDefault(); return; }
  const fwd = [' ', 'Enter', 'ArrowRight', 'ArrowDown', 'PageDown', 'MediaTrackNext'];
  const back = ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'MediaTrackPrevious'];
  if (fwd.includes(e.key)) { e.preventDefault(); step(1); }
  else if (back.includes(e.key)) { e.preventDefault(); step(-1); }
});

// 全部圈列表（按段，点开看每一圈）
let rowEls = [], secEls = [];
function renderAllRows() {
  const box = $('#allRows');
  box.innerHTML = '';
  rowEls = []; secEls = [];
  knitSecs = sectionsOf(cur.rows);
  if (cur.notes && cur.notes.length) {
    const n = document.createElement('div');
    n.className = 'muted';
    n.style.margin = '10px 0';
    n.innerHTML = cur.notes.map(x => esc(x)).join('<br>');
    box.appendChild(n);
  }
  let lastPart = null;
  knitSecs.forEach((sec, si) => {
    if (sec.part !== lastPart) {
      const h = document.createElement('div');
      h.className = 'ar-part';
      h.textContent = sec.part;
      box.appendChild(h);
      lastPart = sec.part;
    }
    const d = document.createElement('details');
    d.className = 'ar-sec';
    const n = sec.end - sec.start + 1;
    d.innerHTML = `<summary><span class="n">第${si + 1}段</span><span class="t">${esc(sec.label)}</span><span class="s"></span></summary>`;
    for (let i = sec.start; i <= sec.end; i++) {
      const r = cur.rows[i];
      const row = document.createElement('div');
      row.className = 'ar-row';
      const pos = r.step ? '步骤' : r.g ? `组${r.g[0] + 1}·${r.g[2] + 1}` : `${i - sec.start + 1}/${n}`;
      row.innerHTML = `<span class="n">${pos}</span><span class="t">${esc(r.text)}</span><span class="s">${r.sts !== '' && r.sts != null ? '→ ' + r.sts + '针' : ''}</span>`;
      row.addEventListener('click', () => openRowDialog(i));
      d.appendChild(row);
      rowEls[i] = row;
    }
    box.appendChild(d);
    secEls.push({ el: d, sec, prog: d.querySelector('summary .s') });
  });
}
function updateAllRows() {
  rowEls.forEach((d, i) => {
    d.classList.toggle('done', i < cur.done);
    d.classList.toggle('cur', i === cur.done);
  });
  secEls.forEach(({ el, sec, prog }) => {
    const n = sec.end - sec.start + 1;
    const k = Math.max(0, Math.min(n, cur.done - sec.start));
    prog.textContent = k >= n ? '✓ 织完' : `${k} / ${n}`;
    el.classList.toggle('done', k >= n);
    const isCur = cur.done >= sec.start && cur.done <= sec.end;
    el.classList.toggle('cur', isCur);
    if (isCur && !el.dataset.seen) { el.open = true; el.dataset.seen = '1'; el.dataset.auto = '1'; }
    if (!isCur && el.dataset.auto) { el.open = false; delete el.dataset.auto; }
  });
}

let editing = -1;
function openRowDialog(i) {
  editing = i;
  const r = cur.rows[i];
  $('#rdTitle').textContent = `总第 ${i + 1} 圈 · ${r.part}`;
  $('#rdText').value = r.text;
  $('#rdSts').value = r.sts ?? '';
  $('#rowDialog').showModal();
}
$('#rowDialog').addEventListener('close', () => {
  const v = $('#rowDialog').returnValue;
  if (editing < 0) return;
  if (v === 'save') {
    const r = cur.rows[editing];
    r.text = $('#rdText').value.trim() || r.text;
    r.sts = $('#rdSts').value === '' ? '' : +$('#rdSts').value;
    renderAllRows();
  } else if (v === 'jump') {
    cur.done = editing;
  }
  editing = -1;
  cur.updated = Date.now();
  save();
  renderKnit();
});

// 菜单
$('#menuBtn').addEventListener('click', e => { e.stopPropagation(); $('#menu').hidden = !$('#menu').hidden; });
document.addEventListener('click', () => $('#menu').hidden = true);
$('#mReset').addEventListener('click', () => {
  if (confirm('确定把进度清零吗？')) { cur.done = 0; cur.updated = Date.now(); save(); renderKnit(); }
});
$('#mRename').addEventListener('click', () => {
  const n = prompt('新名字', cur.name);
  if (n && n.trim()) { cur.name = n.trim(); cur.updated = Date.now(); $('#kName').textContent = cur.name; save(); }
});
$('#mModel').addEventListener('click', () => {
  const sh = cur.customShape || SHAPES[cur.shape];
  if (!sh || !sh.viewBox) { alert('这个作品没有示意图形状。'); return; }
  saveModel(sh, false);
});
$('#mDelete').addEventListener('click', () => {
  if (confirm(`确定删除「${cur.name}」吗？删掉就找不回来了。`)) {
    (cur.images || []).forEach(id => IMG.del(id).catch(() => {}));
    Cloud.deleteImages(cur.images || []);
    (data.deleted = data.deleted || {})[cur.id] = Date.now();
    data.projects = data.projects.filter(p => p !== cur);
    cur = null; save(); show('home');
  }
});

// 屏幕常亮
async function requestWake() {
  const st = $('#wakeStatus');
  if (!('wakeLock' in navigator)) { st.textContent = '这个浏览器不支持屏幕常亮，可能会自动锁屏。'; return; }
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    st.textContent = '屏幕会一直亮着。';
    wakeLock.addEventListener('release', () => { if (!$('#knit').hidden) st.textContent = '屏幕常亮已关闭，点一下页面会重新打开。'; });
  } catch { st.textContent = '没能保持屏幕常亮。'; }
}
function releaseWake() { if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !$('#knit').hidden) requestWake(); });
// ---------- 截图 ----------
async function addImages(files, target) {
  const list = Array.from(files).filter(f => f.type.startsWith('image/'));
  for (const f of list) {
    try {
      const url = await compressImage(f);
      if (target === 'create') cImgs.push(url);
      else if (cur) {
        const id = cur.id + '-' + Math.random().toString(36).slice(2, 8);
        await IMG.put(id, url);
        (cur.images = cur.images || []).push(id);
        cur.updated = Date.now();
        save();
        Cloud.uploadImage(id, url);
      }
    } catch { alert('有一张图片读不了'); }
  }
  if (target === 'create') renderCThumbs(); else renderKImgs();
}

function thumb(url, onOpen, onDel) {
  const d = document.createElement('div');
  d.className = 'thumb-item';
  d.innerHTML = `<img src="${url}" alt="图解截图"><button class="x" aria-label="删掉这张">×</button>`;
  d.addEventListener('click', onOpen);
  d.querySelector('.x').addEventListener('click', e => { e.stopPropagation(); onDel(); });
  return d;
}

function renderCThumbs() {
  const box = $('#cImgs');
  box.innerHTML = '';
  cImgs.forEach((u, i) => box.appendChild(thumb(u, () => openViewer(cImgs, i), () => { cImgs.splice(i, 1); renderCThumbs(); })));
}

let kUrls = [];
async function renderKImgs() {
  if (!cur) return;
  const ids = cur.images || [];
  kUrls = [];
  for (const id of ids) { try { kUrls.push(await getImg(id)); } catch { kUrls.push(null); } }
  const box = $('#kImgs');
  box.innerHTML = '';
  ids.forEach((id, i) => {
    if (!kUrls[i]) return;
    box.appendChild(thumb(kUrls[i], () => openViewer(kUrls.filter(Boolean), kUrls.filter(Boolean).indexOf(kUrls[i])), () => {
      if (!confirm('删掉这张截图？')) return;
      IMG.del(id).catch(() => {});
      Cloud.deleteImages([id]);
      cur.images.splice(i, 1);
      cur.updated = Date.now();
      save();
      renderKImgs();
    }));
  });
  $('#imgSummary').textContent = ids.length ? `图解截图（${ids.length} 张，点开看大图）` : '图解截图（还没有，可以加）';
  if (!ids.length) $('#imgBox').open = false;
}

$('#cImgInput').addEventListener('change', e => { addImages(e.target.files, 'create'); e.target.value = ''; });
$('#kImgInput').addEventListener('change', e => { addImages(e.target.files, 'knit'); e.target.value = ''; });
const drop = $('#cDrop');
['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => addImages(e.dataTransfer.files, 'create'));
document.addEventListener('paste', e => {
  const files = Array.from(e.clipboardData?.files || []);
  if (!files.length) return;
  if (!$('#create').hidden) { e.preventDefault(); addImages(files, 'create'); }
  else if (!$('#knit').hidden) { e.preventDefault(); addImages(files, 'knit'); $('#imgBox').open = true; }
});

// 看大图
let ivList = [], ivIdx = 0;
function openViewer(list, i) {
  ivList = list; ivIdx = Math.max(0, i);
  $('#ivWrap').classList.remove('zoom');
  $('#ivZoom').textContent = '放大';
  showIv();
  $('#imgDialog').showModal();
}
function showIv() {
  $('#ivImg').src = ivList[ivIdx] || '';
  $('#ivCount').textContent = `${ivIdx + 1} / ${ivList.length}`;
  $('#ivWrap').scrollTop = 0;
}
$('#ivPrev').addEventListener('click', () => { if (ivIdx > 0) { ivIdx--; showIv(); } });
$('#ivNext').addEventListener('click', () => { if (ivIdx < ivList.length - 1) { ivIdx++; showIv(); } });
$('#ivClose').addEventListener('click', () => $('#imgDialog').close());
$('#ivZoom').addEventListener('click', () => {
  const z = $('#ivWrap').classList.toggle('zoom');
  $('#ivZoom').textContent = z ? '缩小' : '放大';
});
$('#imgDialog').addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft') $('#ivPrev').click();
  if (e.key === 'ArrowRight') $('#ivNext').click();
});

show('home');
$$('.ai-btn').forEach(b => b.addEventListener('click', runAI));
Cloud.init();
registerModels();
