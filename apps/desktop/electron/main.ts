import { app, BrowserWindow, ipcMain, Menu, net, protocol, shell } from "electron";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { autoUpdater } = require("electron-updater") as typeof import("electron-updater");

const currentDir = path.dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;

protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

function sendUpdate(status: string, detail?: unknown) { mainWindow?.webContents.send("updater:status", { status, detail }); }

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1100, minHeight: 700, show: false,
    autoHideMenuBar: true,
    backgroundColor: "#f6f8fb", title: "Khen thưởng · Bệnh viện Thống Nhất",
    webPreferences: { preload: path.join(currentDir, "preload.mjs"), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const allowed = process.env.VITE_DEV_SERVER_URL && url.startsWith(process.env.VITE_DEV_SERVER_URL);
    if (!allowed && !url.startsWith("file:")) event.preventDefault();
  });
  if (process.env.VITE_DEV_SERVER_URL) void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  else void mainWindow.loadURL("app://bundle/");
}

ipcMain.handle("app:version", () => app.getVersion());
ipcMain.handle("updater:check", async () => {
  if (!app.isPackaged) return { status: "development" };
  const result = await autoUpdater.checkForUpdates();
  return { status: result?.updateInfo.version === app.getVersion() ? "current" : "available", version: result?.updateInfo.version };
});
ipcMain.handle("updater:install", () => { autoUpdater.quitAndInstall(false, true); });

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.on("checking-for-update", () => sendUpdate("checking"));
autoUpdater.on("update-available", (info) => sendUpdate("available", { version: info.version }));
autoUpdater.on("update-not-available", () => sendUpdate("current"));
autoUpdater.on("download-progress", (progress) => sendUpdate("downloading", { percent: Math.round(progress.percent) }));
autoUpdater.on("update-downloaded", (info) => sendUpdate("ready", { version: info.version }));
autoUpdater.on("error", (error) => sendUpdate("error", { message: error.message }));

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  const rendererRoot = path.resolve(currentDir, "../dist");
  protocol.handle("app", (request) => {
    const requestUrl = new URL(request.url);
    const relativePath = requestUrl.pathname === "/" ? "index.html" : decodeURIComponent(requestUrl.pathname.slice(1));
    const target = path.resolve(rendererRoot, relativePath);
    if (target !== rendererRoot && !target.startsWith(`${rendererRoot}${path.sep}`)) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(target).toString());
  });
  createWindow();
  if (app.isPackaged) setTimeout(() => void autoUpdater.checkForUpdates(), 5000);
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("second-instance", () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
