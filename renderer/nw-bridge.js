/* ================= DayFlow — NW.js desktop bridge ================= */
'use strict';

(function () {
  // Fallback when opened in a plain browser (dev/preview)
  if (typeof nw === 'undefined' || typeof process === 'undefined' || !process.versions || !process.versions.nw) {
    window.dayflow = {
      platform: 'web',
      setAutostart: async () => false,
      getAutostart: async () => false,
      nativeNotify: async () => false,
      quit: () => {},
      focusWindow: () => {},
      onFocusReminders: () => {}
    };
    return;
  }

  const cp = require('child_process');
  const path = require('path');
  const fs = require('fs');
  const os = require('os');

  const ASSETS = path.join(__dirname, '..', 'assets');
  const win = nw.Window.get();
  let quitting = false;
  let tray = null;
  let focusCb = null;

  // -------------------------------------------------------------------------
  // Single-instance lock (via PID file + tasklist)
  // -------------------------------------------------------------------------
  function acquireLock() {
    try {
      const dir = path.join(os.tmpdir(), 'dayflow-lock');
      const file = path.join(dir, 'dayflow.lock');
      if (fs.existsSync(file)) {
        const pid = parseInt(fs.readFileSync(file, 'utf8'), 10);
        if (pid && pid !== process.pid) {
          try {
            const out = cp.execFileSync('tasklist', ['/FI', 'PID eq ' + pid, '/FO', 'CSV', '/NH'], { encoding: 'utf8' });
            if (out && out.indexOf('No tasks') === -1 && out.trim() !== '') return false;
          } catch (e) { /* stale lock — proceed */ }
        }
      }
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, String(process.pid));
      return true;
    } catch (e) { return true; }
  }

  // -------------------------------------------------------------------------
  // Autostart via Windows registry (HKCU\...\Run)
  // -------------------------------------------------------------------------
  const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  const RUN_VALUE = 'DayFlow';

  function setAutostart(enable) {
    try {
      const exe = process.execPath;
      if (enable) {
        cp.execFileSync('reg', ['add', RUN_KEY, '/v', RUN_VALUE, '/t', 'REG_SZ', '/d', '"' + exe + '"', '/f']);
      } else {
        cp.execFileSync('reg', ['delete', RUN_KEY, '/v', RUN_VALUE, '/f']);
      }
      return enable;
    } catch (e) { return false; }
  }

  function getAutostart() {
    try {
      const out = cp.execFileSync('reg', ['query', RUN_KEY, '/v', RUN_VALUE], { encoding: 'utf8' });
      return out.indexOf(RUN_VALUE) !== -1;
    } catch (e) { return false; }
  }

  // -------------------------------------------------------------------------
  // Tray
  // -------------------------------------------------------------------------
  function buildTray() {
    try {
      const icon = path.join(ASSETS, 'tray.png');
      tray = new nw.Tray({ icon: icon, title: 'DayFlow' });
      const menu = new nw.Menu();
      menu.append(new nw.MenuItem({
        label: 'Открыть DayFlow',
        click: function () { try { win.show(); win.focus(); } catch (e) {} }
      }));
      menu.append(new nw.MenuItem({
        label: 'Показать напоминания',
        click: function () {
          try { win.show(); win.focus(); } catch (e) {}
          if (focusCb) focusCb();
        }
      }));
      menu.append(new nw.MenuItem({ type: 'separator' }));
      menu.append(new nw.MenuItem({
        label: 'Запускать вместе с Windows',
        type: 'checkbox',
        checked: getAutostart(),
        click: function () { this.checked = setAutostart(this.checked); }
      }));
      menu.append(new nw.MenuItem({ type: 'separator' }));
      menu.append(new nw.MenuItem({
        label: 'Выход',
        click: function () { quitting = true; nw.App.quit(); }
      }));
      tray.menu = menu;
      tray.on('click', function () { try { win.show(); win.focus(); } catch (e) {} });
    } catch (e) { /* tray unavailable — app still works */ }
  }

  // -------------------------------------------------------------------------
  // Close → hide to tray (keep reminders running in background)
  // -------------------------------------------------------------------------
  win.on('close', function () {
    if (!quitting) {
      this.hide();
    }
  });

  // -------------------------------------------------------------------------
  // Public bridge (same interface the UI expects)
  // -------------------------------------------------------------------------
  window.dayflow = {
    platform: process.platform,
    setAutostart: (enable) => setAutostart(!!enable),
    getAutostart: () => getAutostart(),
    nativeNotify: (payload) => {
      try {
        if (payload && payload.title) {
          new Notification(payload.title, {
            body: payload.body || '',
            silent: true,
            icon: path.join(ASSETS, 'icon.png')
          });
          return true;
        }
        return false;
      } catch (e) { return false; }
    },
    quit: () => { quitting = true; nw.App.quit(); },
    focusWindow: () => { try { win.show(); win.focus(); } catch (e) {} },
    onFocusReminders: (cb) => { focusCb = cb; }
  };

  // -------------------------------------------------------------------------
  // Init
  // -------------------------------------------------------------------------
  if (!acquireLock()) {
    nw.App.quit();
    return;
  }
  buildTray();

  // Enable autostart on first run (user asked for it); can be toggled off later
  try {
    const marker = path.join(nw.App.dataPath, '.autostart-set');
    if (!fs.existsSync(marker)) {
      setAutostart(true);
      fs.writeFileSync(marker, '1');
    }
  } catch (e) { /* ignore */ }
})();
