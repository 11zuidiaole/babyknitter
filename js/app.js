// ---------- 存储 ----------
const KEY = 'babyknitter.v1';
let data = load();

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { projects: [] }; }
  catch { return { projects: [] }; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { console.warn(e); }
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
    const total = p.counter ? (p.target || '') : p.rows.length;
    const meta = p.counter
      ? `已织 ${p.done} 行${p.target ? ' / ' + p.target : ''}`
      : (p.done >= total ? '织完啦' : `第 ${p.done + 1} / ${total} 圈 · ${p.rows[p.done]?.part || ''}`);
    c.innerHTML = `<div class="thumb"></div><h3>${esc(p.name)}</h3><div class="meta">${esc(meta)}</div>`;
    if (!p.counter) {
      const up = buildDiagram(c.querySelector('.thumb'), p.shape, p.rows);
      up(p.done);
    } else {
      c.querySelector('.thumb').innerHTML = `<div style="font-size:48px;font-weight:700;color:var(--accent)">${p.done}</div>`;
    }
    c.addEventListener('click', () => openKnit(p.id));
    list.appendChild(c);
  });
}

$('#exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
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
    (d.projects || []).forEach(p => { if (p && p.id && !ids.has(p.id)) { data.projects.push(p); n++; } });
    save(); renderHome();
    alert(`导入了 ${n} 个作品`);
  } catch { alert('这个文件读不了，确定是 babyknitter 导出的备份吗？'); }
  e.target.value = '';
});

// ---------- 新建作品 ----------
let cShape = 'sock', cSrc = 'sections', cSections = [];

$('#newBtn').addEventListener('click', () => {
  $('#fName').value = '';
  $('#pasteText').value = '';
  $('#pastePreview').innerHTML = '';
  $('#countTarget').value = '';
  $('#createError').textContent = '';
  setShape('sock');
  setSrc('sections');
  show('create');
});

function renderShapePicker() {
  const box = $('#shapePicker');
  box.innerHTML = '';
  Object.entries(SHAPES).forEach(([k, s]) => {
    const b = document.createElement('button');
    b.textContent = s.name;
    b.className = k === cShape ? 'on' : '';
    b.addEventListener('click', () => setShape(k));
    box.appendChild(b);
  });
}
function setShape(k) {
  cShape = k;
  cSections = SHAPES[k].defaults.map(([part, count, text, sts]) => ({ type: 'plain', part, count, text, sts }));
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
  if (s === 'paste') updatePreview();
}
$$('#srcTabs button').forEach(b => b.addEventListener('click', () => setSrc(b.dataset.src)));

function renderSections() {
  const box = $('#sectionList');
  box.innerHTML = `<div class="sec-row head"><span>部位</span><span>圈数</span><span>做法</span><span>织完针数</span><span></span></div>`;
  cSections.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'sec-row' + (s.type === 'gen' ? ' gen-row' : '');
    const sel = document.createElement('select');
    fillPartSelect(sel, s.part);
    sel.addEventListener('change', () => s.part = sel.value);
    row.appendChild(sel);
    if (s.type === 'gen') {
      row.insertAdjacentHTML('beforeend', `<span class="muted">${s.rows.length}圈</span><span class="gen-tag">${esc(s.label)}</span>`);
    } else {
      row.insertAdjacentHTML('beforeend', `
        <input type="number" min="1" value="${esc(s.count)}" class="s-count" aria-label="圈数">
        <input value="${esc(s.text)}" class="s-text" placeholder="做法" aria-label="做法">
        <input type="number" value="${esc(s.sts)}" class="s-sts" placeholder="针数" aria-label="织完针数">`);
      row.querySelector('.s-count').addEventListener('input', e => s.count = e.target.value);
      row.querySelector('.s-text').addEventListener('input', e => s.text = e.target.value);
      row.querySelector('.s-sts').addEventListener('input', e => s.sts = e.target.value);
    }
    const x = document.createElement('button');
    x.className = 'x'; x.textContent = '×'; x.setAttribute('aria-label', '删掉这段');
    x.addEventListener('click', () => { cSections.splice(i, 1); renderSections(); });
    row.appendChild(x);
    box.appendChild(row);
  });
}
$('#addSection').addEventListener('click', () => {
  const last = cSections[cSections.length - 1];
  cSections.push({ type: 'plain', part: last ? last.part : SHAPES[cShape].parts[0].name, count: 10, text: '全部下针', sts: '' });
  renderSections();
});

$('#openGen').addEventListener('click', () => { fillPartSelect($('#gPart'), cSections[cSections.length - 1]?.part); $('#genBox').hidden = false; });
$('#genClose').addEventListener('click', () => $('#genBox').hidden = true);
$('#genAdd').addEventListener('click', () => {
  const opt = {
    start: $('#gStart').value, every: $('#gEvery').value, change: $('#gChange').value, target: $('#gTarget').value,
    plainText: $('#gPlain').value || '全部下针', changeText: $('#gChangeText').value || '加减针',
    changeFirst: $('#gWhere').value === 'first',
  };
  const rows = generateShaping(opt);
  if (!rows.length) { alert('生成不了：检查一下起始针数、目标针数和每组加几针（减针要填负数）。'); return; }
  const verb = +opt.change > 0 ? '加' : '减';
  cSections.push({
    type: 'gen', part: $('#gPart').value, rows,
    label: `${opt.start}针 → ${opt.target}针，每${opt.every}圈${verb}${Math.abs(opt.change)}针`,
  });
  $('#genBox').hidden = true;
  renderSections();
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
      ${r.rows.length ? `<ol>${r.rows.map((x, i) => `<li><b>${i + 1} · ${esc(x.part)}</b><span>${esc(x.text)}${x.sts !== '' ? ` → ${x.sts}针` : ''}</span></li>`).join('')}</ol>` : '<div class="pv-warn">一圈都没认出来。每行开头要有圈数，比如「第1圈：」或「Rnd 1:」。</div>'}`;
  }, 200);
}
$('#pasteText').addEventListener('input', updatePreview);
$('#doTranslate').addEventListener('change', updatePreview);

$('#saveProject').addEventListener('click', () => {
  const err = $('#createError');
  err.textContent = '';
  const name = $('#fName').value.trim() || SHAPES[cShape].name;
  const p = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, shape: cShape, rows: [], done: 0, notes: [], created: Date.now(), updated: Date.now() };

  if (cSrc === 'count') {
    p.counter = true;
    p.target = +$('#countTarget').value || 0;
  } else if (cSrc === 'paste') {
    const r = parseCurrentPaste();
    if (!r.rows.length) { err.textContent = '还没认出任何一圈，看看下面的提示。'; return; }
    p.rows = r.rows; p.notes = r.notes;
  } else {
    for (const s of cSections) {
      if (s.type === 'gen') { s.rows.forEach(r => p.rows.push({ part: s.part, text: r.text, sts: r.sts, note: '', orig: '' })); continue; }
      const n = Math.min(+s.count || 0, 2000);
      for (let i = 0; i < n; i++) p.rows.push({ part: s.part, text: s.text || '（没写做法）', sts: i === n - 1 ? (s.sts === '' ? '' : +s.sts) : (s.sts === '' ? '' : +s.sts), note: '', orig: '' });
    }
    if (!p.rows.length) { err.textContent = '至少要有一段，圈数大于 0。'; return; }
  }
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
    updateDiagram = buildDiagram($('#diagram'), cur.shape, cur.rows);
    renderAllRows();
  }
  show('knit');
  renderKnit();
}

function renderKnit() {
  const p = cur;
  const card = $('#card');
  if (p.counter) {
    $('#kSec').textContent = '只计数';
    $('#kNum').textContent = p.done;
    $('#kText').textContent = p.target ? `目标 ${p.target} 行` : '';
    ['#kOrig', '#kNote', '#kSts', '#kNext'].forEach(s => $(s).textContent = '');
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
  $('#kTotal').textContent = `已织 ${i} / ${N} 圈`;
  if (i >= N) {
    $('#kSec').textContent = '';
    $('#kNum').textContent = '织完啦';
    $('#kText').textContent = '全部圈都完成了。';
    ['#kOrig', '#kNote', '#kSts', '#kNext'].forEach(s => $(s).textContent = '');
    card.classList.remove('changed');
    return;
  }
  const r = p.rows[i];
  let k = 0, tot = 0;
  p.rows.forEach((x, j) => { if (x.part === r.part) { tot++; if (j <= i) k++; } });
  $('#kSec').textContent = `${r.part} · 这部分第 ${k} / ${tot} 圈`;
  $('#kNum').textContent = `第 ${i + 1} 圈`;
  const changed = i > 0 && p.rows[i - 1].text !== r.text;
  card.classList.toggle('changed', changed);
  $('#kText').textContent = (changed ? '注意，这圈不一样：' : '') + r.text;
  $('#kOrig').textContent = r.orig ? '原文：' + r.orig : '';
  $('#kNote').textContent = r.note || '';
  $('#kSts').textContent = r.sts !== '' && r.sts != null ? `织完应该是 ${r.sts} 针` : '';
  const nx = p.rows[i + 1];
  $('#kNext').textContent = nx ? `下一圈：${nx.part !== r.part ? '【' + nx.part + '】' : ''}${nx.text}` : '这是最后一圈';
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
  if ($('#knit').hidden || $('#rowDialog').open) return;
  if (e.target.closest && e.target.closest('input, textarea, select')) return;
  if (e.repeat) { e.preventDefault(); return; }
  const fwd = [' ', 'Enter', 'ArrowRight', 'ArrowDown', 'PageDown', 'MediaTrackNext'];
  const back = ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'MediaTrackPrevious'];
  if (fwd.includes(e.key)) { e.preventDefault(); step(1); }
  else if (back.includes(e.key)) { e.preventDefault(); step(-1); }
});

// 全部圈列表
let rowEls = [];
function renderAllRows() {
  const box = $('#allRows');
  box.innerHTML = '';
  rowEls = [];
  if (cur.notes && cur.notes.length) {
    const n = document.createElement('div');
    n.className = 'muted';
    n.style.margin = '10px 0';
    n.textContent = '说明：' + cur.notes.join(' ');
    box.appendChild(n);
  }
  let lastPart = null;
  cur.rows.forEach((r, i) => {
    if (r.part !== lastPart) {
      const h = document.createElement('div');
      h.className = 'ar-part';
      h.textContent = r.part;
      box.appendChild(h);
      lastPart = r.part;
    }
    const d = document.createElement('div');
    d.className = 'ar-row';
    d.innerHTML = `<span class="n">第${i + 1}圈</span><span class="t">${esc(r.text)}</span><span class="s">${r.sts !== '' && r.sts != null ? '→ ' + r.sts + '针' : ''}</span>`;
    d.addEventListener('click', () => openRowDialog(i));
    box.appendChild(d);
    rowEls.push(d);
  });
}
function updateAllRows() {
  rowEls.forEach((d, i) => {
    d.classList.toggle('done', i < cur.done);
    d.classList.toggle('cur', i === cur.done);
  });
}

let editing = -1;
function openRowDialog(i) {
  editing = i;
  const r = cur.rows[i];
  $('#rdTitle').textContent = `第 ${i + 1} 圈 · ${r.part}`;
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
  if (confirm('确定把进度清零吗？')) { cur.done = 0; save(); renderKnit(); }
});
$('#mRename').addEventListener('click', () => {
  const n = prompt('新名字', cur.name);
  if (n && n.trim()) { cur.name = n.trim(); $('#kName').textContent = cur.name; save(); }
});
$('#mDelete').addEventListener('click', () => {
  if (confirm(`确定删除「${cur.name}」吗？删掉就找不回来了。`)) {
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

show('home');
