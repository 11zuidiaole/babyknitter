// AI 读图解：截图 / 文字 → 逐圈文字（放进「粘贴文字」框，可以先检查再开始织）

function buildAIPrompt(extraText) {
  const presets = Object.entries(SHAPES)
    .filter(([k]) => k !== 'none' && k !== 'ai')
    .map(([k, s]) => `${k}（${s.name}）：零件 ${s.parts.map(p => p.name).join('、')}`)
    .join('\n');
  return `你是编织图解助手。读下面的图解（截图和/或文字），整理成一圈一圈（或一行一行）的简单中文说明。

只输出一个 JSON，不要任何别的文字，也不要用代码块包起来。格式：
{
  "name": "作品名，看不出来就写空字符串",
  "shape": "sock / mitten / hat / scarf / panel / custom / none 之一",
  "parts": [只有 shape 是 custom 时才填，每个零件：{"name": "零件名", "path": "SVG path，坐标在 0 0 400 400 以内", "box": [x0, y0, x1, y1], "dir": "up / down / left / right"}],
  "rows": [{"part": "零件名", "text": "这一圈怎么织", "sts": 织完的针数或 null, "note": "可选的小提示"}],
  "notes": ["整体说明：线材、针号、起针方法、密度、尺寸等"],
  "uncertain": ["看不清或不确定的地方，比如：第23圈的符号看不清"]
}

可以用的现成形状和零件名：
${presets}
作品跟哪个现成形状像就用哪个，rows 的 part 必须用那个形状的零件名。都不像就用 custom，在 parts 里自己画简单轮廓（矩形、梯形、圆弧拼起来，零件之间拼成成品的样子；box 是零件外框；dir 是从起针往收针织的方向，比如从下往上织就是 up）。实在没法画就用 none，part 自己起简单的名字。

规则：
1. 一圈（或一行）一条，重复的全部展开写出来，比如"第3-6圈重复5次"要写成 20 条，不能省略，圈数多也要写完。
2. text 用很简单的中文，英文缩写和符号都翻成中文：k=下针，p=上针，k2tog=左上二并一，ssk=右上二并一，yo=挂针，m1=扭加针，kfb=一针里织两针（加1针），sl=滑针，tbl=扭针。日式/中式符号图也翻成文字。片织要写清楚正面还是反面。
3. sts 写这一圈织完以后总共几针，图解没写也能算出来就填，算不出来写 null。
4. 不确定的地方不要猜：写进 uncertain，并在那一圈的 note 里写"请对照原图确认"。
5. 截图里跟编织无关的东西（点赞、评论、水印）不用管。
${extraText ? '\n下面是文字版图解：\n' + extraText : ''}`;
}

function extractJSON(text) {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('AI 没有按格式回答');
  return JSON.parse(text.slice(a, b + 1));
}

function validPart(p) {
  return p && typeof p.name === 'string' && typeof p.path === 'string' && /^[MLHVQCTSAZmlhvqctsaz0-9.,\s-]+$/.test(p.path)
    && Array.isArray(p.box) && p.box.length === 4 && p.box.every(n => typeof n === 'number' && isFinite(n))
    && ['up', 'down', 'left', 'right'].includes(p.dir);
}

// AI 的 JSON → 选好形状 + 生成「粘贴文字」框里的内容
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

  const lines = [];
  (j.notes || []).forEach(n => lines.push(String(n)));
  (j.uncertain || []).forEach(n => lines.push('⚠ 不确定：' + n));
  const shape = SHAPES[shapeKey];
  const names = shape.parts.map(p => p.name);
  let last = null, n = 0;
  for (const r of (j.rows || [])) {
    let part = String(r.part || '').slice(0, 12) || names[0];
    if (shapeKey !== 'none' && !names.includes(part)) part = names[0];
    if (part !== last) { lines.push(`【${part}】`); last = part; }
    const clean = s => String(s ?? '').replace(/\|/g, '／').replace(/\n/g, ' ').trim();
    const sts = Number.isFinite(+r.sts) && r.sts !== null && r.sts !== '' ? +r.sts : '';
    lines.push(`${++n} | ${clean(r.text) || '（没写做法）'} | ${sts} | ${clean(r.note)}`);
  }
  return { shapeKey, text: lines.join('\n'), name: j.name || '', count: n, uncertain: (j.uncertain || []).length };
}

async function runAI() {
  const st = $('#aiStatus');
  const text = $('#pasteText').value.trim();
  const imgs = cImgs.slice(0, 8);
  if (!imgs.length && !text) { st.textContent = '先传截图，或者在「粘贴文字」里贴图解文字。'; return; }
  if (!Cloud.user) { Cloud.openLogin('AI 识别要先登录（用你 itinera 的账号）。'); return; }
  const btns = $$('.ai-btn');
  btns.forEach(b => b.disabled = true);
  st.textContent = `AI 正在读${imgs.length ? ` ${imgs.length} 张截图` : '文字'}…一般要 30 秒到 2 分钟，别关页面。` + (cImgs.length > 8 ? '（一次最多读 8 张，只读了前 8 张）' : '');
  try {
    const images = imgs.map(u => ({ type: 'image/jpeg', data: u.split(',')[1] }));
    const d = await Cloud.ai(buildAIPrompt(text), images);
    if (d.stop === 'max_tokens') throw new Error('图解太长，AI 没写完。可以分几次传截图试试。');
    const r = applyAIResult(extractJSON(d.text || ''));
    if (!r.count) throw new Error('AI 没读出任何一圈，换张清楚点的截图试试。');
    if (r.name && !$('#fName').value.trim()) $('#fName').value = r.name;
    setShape(r.shapeKey);
    $('#pasteText').value = r.text;
    $('#doTranslate').checked = true;
    setSrc('paste');
    st.textContent = `读好了：${r.count} 圈${r.uncertain ? `，有 ${r.uncertain} 处不确定（标了 ⚠）` : ''}。在下面检查一下，有错直接改文字，没问题就点「开始织」。`;
    $('#pasteText').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    st.textContent = 'AI 识别失败：' + (e.message || e);
  } finally {
    btns.forEach(b => b.disabled = false);
  }
}
