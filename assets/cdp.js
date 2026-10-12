/* Café de Palma website: live opening status in Dubai time, dated "What's on" entries, menus by café
   (the printed menus as a book, plus a full-screen reader), the booking dialog with pre-filled WhatsApp
   messages, the mobile menu and the gatherings enquiry.
   Café hours, WhatsApp numbers and gathering options live in the page's #cdp-data block. */
(function () {
  'use strict';
  var DATA = {};
  try { DATA = JSON.parse((document.getElementById('cdp-data') || {}).textContent || '{}'); } catch (e) { DATA = {}; }
  var CAFES = DATA.cafes || {};
  var TZ = 'Asia/Dubai';
  var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var isLive = /(^|\.)cafedepalma\.ae$/.test(location.hostname);

  function each(list, fn) { Array.prototype.forEach.call(list, fn); }

  /* ---------- time, always in Dubai ---------- */
  function nowIn(tz) {
    try {
      var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: 'numeric', minute: 'numeric', hourCycle: 'h23'
      }).formatToParts(new Date());
      var o = {};
      parts.forEach(function (p) { o[p.type] = p.value; });
      var day = WEEKDAYS.indexOf(o.weekday);
      var mins = (parseInt(o.hour, 10) % 24) * 60 + parseInt(o.minute, 10);
      if (day < 0 || isNaN(mins)) return null;
      return { day: day, mins: mins, date: o.year + '-' + o.month + '-' + o.day };
    } catch (e) { return null; }
  }
  /* minutes after midnight → "8 am", "12:30 pm" */
  function clock(m) {
    m = ((m % 1440) + 1440) % 1440;
    var h = Math.floor(m / 60), mm = m % 60, h12 = ((h + 11) % 12) + 1;
    return h12 + (mm ? ':' + (mm < 10 ? '0' : '') + mm : '') + (h >= 12 ? ' pm' : ' am');
  }

  /* ---------- opening status ---------- */
  function statusFor(id) {
    var c = CAFES[id];
    if (!c || !c.week) return null;
    var n = nowIn(c.tz || TZ);
    if (!n) return null;
    var today = c.week[n.day], yest = c.week[(n.day + 6) % 7], tom = c.week[(n.day + 1) % 7];
    if (yest && yest[1] > 1440 && n.mins < yest[1] - 1440) return { open: true, until: yest[1] };
    if (today && n.mins >= today[0] && n.mins < today[1]) return { open: true, until: today[1] };
    if (today && n.mins < today[0]) return { open: false, at: today[0], when: 'today' };
    return { open: false, at: tom ? tom[0] : null, when: 'tomorrow' };
  }
  function statusText(s, short) {
    if (!s) return '';
    if (s.open) return (short ? 'Open until ' : 'Open now · until ') + clock(s.until);
    if (s.at == null) return 'Closed today';
    if (s.when === 'today') return (short ? 'Opens at ' : 'Closed · opens at ') + clock(s.at);
    return (short ? 'Opens tomorrow ' : 'Closed · opens tomorrow at ') + clock(s.at);
  }
  function paintStatus() {
    each(document.querySelectorAll('[data-status]'), function (el) {
      var s = statusFor(el.getAttribute('data-status'));
      var t = statusText(s, el.hasAttribute('data-status-short'));
      el.textContent = t ? (el.getAttribute('data-status-prefix') || '') + t : '';
      el.classList.toggle('is-closed', !!s && !s.open);
    });
    paintEvents();
  }

  /* ---------- what's on: entries hide themselves after their last day; "Today" while they run ---------- */
  function paintEvents() {
    var n = nowIn(TZ);
    if (!n) return;
    each(document.querySelectorAll('[data-show-until]'), function (el) {
      el.hidden = n.date > el.getAttribute('data-show-until');
    });
    each(document.querySelectorAll('[data-show-after]'), function (el) {
      el.hidden = n.date <= el.getAttribute('data-show-after');
    });
    each(document.querySelectorAll('[data-on]'), function (el) {
      var r = el.getAttribute('data-on').split(' ');
      var on = n.date >= r[0] && n.date <= (r[1] || r[0]);
      el.classList.toggle('is-on', on);
      var badge = el.querySelector('.today');
      if (badge) badge.hidden = !on;
    });
  }

  /* ---------- menus: one café at a time; "#menu-creek-harbour" opens that café's menus ---------- */
  function selectMenuCafe(id) {
    var panels = document.querySelectorAll('.menu-panel[data-cafe]'), found = false;
    each(panels, function (p) { if (p.getAttribute('data-cafe') === id) found = true; });
    if (!found) return false;
    each(panels, function (p) { p.hidden = p.getAttribute('data-cafe') !== id; });
    each(document.querySelectorAll('[data-menu-cafe]'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-menu-cafe') === id));
    });
    renderBooks(id);
    return true;
  }
  function menuHash(hash) {
    var m = /^#menu-([a-z-]+)$/.exec(String(hash || ''));
    return m && CAFES[m[1]] ? m[1] : null;
  }
  function openMenuHash(hash, smooth) {
    var id = menuHash(hash);
    if (!id || !selectMenuCafe(id)) return false;
    var target = document.getElementById('menu-tools') || document.getElementById('menu');
    if (target) window.requestAnimationFrame(function () {
      target.scrollIntoView({ behavior: smooth && !reduceMotion ? 'smooth' : 'auto', block: 'start' });
    });
    return true;
  }

  /* ---------- the printed menus as a book: a spread at a time on the page, a page at a time full screen.
     Page images, folds and the PDF for each menu come from DATA.pages and DATA.books ---------- */
  var PAGES = DATA.pages || {};
  var BOOKS = DATA.books || {};
  var bookState = {};
  function byId(id) { return document.getElementById(id); }
  function pageInfo(b, p) { return PAGES[b.pages[p]] || {}; }
  function menuLabel(b, menu) {
    for (var i = 0; i < (b.menus || []).length; i++) if (b.menus[i][0] === menu) return b.menus[i][1];
    return menu === 'cover' ? 'Cover' : 'Menu';
  }
  function spreadOf(b, p) {
    for (var i = 0; i < b.spreads.length; i++) if (b.spreads[i].indexOf(p) > -1) return i;
    return 0;
  }
  function menusIn(b, s) {
    var list = [];
    (b.spreads[s] || []).forEach(function (p) {
      var m = pageInfo(b, p).menu;
      if (m && m !== 'cover' && list.indexOf(m) < 0) list.push(m);
    });
    return list;
  }
  function stateOf(id) {
    var b = BOOKS[id];
    if (!b || !b.spreads || !b.spreads.length) return null;
    if (!bookState[id]) {
      var first = b.menus && b.menus.length ? b.starts[b.menus[0][0]] : 0;
      bookState[id] = { s: spreadOf(b, first || 0), focus: null };
    }
    return bookState[id];
  }
  function renderBook(panel) {
    var id = panel.getAttribute('data-cafe'), b = BOOKS[id], st = stateOf(id);
    if (!st) return;
    var spread = b.spreads[st.s] || [], n = b.pages.length;
    var showing = st.focus ? [st.focus] : menusIn(b, st.s);
    var wrap = panel.querySelector('.mn-spread');
    if (wrap) wrap.classList.toggle('is-single', spread.length < 2);
    each(panel.querySelectorAll('.mn-pg'), function (btn, i) {
      var p = spread[i];
      btn.hidden = p == null;
      if (p == null) return;
      var info = pageInfo(b, p), im = btn.querySelector('img');
      btn.setAttribute('data-page', String(p));
      btn.setAttribute('aria-label', menuLabel(b, info.menu) + ', page ' + (p + 1) + ' of ' + n + '. Open full screen');
      btn.classList.toggle('is-dim', !!st.focus && info.menu !== st.focus);
      if (im && !panel.hidden) {
        if (info.w && info.h) { im.width = info.w; im.height = info.h; }
        var src = info.small || info.src;
        if (src && im.getAttribute('src') !== src) im.setAttribute('src', src);
      }
    });
    var count = panel.querySelector('.mn-count');
    if (count) {
      count.textContent = spread.length > 1
        ? 'Pages ' + (spread[0] + 1) + '–' + (spread[spread.length - 1] + 1) + ' of ' + n
        : 'Page ' + (spread[0] + 1) + ' of ' + n;
    }
    each(panel.querySelectorAll('.mn-nav'), function (nb) {
      var back = parseInt(nb.getAttribute('data-dir'), 10) < 0;
      nb.setAttribute('aria-disabled', String(back ? st.s <= 0 : st.s >= b.spreads.length - 1));
    });
    each(panel.querySelectorAll('[data-menu-tab]'), function (tb) {
      tb.setAttribute('aria-pressed', String(showing.indexOf(tb.getAttribute('data-menu-tab')) > -1));
    });
  }
  function renderBooks(id) {
    each(document.querySelectorAll('.menu-panel[data-cafe]'), function (panel) {
      if (!id || panel.getAttribute('data-cafe') === id) renderBook(panel);
    });
  }
  function turnBook(panel, dir) {
    var id = panel.getAttribute('data-cafe'), b = BOOKS[id], st = stateOf(id);
    if (!st) return;
    var s = Math.max(0, Math.min(b.spreads.length - 1, st.s + dir));
    if (s === st.s) return;
    st.s = s;
    st.focus = null;
    renderBook(panel);
  }
  /* a menu tab opens the spread where that menu starts; when the spread also holds another menu, that page steps back */
  function showMenuTab(panel, menu) {
    var id = panel.getAttribute('data-cafe'), b = BOOKS[id], st = stateOf(id);
    if (!st || b.starts[menu] == null) return;
    st.s = spreadOf(b, b.starts[menu]);
    st.focus = menusIn(b, st.s).length > 1 ? menu : null;
    renderBook(panel);
  }

  var reader = byId('menu-reader');
  var rd = { id: null, p: 0, opener: null };
  function isZoomed() { var s = byId('reader-stage'); return !!s && s.classList.contains('is-zoomed'); }
  function setZoom(on, rx, ry) {
    var stage = byId('reader-stage'), btn = byId('reader-zoom'), im = byId('reader-img');
    if (!stage) return;
    stage.classList.toggle('is-zoomed', on);
    if (btn) { btn.setAttribute('aria-pressed', String(on)); btn.textContent = on ? 'Zoom out' : 'Zoom in'; }
    if (on && im) {
      /* keep the spot that was tapped in the middle of the screen */
      var x = rx == null ? 0.5 : rx, y = ry == null ? 0 : ry;
      stage.scrollLeft = Math.max(0, im.offsetLeft + im.offsetWidth * x - stage.clientWidth / 2);
      stage.scrollTop = Math.max(0, im.offsetTop + im.offsetHeight * y - stage.clientHeight / 2);
    }
  }
  function buildReader(id) {
    var b = BOOKS[id], menus = byId('reader-menus'), pages = byId('reader-pages');
    byId('reader-title').textContent = 'Menu at ' + b.name;
    menus.textContent = '';
    pages.textContent = '';
    (b.menus || []).forEach(function (m) {
      if (b.starts[m[0]] == null) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rbtn';
      btn.textContent = m[1];
      btn.setAttribute('data-r-menu', m[0]);
      btn.setAttribute('aria-pressed', 'false');
      menus.appendChild(btn);
    });
    b.pages.forEach(function (k, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rbtn';
      btn.textContent = String(i + 1);
      btn.setAttribute('data-r-page', String(i));
      btn.setAttribute('aria-label', 'Page ' + (i + 1) + ', ' + menuLabel(b, pageInfo(b, i).menu));
      pages.appendChild(btn);
    });
  }
  function showPage(p, force) {
    var b = BOOKS[rd.id];
    if (!b) return;
    var n = b.pages.length;
    p = Math.max(0, Math.min(n - 1, p));
    if (p === rd.p && !force) return;
    rd.p = p;
    var info = pageInfo(b, p), im = byId('reader-img'), stage = byId('reader-stage'), pdf = byId('reader-pdf');
    setZoom(false);
    if (im) {
      if (info.w && info.h) { im.width = info.w; im.height = info.h; }
      if (info.src) im.src = info.src;
      im.alt = menuLabel(b, info.menu) + ', page ' + (p + 1) + ' of ' + n + ' of the ' + b.name + ' menu. The PDF has the same menu as text.';
    }
    if (stage) { stage.scrollTop = 0; stage.scrollLeft = 0; }
    var href = b.pdfs[info.menu] || (b.menus && b.pdfs[b.menus[0][0]]);
    if (pdf && href) pdf.href = href;
    each(byId('reader-menus').children, function (btn) {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-r-menu') === info.menu));
    });
    each(byId('reader-pages').children, function (btn) {
      if (+btn.getAttribute('data-r-page') === p) btn.setAttribute('aria-current', 'true');
      else btn.removeAttribute('aria-current');
    });
    byId('reader-prev').setAttribute('aria-disabled', String(p <= 0));
    byId('reader-next').setAttribute('aria-disabled', String(p >= n - 1));
    byId('reader-num').textContent = (p + 1) + ' / ' + n;
    byId('reader-count').textContent = 'Page ' + (p + 1) + ' of ' + n + ', ' + menuLabel(b, info.menu);
    [p - 1, p + 1].forEach(function (q) {
      if (q >= 0 && q < n && pageInfo(b, q).src) { var pre = new Image(); pre.src = pageInfo(b, q).src; }
    });
    /* the book on the page follows along, so closing the reader lands on the same spread */
    var st = stateOf(rd.id);
    if (st) { st.s = spreadOf(b, p); st.focus = null; renderBooks(rd.id); }
  }
  function openReader(id, p, opener) {
    if (!reader || typeof reader.showModal !== 'function' || !BOOKS[id]) return false;
    if (rd.id !== id) { rd.id = id; buildReader(id); }
    rd.opener = opener || null;
    closeNav();
    document.documentElement.classList.add('is-reading');
    if (!reader.open) reader.showModal();
    showPage(p || 0, true);
    var c = byId('reader-close');
    if (c) c.focus();
    return true;
  }
  if (reader) {
    reader.addEventListener('close', function () {
      document.documentElement.classList.remove('is-reading');
      setZoom(false);
      var o = rd.opener;
      rd.opener = null;
      /* back to the page that was open in the reader when it is on show, otherwise to whatever opened it */
      var panel = o && o.closest ? o.closest('.menu-panel') : null;
      if (panel) {
        each(panel.querySelectorAll('.mn-pg'), function (btn) {
          if (!btn.hidden && +btn.getAttribute('data-page') === rd.p) o = btn;
        });
      }
      if (o && o.focus && document.body.contains(o)) {
        try { o.focus({ preventScroll: true }); } catch (err) { o.focus(); }
      }
    });
    reader.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest('#reader-close')) { reader.close(); return; }
      if (t.closest('#reader-prev')) { showPage(rd.p - 1); return; }
      if (t.closest('#reader-next')) { showPage(rd.p + 1); return; }
      if (t.closest('#reader-zoom')) { setZoom(!isZoomed()); return; }
      var mb = t.closest('[data-r-menu]');
      if (mb) { var b = BOOKS[rd.id]; if (b && b.starts[mb.getAttribute('data-r-menu')] != null) showPage(b.starts[mb.getAttribute('data-r-menu')]); return; }
      var pb = t.closest('[data-r-page]');
      if (pb) { showPage(+pb.getAttribute('data-r-page')); return; }
      if (t.id === 'reader-img') {
        if (isZoomed()) { setZoom(false); return; }
        var r = t.getBoundingClientRect();
        setZoom(true, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      }
    });
    reader.addEventListener('keydown', function (e) {
      if (isZoomed() || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowLeft') { showPage(rd.p - 1); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { showPage(rd.p + 1); e.preventDefault(); }
    });
    var stageEl = byId('reader-stage'), sx = null, sy = 0;
    if (stageEl) {
      stageEl.addEventListener('touchstart', function (e) {
        if (e.touches.length === 1) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; } else sx = null;
      }, { passive: true });
      stageEl.addEventListener('touchend', function (e) {
        if (sx == null || isZoomed() || !e.changedTouches.length) { sx = null; return; }
        var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
        sx = null;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) showPage(rd.p + (dx < 0 ? 1 : -1));
      }, { passive: true });
    }
  }

  /* ---------- navigation ---------- */
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');
  function closeNav() {
    if (!nav) return;
    nav.classList.remove('is-open');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = !nav.classList.contains('is-open');
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeNav(); });
  }

  /* ---------- booking: pick a café, then WhatsApp with the message already written ---------- */
  var dialog = document.getElementById('book-dialog');
  function waBookLink(id, topic) {
    var c = CAFES[id];
    if (!c) return '#';
    var text = 'Hello Café de Palma, I would like to book a table at ' + c.name + (topic ? ' for ' + topic : '') + '.';
    return 'https://wa.me/' + c.wa + '?text=' + encodeURIComponent(text);
  }
  function openBook(topic) {
    if (!dialog || typeof dialog.showModal !== 'function') return false;
    each(dialog.querySelectorAll('[data-wa-book]'), function (a) { a.href = waBookLink(a.getAttribute('data-wa-book'), topic); });
    var t = document.getElementById('book-topic');
    if (t) { t.textContent = topic ? 'For ' + topic : ''; t.hidden = !topic; }
    paintStatus();
    closeNav();
    if (!dialog.open) dialog.showModal();
    return true;
  }
  if (dialog) {
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog || e.target.closest('[data-close-dialog]')) dialog.close();
    });
  }

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var t = e.target;
    if (!t || !t.closest) return;
    var opener = t.closest('[data-open-book]');
    if (opener) {
      if (openBook(opener.getAttribute('data-book-topic') || '')) e.preventDefault();
      return;
    }
    var panel = t.closest('.menu-panel[data-cafe]');
    if (panel) {
      var pid = panel.getAttribute('data-cafe');
      var tab = t.closest('[data-menu-tab]');
      if (tab) { showMenuTab(panel, tab.getAttribute('data-menu-tab')); return; }
      var turn = t.closest('.mn-nav');
      if (turn) {
        if (turn.getAttribute('aria-disabled') !== 'true') turnBook(panel, parseInt(turn.getAttribute('data-dir'), 10));
        return;
      }
      var pg = t.closest('.mn-pg');
      if (pg) { openReader(pid, +pg.getAttribute('data-page'), pg); return; }
      var rb = t.closest('[data-read]');
      if (rb) {
        var st = stateOf(pid), bk = BOOKS[pid];
        if (st) openReader(pid, st.focus ? bk.starts[st.focus] : bk.spreads[st.s][0], rb);
        return;
      }
    }
    var pick = t.closest('[data-menu-cafe]');
    if (pick) {
      var id = pick.getAttribute('data-menu-cafe');
      if (selectMenuCafe(id)) { try { history.replaceState(null, '', '#menu-' + id); } catch (err) { /* address stays */ } }
      return;
    }
    var g = t.closest('[data-gather]');
    if (g) {
      var sel = document.getElementById('g-place');
      if (sel) { sel.value = g.getAttribute('data-gather'); sel.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    var a = t.closest('a[href^="#"]');
    if (!a) return;
    var hash = a.getAttribute('href');
    closeNav();
    if (dialog && dialog.open) dialog.close();
    if (menuHash(hash) && openMenuHash(hash, true)) {
      e.preventDefault();
      try { history.pushState(null, '', hash); } catch (err) { /* address stays */ }
    }
  });
  window.addEventListener('hashchange', function () { openMenuHash(location.hash, true); });

  /* ---------- gatherings: the enquiry is written as you fill it in, then sent on WhatsApp ---------- */
  var form = document.getElementById('gather-form');
  if (form) {
    var OPTIONS = DATA.gatherings || {};
    var out = document.getElementById('g-preview');
    var send = document.getElementById('g-whatsapp');
    var sendTo = document.getElementById('g-sendto');
    var copyBtn = document.getElementById('g-copy');
    var copied = document.getElementById('g-copied');
    var val = function (id) { var el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
    var fmtDate = function (v) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return '';
      var p = v.split('-');
      try {
        return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
          .format(new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 12)));
      } catch (e) { return v; }
    };
    var fmtTime = function (v) { var m = /^(\d{1,2}):(\d{2})/.exec(v); return m ? clock(+m[1] * 60 + +m[2]) : ''; };
    var compose = function () {
      var o = OPTIONS[val('g-place')] || {};
      var line = 'I would like to ask about ' + (o.label || 'a gathering at Café de Palma');
      var occasion = val('g-occasion');
      if (occasion) line += ' for ' + occasion;
      var guests = parseInt(val('g-guests'), 10);
      if (guests > 0) line += ', for ' + guests + (guests === 1 ? ' guest' : ' guests');
      var d = fmtDate(val('g-date'));
      if (d) line += ' on ' + d;
      var tm = fmtTime(val('g-time'));
      if (tm) line += ' at ' + tm;
      line += '.';
      var msg = 'Hello Café de Palma,\n\n' + line;
      var notes = val('g-notes');
      if (notes) msg += '\n\n' + notes;
      msg += '\n\nThank you' + (val('g-name') ? ',\n' + val('g-name') : '');
      return { text: msg, cafe: CAFES[o.cafe] };
    };
    var update = function () {
      var m = compose();
      if (out) out.textContent = m.text;
      if (send && m.cafe) send.href = 'https://wa.me/' + m.cafe.wa + '?text=' + encodeURIComponent(m.text);
      if (sendTo && m.cafe) sendTo.textContent = m.cafe.name + ', ' + m.cafe.phone;
      if (copied) copied.textContent = '';
    };
    form.addEventListener('input', update);
    form.addEventListener('change', update);
    form.addEventListener('submit', function (e) { e.preventDefault(); if (send) send.focus(); });
    if (copyBtn) copyBtn.addEventListener('click', function () {
      var text = compose().text;
      var done = function () { if (copied) copied.textContent = 'Message copied. Paste it into WhatsApp or an email to info@cafedepalma.ae.'; };
      var fallback = function () {
        if (!out) return;
        var r = document.createRange();
        r.selectNodeContents(out);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        if (copied) copied.textContent = 'Your message is selected. Copy it with Ctrl+C or ⌘C.';
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
        else fallback();
      } catch (err) { fallback(); }
    });
    update();
  }

  /* ---------- the dish slideshow: arrows, a counter and a progress line over a scroll-snap track ---------- */
  each(document.querySelectorAll('[data-carousel]'), function (car) {
    var track = car.querySelector('.car-track');
    if (!track) return;
    var items = track.children, bar = car.querySelector('.car-progress span'), now = car.querySelector('[data-car-now]');
    var btns = car.querySelectorAll('[data-car]');
    function step() { return items.length > 1 ? items[1].offsetLeft - items[0].offsetLeft : track.clientWidth; }
    function paint() {
      var max = track.scrollWidth - track.clientWidth, x = track.scrollLeft;
      each(btns, function (b) {
        var back = b.getAttribute('data-car') === '-1';
        b.setAttribute('aria-disabled', String(back ? x <= 2 : x >= max - 2));
      });
      if (bar) {
        var w = track.scrollWidth ? track.clientWidth / track.scrollWidth : 1;
        bar.style.width = (w * 100) + '%';
        bar.style.left = (max > 0 ? (x / max) * (1 - w) * 100 : 0) + '%';
      }
      if (now) now.textContent = String(Math.min(items.length, Math.round(x / step()) + 1));
    }
    each(btns, function (b) {
      b.addEventListener('click', function () {
        if (b.getAttribute('aria-disabled') === 'true') return;
        var perView = Math.max(1, Math.floor(track.clientWidth / step()));
        track.scrollBy({ left: +b.getAttribute('data-car') * perView * step(), behavior: reduceMotion ? 'auto' : 'smooth' });
      });
    });
    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        track.scrollBy({ left: (e.key === 'ArrowRight' ? 1 : -1) * step(), behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    });
    track.addEventListener('scroll', function () { window.requestAnimationFrame(paint); }, { passive: true });
    window.addEventListener('resize', paint);
    paint();
  });

  /* ---------- sections ease in as they scroll into view ---------- */
  var revealEls = document.querySelectorAll('[data-reveal]');
  if (revealEls.length && 'IntersectionObserver' in window && !reduceMotion) {
    document.documentElement.classList.add('js-reveal');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    each(revealEls, function (el) { io.observe(el); });
  }

  /* ---------- what's on (home): the event buttons show one event or season at a time ---------- */
  each(document.querySelectorAll('[data-wo-tabs]'), function (bar) {
    var sec = bar.closest('section');
    var tabs = bar.querySelectorAll('[data-wo-tab]');
    function show(key) {
      each(tabs, function (t) { t.setAttribute('aria-pressed', String(t.getAttribute('data-wo-tab') === key)); });
      each(sec.querySelectorAll('[data-wo-panel]'), function (g) {
        var on = g.getAttribute('data-wo-panel').split(' ').indexOf(key) > -1;
        g.classList.toggle('is-off', !on);
        var shown = 0;
        each(g.querySelectorAll('[data-wo-item]'), function (it) {
          var vis = it.getAttribute('data-wo-item').split(' ').indexOf(key) > -1;
          it.classList.toggle('is-off', !vis);
          if (vis) shown++;
        });
        var grid = g.querySelector('.wo-grid');
        if (grid) grid.classList.toggle('is-one', on && shown === 1);
      });
    }
    paintEvents();
    var first = null;
    each(tabs, function (t) { if (!first && !t.hidden) first = t.getAttribute('data-wo-tab'); });
    if (first) show(first);
    bar.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-wo-tab]') : null;
      if (t) show(t.getAttribute('data-wo-tab'));
    });
  });

  /* ---------- small things ---------- */
  each(document.querySelectorAll('[data-year]'), function (el) { el.textContent = String(new Date().getFullYear()); });

  /* on the live domain only: the page's own title and Google Tag Manager (the container the current site uses) */
  if (isLive) {
    if (DATA.title) document.title = DATA.title;
    if (DATA.gtm) {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
      var g = document.createElement('script');
      g.async = true;
      g.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(DATA.gtm);
      document.head.appendChild(g);
    }
  }

  paintStatus();
  window.setInterval(paintStatus, 60000);
  renderBooks();
  if (location.hash) openMenuHash(location.hash, false);
})();
