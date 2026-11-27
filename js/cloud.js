// 云同步 + 登录 + AI 识别
// 用的是和 itinera、deadline 清单同一个 Supabase 项目和账号。
// AI 直接调用 itinera 已经部署好的 Edge Function「itinera-ai」（它只负责把文字/截图转交给 Claude）。

const SUPA_URL = 'https://jqvguqqcvtassurhuqrs.supabase.co';
const SUPA_KEY = 'sb_publishable_VutfQkyu6XcxGAUT5fA_Eg_g5owXqQR';
const T_BOARD = 'babyknitter_boards';
const BUCKET = 'babyknitter';
const AI_FN = 'itinera-ai';

const Cloud = (() => {
  let sb = null, user = null, pushTimer = null, lastSync = null, busy = false;

  function setStatus(msg) {
    const box = $('#cloudStatus');
    if (!box) return;
    if (!sb) { box.innerHTML = '云同步不可用（网络加载失败），进度只存在这个浏览器里。'; return; }
    if (!user) {
      box.innerHTML = `云同步：没登录。<button class="link" id="loginOpen">登录</button>以后换设备也能看到，还能用 AI 读截图。`;
      $('#loginOpen').onclick = () => openLogin();
      return;
    }
    const t = lastSync ? lastSync.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
    box.innerHTML = `云同步：${esc(user.email || '')} · ${msg || (t ? t + ' 已同步' : '同步中…')} <button class="link" id="logoutBtn">退出</button>`;
    $('#logoutBtn').onclick = async () => { await sb.auth.signOut(); };
  }

  function uploadedKey() { return 'babyknitter.uploaded.' + (user ? user.id : ''); }
  function getUploaded() { try { return new Set(JSON.parse(localStorage.getItem(uploadedKey())) || []); } catch { return new Set(); } }
  function markUploaded(id, on = true) {
    const s = getUploaded();
    on ? s.add(id) : s.delete(id);
    try { localStorage.setItem(uploadedKey(), JSON.stringify([...s])); } catch {}
  }

  // 按作品合并：谁的 updated 新用谁；删除过的作品记在 deleted 里
  function merge(a, b) {
    const deleted = { ...(a.deleted || {}) };
    for (const [k, v] of Object.entries((b && b.deleted) || {})) deleted[k] = Math.max(deleted[k] || 0, v);
    const map = new Map();
    for (const p of [...(a.projects || []), ...((b && b.projects) || [])]) {
      const q = map.get(p.id);
      if (!q || (p.updated || 0) > (q.updated || 0)) map.set(p.id, p);
    }
    const projects = [...map.values()].filter(p => !(deleted[p.id] >= (p.updated || 0)));
    const deletedModels = { ...(a.deletedModels || {}) };
    for (const [k, v] of Object.entries((b && b.deletedModels) || {})) deletedModels[k] = Math.max(deletedModels[k] || 0, v);
    const mm = new Map();
    for (const m of [...(a.models || []), ...((b && b.models) || [])]) {
      const q = mm.get(m.id);
      if (!q || (m.updated || 0) > (q.updated || 0)) mm.set(m.id, m);
    }
    const models = [...mm.values()].filter(m => !(deletedModels[m.id] >= (m.updated || 0)));
    return { projects, deleted, models, deletedModels };
  }

  async function pullMerge() {
    if (!user || busy) return;
    busy = true;
    try {
      setStatus('同步中…');
      const { data: row, error } = await sb.from(T_BOARD).select('data').eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      const merged = merge(data, row ? row.data : null);
      data.projects = merged.projects;
      data.deleted = merged.deleted;
      data.models = merged.models;
      data.deletedModels = merged.deletedModels;
      registerModels();
      localSave();
      refreshViews();
      await pushNow();
      syncImages();
    } catch (e) {
      console.warn(e);
      setStatus('同步失败：' + (e.message || e) + (String(e.message || '').includes('babyknitter_boards') ? '（是不是还没在 Supabase 运行 supabase.sql？）' : ''));
    } finally { busy = false; }
  }

  async function pushNow() {
    if (!user) return;
    clearTimeout(pushTimer);
    const { error } = await sb.from(T_BOARD).upsert({
      user_id: user.id,
      data: { projects: data.projects, deleted: data.deleted || {}, models: data.models || [], deletedModels: data.deletedModels || {} },
      updated_at: new Date().toISOString(),
    });
    if (error) { setStatus('同步失败：' + error.message); return; }
    lastSync = new Date();
    setStatus();
  }

  function schedulePush() {
    if (!user) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, 1500);
  }

  function refreshViews() {
    if (!$('#home').hidden) renderHome();
    if (!$('#knit').hidden && cur) {
      const n = data.projects.find(p => p.id === cur.id);
      if (!n) show('home');
      else if (n !== cur) openKnit(n.id);
    }
  }

  // ---- 截图 ----
  function dataUrlToBlob(u) {
    const [head, b64] = u.split(',');
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: head.match(/:(.*?);/)[1] });
  }
  function blobToDataUrl(b) {
    return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); });
  }
  async function uploadImage(id, url) {
    if (!user) return;
    try {
      const { error } = await sb.storage.from(BUCKET).upload(`${user.id}/${id}.jpg`, dataUrlToBlob(url), { upsert: true, contentType: 'image/jpeg' });
      if (error) throw error;
      markUploaded(id);
    } catch (e) { console.warn('图片上传失败', e); }
  }
  async function syncImages() {
    if (!user) return;
    const done = getUploaded();
    for (const p of data.projects) for (const id of (p.images || [])) {
      if (done.has(id)) continue;
      const u = await IMG.get(id).catch(() => null);
      if (u) await uploadImage(id, u);
    }
  }
  async function fetchImage(id) {
    if (!user) return null;
    try {
      const { data: blob, error } = await sb.storage.from(BUCKET).download(`${user.id}/${id}.jpg`);
      if (error || !blob) return null;
      const u = await blobToDataUrl(blob);
      await IMG.put(id, u);
      markUploaded(id);
      return u;
    } catch { return null; }
  }
  async function deleteImages(ids) {
    if (!user || !ids.length) return;
    try { await sb.storage.from(BUCKET).remove(ids.map(id => `${user.id}/${id}.jpg`)); } catch {}
    ids.forEach(id => markUploaded(id, false));
  }

  // ---- 登录 ----
  function openLogin(msg) {
    $('#loginMsg').textContent = msg || '用你 itinera / deadline 清单的同一个账号登录。';
    $('#loginErr').textContent = '';
    $('#loginDialog').showModal();
  }
  async function doLogin(kind) {
    const email = $('#loginEmail').value.trim(), password = $('#loginPass').value;
    if (!email || !password) { $('#loginErr').textContent = '邮箱和密码都要填'; return; }
    $('#loginErr').textContent = kind === 'up' ? '注册中…' : '登录中…';
    const r = kind === 'up' ? await sb.auth.signUp({ email, password }) : await sb.auth.signInWithPassword({ email, password });
    if (r.error) { $('#loginErr').textContent = r.error.message === 'Invalid login credentials' ? '邮箱或密码不对' : r.error.message; return; }
    if (kind === 'up' && !r.data.session) { $('#loginErr').textContent = '注册好了，去邮箱点确认链接，然后回来登录。'; return; }
    $('#loginDialog').close();
  }

  // ---- AI ----
  async function ai(prompt, images) {
    if (!user) throw new Error('需要先登录');
    const { data: d, error } = await sb.functions.invoke(AI_FN, { body: { prompt, images, max_tokens: 8000, model: 'claude-sonnet-5-5' } });
    if (error) {
      let msg = error.message || '', status = error.context && error.context.status;
      try { const j = await error.context.json(); msg = j.error || msg; } catch {}
      if (status === 504 || status === 546 || /Failed to send|timed? ?out|NetworkError|Load failed|Failed to fetch/i.test(msg)) msg = '等太久超时了，或者网络断了。截图少传几张再试试。';
      else if (status === 401) msg = '登录过期了，退出再重新登录试试。';
      else if (status === 403) msg = '这个账号没有使用 AI 的权限（itinera-ai 里设了 ALLOWED_EMAILS）。';
      else if (/credit|balance|billing/i.test(msg)) msg = 'Anthropic 账户余额不够了：' + msg;
      else if (/spend|limit/i.test(msg)) msg = '到了 Anthropic 后台设的花费上限：' + msg;
      throw new Error(msg + (status ? `（错误码 ${status}）` : ''));
    }
    if (d && d.error) throw new Error(d.error);
    return d;
  }

  function init() {
    if (!window.supabase) { setStatus(); return; }
    sb = window.supabase.createClient(SUPA_URL, SUPA_KEY);
    $('#loginGo').onclick = () => doLogin('in');
    $('#loginUp').onclick = () => doLogin('up');
    $('#loginCancel').onclick = () => $('#loginDialog').close();
    sb.auth.onAuthStateChange((ev, session) => {
      const was = user && user.id;
      user = session ? session.user : null;
      setStatus();
      if (user && user.id !== was) setTimeout(pullMerge, 0);
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pullMerge(); });
    setStatus();
  }

  return {
    init, schedulePush, uploadImage, fetchImage, deleteImages, ai, openLogin, merge,
    get user() { return user; },
  };
})();
