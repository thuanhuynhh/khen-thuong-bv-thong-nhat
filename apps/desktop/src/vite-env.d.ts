/// <reference types="vite/client" />
interface Window {
  desktop?: {
    getVersion(): Promise<string>;
    checkForUpdates(): Promise<{ status: string; version?: string }>;
    installUpdate(): Promise<void>;
    onUpdateStatus(callback: (data: { status: string; detail?: { percent?: number; version?: string; message?: string } }) => void): () => void;
  };
}
