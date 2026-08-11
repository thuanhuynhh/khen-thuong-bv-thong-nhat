import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktop", {
  getVersion: (): Promise<string> => ipcRenderer.invoke("app:version"),
  checkForUpdates: (): Promise<{ status: string; version?: string }> => ipcRenderer.invoke("updater:check"),
  installUpdate: (): Promise<void> => ipcRenderer.invoke("updater:install"),
  onUpdateStatus: (callback: (data: { status: string; detail?: unknown }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { status: string; detail?: unknown }) => callback(data);
    ipcRenderer.on("updater:status", listener);
    return () => ipcRenderer.removeListener("updater:status", listener);
  }
});
