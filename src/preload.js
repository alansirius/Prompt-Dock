const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("promptDock", {
  load: () => ipcRenderer.invoke("prompts:load"),
  save: (prompts) => ipcRenderer.invoke("prompts:save", prompts),
  chooseStore: () => ipcRenderer.invoke("store:choose"),
  openStore: (filePath) => ipcRenderer.invoke("store:open", filePath),
  copy: (text) => ipcRenderer.invoke("clipboard:copy", text),
  hide: () => ipcRenderer.invoke("window:hide"),
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  dismissUpdate: (version) => ipcRenderer.invoke("updates:dismiss", version),
  openUpdate: (url) => ipcRenderer.invoke("updates:open", url),
  onUpdateAvailable: (callback) => ipcRenderer.on("update:available", (_event, update) => callback(update)),
  onUpdateError: (callback) => ipcRenderer.on("update:error", (_event, message) => callback(message)),
  onSummoned: (callback) => ipcRenderer.on("window:summoned", callback)
});
