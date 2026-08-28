/* Smoke test for DayFlow renderer logic (run with plain Node + jsdom). */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = __dirname;
const html = fs.readFileSync(path.join(ROOT, 'renderer', 'index.html'), 'utf8');

const dom = new JSDOM(html, {
  url: 'http://localhost/index.html',
  pretendToBeVisual: true,
  runScripts: 'outside-only'
});

const { window } = dom;
const errors = [];

// --- browser shims that jsdom lacks ---
window.scrollTo = () => {};
window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));
window.AudioContext = undefined; // audio not tested here
window.HTMLCanvasElement.prototype.getContext = function () {
  return {
    font: '', textBaseline: '', textAlign: '', fillStyle: '',
    measureText: () => ({ width: 50 }),
    fillText: () => {}
  };
};

// --- stub THREE with an auto-dummy Proxy (no WebGL in jsdom) ---
function makeDummy() {
  const fn = function () {};
  return new Proxy(fn, {
    get(target, prop) {
      if (prop === Symbol.toPrimitive) return () => 0;
      if (prop === 'then') return undefined;
      if (!(prop in target)) target[prop] = makeDummy();
      return target[prop];
    },
    apply() { return makeDummy(); },
    construct() { return makeDummy(); }
  });
}
window.THREE = makeDummy();

// --- capture uncaught errors ---
window.addEventListener('error', (e) => errors.push('window error: ' + e.message));

function runFile(rel) {
  const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  try {
    window.eval(code);
  } catch (e) {
    errors.push(`${rel}: ${e.stack}`);
  }
}

// Load scripts in the same order as index.html (three.min/OrbitControls skipped — stubbed)
runFile('renderer/three-scene.js');
runFile('renderer/nw-bridge.js'); // nw undefined → web fallback bridge
runFile('renderer/app.js');       // runs init()

// --- assertions ---
function check(name, cond) {
  console.log((cond ? '✔' : '✘') + ' ' + name);
  if (!cond) errors.push('ASSERT FAIL: ' + name);
}

check('timeline rendered', window.document.querySelectorAll('#todayTimeline .tl-item').length > 0);
check('stat cards = 4', window.document.querySelectorAll('#statCards .stat-card').length === 4);
check('calendar grid = 42 cells', window.document.querySelectorAll('#calendarGrid .cal-day').length === 42);
check('mini calendar = 42+ cells', window.document.querySelectorAll('#miniCalendar .mini-day').length >= 42);
check('task list rendered', window.document.querySelectorAll('#taskList .task-item').length > 0);

// switch views — must not throw
try {
  ['calendar', 'tasks', '3d', 'today'].forEach((v) => {
    window.document.querySelector(`.nav-item[data-view="${v}"]`).click();
  });
  check('view switching ok', true);
} catch (e) {
  errors.push('view switching: ' + e.stack);
  check('view switching ok', false);
}

// add a task + add an event programmatically
try {
  window.document.getElementById('taskInput').value = 'Тестовая задача';
  window.document.getElementById('btnAddTask').click();
  check('task added', window.document.querySelectorAll('#taskList .task-item').length > 1);

  // open modal + save event
  window.document.getElementById('btnQuickAdd').click();
  window.document.getElementById('evTitle').value = 'Тест-событие';
  window.document.getElementById('btnSaveEvent').click();
  check('event modal saved', window.document.querySelectorAll('#todayTimeline .tl-item').length > 0);
} catch (e) {
  errors.push('interaction: ' + e.stack);
  check('interaction ok', false);
}

console.log('\n--- errors ---');
if (errors.length === 0) console.log('NO ERRORS');
else errors.forEach((e) => console.log(e));

window.close();
process.exit(errors.length === 0 ? 0 : 1);
