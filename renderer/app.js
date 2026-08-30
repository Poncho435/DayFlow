/* ================= DayFlow — application logic ================= */
'use strict';

// ---------------------------------------------------------------------------
// Constants & categories
// ---------------------------------------------------------------------------
const CATEGORIES = {
  work:     { label: 'Работа',    color: '#6d7cff', emoji: '💼' },
  personal: { label: 'Личное',    color: '#f472b6', emoji: '🏠' },
  health:   { label: 'Здоровье',  color: '#34d399', emoji: '🏃' },
  study:    { label: 'Учёба',     color: '#fbbf24', emoji: '📚' },
  other:    { label: 'Другое',    color: '#22d3ee', emoji: '✨' }
};

const PRIORITY = {
  high:   { label: 'Высокий',  color: '#f87171' },
  medium: { label: 'Средний',  color: '#fbbf24' },
  low:    { label: 'Низкий',   color: '#34d399' }
};

const DOW_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const DOW_FULL  = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function pad(n) { return String(n).padStart(2, '0'); }
function fmtDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function todayStr() { return fmtDate(new Date()); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function startOfWeek(d) { const r = new Date(d); const day = (r.getDay() + 6) % 7; r.setDate(r.getDate() - day); return r; }
function daysBetween(a, b) { return Math.round((b - a) / 86400000); }
function minutesOf(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function catColor(c) { return (CATEGORIES[c] || CATEGORIES.other).color; }
function catLabel(c) { return (CATEGORIES[c] || CATEGORIES.other).label; }

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

// ---------------------------------------------------------------------------
// State & persistence
// ---------------------------------------------------------------------------
const STORE_KEY = 'dayflow.data.v1';
let state = {
  events: [],
  tasks: [],
  settings: {
    sound: true,          // постоянный звуковой сигнал
    soundDuration: 180,   // секунд звучания (3 мин), 0 = пока не нажмут кнопку
    snoozeMinutes: 10,    // через сколько напомнить снова
    tray: true,           // сворачивать в трей
    reminders: true,      // мастер-выключатель напоминаний
    alwaysOnTop: true,    // окно напоминания поверх всех приложений
    nativeNotif: true     // системное уведомление Windows
  },
  firedReminders: {},
  snoozed: {}
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state.events = parsed.events || [];
      state.tasks = parsed.tasks || [];
      state.settings = Object.assign(state.settings, parsed.settings || {});
      state.firedReminders = parsed.firedReminders || {};
      state.snoozed = parsed.snoozed || {};
    }
  } catch (e) { /* ignore */ }
}
function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Events: repeating occurrence expansion
// ---------------------------------------------------------------------------
function occurrencesOf(ev, fromDate, toDate) {
  // returns array of concrete {date, start, end} occurrences within range
  const base = parseDate(ev.date);
  const out = [];
  if (ev.repeat === 'none' || ev.repeat === undefined) {
    if (base >= fromDate && base <= toDate) out.push({ date: fmtDate(base), start: ev.start, end: ev.end });
    return out;
  }
  const horizon = 90; // look ahead 90 days for repeats
  const start = new Date(Math.min(base.getTime(), fromDate.getTime()));
  const end = new Date(Math.max(toDate.getTime(), addDays(new Date(), horizon).getTime()));
  let cur = new Date(base);
  let guard = 0;
  while (cur <= end && guard < 800) {
    if (cur >= fromDate && cur <= toDate) {
      out.push({ date: fmtDate(cur), start: ev.start, end: ev.end });
    }
    if (ev.repeat === 'daily') cur = addDays(cur, 1);
    else if (ev.repeat === 'weekly') cur = addDays(cur, 7);
    else if (ev.repeat === 'monthly') cur = new Date(cur.getFullYear(), cur.getMonth() + 1, cur.getDate());
    guard++;
  }
  return out;
}

function eventsOnDate(dateStr) {
  const d = parseDate(dateStr);
  const result = [];
  state.events.forEach((ev) => {
    occurrencesOf(ev, d, d).forEach((occ) => {
      result.push({ ...ev, date: occ.date, start: occ.start, end: occ.end });
    });
  });
  result.sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
  return result;
}

function eventsBetween(fromStr, toStr) {
  const from = parseDate(fromStr), to = parseDate(toStr);
  const result = [];
  state.events.forEach((ev) => {
    occurrencesOf(ev, from, to).forEach((occ) => {
      result.push({ ...ev, date: occ.date, start: occ.start, end: occ.end });
    });
  });
  result.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  return result;
}

function baseEventById(id) { return state.events.find((e) => e.id === id); }

// ---------------------------------------------------------------------------
// Views navigation
// ---------------------------------------------------------------------------
let currentView = 'today';
let selectedDate = todayStr();     // for today/calendar nav
let calendarCursor = todayStr();   // for month grid + mini calendar

const VIEW_TITLES = { today: 'Сегодня', calendar: 'Календарь', '3d': '3D-хроника', tasks: 'Задачи' };

function setView(view) {
  currentView = view;
  $$('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.view === view));
  $$('.view').forEach((v) => v.classList.remove('active'));
  $('#view-' + view).classList.add('active');
  $('#viewTitle').textContent = VIEW_TITLES[view];
  // show/hide date nav for relevant views
  const showNav = (view === 'today' || view === 'calendar');
  $('.date-nav').style.visibility = showNav ? 'visible' : 'hidden';
  renderAll();
  if (view === '3d') setTimeout(() => { if (window.ThreeScene) ThreeScene.resize(); }, 60);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function renderAll() {
  renderHero();
  renderStatCards();
  renderTodayTimeline();
  renderUpcoming();
  renderCalendar();
  renderDayDetail();
  renderTasks();
  renderMiniCalendar();
  renderBellBadge();
  if (currentView === '3d' && window.ThreeScene) ThreeScene.render();
}

// --- Hero ---
function renderHero() {
  const now = new Date();
  $('#heroDate').textContent = capitalize(`${DOW_FULL[(now.getDay() + 6) % 7]}, ${now.getDate()} ${MONTHS_GEN[now.getMonth()]}`);
  $('#heroGreeting').textContent = greeting() + '!';
  const todays = eventsOnDate(todayStr());
  const next = todays.find((e) => minutesOf(e.start) >= now.getHours() * 60 + now.getMinutes());
  if (todays.length === 0) $('#heroSummary').textContent = 'Сегодня свободный день — время для важных дел и отдыха.';
  else if (next) $('#heroSummary').textContent = `Ближайшее: «${next.title}» в ${next.start}. Всего событий сегодня: ${todays.length}.`;
  else $('#heroSummary').textContent = `Все события на сегодня завершены (${todays.length}). Отличная работа!`;
}

function renderStatCards() {
  const now = new Date();
  const today = todayStr();
  const todays = eventsOnDate(today);
  const done = todays.filter((e) => minutesOf(e.end) <= now.getHours() * 60 + now.getMinutes()).length;
  const upcoming = todays.filter((e) => minutesOf(e.start) > now.getHours() * 60 + now.getMinutes()).length;
  const tasksTotal = state.tasks.length;
  const tasksDone = state.tasks.filter((t) => t.done).length;

  $('#statCards').innerHTML = `
    <div class="stat-card">
      <div class="stat-icon blue">📅</div>
      <div class="stat-value">${todays.length}</div>
      <div class="stat-label">Событий сегодня</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon green">✅</div>
      <div class="stat-value">${done}</div>
      <div class="stat-label">Завершено</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon amber">⏳</div>
      <div class="stat-value">${upcoming}</div>
      <div class="stat-label">Предстоит</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon pink">🎯</div>
      <div class="stat-value">${tasksDone}/${tasksTotal}</div>
      <div class="stat-label">Задачи выполнены</div>
    </div>
  `;
}

// --- Today timeline ---
function renderTodayTimeline() {
  const today = todayStr();
  const events = eventsOnDate(today);
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const el = $('#todayTimeline');

  if (events.length === 0) {
    el.innerHTML = `<div class="tl-empty"><div class="big">🌤️</div>На сегодня ничего не запланировано.<br>Добавьте событие кнопкой «Новое событие».</div>`;
    $('#todayCount').textContent = '';
    return;
  }
  $('#todayCount').textContent = `${events.length} событ.`;

  el.innerHTML = events.map((ev) => {
    const startMin = minutesOf(ev.start), endMin = minutesOf(ev.end);
    const cls = endMin < nowMin ? 'past' : (startMin <= nowMin ? 'now' : '');
    const duration = endMin - startMin;
    return `
      <div class="tl-item ${cls}" data-id="${ev.id}" data-date="${ev.date}">
        <div class="tl-time">${ev.start}<br><span style="color:var(--text-faint);font-size:11px">${ev.end}</span></div>
        <div class="tl-body">
          <div class="tl-title">${esc(ev.title)}</div>
          <div class="tl-meta">
            <span class="tl-chip" style="background:${catColor(ev.category)}22;color:${catColor(ev.category)}">${catLabel(ev.category)}</span>
            <span class="tl-chip pri-${ev.priority}">${PRIORITY[ev.priority].label}</span>
            ${ev.repeat !== 'none' ? `<span class="tl-chip">🔁 повтор</span>` : ''}
            <span class="tl-chip">${duration} мин</span>
            ${ev.reminder > 0 ? `<span class="tl-chip">🔔 за ${ev.reminder} мин</span>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');
}

// --- Upcoming (sidebar + today panel) ---
function upcomingEvents(limit = 6) {
  const now = new Date();
  const from = todayStr();
  const to = fmtDate(addDays(now, 14));
  const all = eventsBetween(from, to);
  return all.filter((e) => {
    const d = new Date(`${e.date}T${e.start}`);
    return d >= now;
  }).slice(0, limit);
}

function renderUpcoming() {
  const list = upcomingEvents(6);
  const wrap = $('#todayUpcoming');
  if (list.length === 0) {
    wrap.innerHTML = `<div class="tl-empty"><div class="big">🔔</div>Ближайших напоминаний нет.</div>`;
  } else {
    wrap.innerHTML = list.map((ev) => {
      const d = new Date(`${ev.date}T${ev.start}`);
      const rel = relativeDay(ev.date);
      return `
        <div class="upcoming-row">
          <span class="upcoming-dot" style="background:${catColor(ev.category)}"></span>
          <div style="flex:1;min-width:0">
            <div class="u-title">${esc(ev.title)}</div>
            <div class="u-when">${rel} · ${ev.start}</div>
          </div>
          <span class="tl-chip pri-${ev.priority}">${PRIORITY[ev.priority].label}</span>
        </div>`;
    }).join('');
  }

  const side = $('#sidebarUpcoming');
  const sideList = list.slice(0, 4);
  if (sideList.length === 0) {
    side.innerHTML = `<div class="upcoming-empty">Ближайшие события<br>появятся здесь</div>`;
  } else {
    side.innerHTML = sideList.map((ev) => {
      const d = new Date(`${ev.date}T${ev.start}`);
      return `
        <div class="upcoming-item">
          <span class="upcoming-dot" style="background:${catColor(ev.category)}"></span>
          <div class="upcoming-info">
            <div class="upcoming-title">${esc(ev.title)}</div>
            <div class="upcoming-time">${relativeDay(ev.date)} · ${ev.start}</div>
          </div>
        </div>`;
    }).join('');
  }
}

function relativeDay(dateStr) {
  const today = todayStr();
  const tomorrow = fmtDate(addDays(new Date(), 1));
  if (dateStr === today) return 'Сегодня';
  if (dateStr === tomorrow) return 'Завтра';
  const d = parseDate(dateStr);
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
}

// --- Month calendar ---
function renderCalendar() {
  const d = parseDate(calendarCursor);
  const year = d.getFullYear(), month = d.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // Monday-first
  const gridStart = addDays(first, -startOffset);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  $('#calendarWeekdays').innerHTML = DOW_SHORT.map((d) => `<span>${d}</span>`).join('');

  let html = '';
  for (let i = 0; i < 42; i++) {
    const cellDate = addDays(gridStart, i);
    const isOther = cellDate.getMonth() !== month;
    const isToday = fmtDate(cellDate) === todayStr();
    const isSelected = fmtDate(cellDate) === selectedDate;
    const evs = eventsOnDate(fmtDate(cellDate));
    const shown = evs.slice(0, 3);
    const more = evs.length - shown.length;
    html += `
      <div class="cal-day ${isOther ? 'other' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" data-date="${fmtDate(cellDate)}">
        <div class="cal-day-num">${cellDate.getDate()}</div>
        <div class="cal-events">
          ${shown.map((e) => `<div class="cal-ev" style="background:${catColor(e.category)}">${e.start} ${esc(e.title)}</div>`).join('')}
          ${more > 0 ? `<div class="cal-more">+${more} ещё</div>` : ''}
        </div>
      </div>`;
  }
  $('#calendarGrid').innerHTML = html;
}

function renderDayDetail() {
  const evs = eventsOnDate(selectedDate);
  const d = parseDate(selectedDate);
  $('#dayDetailTitle').textContent = `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} · ${DOW_FULL[(d.getDay() + 6) % 7]}`;
  const el = $('#dayDetailTimeline');
  if (evs.length === 0) {
    el.innerHTML = `<div class="tl-empty">Нет событий в этот день.<br>Нажмите «Новое событие», чтобы добавить.</div>`;
    return;
  }
  el.innerHTML = evs.map((ev) => `
    <div class="tl-item" data-id="${ev.id}" data-date="${ev.date}">
      <div class="tl-time">${ev.start}<br><span style="color:var(--text-faint);font-size:11px">${ev.end}</span></div>
      <div class="tl-body">
        <div class="tl-title">${esc(ev.title)}</div>
        <div class="tl-meta">
          <span class="tl-chip" style="background:${catColor(ev.category)}22;color:${catColor(ev.category)}">${catLabel(ev.category)}</span>
          <span class="tl-chip pri-${ev.priority}">${PRIORITY[ev.priority].label}</span>
        </div>
      </div>
    </div>`).join('');
}

// --- Tasks ---
function renderTasks() {
  const el = $('#taskList');
  const total = state.tasks.length;
  const done = state.tasks.filter((t) => t.done).length;
  $('#tasksProgress').textContent = total ? `${done} из ${total}` : '';

  if (total === 0) {
    el.innerHTML = `<div class="tl-empty"><div class="big">🎯</div>Пока нет задач.<br>Создайте первую задачу выше.</div>`;
    return;
  }
  el.innerHTML = state.tasks.map((t) => `
    <div class="task-item ${t.done ? 'done' : ''}" data-id="${t.id}">
      <button class="task-check ${t.done ? 'checked' : ''}" data-id="${t.id}">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <span class="task-text">${esc(t.text)}</span>
      <button class="icon-btn task-del" data-id="${t.id}" title="Удалить">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>`).join('');
}

// --- Mini calendar ---
let miniCursor = new Date();
function renderMiniCalendar() {
  const year = miniCursor.getFullYear(), month = miniCursor.getMonth();
  $('#miniTitle').textContent = `${MONTHS_NOM[month]} ${year}`;
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const gridStart = addDays(first, -startOffset);

  let html = DOW_SHORT.map((d) => `<div class="mini-dow">${d}</div>`).join('');
  for (let i = 0; i < 42; i++) {
    const cell = addDays(gridStart, i);
    const isOther = cell.getMonth() !== month;
    const isToday = fmtDate(cell) === todayStr();
    const isSelected = fmtDate(cell) === selectedDate;
    const hasEvent = eventsOnDate(fmtDate(cell)).length > 0;
    html += `<div class="mini-day ${isOther ? 'other' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${hasEvent ? 'has-event' : ''}" data-date="${fmtDate(cell)}">${cell.getDate()}</div>`;
  }
  $('#miniCalendar').innerHTML = html;
}

function renderBellBadge() {
  const now = new Date();
  const pending = state.events.filter((ev) => {
    return ev.reminder > 0 && hasPendingReminder(ev, now);
  });
  const badge = $('#bellBadge');
  if (pending.length > 0) { badge.hidden = false; badge.textContent = pending.length; }
  else badge.hidden = true;
}

function esc(s) { return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------------------------------------------------------------------------
// Event modal
// ---------------------------------------------------------------------------
let editingId = null;

function openEventModal(prefillDate) {
  editingId = null;
  $('#modalTitle').textContent = 'Новое событие';
  $('#btnDeleteEvent').hidden = true;
  const now = new Date();
  const rounded = new Date(Math.ceil((now.getTime() + 30 * 60000) / (30 * 60000)) * (30 * 60000));
  $('#evTitle').value = '';
  $('#evDate').value = prefillDate || todayStr();
  $('#evStart').value = fmtTime(rounded);
  $('#evEnd').value = fmtTime(new Date(rounded.getTime() + 60 * 60000));
  $('#evCategory').value = 'work';
  $('#evPriority').value = 'medium';
  $('#evReminder').value = '15';
  $('#evRepeat').value = 'none';
  $('#evNotes').value = '';
  $('#modalBackdrop').hidden = false;
  setTimeout(() => $('#evTitle').focus(), 50);
}

function fmtTime(d) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }

function openEditModal(id, dateStr) {
  const ev = baseEventById(id);
  if (!ev) return;
  editingId = id;
  $('#modalTitle').textContent = 'Редактировать событие';
  $('#btnDeleteEvent').hidden = false;
  $('#evTitle').value = ev.title;
  $('#evDate').value = dateStr || ev.date;
  $('#evStart').value = ev.start;
  $('#evEnd').value = ev.end;
  $('#evCategory').value = ev.category;
  $('#evPriority').value = ev.priority;
  $('#evReminder').value = String(ev.reminder);
  $('#evRepeat').value = ev.repeat;
  $('#evNotes').value = ev.notes || '';
  $('#modalBackdrop').hidden = false;
}

function closeEventModal() { $('#modalBackdrop').hidden = true; }

function saveEvent() {
  const title = $('#evTitle').value.trim();
  if (!title) { toast('Введите название события', 'error'); return; }
  const date = $('#evDate').value;
  const start = $('#evStart').value;
  let end = $('#evEnd').value;
  if (minutesOf(end) <= minutesOf(start)) { toast('Время окончания должно быть позже начала', 'error'); return; }

  const data = {
    title,
    date,
    start,
    end,
    category: $('#evCategory').value,
    priority: $('#evPriority').value,
    reminder: parseInt($('#evReminder').value, 10),
    repeat: $('#evRepeat').value,
    notes: $('#evNotes').value.trim()
  };

  if (editingId) {
    const idx = state.events.findIndex((e) => e.id === editingId);
    if (idx >= 0) state.events[idx] = { ...state.events[idx], ...data };
    toast('Событие обновлено', 'success');
  } else {
    state.events.push({ id: uid(), ...data });
    toast('Событие добавлено', 'success');
  }
  saveState();
  closeEventModal();
  renderAll();
}

function deleteEvent() {
  if (!editingId) return;
  state.events = state.events.filter((e) => e.id !== editingId);
  saveState();
  closeEventModal();
  renderAll();
  toast('Событие удалено', 'info');
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
function addTask(text) {
  text = text.trim();
  if (!text) return;
  state.tasks.unshift({ id: uid(), text, done: false, createdAt: Date.now() });
  saveState();
  renderTasks();
  renderStatCards();
  $('#taskInput').value = '';
}

function toggleTask(id) {
  const t = state.tasks.find((t) => t.id === id);
  if (t) { t.done = !t.done; saveState(); renderTasks(); renderStatCards(); }
}
function deleteTask(id) {
  state.tasks = state.tasks.filter((t) => t.id !== id);
  saveState(); renderTasks(); renderStatCards();
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------
function hasPendingReminder(ev, now) {
  const key = reminderKey(ev, now);
  const t = reminderTime(ev, now);
  return t !== null && now >= t && !state.firedReminders[key];
}

function reminderKey(ev, now) {
  // key = id + concrete occurrence date
  const d = occurrenceDateFor(ev, now);
  return ev.id + '|' + d;
}

function occurrenceDateFor(ev, now) {
  // find the occurrence of ev whose reminder window contains `now`
  const from = addDays(now, -2);
  const to = addDays(now, 2);
  const occs = occurrencesOf(ev, from, to);
  // choose the occurrence whose start time is closest to now (past or upcoming)
  let best = null, bestDiff = Infinity;
  occs.forEach((o) => {
    const start = new Date(`${o.date}T${o.start}`);
    const diff = Math.abs(start - now);
    if (diff < bestDiff) { bestDiff = diff; best = o; }
  });
  return best ? best.date : ev.date;
}

function reminderTime(ev, now) {
  const occDate = occurrenceDateFor(ev, now);
  const start = new Date(`${occDate}T${ev.start}`);
  return new Date(start.getTime() - (ev.reminder || 0) * 60000);
}

function checkReminders() {
  if (state.settings.reminders === false) return; // напоминания выключены
  const now = new Date();
  let changed = false;
  state.events.forEach((ev) => {
    if (!ev.reminder || ev.reminder <= 0) return; // no reminder
    const key = reminderKey(ev, now);
    const t = reminderTime(ev, now);
    if (!t) return;
    if (now < t) return; // not time yet

    // honour snooze
    if (state.snoozed && state.snoozed[key]) {
      if (now < state.snoozed[key]) return;
      delete state.snoozed[key];
    }

    if (state.firedReminders[key]) return; // already fired for this occurrence

    // stale (app was closed past the window) — mark silently, don't spam
    if (now > new Date(t.getTime() + 30 * 60000)) {
      state.firedReminders[key] = true;
      changed = true;
      return;
    }

    fireReminder(ev, key);
    changed = true;
  });
  if (changed) { saveState(); renderBellBadge(); }
}

function fireReminder(ev, key) {
  state.firedReminders[key] = true;
  saveState();

  // показать полноэкранное окно напоминания
  showReminderPopup(ev, key);

  // системное уведомление Windows
  if (state.settings.nativeNotif !== false && window.dayflow && window.dayflow.nativeNotify) {
    window.dayflow.nativeNotify({ title: '🔔 ' + ev.title, body: `Начинается в ${ev.start} · ${catLabel(ev.category)}` });
  }

  // постоянный звуковой сигнал на заданное время
  if (state.settings.sound) {
    const dur = parseInt(state.settings.soundDuration, 10);
    startAlarm(isNaN(dur) ? 180 : dur);
  }
}

let currentReminderKey = null;

function showReminderPopup(ev, key) {
  currentReminderKey = key;
  $('#reminderTime').textContent = `${relativeDay(ev.date)} · ${ev.start}`;
  $('#reminderTitle').textContent = ev.title;
  $('#reminderMeta').textContent = `${catLabel(ev.category)} · ${PRIORITY[ev.priority].label} приоритет · до ${ev.end}`;
  const notes = $('#reminderNotes');
  if (ev.notes) { notes.hidden = false; notes.textContent = ev.notes; } else { notes.hidden = true; }
  $('#reminderOverlay').hidden = false;

  // подпись кнопки «Отложить»
  const snoozeLabel = $('#reminderSnooze');
  if (snoozeLabel) {
    const m = parseInt(state.settings.snoozeMinutes, 10) || 10;
    snoozeLabel.textContent = `Отложить (${m} мин)`;
  }

  // вывести окно поверх всех приложений и развернуть
  if (window.dayflow) {
    if (state.settings.alwaysOnTop !== false) {
      if (window.dayflow.setAlwaysOnTop) window.dayflow.setAlwaysOnTop(true);
      if (window.dayflow.maximize) window.dayflow.maximize();
    }
    if (window.dayflow.focusWindow) window.dayflow.focusWindow();
    if (window.dayflow.flashFrame) window.dayflow.flashFrame(true);
  }
}

function dismissReminder() {
  $('#reminderOverlay').hidden = true;
  currentReminderKey = null;
  stopAlarm();
  resetWindowState();
  renderBellBadge();
}

function snoozeReminder() {
  if (currentReminderKey) {
    state.snoozed = state.snoozed || {};
    const m = parseInt(state.settings.snoozeMinutes, 10) || 10;
    state.snoozed[currentReminderKey] = Date.now() + m * 60000;
    delete state.firedReminders[currentReminderKey];
    saveState();
  }
  const m = parseInt(state.settings.snoozeMinutes, 10) || 10;
  dismissReminder();
  toast(`Напомню через ${m} мин`, 'info');
}

// Вернуть окно в обычное состояние после закрытия напоминания
function resetWindowState() {
  if (window.dayflow) {
    if (window.dayflow.setAlwaysOnTop) window.dayflow.setAlwaysOnTop(false);
    if (window.dayflow.unmaximize) window.dayflow.unmaximize();
    if (window.dayflow.flashFrame) window.dayflow.flashFrame(false);
  }
}

// --- Persistent alarm sound («пи-пи-пи… пилим-пилим…») ---
let audioCtx = null;
let alarmInterval = null;   // интервал повторения рисунка сигнала
let alarmTimer = null;      // таймер остановки через N минут

function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// Один короткий «бип» на частоте freq (Гц) длительностью dur (сек)
function alarmBeep(ctx, t, freq, dur) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';            // «пищащий» будильник
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.16, t + 0.015);
  gain.gain.setValueAtTime(0.16, t + dur - 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

// Рисунок: «пи пи пи — пилим пилим» (3 коротких высоких + 2 длинных ниже)
function alarmPattern(ctx) {
  const now = ctx.currentTime;
  alarmBeep(ctx, now,        950, 0.14);   // пи
  alarmBeep(ctx, now + 0.22, 950, 0.14);   // пи
  alarmBeep(ctx, now + 0.44, 950, 0.14);   // пи
  alarmBeep(ctx, now + 0.72, 660, 0.28);   // пи-лим
  alarmBeep(ctx, now + 1.04, 660, 0.28);   // пи-лим
}

function startAlarm(durationSec) {
  stopAlarm();
  const ctx = ensureAudio();
  if (!ctx) return;
  alarmPattern(ctx);
  alarmInterval = setInterval(() => {
    const c = ensureAudio();
    if (c) alarmPattern(c);
  }, 1500);
  if (durationSec > 0) {
    alarmTimer = setTimeout(() => stopAlarm(), durationSec * 1000);
  }
}

function stopAlarm() {
  if (alarmInterval) { clearInterval(alarmInterval); alarmInterval = null; }
  if (alarmTimer) { clearTimeout(alarmTimer); alarmTimer = null; }
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
function toast(msg, type = 'info') {
  const container = $('#toastContainer');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  const icons = { success: '✅', info: '💡', error: '⚠️' };
  el.innerHTML = `<span>${icons[type] || '💡'}</span> ${esc(msg)}`;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('hide');
    setTimeout(() => el.remove(), 260);
  }, 2800);
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------
function bindEvents() {
  // navigation
  $$('.nav-item').forEach((n) => n.addEventListener('click', () => setView(n.dataset.view)));

  // view toggle (2D/3D) — quick access to 3D view
  $('#viewToggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.vt');
    if (!btn) return;
    $$('#viewToggle .vt').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    if (btn.dataset.mode === '3d') setView('3d');
    else if (currentView === '3d') setView('today');
  });

  // date nav
  $('#navPrev').addEventListener('click', () => { if (currentView === 'today') { selectedDate = fmtDate(addDays(parseDate(selectedDate), -1)); } else if (currentView === 'calendar') { calendarCursor = fmtDate(addDays(parseDate(calendarCursor), -1)); } renderAll(); });
  $('#navNext').addEventListener('click', () => { if (currentView === 'today') { selectedDate = fmtDate(addDays(parseDate(selectedDate), 1)); } else if (currentView === 'calendar') { calendarCursor = fmtDate(addDays(parseDate(calendarCursor), 1)); } renderAll(); });
  $('#btnToday').addEventListener('click', () => { selectedDate = todayStr(); calendarCursor = todayStr(); if (window.ThreeScene) ThreeScene.resetWeek(); renderAll(); });

  // mini calendar
  $('#miniPrev').addEventListener('click', () => { miniCursor = new Date(miniCursor.getFullYear(), miniCursor.getMonth() - 1, 1); renderMiniCalendar(); });
  $('#miniNext').addEventListener('click', () => { miniCursor = new Date(miniCursor.getFullYear(), miniCursor.getMonth() + 1, 1); renderMiniCalendar(); });
  $('#miniCalendar').addEventListener('click', (e) => {
    const day = e.target.closest('.mini-day');
    if (!day) return;
    selectedDate = day.dataset.date;
    renderAll();
  });

  // month calendar grid
  $('#calendarGrid').addEventListener('click', (e) => {
    const day = e.target.closest('.cal-day');
    if (!day) return;
    selectedDate = day.dataset.date;
    renderAll();
  });

  // timeline items -> edit
  document.addEventListener('click', (e) => {
    const item = e.target.closest('.tl-item');
    if (item && !e.target.closest('.task-check') && !e.target.closest('.task-del')) {
      openEditModal(item.dataset.id, item.dataset.date);
    }
  });

  // quick add + modal
  $('#btnQuickAdd').addEventListener('click', () => openEventModal(selectedDate));
  $('#modalClose').addEventListener('click', closeEventModal);
  $('#btnCancel').addEventListener('click', closeEventModal);
  $('#btnSaveEvent').addEventListener('click', saveEvent);
  $('#btnDeleteEvent').addEventListener('click', deleteEvent);
  $('#modalBackdrop').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeEventModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeEventModal(); $('#settingsBackdrop').hidden = true; if (!$('#reminderOverlay').hidden) dismissReminder(); }
    if (e.key === 'Enter' && !$('#modalBackdrop').hidden && e.target.tagName !== 'TEXTAREA') saveEvent();
  });

  // tasks
  $('#btnAddTask').addEventListener('click', () => addTask($('#taskInput').value));
  $('#taskInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') addTask($('#taskInput').value); });
  $('#taskList').addEventListener('click', (e) => {
    const check = e.target.closest('.task-check');
    const del = e.target.closest('.task-del');
    if (check) toggleTask(check.dataset.id);
    else if (del) deleteTask(del.dataset.id);
  });

  // reminders
  $('#reminderDone').addEventListener('click', dismissReminder);
  $('#reminderSnooze').addEventListener('click', snoozeReminder);

  // settings
  $('#btnSettings').addEventListener('click', openSettings);
  $('#settingsClose').addEventListener('click', () => $('#settingsBackdrop').hidden = true);
  $('#settingsBackdrop').addEventListener('click', (e) => { if (e.target === e.currentTarget) $('#settingsBackdrop').hidden = true; });
  $('#setReminders').addEventListener('change', (e) => { state.settings.reminders = e.target.checked; saveState(); });
  $('#setAlwaysOnTop').addEventListener('change', (e) => { state.settings.alwaysOnTop = e.target.checked; saveState(); });
  $('#setNativeNotif').addEventListener('change', (e) => { state.settings.nativeNotif = e.target.checked; saveState(); });
  $('#setSound').addEventListener('change', (e) => { state.settings.sound = e.target.checked; if (!e.target.checked) stopAlarm(); saveState(); });
  $('#setSoundDuration').addEventListener('change', (e) => { state.settings.soundDuration = parseInt(e.target.value, 10); saveState(); });
  $('#setSnooze').addEventListener('change', (e) => { state.settings.snoozeMinutes = parseInt(e.target.value, 10); saveState(); });
  $('#setTray').addEventListener('change', (e) => { state.settings.tray = e.target.checked; saveState(); });
  $('#setAutostart').addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    if (window.dayflow && window.dayflow.setAutostart) {
      const actual = await window.dayflow.setAutostart(enabled);
      e.target.checked = actual;
      toast(actual ? 'Автозапуск включён' : 'Автозапуск выключен', 'success');
    }
  });
  $('#btnClearData').addEventListener('click', () => {
    state.events = []; state.tasks = []; state.firedReminders = {};
    saveState(); renderAll();
    $('#settingsBackdrop').hidden = true;
    toast('Все данные сброшены', 'info');
  });

  // bell -> today view
  $('#notifBell').addEventListener('click', () => setView('today'));

  // tray "focus reminders"
  if (window.dayflow && window.dayflow.onFocusReminders) {
    window.dayflow.onFocusReminders(() => {
      setView('today');
      if (state.events.some((e) => e.reminder > 0)) toast('Ближайшие напоминания — на панели справа', 'info');
    });
  }

  // 3D week nav
  $('#threePrev').addEventListener('click', () => { if (window.ThreeScene) ThreeScene.shiftWeek(-1); });
  $('#threeNext').addEventListener('click', () => { if (window.ThreeScene) ThreeScene.shiftWeek(1); });
}

async function openSettings() {
  $('#settingsBackdrop').hidden = false;
  $('#setReminders').checked = state.settings.reminders !== false;
  $('#setAlwaysOnTop').checked = state.settings.alwaysOnTop !== false;
  $('#setNativeNotif').checked = state.settings.nativeNotif !== false;
  $('#setSound').checked = !!state.settings.sound;
  $('#setSoundDuration').value = String(state.settings.soundDuration != null ? state.settings.soundDuration : 180);
  $('#setSnooze').value = String(state.settings.snoozeMinutes != null ? state.settings.snoozeMinutes : 10);
  $('#setTray').checked = !!state.settings.tray;
  if (window.dayflow && window.dayflow.getAutostart) {
    $('#setAutostart').checked = await window.dayflow.getAutostart();
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
function init() {
  loadState();
  // seed a couple of demo events on very first launch so it's not empty
  if (!localStorage.getItem('dayflow.seeded')) {
    seedDemo();
    localStorage.setItem('dayflow.seeded', '1');
  }
  bindEvents();
  renderAll();
  if (window.ThreeScene) ThreeScene.init();

  // reminder scheduler
  checkReminders();
  setInterval(checkReminders, 20000);
  // update "now" highlighting every minute
  setInterval(() => { if (currentView === 'today') renderTodayTimeline(); renderBellBadge(); }, 60000);
}

function seedDemo() {
  const t = todayStr();
  const now = new Date();
  const h = now.getHours();
  const startAt = (hour, min = 0) => `${pad(hour)}:${pad(min)}`;
  state.events.push(
    { id: uid(), title: 'Утренняя планёрка', date: t, start: startAt(Math.max(h, 9), 0), end: startAt(Math.max(h, 9), 30), category: 'work', priority: 'high', reminder: 15, repeat: 'daily', notes: 'Обсудить цели дня и приоритеты' },
    { id: uid(), title: 'Спортзал', date: t, start: startAt(18, 30), end: startAt(19, 30), category: 'health', priority: 'medium', reminder: 30, repeat: 'weekly', notes: '' },
    { id: uid(), title: 'Изучение английского', date: t, start: startAt(20, 0), end: startAt(21, 0), category: 'study', priority: 'low', reminder: 10, repeat: 'daily', notes: '30 новых слов + практика' }
  );
  state.tasks.push(
    { id: uid(), text: 'Проверить почту и ответить на важные письма', done: false, createdAt: Date.now() },
    { id: uid(), text: 'Оплатить счета', done: true, createdAt: Date.now() },
    { id: uid(), text: 'Позвонить родителям', done: false, createdAt: Date.now() }
  );
  saveState();
}

// expose helpers to the 3D scene
window.DayFlowData = {
  eventsBetween,
  occurrencesOf,
  eventsOnDate,
  CATEGORIES,
  PRIORITY,
  todayStr,
  fmtDate,
  parseDate,
  addDays,
  startOfWeek,
  pad
};

init();
