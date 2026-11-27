// AI 读图解：截图 / 文字 → 分段（可以直接在表格里改）
// 只让 AI 输出"分段"而不是每一圈，输出短很多，几十秒就能读完

function buildAIPrompt(extraText) {
  const presets = Object.entries(SHAPES)
    .filter(([k]) => k !== 'none' && k !== 'ai')
    .map(([k, s]) => `${k}（${s.name}）：零件 ${s.parts.map(p => p.name).join('、')}`)
    .join('\n');
  return `你是编织图解助手。读下面的图解（截图或文字），整理成"分段"，用简单中文。

只输出一个 JSON，不要任何别的文字，不要代码块。格式：
{
  "name": "作品名，看不出来写空字符串",
  "shape": "sock / mitten / hat / scarf / panel / custom / none 之一",
  "parts": [只有 shape 是 custom 才填：{"name": "零件名", "path": "SVG path，坐标在 0 0 400 400 以内", "box": [x0, y0, x1, y1], "dir": "up / down / left / right"}],
  "sections": [
    {"part": "零件名", "rounds": 圈数, "text": "这几圈每圈怎么织", "sts": 织完针数或 null, "note": "可选"},
    {"part": "零件名", "repeat": 重复次数, "start_sts": 这组开始前的针数或 null, "rows": [{"text": "组里第1圈怎么织", "change": 这圈加减几针}, ...], "note": "可选"}
  ],
  "notes": ["整体说明：线材、针号、起针方法、密度、尺寸等，简短"],
  "uncertain": ["看不清或不确定的地方"]
}

分段规则：
1. 连续几圈做法完全一样 → 用第一种（rounds）。
2. 几圈一组循环（比如"每3圈加2针，第3圈加针，重复4次"）→ 用第二种（repeat + rows），rows 里每圈一条，change 是这一圈加了几针（减针写负数，不加减写 0）。
3. 按图解的顺序写，从起针到收针。不要把整个图解拆成每一圈一条。
4. text 用很简单的中文：k=下针，p=上针，k2tog=左上二并一，ssk=右上二并一，yo=挂针，m1=扭加针，kfb=一针里织两针，sl=滑针，tbl=扭针。日式/中式符号图也翻成文字。片织写清楚正面还是反面。
5. 不确定的地方不要猜：写进 uncertain，并在那一段的 note 里写"请对照原图确认：…"。
6. 截图里跟编织无关的东西（点赞、评论、水印）不用管。

形状：作品跟哪个现成形状像就用哪个，part 必须用那个形状的零件名：
${presets}
都不像就用 custom，在 parts 里画简单轮廓（矩形、梯形、圆弧拼成成品的样子；box 是零件外框；dir 是从起针往收针的方向）。实在画不了用 none，part 自己起简单名字。
${extraText ? '\n文字版图解：\n' + extraText : ''}`;
}

function extractJSON(text) {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('AI 没有按格式回答，再试一次');
  try { return JSON.parse(text.slice(a, b + 1)); }
  catch { throw new Error('AI 的回答格式有问题，再试一次'); }
}

function validPart(p) {
  return p && typeof p.name === 'string' && typeof p.path === 'string' && /^[MLHVQCTSAZmlhvqctsaz0-9.,\s-]+$/.test(p.path)
    && Array.isArray(p.box) && p.box.length === 4 && p.box.every(n => typeof n === 'number' && isFinite(n))
    && ['up', 'down', 'left', 'right'].includes(p.dir);
}

const num = v => (v === null || v === undefined || v === '' || !isFinite(+v)) ? '' : +v;
const str = v => String(v ?? '').replace(/\s+/g, ' ').trim();

// AI 的 JSON → 形状 + 分段
function applyAIResult(j) {
  let shapeKey = 'none';
  delete SHAPES.ai;
  if (j.shape === 'custom' && Array.isArray(j.parts) && j.parts.filter(validPart).length) {
    const parts = j.parts.filter(validPart).map(p => ({
      name: p.name.slice(0, 12), aliases: [p.name.slice(0, 12)], path: p.path, box: p.box, dir: p.dir,
      label: [p.box[2] + 6, (p.box[1] + p.box[3]) / 2 + 5],
    }));
    SHAPES.ai = { name: 'AI 画的形状', viewBox: '-10 -10 500 420', parts, defaults: [] };
    shapeKey = 'ai';
  } else if (SHAPES[j.shape] && j.shape !== 'ai') {
    shapeKey = j.shape;
  }
  const names = SHAPES[shapeKey].parts.map(p => p.name);
  const fixPart = p => {
    p = str(p).slice(0, 12) || names[0];
    return shapeKey === 'none' || names.includes(p) ? p : names[0];
  };
  if (shapeKey === 'none') {
    const used = [...new Set((j.sections || []).map(s => fixPart(s.part)))];
    SHAPES.none = { ...SHAPES.none, parts: used.map(n => ({ name: n, aliases: [n], path: '', box: null, dir: 'down' })) };
  }

  const secs = [];
  for (const s of (j.sections || [])) {
    const note = str(s.note);
    const flag = /确认|不确定|看不清/.test(note);
    if (Array.isArray(s.rows) && s.rows.length && +s.repeat > 0) {
      secs.push({
        type: 'group', part: fixPart(s.part), times: Math.min(+s.repeat, 500), start: num(s.start_sts),
        rows: s.rows.map(r => ({ text: str(r.text) || '（没写做法）', change: num(r.change) || 0 })), note, flag,
      });
    } else if (+s.rounds > 0) {
      secs.push({ type: 'plain', part: fixPart(s.part), count: Math.min(+s.rounds, 2000), text: str(s.text) || '（没写做法）', sts: num(s.sts), note, flag });
    }
  }
  return { shapeKey, secs, name: str(j.name), notes: (j.notes || []).map(str).filter(Boolean), uncertain: (j.uncertain || []).map(str).filter(Boolean) };
}

let aiRunning = false;
async function runAI(e) {
  if (aiRunning) return;
  const mode = e.currentTarget.dataset.ai;
  const st = mode === 'text' ? $('#aiStatus2') : $('#aiStatus');
  st.classList.remove('err');
  const text = mode === 'text' ? $('#pasteText').value.trim() : '';
  const imgs = mode === 'img' ? cImgs.slice(0, 8) : [];
  if (mode === 'img' && !imgs.length) { st.textContent = '先传截图。'; return; }
  if (mode === 'text' && !text) { st.textContent = '先把图解文字贴进上面的框。'; return; }
  if (!Cloud.user) { Cloud.openLogin('AI 识别要先登录（用你 itinera 的账号）。'); return; }

  aiRunning = true;
  const btns = $$('.ai-btn');
  btns.forEach(b => b.disabled = true);
  const t0 = Date.now();
  const what = imgs.length ? `${imgs.length} 张截图` : '文字';
  const tick = () => {
    const sec = Math.round((Date.now() - t0) / 1000);
    st.innerHTML = `<span class="spin"></span>AI 正在读${what}…已经 ${sec} 秒（一般 20～60 秒）。别关页面。` + (cImgs.length > 8 && mode === 'img' ? '<br>一次最多读 8 张，只读了前 8 张。' : '');
  };
  tick();
  const timer = setInterval(tick, 1000);
  try {
    const images = imgs.map(u => ({ type: 'image/jpeg', data: u.split(',')[1] }));
    const d = await Promise.race([
      Cloud.ai(buildAIPrompt(text), images),
      new Promise((_, rej) => setTimeout(() => rej(new Error('等了 3 分钟还没读完，先停了。截图少传几张再试试。')), 180000)),
    ]);
    if (d.stop === 'max_tokens') throw new Error('图解太长，AI 没写完。分两次传截图试试。');
    const r = applyAIResult(extractJSON(d.text || ''));
    if (!r.secs.length) throw new Error('AI 没读出分段，换张清楚点的截图试试。');

    aiDone = true; cDirty = true;
    cSections = r.secs;
    cNotes = [...r.notes, ...r.uncertain.map(u => '⚠ ' + u)];
    if (r.name && !$('#fName').value.trim()) $('#fName').value = r.name;
    $('#aiNotes').innerHTML =
      (r.uncertain.length ? `<h4 class="warn">⚠ AI 不确定的地方，请对照截图检查</h4>${r.uncertain.map(u => `<div class="warn">· ${esc(u)}</div>`).join('')}` : '') +
      (r.notes.length ? `<h4 style="margin-top:6px">图解说明</h4>${r.notes.map(n => `<div>· ${esc(n)}</div>`).join('')}` : '');
    setShape(r.shapeKey);
    const sec = Math.round((Date.now() - t0) / 1000);
    st.textContent = `读好了（用了 ${sec} 秒）：${r.secs.length} 段，一共 ${expandSections(cSections).length} 圈。下面检查一下，哪里不对直接改，没问题点「开始织」。`;
    setSrc(mode === 'text' ? 'sections' : 'ai');
    if (mode === 'text') $('#aiStatus').textContent = '';
    ($('#aiNotes').hidden ? $('#shapeField') : $('#aiNotes')).scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    st.classList.add('err');
    st.textContent = 'AI 识别失败：' + (err.message || err);
  } finally {
    clearInterval(timer);
    aiRunning = false;
    btns.forEach(b => b.disabled = false);
  }
}
