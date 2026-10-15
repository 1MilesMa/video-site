const state = { items: [], idx: -1, site: {} };
const $ = (id) => document.getElementById(id);

function fmtDur(sec){
  if (!isFinite(sec) || sec <= 0) return '--:--';
  const s = Math.round(sec);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
function fmtSize(bytes){
  if (!bytes) return '';
  return (bytes / 1048576).toFixed(1) + ' MB';
}
async function getJSON(url, fb){
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } catch (err) { return fb; }
}

const PLAY_SVG = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" fill="rgba(0,0,0,.5)" stroke="rgba(255,255,255,.8)" stroke-width="2"/><path d="M26 20 L46 32 L26 44 Z" fill="#fff"/></svg>';

function url(file){ return 'videos/' + encodeURIComponent(file); }
function titleOf(file, site){
  const map = site.titles || {};
  if (map[file]) return map[file];
  return file.replace(/\.[^.]+$/, '');
}

function buildGrid(){
  const grid = $('grid');
  grid.innerHTML = '';
  state.items.forEach((it, i) => {
    const card = document.createElement('div');
    card.className = 'card' + (it.exists ? '' : ' pending');

    const thumb = document.createElement('div');
    thumb.className = 'thumb';

    if (it.exists) {
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.preload = 'metadata';
      v.src = url(it.file);
      v.addEventListener('loadedmetadata', () => {
        it.duration = v.duration;
        it.w = v.videoWidth;
        it.h = v.videoHeight;
        dur.textContent = fmtDur(it.duration);
        if (v.duration > 1) v.currentTime = Math.min(1.2, v.duration * 0.12);
        if (i === state.idx) renderNow();
        updateFoot();
      });
      const dur = document.createElement('span');
      dur.className = 'dur';
      dur.textContent = '--:--';
      const play = document.createElement('div');
      play.className = 'play';
      play.innerHTML = PLAY_SVG;
      thumb.appendChild(v);
      thumb.appendChild(play);
      thumb.appendChild(dur);
      card.addEventListener('click', () => select(i));
    } else {
      const ph = document.createElement('div');
      ph.className = 'ph';
      ph.textContent = '待补充';
      thumb.appendChild(ph);
    }

    const cap = document.createElement('div');
    cap.className = 'cap';
    const t = document.createElement('div');
    t.className = 't';
    t.textContent = it.title;
    const s = document.createElement('div');
    s.className = 's';
    s.textContent = it.exists ? (it.file + ' · ' + fmtSize(it.size)) : it.file;
    cap.appendChild(t);
    cap.appendChild(s);

    card.appendChild(thumb);
    card.appendChild(cap);
    grid.appendChild(card);
    it.card = card;
  });
}

function renderNow(){
  const it = state.items[state.idx];
  const badges = $('now-badges');
  badges.innerHTML = '';
  if (!it) return;
  $('now-title').textContent = it.title;
  const add = (txt) => {
    if (!txt) return;
    const b = document.createElement('span');
    b.className = 'badge';
    b.textContent = txt;
    badges.appendChild(b);
  };
  add(it.file);
  add(it.duration ? fmtDur(it.duration) : '');
  add(it.w && it.h ? it.w + '×' + it.h : '');
  add(fmtSize(it.size));
}

function updateFoot(){
  const total = state.items.length;
  const have = state.items.filter((x) => x.exists);
  const bytes = have.reduce((a, x) => a + (x.size || 0), 0);
  $('foot-info').textContent = '已收录 ' + have.length + ' / ' + total + ' 个视频 · ' + fmtSize(bytes);
}

function select(i, silent){
  const it = state.items[i];
  if (!it || !it.exists) return;
  state.items.forEach((x) => x.card && x.card.classList.remove('active'));
  if (it.card) it.card.classList.add('active');
  state.idx = i;
  const p = $('player');
  if (p.getAttribute('src') !== url(it.file)) {
    p.src = url(it.file);
    p.load();
  }
  if (!silent) p.play().catch(() => {});
  $('player').closest('.player-wrap').classList.add('playing');
  renderNow();
}

function step(dir){
  const n = state.items.length;
  if (!n) return;
  let i = state.idx;
  for (let k = 0; k < n; k++) {
    i = (i + dir + n) % n;
    if (state.items[i].exists) { select(i); return; }
  }
}

function bindKeys(){
  document.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === ' ') {
      const p = $('player');
      if (!p.src) return;
      e.preventDefault();
      if (p.paused) p.play().catch(() => {}); else p.pause();
    }
  });
}

async function boot(){
  const site = await getJSON('data/site.json', {});
  state.site = site;
  if (site.siteTitle) {
    document.title = site.siteTitle;
    $('site-title').textContent = site.siteTitle;
  }
  const sub = $('site-subtitle');
  sub.textContent = site.subtitle || '';
  if (!site.subtitle) sub.style.display = 'none';

  let files = null;
  const live = await getJSON('api/list', null);
  if (live && Array.isArray(live.videos)) {
    files = live.videos;
  } else {
    const stat = await getJSON('data/videos.json', { videos: [] });
    files = stat.videos || [];
  }
  const byName = new Map(files.map((f) => [f.file, f]));

  const order = (site.order || []).slice();
  files.forEach((f) => { if (order.indexOf(f.file) < 0) order.push(f.file); });

  const seen = new Set();
  state.items = order.filter((n) => !seen.has(n) && seen.add(n)).map((file) => {
    const f = byName.get(file);
    return {
      file: file,
      title: titleOf(file, site),
      exists: !!f,
      size: f ? f.size : 0,
      mtime: f ? f.mtime : 0
    };
  });

  buildGrid();
  updateFoot();
  bindKeys();
  const first = state.items.findIndex((x) => x.exists);
  if (first >= 0) select(first, true);
  $('player').addEventListener('ended', () => step(1));
}

boot();