// 图解文字解析：把一段图解拆成一圈一圈，顺便翻译英文缩写

// 英文缩写 → 中文。长的放前面，避免 k2tog 被拆成 k2 + tog
const ABBR = [
  [/\bsl1[\s-]*k2tog[\s-]*psso\b/gi, '右上三并一'],
  [/\b(sk2p|sk2po)\b/gi, '右上三并一'],
  [/\b(s2kp|s2kpo|cdd)\b/gi, '中上三并一'],
  [/\bk3tog\b/gi, '下针三并一'],
  [/\bk2tog\s*tbl\b/gi, '扭针二并一'],
  [/\bk2tog\b/gi, '左上二并一'],
  [/\bp3tog\b/gi, '上针三并一'],
  [/\bp2tog\b/gi, '上针二并一'],
  [/\bssk\b/gi, '右上二并一'],
  [/\bssp\b/gi, '上针右上二并一'],
  [/\bkfb\b/gi, '同一针前后各织一针（加1针）'],
  [/\bpfb\b/gi, '同一针前后各织一上针（加1针）'],
  [/\bm1l\b/gi, '左扭加针'],
  [/\bm1r\b/gi, '右扭加针'],
  [/\bm1p\b/gi, '上针扭加针'],
  [/\bm1\b/gi, '扭加针'],
  [/\byo\b/gi, '挂针'],
  [/\bk\s*tbl\b|\bktbl\b/gi, '扭下针'],
  [/\bp\s*tbl\b|\bptbl\b/gi, '扭上针'],
  [/\btbl\b/gi, '（织后面的线圈）'],
  [/\bsl\s*(\d+)\s*(?:st|sts)?\s*p?wise\b/gi, '滑$1针'],
  [/\bsl\s*(\d+)\b/gi, '滑$1针'],
  [/\bsl\b/gi, '滑针'],
  [/\bpsso\b/gi, '把滑过的针盖过去'],
  [/\bwyif\b/gi, '线放前面'],
  [/\bwyib\b/gi, '线放后面'],
  [/\bpm\b/gi, '放记号扣'],
  [/\bsm\b/gi, '移记号扣'],
  [/\brm\b/gi, '取下记号扣'],
  [/\bbor\b/gi, '圈起点'],
  [/\bcast on\b|\bco\b/gi, '起针'],
  [/\bbind off\b|\bbo\b/gi, '收针'],
  [/\brep(?:eat)? from \*/gi, '从 * 开始重复'],
  [/\brep(?:eat)? between \*s?\b/gi, '重复 * 之间的内容'],
  [/\bknit\b/gi, '下针'],
  [/\bpurl\b/gi, '上针'],
  [/\bk\s*(\d+)\b/gi, '下针$1针'],
  [/\bp\s*(\d+)\b/gi, '上针$1针'],
  [/\bk\b/gi, '下针'],
  [/\bp\b/gi, '上针'],
  [/\bto last (\d+) sts?\b/gi, '织到剩$1针'],
  [/\bto end\b/gi, '织到最后'],
  [/\bto m\b/gi, '织到记号扣'],
  [/\bacross\b/gi, '整行'],
  [/\baround\b/gi, '整圈'],
  [/\b(\d+) times\b/gi, '$1次'],
  [/\bonce\b/gi, '1次'],
  [/\btwice\b/gi, '2次'],
  [/\binc\b/gi, '加针'],
  [/\bdec\b/gi, '减针'],
  [/\bsts?\b/gi, '针'],
  [/\brs\b/gi, '正面'],
  [/\bws\b/gi, '反面'],
  [/\brep(?:eat)?\b/gi, '重复'],
  [/\bbeg\b/gi, '开头'],
  [/\brem\b/gi, '剩余'],
  [/\b(cont|continue)\b/gi, '继续'],
  [/\bas est(?:ablished)?\b/gi, '按之前的花样'],
  [/\bpatt\b/gi, '花样'],
  [/\bmc\b/gi, '主色线'],
  [/\bcc\b/gi, '配色线'],
  [/\band\b/gi, '和'],
  [/\bin each\b|\beach\b/gi, '每'],
];

function translate(text) {
  let t = ' ' + text + ' ';
  for (const [re, zh] of ABBR) t = t.replace(re, zh);
  return t.replace(/\s*,\s*/g, '，').replace(/\s*;\s*/g, '；').replace(/\s{2,}/g, ' ').trim();
}

function hasEnglish(text) {
  return /[a-z]{1,}/i.test(text);
}

// 从一行里找出"织完多少针"
function pullStitchCount(text) {
  const pats = [
    /(?:→|->|=>|＝|=)\s*(\d+)\s*(?:针|sts?|stitches)?\s*$/i,
    /[(（\[]\s*(\d+)\s*(?:针|sts?|stitches)\s*[)）\]]\s*$/i,
    /[—–-]\s*(\d+)\s*(?:sts?|stitches|针)\s*\.?\s*$/i,
    /[，,]\s*(?:共|剩)?\s*(\d+)\s*针\s*$/,
  ];
  for (const re of pats) {
    const m = text.match(re);
    if (m) return { text: text.slice(0, m.index).trim().replace(/[，,：:]$/, ''), sts: +m[1] };
  }
  return { text: text.trim(), sts: '' };
}

const RE_EN = /^\s*(?:rnds?|rounds?|rows?|r)\s*\.?\s*(\d+)(?:\s*(?:-|–|—|to|through)\s*(\d+))?\s*[:.)\-–]?\s*(.*)$/i;
const RE_ZH = /^\s*第?\s*(\d+)\s*(?:[-–—~～至到]\s*第?\s*(\d+))?\s*[圈行轮]\s*[:：.、]?\s*(.*)$/;
const RE_PIPE = /^\s*(\d+)\s*\|\s*([^|]*?)\s*(?:\|\s*(\d*)\s*)?(?:\|\s*(.*?)\s*)?$/;
const RE_REP_EN = /^\s*rep(?:eat)?\s+(?:rnds?|rows?|rounds?)\s*(\d+)\s*(?:-|–|—|to|through|and)\s*(\d+)\s*(?:(\d+)|once|twice|three|four|five)?\s*(more)?\s*(?:times?)?/i;
const RE_REP_ZH = /重复\s*第?\s*(\d+)\s*[-–—~～至到]\s*第?\s*(\d+)\s*[圈行轮]\s*(再|共)?\s*(\d+)\s*(?:次|遍)/;
const WORDNUM = { once: 1, twice: 2, three: 3, four: 4, five: 5 };

// partOf(line) → 零件名或 null，用来识别 "【袜筒】" 这种小标题
function parsePattern(input, { partOf, defaultPart, doTranslate }) {
  const lines = input.split(/\r?\n/);
  const rows = [];      // {num, part, text, sts, note}
  const notes = [];
  const warnings = [];
  let part = defaultPart;

  const addRow = (num, text, sts) => {
    const shown = doTranslate && hasEnglish(text) ? translate(text) : text;
    rows.push({ num, part, text: shown, orig: shown !== text ? text : '', sts });
  };

  for (const raw of lines) {
    const line = raw.replace(/[✓✔☐☑]/g, '').trim();
    if (!line) continue;

    let m;
    if ((m = line.match(RE_REP_EN)) || (m = line.match(RE_REP_ZH))) {
      const zh = RE_REP_ZH.test(line);
      const a = +m[1], b = +m[2];
      let times, more;
      if (zh) { times = +m[4]; more = m[3] === '再'; }
      else { times = m[3] ? +m[3] : (WORDNUM[(line.match(/\b(once|twice|three|four|five)\b/i) || [])[1]?.toLowerCase()] || 1); more = !!m[4]; }
      const extra = more ? times : times - 1;
      // 找最近一次出现的第a圈，从那里往后取到第b圈（避免和前面同号的圈搞混）
      let st = -1;
      for (let j = rows.length - 1; j >= 0; j--) if (rows[j].num === a) { st = j; break; }
      const block = [];
      if (st >= 0) for (let j = st; j < rows.length && rows[j].num >= a && rows[j].num <= b; j++) block.push(rows[j]);
      if (!block.length) { warnings.push(`没找到要重复的第${a}-${b}圈：「${line}」`); continue; }
      if (!zh && !m[4] || zh && !m[3]) warnings.push(`「${line}」我按"总共${times}次"算的（也就是再织${extra}次），不对的话请手动改。`);
      let next = rows[rows.length - 1].num + 1;
      for (let t = 0; t < extra; t++) for (const r of block) rows.push({ ...r, num: next++ });
      continue;
    }

    if ((m = line.match(RE_PIPE))) {
      const p = pullStitchCount(m[2]);
      addRow(+m[1], p.text, m[3] ? +m[3] : p.sts);
      if (m[4]) rows[rows.length - 1].note = m[4];
      continue;
    }

    if ((m = line.match(RE_EN)) || (m = line.match(RE_ZH))) {
      const a = +m[1], b = m[2] ? +m[2] : a;
      const p = pullStitchCount(m[3] || '');
      if (b < a || b - a > 500) { warnings.push(`圈数范围看不懂：「${line}」`); continue; }
      for (let n = a; n <= b; n++) addRow(n, p.text || '（没写做法）', n === b ? p.sts : '');
      continue;
    }

    // 不是圈：可能是小标题，也可能是说明
    const header = line.length <= 16 ? partOf(line) : null;
    if (header) { part = header; continue; }
    if (rows.length) {
      const last = rows[rows.length - 1];
      last.note = (last.note ? last.note + ' ' : '') + line;
    } else {
      notes.push(line);
    }
  }

  return {
    rows: rows.map(r => ({ part: r.part, text: r.text, orig: r.orig || '', sts: r.sts, note: r.note || '' })),
    notes,
    warnings,
  };
}

// 加减针生成器：比如 34针起，每3圈加2针（第3圈加），加到42针
function generateShaping({ start, every, change, target, plainText, changeText, changeFirst }) {
  const rows = [];
  start = +start; every = Math.max(1, +every); change = +change; target = +target;
  if (!change || !target || !start) return rows;
  if ((target - start) / change <= 0) return rows;
  let sts = start;
  let guard = 0;
  while ((change > 0 ? sts < target : sts > target) && guard++ < 300) {
    for (let i = 0; i < every; i++) {
      const isChange = changeFirst ? i === 0 : i === every - 1;
      if (isChange) {
        sts = change > 0 ? Math.min(sts + change, target) : Math.max(sts + change, target);
        rows.push({ text: changeText, sts, change: true });
      } else {
        rows.push({ text: plainText, sts });
      }
    }
  }
  return rows;
}
