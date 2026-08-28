const { app, BrowserWindow, Tray, Menu, ipcMain, Notification, nativeImage, shell, nativeTheme } = require('electron');
const path = require('path');

let mainWindow = null;
let tray = null;
let isQuitting = false;

const APP_NAME = 'DayFlow';

// ---------------------------------------------------------------------------
// Single instance lock
// ---------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ---------------------------------------------------------------------------
// Autostart (Windows / macOS)
// ---------------------------------------------------------------------------
function setAutostart(enable) {
  try {
    app.setLoginItemSettings({
      openAtLogin: enable,
      openAsHidden: false,
      path: process.execPath,
      args: ['--hidden']
    });
    return app.getLoginItemSettings().openAtLogin;
  } catch (e) {
    return false;
  }
}

function getAutostart() {
  try {
    return app.getLoginItemSettings().openAtLogin;
  } catch (e) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1024,
    minHeight: 660,
    show: false,
    backgroundColor: '#0b0e1a',
    title: APP_NAME,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) {
      mainWindow.show();
    }
  });

  // Hide to tray instead of closing
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------
function createTray() {
  let icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  if (icon.isEmpty()) icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'));
  const trayIcon = icon.resize({ width: 16, height: 16 });
  tray = new Tray(trayIcon);
  tray.setToolTip(APP_NAME);

  const menu = Menu.buildFromTemplate([
    { label: 'Открыть DayFlow', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { label: 'Показать напоминания', click: () => { mainWindow.show(); mainWindow.focus(); mainWindow.webContents.send('focus-reminders'); } },
    { type: 'separator' },
    {
      label: 'Автозапуск при входе',
      type: 'checkbox',
      checked: getAutostart(),
      click: (item) => setAutostart(item.checked)
    },
    { type: 'separator' },
    { label: 'Выход', click: () => { isQuitting = true; app.quit(); } }
  ]);

  tray.setContextMenu(menu);
  tray.on('double-click', () => { mainWindow.show(); mainWindow.focus(); });
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
ipcMain.handle('set-autostart', (e, enable) => setAutostart(!!enable));
ipcMain.handle('get-autostart', () => getAutostart());

// Native OS notification (backup for in-app popups)
ipcMain.handle('native-notify', (e, payload) => {
  try {
    const { title, body } = payload || {};
    if (Notification.isSupported()) {
      const n = new Notification({
        title: title || APP_NAME,
        body: body || '',
        silent: true, // sound is handled in-app for a consistent experience
        icon: path.join(__dirname, 'assets', 'icon.png')
      });
      n.show();
      return true;
    }
    return false;
  } catch (err) {
    return false;
  }
});

// Quit from tray (Windows)
ipcMain.on('app-quit', () => {
  isQuitting = true;
  app.quit();
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark';
  createWindow();
  createTray();

  // Enable autostart by default on first run (user asked for it)
  try {
    if (getAutostart() === false) {
      setAutostart(true);
    }
  } catch (e) { /* ignore */ }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else { mainWindow.show(); mainWindow.focus(); }
  });
});

app.on('window-all-closed', () => {
  // keep running in tray (do not quit)
  if (process.platform !== 'darwin' && isQuitting) {
    app.quit();
  }
});

app.on('before-quit', () => { isQuitting = true; });
