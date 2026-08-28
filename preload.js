const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dayflow', {
  setAutostart: (enable) => ipcRenderer.invoke('set-autostart', enable),
  getAutostart: () => ipcRenderer.invoke('get-autostart'),
  nativeNotify: (payload) => ipcRenderer.invoke('native-notify', payload),
  quit: () => ipcRenderer.send('app-quit'),
  onFocusReminders: (cb) => ipcRenderer.on('focus-reminders', cb),
  platform: process.platform
});
