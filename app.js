// Мини-приложение «Мануфактура» для Telegram: меню, бинго настоек, бронь, о баре.
// Работает и в обычном браузере (тогда без Telegram-функций, прогресс в localStorage).
(() => {
  const B = window.BAR, M = window.MENU, T = M.tinctures;
  const tg = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData !== undefined ? window.Telegram.WebApp : null;
  const inTg = !!(tg && tg.platform && tg.platform !== 'unknown');
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const haptic = (kind) => { try { inTg && (kind === 'tap' ? tg.HapticFeedback.selectionChanged() : tg.HapticFeedback.notificationOccurred(kind)); } catch {} };

  if (inTg) {
    tg.ready(); tg.expand();
    try { tg.setHeaderColor('#8e2f34'); tg.setBackgroundColor('#f5efe6'); tg.setBottomBarColor && tg.setBottomBarColor('#fbf8f3'); } catch {}
  }

  /* ---------- Время ---------- */
  const now = window.BookingTime.now();
  const night = new Date(now); if (now.getHours() < 5) night.setDate(now.getDate() - 1);
  const dow = night.getDay(), isWed = dow === 3;
  const closeHour = d => (d === 5 || d === 6) ? 5 : 2;
  const openAt = new Date(night); openAt.setHours(17, 0, 0, 0);
  const closeAt = new Date(night); closeAt.setDate(night.getDate() + 1); closeAt.setHours(closeHour(dow), 0, 0, 0);
  const isOpen = now >= openAt && now < closeAt;
  $('#open').innerHTML = isOpen ? `Открыто<span>до ${pad(closeHour(dow))}:00</span>` : `Закрыто<span>откроемся в 17:00</span>`;

  /* ---------- Вкладки ---------- */
  const tabs = [...document.querySelectorAll('.tab')];
  const show = name => {
    tabs.forEach(t => t.setAttribute('aria-selected', t.dataset.s === name));
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === 's-' + name));
    scrollTo(0, 0); haptic('tap');
  };
  tabs.forEach(t => t.onclick = () => show(t.dataset.s));
  const start = new URLSearchParams(location.search).get('tab') || (inTg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) || '';
  if (['menu', 'bingo', 'book', 'about'].includes(start)) show(start);

  /* ---------- Нижний лист ---------- */
  const scrim = $('#scrim'), sheet = $('#sheet'), sheetBody = $('#sheetBody');
  let onClose = null;
  // Пока лист открыт, страница под ним заморожена (иначе в Telegram меню листается за листом).
  let lockY = 0, sheetOpen = false;
  const lock = () => { lockY = scrollY; Object.assign(document.body.style, { position: 'fixed', top: `-${lockY}px`, left: '0', right: '0', overflow: 'hidden' }); };
  const unlock = () => { Object.assign(document.body.style, { position: '', top: '', left: '', right: '', overflow: '' }); scrollTo(0, lockY); };
  const openSheet = (html, after) => {
    sheetBody.innerHTML = html; sheet.style.transform = ''; sheet.scrollTop = 0;
    if (!sheetOpen) lock();
    sheetOpen = true; scrim.classList.add('on'); sheet.classList.add('on');
    if (inTg) { tg.BackButton.show(); try { tg.disableVerticalSwipes && tg.disableVerticalSwipes(); } catch {} }
    after && after();
  };
  const closeSheet = () => {
    if (!sheetOpen) return;
    sheetOpen = false; scrim.classList.remove('on'); sheet.classList.remove('on'); sheet.style.transform = '';
    unlock();
    if (inTg) { tg.BackButton.hide(); try { tg.enableVerticalSwipes && tg.enableVerticalSwipes(); } catch {} }
    onClose && onClose(); onClose = null;
  };
  scrim.onclick = closeSheet;
  scrim.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  // Смахнуть лист вниз: тянем, если содержимое листа прокручено к началу.
  let y0 = null, dy = 0, t0 = 0;
  sheet.addEventListener('touchstart', e => { if (sheet.scrollTop > 0) { y0 = null; return; } y0 = e.touches[0].clientY; dy = 0; t0 = Date.now(); sheet.style.transition = 'none'; }, { passive: true });
  sheet.addEventListener('touchmove', e => {
    if (y0 === null) return; dy = e.touches[0].clientY - y0;
    if (dy > 0) { e.preventDefault(); sheet.style.transform = `translateY(${dy}px)`; scrim.style.opacity = String(Math.max(0, 1 - dy / 400)); }
  }, { passive: false });
  sheet.addEventListener('touchend', () => {
    if (y0 === null) return; sheet.style.transition = ''; scrim.style.opacity = '';
    const fast = dy > 40 && Date.now() - t0 < 250;
    if (dy > 110 || fast) closeSheet(); else sheet.style.transform = '';
    y0 = null; dy = 0;
  });
  if (inTg) tg.BackButton.onClick(closeSheet);
  addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

  /* ---------- Меню ---------- */
  const row = (i, withPhoto) => {
    const right = `<span class="rt">${i.w ? `<span class="w">${esc(i.w)}</span>` : ''}<span class="pr">${i.price}</span></span>`;
    const txt = `<span><span class="nm">${esc(i.name)}</span><span class="ds">${esc(i.desc)}</span></span>`;
    if (withPhoto && i.photo) return `<li><button class="it" type="button" data-photo="${i.photo}"><img class="ph" src="img/dish/${i.photo}.jpg" alt="" loading="lazy">${txt}${right}</button></li>`;
    return `<li class="it"><span class="ph none"></span>${txt}${right}</li>`;
  };
  let kSel = M.kitchen[0].title;
  const views = {
    kitchen: () => `<div class="chips" id="kChips">${M.kitchen.map(g => `<button class="chip" type="button" aria-pressed="${g.title === kSel}" data-g="${esc(g.title)}">${esc(g.title)}</button>`).join('')}</div>
      <div class="pad">${(() => { const g = M.kitchen.find(x => x.title === kSel); return `<p class="group">${esc(g.title)}</p><ul class="list">${g.items.map(i => row(i, true)).join('')}</ul>`; })()}
      <p class="note">${esc(M.allergy)}</p></div>`,
    cocktails: () => `<div class="pad"><p class="group">Авторские · все по 600</p><div class="sigbox"><ul class="list">${M.cocktails.signature.map(i => row(i)).join('')}</ul></div>
      <p class="group">Классика</p><ul class="list">${M.cocktails.classic.map(i => row(i)).join('')}</ul>
      <p class="note">${esc(M.cocktails.note)}</p></div>`,
    tinct: () => `<div class="pad"><div class="t-price"><span class="pr">${isWed ? T.wednesday : T.price}</span><span>${isWed ? `Сегодня среда: все настойки по ${T.wednesday} ₽ вместо ${T.price}.` : `Любая настойка, 50 мл. По средам — ${T.wednesday} ₽.`}</span></div>
      ${T.groups.map(g => `<p class="group">${esc(g.title)}</p><ul class="list">${g.items.map(([n, d]) => `<li class="it"><span class="ph none"></span><span><span class="nm">${esc(n)}</span><span class="ds">${esc(d)}</span></span><span></span></li>`).join('')}</ul>`).join('')}
      <button class="btn ghost" type="button" data-go="bingo">Открыть бинго</button></div>`,
    bar: () => `<div class="pad bar2">${M.bar.map(g => `<div><p class="group">${esc(g.title)}</p><ul class="plain">${g.items.map(([n, p]) => `<li><span>${esc(n)}</span><b>${p}</b></li>`).join('')}</ul></div>`).join('')}</div>`
  };
  let mSel = 'kitchen';
  const renderMenu = () => { $('#menuBody').innerHTML = views[mSel](); };
  $('#menuSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; mSel = b.dataset.m;
    $('#menuSeg').querySelectorAll('button').forEach(x => x.setAttribute('aria-selected', x === b)); renderMenu(); haptic('tap'); };
  $('#menuBody').onclick = e => {
    const c = e.target.closest('.chip'); if (c) { kSel = c.dataset.g; renderMenu(); haptic('tap'); return; }
    const go = e.target.closest('[data-go]'); if (go) { show(go.dataset.go); return; }
    const it = e.target.closest('button.it'); if (!it) return;
    const i = M.kitchen.flatMap(g => g.items).find(x => String(x.photo) === it.dataset.photo);
    openSheet(`<img class="big" src="img/dish/${i.photo}.jpg" alt="${esc(i.name)}"><h3 id="shTitle">${esc(i.name)}</h3><p class="ds">${esc(i.desc)}</p>
      <div class="row"><span class="w">${esc(i.w)}</span><span class="pr">${i.price}</span></div>`);
  };
  renderMenu();

  const toast = msg => { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2600); };

  /* ---------- Книга образцов ---------- */
  // Дом 36 в 1873 году — лавка «Мануфактурные товары» купца А. Г. Морозова. Каждая настойка — образец ткани.
  const COLORS = { 'Бузина-цитрус':'#e8d37a','Гранат-персик':'#d4515a','Алоэ-киви':'#9cc06a','Яблоко-щавель':'#b9cd73','Фейхоа-лайм':'#86ad61','Вишня':'#7c1a2a','Хреновуха':'#e6dcb8','Томатная':'#d4472f','Лимончелло':'#f0cc45','Облепиха':'#ee8a24','Клюковка':'#b51f3a','Персик-личи-конопля':'#f1b083','Клубника-гречка':'#c64a58','Банан-куркума':'#efc244','Малина-пломбир':'#eda0b2','Кассис':'#4b1a3a','Порно шот':'#f2b45a','Джин на малине':'#d4567a','Черноплодный негрони':'#3b1422' };
  const tinct = []; T.groups.forEach(g => g.items.forEach(([n, d]) => tinct.push({ n, d, g: g.title })));
  const cats = T.groups.map(g => ({ title: g.title, items: tinct.filter(t => t.g === g.title) }));
  const RANKS = [ { at: 0, t: 'Покупатель' }, { at: 5, t: 'Купец 3-й гильдии' }, { at: 12, t: 'Купец 2-й гильдии' }, { at: 19, t: 'Купец 1-й гильдии' } ];
  const WEAVES = ['ситец в полоску', 'клетка', 'горох', 'ёлочка', 'саржа', 'рогожка'];

  // Цвет нитей узора: темнее на светлой ткани, светлее на тёмной.
  const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const mix = (c, w, k) => '#' + hex(c).map(v => Math.round(v + (w - v) * k).toString(16).padStart(2, '0')).join('');
  const lum = c => { const [r, g, b] = hex(c); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
  let swId = 0;
  // Образец ткани: SVG-узор + край «зигзагом», как после портновских ножниц.
  const swatchSVG = (name, w = 120, h = 90) => {
    const i = tinct.findIndex(t => t.n === name), c = COLORS[name], dark = lum(c) < .45;
    const ink = dark ? mix(c, 255, .38) : mix(c, 0, .28), soft = dark ? mix(c, 255, .18) : mix(c, 0, .12), id = 'sw' + (++swId);
    const kind = i % 6;
    const pat = [
      `<pattern id="${id}" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="${c}"/><rect width="4" height="12" fill="${ink}" opacity=".55"/><rect x="7" width="1.5" height="12" fill="${ink}" opacity=".4"/></pattern>`,
      `<pattern id="${id}" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="${c}"/><rect width="8" height="16" fill="${ink}" opacity=".3"/><rect width="16" height="8" fill="${ink}" opacity=".3"/></pattern>`,
      `<pattern id="${id}" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="${c}"/><circle cx="3.5" cy="3.5" r="2.2" fill="${ink}" opacity=".7"/><circle cx="10.5" cy="10.5" r="2.2" fill="${ink}" opacity=".7"/></pattern>`,
      `<pattern id="${id}" width="12" height="10" patternUnits="userSpaceOnUse"><rect width="12" height="10" fill="${c}"/><path d="M0 10 6 0M6 0l6 10" stroke="${ink}" stroke-width="1.6" opacity=".55" fill="none"/></pattern>`,
      `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="${c}"/><rect width="3" height="8" fill="${ink}" opacity=".35"/></pattern>`,
      `<pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="${c}"/><rect width="3" height="3" fill="${soft}"/><rect x="3" y="3" width="3" height="3" fill="${soft}"/></pattern>`
    ][kind];
    // зигзаг по периметру
    const t = 4, step = 6, pts = [];
    for (let x = 0; x <= w; x += step) pts.push([x, (x / step) % 2 ? t : 0]);
    for (let y = step; y <= h; y += step) pts.push([w - ((y / step) % 2 ? t : 0), y]);
    for (let x = w - step; x >= 0; x -= step) pts.push([x, h - ((x / step) % 2 ? t : 0)]);
    for (let y = h - step; y > 0; y -= step) pts.push([(y / step) % 2 ? t : 0, y]);
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><defs>${pat}</defs><polygon points="${pts.map(p => p.join(',')).join(' ')}" fill="url(#${id})"/><polygon points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${ink}" stroke-opacity=".35" stroke-width="1" stroke-dasharray="2 2" transform="translate(${w * .04} ${h * .05}) scale(.92 .9)"/></svg>`;
  };

  // Код дня для бармена. В прототипе вычисляется из даты; в рабочей версии бармен получит его в боте.
  const dayCode = d => String(((d.getDate() * 7919 + (d.getMonth() + 1) * 104729 + d.getFullYear()) % 9000) + 1000);
  const KEY = 'manufaktura-book';
  const monthKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const MONTHS_IN = ['январе','феврале','марте','апреле','мае','июне','июле','августе','сентябре','октябре','ноябре','декабре'];
  let book = { items: {}, months: {} };
  const store = {
    load: cb => {
      const parse = v => { try { const o = JSON.parse(v || '{}'); return o.items ? o : { items: {}, months: {} }; } catch { return { items: {}, months: {} }; } };
      if (inTg && tg.isVersionAtLeast && tg.isVersionAtLeast('6.9')) tg.CloudStorage.getItem(KEY, (err, v) => cb(parse(v)));
      else { let v = null; try { v = localStorage.getItem(KEY); } catch {} cb(parse(v)); }
    },
    save: v => {
      const s = JSON.stringify(v);
      if (inTg && tg.isVersionAtLeast && tg.isVersionAtLeast('6.9')) tg.CloudStorage.setItem(KEY, s);
      else { try { localStorage.setItem(KEY, s); } catch {} }
    }
  };
  const uniq = () => Object.keys(book.items).length;
  const total = () => Object.values(book.items).reduce((a, x) => a + x.n, 0);
  const rankOf = n => [...RANKS].reverse().find(r => n >= r.at);
  const shots = n => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'рюмка' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'рюмки' : 'рюмок'}`;
  let justSewn = null;
  function renderBook() {
    const u = uniq(), r = rankOf(u), next = RANKS.find(x => x.at > u), mon = book.months[monthKey(now)] || 0;
    $('#rank').innerHTML = `<p class="lbl">Ваше звание</p><p class="title">${r.t}</p>
      <p class="next">${next ? `До звания «${next.t.toLowerCase()}» — ${next.at - u} ${next.at - u === 1 ? 'образец' : next.at - u < 5 ? 'образца' : 'образцов'}` : 'Вся книга собрана. Как сам А. Г. Морозов.'}</p>
      <div class="ladder">${RANKS.slice(1).map(x => `<i class="${u >= x.at ? 'on' : ''}"></i>`).join('')}</div>
      <div class="stats"><div><b>${u}/${tinct.length}</b><span>образцов</span></div><button type="button" class="st-btn" id="hist"><b>${total()}</b><span>рюмок всего ›</span></button><div><b>${mon}</b><span>в ${MONTHS_IN[now.getMonth()]}</span></div></div>
      <button class="share" type="button" id="share"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13"/></svg>Похвастаться</button>`;
    $('#pages').innerHTML = cats.map(c => {
      const n = c.items.filter(t => book.items[t.n]).length;
      return `<div class="page${n === c.items.length ? ' full' : ''}"><div class="page-h"><b>${esc(c.title)}</b><span>${n} из ${c.items.length}</span></div>
        <div class="sw-grid">${c.items.map(t => { const it = book.items[t.n];
          return `<button type="button" class="sw${it ? ' has' : ''}${justSewn === t.n ? ' new' : ''}" data-n="${esc(t.n)}" aria-label="${esc(t.n)}${it ? `, рюмок: ${it.n}` : ', образца пока нет'}">
            <span class="slot">${it ? swatchSVG(t.n) : `<em>№${pad(tinct.indexOf(t) + 1)}</em>`}</span>
            <span class="n">${esc(t.n)}</span>${it ? `<span class="cnt">${shots(it.n)}</span>` : ''}</button>`; }).join('')}</div></div>`;
    }).join('');
    justSewn = null;
    $('#share').onclick = () => { haptic('tap'); openStory(); };
    $('#hist').onclick = () => { haptic('tap'); openHistory(); };
  }

  /* ---------- Рюмки по месяцам ---------- */
  const MONTHS_NOM = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const yearTotal = () => Object.entries(book.months).filter(([k]) => k.startsWith(String(now.getFullYear()))).reduce((a, [, v]) => a + v, 0);
  function openHistory() {
    const rows = [2, 1, 0].map(k => { const d = new Date(now.getFullYear(), now.getMonth() - k, 1); return { name: MONTHS_NOM[d.getMonth()], n: book.months[monthKey(d)] || 0 }; });
    const max = Math.max(1, ...rows.map(r => r.n));
    openSheet(`<h3 id="shTitle">Рюмки по месяцам</h3>
      <ul class="hist">${rows.map(r => `<li><span>${r.name}</span><i style="--w:${Math.round(r.n / max * 100)}%"></i><b>${r.n}</b></li>`).join('')}</ul>
      <p class="hint">За ${now.getFullYear()} год: ${shots(yearTotal())}. Всего: ${shots(total())}.</p>`);
  }

  /* ---------- Сторис ---------- */
  const W = 1080, H = 1920;
  let storyPhoto = null;
  const storyOpts = { rank: true, swatches: true, month: true, year: false };
  const logoImg = new Image(); logoImg.src = 'img/logo-round.png';
  // Узор ткани на холсте (те же 6 переплетений, что и в книге).
  function drawSwatch(ctx, x, y, w, h, name) {
    const i = tinct.findIndex(t => t.n === name), c = COLORS[name], dark = lum(c) < .45;
    const ink = dark ? mix(c, 255, .38) : mix(c, 0, .28), soft = dark ? mix(c, 255, .18) : mix(c, 0, .12);
    const k = Math.max(1, w / 120), tile = document.createElement('canvas'), sz = [12, 16, 14, 12, 8, 6][i % 6] * k;
    tile.width = tile.height = Math.ceil(sz); const t = tile.getContext('2d');
    t.fillStyle = c; t.fillRect(0, 0, sz, sz); t.fillStyle = ink; t.strokeStyle = ink;
    switch (i % 6) {
      case 0: t.globalAlpha = .55; t.fillRect(0, 0, 4 * k, sz); t.globalAlpha = .4; t.fillRect(7 * k, 0, 1.5 * k, sz); break;
      case 1: t.globalAlpha = .3; t.fillRect(0, 0, sz / 2, sz); t.fillRect(0, 0, sz, sz / 2); break;
      case 2: t.globalAlpha = .7; [[3.5, 3.5], [10.5, 10.5]].forEach(([a, b]) => { t.beginPath(); t.arc(a * k, b * k, 2.2 * k, 0, 7); t.fill(); }); break;
      case 3: t.globalAlpha = .55; t.lineWidth = 1.6 * k; t.beginPath(); t.moveTo(0, sz); t.lineTo(sz / 2, 0); t.lineTo(sz, sz); t.stroke(); break;
      case 4: t.globalAlpha = .35; t.beginPath(); t.moveTo(0, 0); t.lineTo(sz * .4, 0); t.lineTo(sz, sz * .6); t.lineTo(sz, sz); t.lineTo(sz * .6, sz); t.lineTo(0, sz * .4); t.closePath(); t.fill(); break;
      case 5: t.fillStyle = soft; t.fillRect(0, 0, sz / 2, sz / 2); t.fillRect(sz / 2, sz / 2, sz / 2, sz / 2); break;
    }
    const tooth = 4 * k, step = 6 * k; ctx.save(); ctx.beginPath();
    let n = 0; for (let px = 0; px <= w; px += step, n++) ctx.lineTo(x + px, y + (n % 2 ? tooth : 0));
    n = 1; for (let py = step; py <= h; py += step, n++) ctx.lineTo(x + w - (n % 2 ? tooth : 0), y + py);
    n = 1; for (let px = w - step; px >= 0; px -= step, n++) ctx.lineTo(x + px, y + h - (n % 2 ? tooth : 0));
    n = 1; for (let py = h - step; py > 0; py -= step, n++) ctx.lineTo(x + (n % 2 ? tooth : 0), y + py);
    ctx.closePath(); ctx.shadowColor = 'rgba(30,8,10,.35)'; ctx.shadowOffsetY = 4 * k; ctx.shadowBlur = 8 * k;
    ctx.fillStyle = ctx.createPattern(tile, 'repeat'); ctx.translate(x, y); ctx.fill(); ctx.restore();
  }
  const fit = (ctx, text, max, size, weight = 800) => { let f = size; do { ctx.font = `${weight} ${f}px "Roboto Condensed", "Arial Narrow", sans-serif`; f -= 4; } while (ctx.measureText(text).width > max && f > 30); };
  // Купеческое свидетельство для сторис. Весь контент — в безопасной зоне 270…1650 px,
  // чтобы его не перекрывали подписи и кнопки сторис Instagram/Telegram.
  const SAFE_TOP = 270, SAFE_BOTTOM = H - 270;
  async function drawStory(cv) {
    const OS = '"Old Standard TT", Georgia, serif', RC = '"Roboto Condensed", "Arial Narrow", sans-serif';
    try { await Promise.all([document.fonts.load(`italic 400 100px ${OS}`), document.fonts.load(`400 40px ${OS}`), document.fonts.load(`700 40px ${OS}`), document.fonts.load(`800 40px ${RC}`), document.fonts.load('400 40px "Golos Text"')]); } catch {}
    if (!logoImg.complete) await new Promise(r => { logoImg.onload = logoImg.onerror = r; });
    cv.width = W; cv.height = H; const ctx = cv.getContext('2d'), cream = '#f6eee4', cream2 = '#e3cfc6', line = 'rgba(246,238,228,.35)';
    ctx.fillStyle = '#8e2f34'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = line; ctx.lineWidth = 3; ctx.strokeRect(48, 48, W - 96, H - 96); ctx.lineWidth = 1.5; ctx.strokeRect(62, 62, W - 124, H - 124);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const u = uniq(), r = rankOf(u), user = inTg && tg.initDataUnsafe && tg.initDataUnsafe.user, hasName = !!(user && user.first_name);
    const circles = [];
    if (storyOpts.swatches) circles.push({ big: `${u}`, small: `из ${tinct.length}`, cap: 'образцов' });
    if (storyOpts.month) circles.push({ big: `${book.months[monthKey(now)] || 0}`, small: 'рюмок', cap: MONTHS_NOM[now.getMonth()].toLowerCase() });
    if (storyOpts.year) circles.push({ big: `${yearTotal()}`, small: 'рюмок', cap: `за ${now.getFullYear()}` });
    const showGrid = storyOpts.swatches, split = showGrid && circles.length > 0;

    // Размеры блоков. В режиме «две колонки» слева сетка 4×5, справа кружки столбиком.
    const lw0 = storyPhoto ? 104 : 150, lh = logoImg.naturalWidth ? lw0 * logoImg.naturalHeight / logoImg.naturalWidth : 160;
    const titleH = 92;                           // «Купеческое свидетельство» + линия + воздух
    const cols = split ? 4 : 5, rows = Math.ceil(tinct.length / cols);
    let pr = storyPhoto ? 240 : 0, gs = split ? .9 : 1, cs = split ? 1 : 1;
    const gridW = k => (cols * 130 + (cols - 1) * 18) * k, gridHh = k => (rows * 98 + (rows - 1) * 18) * k;
    const circBlockH = k => split ? 0 : (circles.length ? 300 * k : 0);  // в две колонки кружки подстраиваются под высоту сетки
    const bodyH = () => split ? Math.max(gridHh(gs), circBlockH(cs)) + 30 : (showGrid ? gridHh(gs) + 40 : 0) + circBlockH(cs);
    const need = () => lh + 36 + titleH + (storyPhoto ? 2 * pr + 44 + 50 : 0) + (hasName ? 64 : 0) + (storyOpts.rank ? 150 : 0) + bodyH();
    const avail = SAFE_BOTTOM - 150 - SAFE_TOP;
    while (need() > avail && gs > .8) { gs -= .02; cs = Math.min(1, gs + .1); }
    while (need() > avail && pr > 170) pr -= 10;
    while (need() > avail && gs > .6) { gs -= .02; cs = Math.min(1, gs + .1); }
    while (need() > avail && pr > 110) pr -= 10;
    let y = SAFE_TOP + Math.max(0, (avail - need()) / 2);

    if (logoImg.naturalWidth) ctx.drawImage(logoImg, (W - lw0) / 2, y, lw0, lh); y += lh + 36;
    // заголовок документа — Old Standard TT капителью, линия с ромбиком
    ctx.fillStyle = cream2; ctx.font = `400 38px ${OS}`; ctx.letterSpacing = '8px';
    ctx.fillText('КУПЕЧЕСКОЕ СВИДЕТЕЛЬСТВО', W / 2, y + 34); ctx.letterSpacing = '0px';
    const ly = y + 62; ctx.strokeStyle = line; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(W / 2 - 230, ly); ctx.lineTo(W / 2 - 14, ly); ctx.moveTo(W / 2 + 14, ly); ctx.lineTo(W / 2 + 230, ly); ctx.stroke();
    ctx.save(); ctx.translate(W / 2, ly); ctx.rotate(Math.PI / 4); ctx.fillStyle = cream2; ctx.fillRect(-5, -5, 10, 10); ctx.restore();
    y += titleH;
    if (storyPhoto) {
      const ring = 22, cx = W / 2, cy = y + 22 + ring + pr;  // кольцо не задевает линию заголовка
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, pr, 0, 7); ctx.clip();
      const sc = Math.max(2 * pr / storyPhoto.width, 2 * pr / storyPhoto.height);
      ctx.drawImage(storyPhoto, cx - storyPhoto.width * sc / 2, cy - storyPhoto.height * sc / 2, storyPhoto.width * sc, storyPhoto.height * sc); ctx.restore();
      ctx.beginPath(); ctx.arc(cx, cy, pr + 8, 0, 7); ctx.strokeStyle = cream; ctx.lineWidth = 8; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, pr + ring, 0, 7); ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.stroke();
      y = cy + pr + ring + 50;
    }
    if (hasName) { ctx.fillStyle = cream2; ctx.font = `italic 400 42px ${OS}`; ctx.fillText(`выдано ${user.first_name}`, W / 2, y + 30); y += 64; }
    if (storyOpts.rank) {
      ctx.fillStyle = cream; const t = r.t; let f = 104;
      do { ctx.font = `italic 400 ${f}px ${OS}`; f -= 4; } while (ctx.measureText(t).width > W - 200 && f > 40);
      ctx.fillText(t, W / 2, y + 96); y += 150;
    }
    const drawGrid = (gx, gy, k) => {
      const cw = 130 * k, ch = 98 * k, gap = 18 * k;
      tinct.forEach((t, i) => {
        const x = gx + (i % cols) * (cw + gap), yy = gy + Math.floor(i / cols) * (ch + gap);
        if (book.items[t.n]) drawSwatch(ctx, x, yy, cw, ch, t.n);
        else { ctx.save(); ctx.setLineDash([10, 8]); ctx.strokeStyle = 'rgba(246,238,228,.4)'; ctx.lineWidth = 3; ctx.strokeRect(x + 4, yy + 4, cw - 8, ch - 8); ctx.restore(); }
      });
    };
    const drawCircle = (cx, cy, d, c, capBelow) => {
      ctx.beginPath(); ctx.arc(cx, cy, d / 2, 0, 7); ctx.strokeStyle = cream; ctx.lineWidth = 3.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, d / 2 - 9, 0, 7); ctx.strokeStyle = line; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = cream; let f = d * .42; do { ctx.font = `700 ${f}px ${OS}`; f -= 2; } while (ctx.measureText(c.big).width > d - 46);
      ctx.fillText(c.big, cx, cy + d * .1);
      ctx.fillStyle = cream2; ctx.font = `700 ${Math.round(d * .13)}px ${RC}`; ctx.letterSpacing = '2px'; ctx.fillText(c.small.toUpperCase(), cx, cy + d * .3); ctx.letterSpacing = '0px';
      ctx.font = `italic 400 ${capBelow ? 36 : 34}px ${OS}`; ctx.fillStyle = cream2;
      if (capBelow) ctx.fillText(c.cap, cx, cy + d / 2 + 46);
    };
    if (split) {
      const gw = gridW(gs), d = 170 * cs, colGap = 56, total = gw + colGap + d + 140; // справа кружок + подпись сбоку
      const gx = (W - total) / 2, gy = y + 10;
      drawGrid(gx, gy, gs);
      // правая колонка ровно по высоте сетки: первый кружок — вровень с верхним рядом, последний — с нижним
      const gh = gridHh(gs), n = circles.length, dd = Math.min(d, n > 1 ? (gh - (n - 1) * 24) / n : d);
      const cx = gx + gw + colGap + d / 2, step = n > 1 ? (gh - dd) / (n - 1) : 0;
      circles.forEach((c, i) => {
        const cy = n > 1 ? gy + dd / 2 + i * step : gy + gh / 2;
        drawCircle(cx, cy, dd, c, false);
        ctx.textAlign = 'left'; ctx.fillStyle = cream2; ctx.font = `italic 400 34px ${OS}`; ctx.fillText(c.cap, cx + d / 2 + 18, cy + 12); ctx.textAlign = 'center';
      });
      y += gh + 30;
    } else {
      if (showGrid) { const gw = gridW(gs); drawGrid((W - gw) / 2, y + 10, gs); y += gridHh(gs) + 40; }
      if (circles.length) {
        const d = 220 * cs, gap = 46 * cs, total = circles.length * d + (circles.length - 1) * gap; let cx = (W - total) / 2 + d / 2;
        circles.forEach(c => { drawCircle(cx, y + d / 2 + 6, d, c, true); cx += d + gap; });
      }
    }
    // подпись бара — внутри безопасной зоны
    ctx.fillStyle = cream; ctx.font = `800 40px ${RC}`; ctx.letterSpacing = '10px'; ctx.fillText('МАНУФАКТУРА', W / 2, SAFE_BOTTOM - 76); ctx.letterSpacing = '0px';
    ctx.fillStyle = cream2; ctx.font = `italic 400 32px ${OS}`; ctx.fillText(`бар-кухня · ${B.address}`, W / 2, SAFE_BOTTOM - 32);
  }
  function openStory() {
    const opt = (k, label) => `<label class="tgl"><input type="checkbox" data-k="${k}" ${storyOpts[k] ? 'checked' : ''}><span>${label}</span></label>`;
    openSheet(`<h3 id="shTitle">Купеческое свидетельство</h3>
      <div class="story"><canvas id="cv" aria-label="Превью сторис"></canvas>
        <div class="story-side">
          <label class="btn ghost photo-btn">${storyPhoto ? 'Сменить фото' : 'Загрузить фото из бара'}<input type="file" accept="image/*" id="photoIn" hidden></label>
          ${storyPhoto ? '<button class="link" type="button" id="noPhoto">Убрать фото</button>' : ''}
          <div class="tgls">${opt('rank', 'Звание')}${opt('swatches', 'Образцы')}${opt('month', 'Рюмки за месяц')}${opt('year', 'Рюмки за год')}</div>
        </div></div>
      <button class="btn" type="button" id="saveStory">Сохранить картинку</button>
      <p class="hint">Сохраните и выложите в сторис с отметкой бара. Всё важное стоит в безопасной зоне — интерфейс сторис ничего не закроет.</p>`, () => {
      const cv = $('#cv'); drawStory(cv);
      sheetBody.querySelectorAll('.tgl input').forEach(i => i.onchange = () => { storyOpts[i.dataset.k] = i.checked; drawStory(cv); haptic('tap'); });
      $('#photoIn').onchange = e => { const f = e.target.files[0]; if (!f) return; const img = new Image(); img.onload = () => { storyPhoto = img; openStory(); }; img.src = URL.createObjectURL(f); };
      const np = $('#noPhoto'); if (np) np.onclick = () => { storyPhoto = null; openStory(); };
      $('#saveStory').onclick = async () => {
        const url = cv.toDataURL('image/png'); haptic('success');
        // На телефоне: системное «Поделиться» с файлом, если есть; иначе картинка на весь экран — долгое нажатие → сохранить.
        try {
          const blob = await (await fetch(url)).blob(), file = new File([blob], 'manufaktura-story.png', { type: 'image/png' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; }
        } catch (err) { if (err && err.name === 'AbortError') return; }
        const v = $('#viewer'); v.querySelector('img').src = url; v.querySelector('a').href = url; v.hidden = false;
      };
    });
  }
  $('#viewer').onclick = e => { if (e.target.closest('a')) return; $('#viewer').hidden = true; };
  $('#wedRule').textContent = isWed ? `Сегодня среда: все настойки по ${T.wednesday} ₽.` : `По средам все настойки по ${T.wednesday} ₽ вместо ${T.price}.`;
  $('#demoCode').textContent = `Демо: код дня для бармена ${dayCode(now)}. В рабочей версии бармен получает его в боте.`;
  $('#pages').onclick = e => {
    const b = e.target.closest('.sw'); if (!b) return; const c = tinct.find(t => t.n === b.dataset.n), it = book.items[c.n];
    haptic('tap');
    openSheet(`${it ? `<div class="sw-big">${swatchSVG(c.n, 160, 90)}</div>` : ''}<h3 id="shTitle">${esc(c.n)}</h3>
      <p class="ds">${esc(c.g)} · ${esc(c.d)} · 50 мл · ${isWed ? T.wednesday : T.price} ₽</p>
      ${it ? `<p class="hint">Образец «${WEAVES[tinct.indexOf(c) % 6]}» вшит ${esc(it.first)}. Выпито: ${shots(it.n)}.</p>` : ''}
      <form id="codeForm" novalidate><div class="code"><input id="code" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="····" aria-label="Код бармена"></div>
      <p class="err" id="codeErr">Код не подошёл. Попросите бармена ввести его ещё раз.</p>
      <p class="hint">Передайте телефон бармену: он введёт код дня, когда нальёт настойку.</p>
      <button class="btn" type="submit">${it ? 'Ещё рюмка' : 'Вшить образец'}</button></form>`, () => {
      const inp = $('#code');
      inp.oninput = () => { inp.value = inp.value.replace(/\D/g, '').slice(0, 4); inp.removeAttribute('aria-invalid'); $('#codeErr').classList.remove('on'); };
      $('#codeForm').onsubmit = ev => {
        ev.preventDefault();
        if (inp.value !== dayCode(now)) { inp.setAttribute('aria-invalid', 'true'); $('#codeErr').classList.add('on'); haptic('error'); return; }
        const was = book.items[c.n], before = rankOf(uniq()).t;
        book.items[c.n] = was ? { ...was, n: was.n + 1 } : { first: `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`, n: 1 };
        const mk = monthKey(now); book.months[mk] = (book.months[mk] || 0) + 1;
        store.save(book); if (!was) justSewn = c.n;
        closeSheet(); renderBook(); haptic('success');
        if (rankOf(uniq()).t !== before) setTimeout(() => { toast(`Новое звание: ${rankOf(uniq()).t.toLowerCase()}!`); scrollTo({ top: 0, behavior: 'smooth' }); }, 300);
      };
    });
  };
  store.load(v => { book = v; renderBook(); });

  /* ---------- Бронь ---------- */
  const user = inTg && tg.initDataUnsafe && tg.initDataUnsafe.user;
  if (user && user.first_name) $('#fName').value = user.first_name;
  const DAYS_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  let bookingToday = window.BookingTime.now(); bookingToday.setHours(0, 0, 0, 0);
  let days = [...Array(7)].map((_, i) => { const d = new Date(bookingToday); d.setDate(d.getDate() + i); return d; });
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  let selDate = days[0];
  const maxD = new Date(bookingToday); maxD.setDate(bookingToday.getDate() + 90);
  const MONTHS_N = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const chev = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
  let calMonth = null;
  const otherChip = () => $('#days [data-i="other"]');
  function openCal() {
    calMonth = calMonth || new Date(selDate.getFullYear(), selDate.getMonth(), 1);
    const draw = () => {
      const y = calMonth.getFullYear(), m = calMonth.getMonth();
      const first = (new Date(y, m, 1).getDay() + 6) % 7, nDays = new Date(y, m + 1, 0).getDate();
      const minM = new Date(bookingToday.getFullYear(), bookingToday.getMonth(), 1), maxM = new Date(maxD.getFullYear(), maxD.getMonth(), 1);
      let g = '<span></span>'.repeat(first);
      for (let d = 1; d <= nDays; d++) {
        const dt = new Date(y, m, d, 12), k = iso(dt), dw = dt.getDay();
        const off = k < iso(bookingToday) || k > iso(maxD);
        g += `<button type="button" data-d="${k}" class="${k === iso(bookingToday) ? 'today' : ''}${dw === 5 || dw === 6 ? ' wknd' : ''}" aria-pressed="${k === iso(selDate)}" ${off ? 'disabled' : ''} aria-label="${d} ${MONTHS[m]}">${d}</button>`;
      }
      sheetBody.innerHTML = `<div class="cal-h"><button class="cal-nav" type="button" id="calPrev" aria-label="Предыдущий месяц" ${calMonth <= minM ? 'disabled' : ''}>${chev('M15 5l-7 7 7 7')}</button>
        <b id="shTitle">${MONTHS_N[m]} ${y}</b><button class="cal-nav" type="button" id="calNext" aria-label="Следующий месяц" ${calMonth >= maxM ? 'disabled' : ''}>${chev('M9 5l7 7-7 7')}</button></div>
        <div class="cal-w">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(w => `<span>${w}</span>`).join('')}</div><div class="cal-g" id="calG">${g}</div>
        <p class="hint">Бронь до ${maxD.getDate()} ${MONTHS[maxD.getMonth()]}. Пятница и суббота — до 05:00.</p>`;
      $('#calPrev').onclick = () => { calMonth = new Date(y, m - 1, 1); draw(); haptic('tap'); };
      $('#calNext').onclick = () => { calMonth = new Date(y, m + 1, 1); draw(); haptic('tap'); };
      $('#calG').onclick = e => { const b = e.target.closest('button[data-d]'); if (!b || b.disabled) return;
        selDate = new Date(b.dataset.d + 'T12:00');
        const i = days.findIndex(x => iso(x) === b.dataset.d);
        $('#days').querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', i >= 0 ? x.dataset.i === String(i) : x === otherChip()));
        otherChip().textContent = i >= 0 ? 'Другая дата' : `${selDate.getDate()} ${MONTHS[selDate.getMonth()]}`;
        fill(); haptic('success'); closeSheet(); setTimeout(() => (i >= 0 ? $(`#days [data-i="${i}"]`) : otherChip()).scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }), 200); };
    };
    openSheet('', draw);
  }
  function renderDays() {
    $('#days').innerHTML = days.map((d, i) => `<button type="button" class="chip" aria-pressed="${iso(d) === iso(selDate)}" data-i="${i}">${i === 0 ? 'Сегодня' : i === 1 ? 'Завтра' : DAYS_SHORT[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}</button>`).join('') +
      `<button type="button" class="chip" aria-pressed="${!days.some(d => iso(d) === iso(selDate))}" data-i="other">Другая дата</button>`;
  }
  renderDays();
  $('#days').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; haptic('tap');
    if (b.dataset.i !== 'other') $('#days').querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', x === b));
    if (b.dataset.i === 'other') { openCal(); return; }
    selDate = days[+b.dataset.i]; otherChip().textContent = 'Другая дата'; calMonth = null;
    fill(); };
  const isToday = () => iso(selDate) === iso(bookingToday);
  const fTime = $('#fTime');
  function fill() {
    const previous = fTime.value;
    const o = window.BookingTime.slots(selDate);
    fTime.innerHTML = o.length ? o.map(t => `<option>${t}</option>`).join('') : '<option value="">На эту дату уже поздно</option>';
    if (o.includes(previous)) fTime.value = previous;
    else if (o.includes('20:00')) fTime.value = '20:00';
  }
  function refreshBookingDay() {
    const current = window.BookingTime.now(); current.setHours(0,0,0,0);
    if (iso(current) === iso(bookingToday)) return false;
    bookingToday = current;
    days = [...Array(7)].map((_, i) => { const d = new Date(current); d.setDate(d.getDate()+i); return d; });
    maxD.setTime(current.getTime()); maxD.setDate(current.getDate()+90);
    if (iso(selDate) < iso(current)) selDate = days[0];
    calMonth = null; renderDays(); fill();
    return true;
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !$('#send').disabled) { refreshBookingDay(); fill(); }
  });
  fill();
  let guests = 2; const gO = $('#gO'), gM = $('#gM'), gP = $('#gP');
  const setG = n => { guests = Math.max(1, Math.min(20, n)); gO.textContent = guests; gM.disabled = guests <= 1; gP.disabled = guests >= 20; };
  gM.onclick = () => { setG(guests - 1); haptic('tap'); }; gP.onclick = () => { setG(guests + 1); haptic('tap'); }; setG(2);
  const fPhone = $('#fPhone');
  fPhone.oninput = () => {
    let d = fPhone.value.replace(/\D/g, ''); if (d[0] === '8') d = '7' + d.slice(1); if (d && d[0] !== '7') d = '7' + d; d = d.slice(0, 11);
    const p = [d.slice(1, 4), d.slice(4, 7), d.slice(7, 9), d.slice(9, 11)];
    fPhone.value = d ? '+7' + (p[0] ? ' ' + p[0] : '') + (p[1] ? ' ' + p[1] : '') + (p[2] ? '-' + p[2] : '') + (p[3] ? '-' + p[3] : '') : '';
  };
  const check = (inp, err, ok) => { inp.setAttribute('aria-invalid', !ok); $(err).classList.toggle('on', !ok); return ok; };
  $('#form').onsubmit = async e => {
    e.preventDefault();
    if ($('#send').disabled) return;
    if (refreshBookingDay()) { toast('Наступил новый день. Проверьте дату и время брони.'); return; }
    const okN = check($('#fName'), '#eName', $('#fName').value.trim().length > 1);
    const okP = check(fPhone, '#ePhone', fPhone.value.replace(/\D/g, '').length === 11);
    if (!okN) { haptic('error'); return $('#fName').focus(); } if (!okP) { haptic('error'); return fPhone.focus(); } if (!fTime.value) return fTime.focus();
    const d = selDate, btn = $('#send'); btn.disabled = true; btn.textContent = 'Отправляем…';
    const payload = { name: $('#fName').value.trim(), phone: fPhone.value, date: iso(d), date_mode: 'calendar', time: fTime.value, guests, note: $('#fNote').value.trim(), tg_user: user ? user.id : null };
    const controls = [...$('#form').querySelectorAll('input, textarea, select, button')].map(el => [el, el.disabled]);
    controls.forEach(([el]) => { el.disabled = true; });
    let result;
    try {
      result = await window.submitBooking(B.webhookUrl, payload);
    } catch (error) {
      haptic('error'); alert(error.message + '\nТелефон бара: ' + B.phone); return;
    } finally {
      controls.forEach(([el, disabled]) => { el.disabled = disabled; });
      btn.disabled = false; btn.textContent = 'Отправить заявку';
    }
    const bookedDate = new Date(payload.date + 'T12:00');
    const dayTxt = `${bookedDate.getDate()} ${MONTHS[bookedDate.getMonth()]} ${bookedDate.getFullYear()}, ${DAYS_SHORT[bookedDate.getDay()].toLowerCase()}`;
    $('#okCard').innerHTML = [['Номер заявки', result.reservation_id], ['Когда', `${dayTxt}, ${payload.time}`], ['Гостей', payload.guests], ['Имя', payload.name], ['Телефон', payload.phone]]
      .concat(payload.note ? [['Пожелания', payload.note]] : []).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
    $('#demoNote').hidden = true;
    $('#form').hidden = true; $('#ok').hidden = false; haptic('success');
  };
  $('#okCall').onclick = () => openPhone();
  if (!B.webhookUrl) {
    $('#form').hidden = true;
    const fallback = document.createElement('div');
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Онлайн-бронирование пока недоступно. Позвоните нам, чтобы забронировать столик.';
    const call = document.createElement('button');
    call.type = 'button'; call.className = 'btn';
    call.textContent = 'Забронировать по телефону';
    call.onclick = () => openPhone();
    fallback.append(hint, call);
    $('#form').before(fallback);
  }
  $('#again').onclick = () => { window.resetBookingRequest(); refreshBookingDay(); $('#ok').hidden = true; $('#form').hidden = false; $('#form').reset(); if (user && user.first_name) $('#fName').value = user.first_name; selDate = days[0]; calMonth = null; otherChip().textContent = 'Другая дата'; $('#days').querySelectorAll('.chip').forEach((x, i) => x.setAttribute('aria-pressed', i === 0)); setG(2); fill(); };

  /* ---------- Телефон и карты ---------- */
  // В Telegram на iPhone ссылки tel: часто не срабатывают, поэтому даём и звонок, и копирование.
  const openExternal = url => { if (inTg) tg.openLink(url); else window.open(url, '_blank', 'noopener'); };
  function copyText(t) {
    const done = () => { haptic('success'); toast('Номер скопирован'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, fallback); else fallback();
    function fallback() { const ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch { toast('Не получилось скопировать — выделите номер'); } ta.remove(); }
  }
  function openPhone() {
    openSheet(`<h3 id="shTitle">Позвонить в бар</h3><p class="big-num">${esc(B.phone)}</p><p class="hint">Бронь, вопросы, банкеты.</p>
      <a class="btn" href="tel:${B.phoneRaw}" id="callNow">Позвонить</a><button class="btn ghost" type="button" id="copyNum">Скопировать номер</button>`, () => {
      $('#copyNum').onclick = () => copyText(B.phone);
      $('#callNow').onclick = () => haptic('tap');
    });
  }
  function openMaps() {
    const q = encodeURIComponent(`${B.city ? B.city + ', ' : ''}${B.address}`);
    const ya = `https://yandex.ru/maps/?text=${q}`, gis = B.map || `https://2gis.ru/search/${q}`;
    openSheet(`<h3 id="shTitle">${esc(B.address)}</h3><p class="ds">${esc(B.building)}${B.city ? ', ' + esc(B.city) : ''}</p>
      <button class="btn" type="button" id="toYa">Открыть в Яндекс Картах</button><button class="btn ghost" type="button" id="to2gis">Открыть в 2ГИС</button>`, () => {
      $('#toYa').onclick = () => { closeSheet(); openExternal(ya); };
      $('#to2gis').onclick = () => { closeSheet(); openExternal(gis); };
    });
  }

  /* ---------- О баре ---------- */
  $('#motto').textContent = `${B.motto}. ${B.about}.`;
  const ICON = {
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="m12 3.5 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8L12 3.5Z"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/></svg>',
    tip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 12.5h3.5l3 2.5h3.5a1.5 1.5 0 0 1 0 3H9.5M7.5 12.5V20M4 20h3.5"/><path d="m14.5 16 4.6-2.2a1.5 1.5 0 0 1 1.4 2.6L13.5 20H7.5"/><circle cx="15" cy="6.5" r="3"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 10h16M4 15h16M10 4v16M15 4v16"/></svg>'
  };
  const linkAct = (url, icon, label, demo) => `<a class="act" ${url ? `href="${esc(url)}" target="_blank" rel="noopener"` : `href="#" data-demo="${esc(demo)}"`}>${icon}${label}</a>`;
  const acts = withBingo => `<div class="acts">
      ${withBingo ? `<button class="act" type="button" data-go="bingo">${ICON.grid}Бинго</button>` : linkAct(B.review2gis, ICON.pin, 'Отзыв в 2ГИС', 'Ссылку на отзыв в 2ГИС добавим, когда её даст бар')}
      ${linkAct(B.reviewYandex, ICON.star, withBingo ? 'Отзыв' : 'Яндекс Карты', 'Ссылку на отзыв в Яндекс Картах добавим, когда её даст бар')}
      ${linkAct(B.tips, ICON.tip, 'Чаевые', 'Ссылку на чаевые команде добавим, когда бар подключит сервис')}</div>`;
  document.addEventListener('click', e => {
    const d = e.target.closest('[data-demo]'); if (d) { e.preventDefault(); toast('Демо: ' + d.dataset.demo + '.'); return; }
    const g = e.target.closest('.acts [data-go]'); if (g) show(g.dataset.go);
  });
  $('#history').innerHTML = `<h3>Дом 1873 года</h3>
    <p>Здание на бывшей Большой Тобольской улице построено в 1873 году как каменная лавка «Мануфактурные товары» купца первой гильдии Андрея Григорьевича Морозова. Его торговый дом «Морозов с сыновьями» держал восемь лавок, а в 1914 году был первым в уезде по обороту.</p>
    <p>Мануфактурой тогда называли ткани. Отсюда и наше имя, и книга образцов в этом приложении.</p>`;
  $('#aboutActs').innerHTML = `<div class="guest"><h3>Были у нас?</h3><p>Оставьте отзыв или поблагодарите команду бара.</p>${acts(false)}</div>`;
  $('#info').innerHTML = `
    <button type="button" id="addrBtn"><span class="k">Адрес</span><span class="v">${esc(B.address)}<small>${esc(B.building)}</small></span></button>
    <button type="button" id="phoneBtn"><span class="k">Телефон</span><span class="v">${esc(B.phone)}</span></button>
    <div><span class="k">Часы</span><span class="v2">${B.hours.map(h => `${h.days} ${h.time}`).join('<br>')}</span></div>`;
  $('#phoneBtn').onclick = () => { haptic('tap'); openPhone(); };
  $('#addrBtn').onclick = () => { haptic('tap'); openMaps(); };
  if (B.author) {
    const cr = $('#credit');
    cr.innerHTML = `Приложение сделал ${B.authorLink ? `<a href="${esc(B.authorLink)}" id="authorLink">${esc(B.author)}</a>` : esc(B.author)}`;
    const al = $('#authorLink'); if (al && inTg) al.onclick = e => { e.preventDefault(); /^https:\/\/t\.me\//.test(B.authorLink) ? tg.openTelegramLink(B.authorLink) : tg.openLink(B.authorLink); };
  }
  const tl = $('#tgLink'); tl.href = B.telegram;
  if (inTg) tl.onclick = e => { e.preventDefault(); tg.openTelegramLink(B.telegram); };
})();
