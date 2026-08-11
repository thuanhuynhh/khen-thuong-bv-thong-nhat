import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktop", {
  getVersion: (): Promise<string> => ipcRenderer.invoke("app:version"),
  checkForUpdates: (): Promise<{ status: string; version?: string }> => ipcRenderer.invoke("updater:check"),
  onUpdateStatus: (callback: (data: { status: string; detail?: { percent?: number; version?: string; message?: string } }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: { status: string; detail?: { percent?: number; version?: string; message?: string } }) => callback(data);
    ipcRenderer.on("updater:status", listener);
    return () => ipcRenderer.removeListener("updater:status", listener);
  }
});
