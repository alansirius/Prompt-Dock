const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("promptDock", {
  load: () => ipcRenderer.invoke("prompts:load"),
  save: (prompts) => ipcRenderer.invoke("prompts:save", prompts),
  copy: (text) => ipcRenderer.invoke("clipboard:copy", text),
  hide: () => ipcRenderer.invoke("window:hide"),
  onSummoned: (callback) => ipcRenderer.on("window:summoned", callback)
});
