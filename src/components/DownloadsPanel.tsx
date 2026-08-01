import { useCallback, useEffect, useState } from "react";
import type { DownloadRecord } from "../inix.d";

interface DownloadsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function DownloadsPanel({ open, onClose }: DownloadsPanelProps) {
  const [downloads, setDownloads] = useState<DownloadRecord[]>([]);

  const refresh = useCallback(async () => {
    const list = await window.inix?.downloads.list();
    if (list) setDownloads(list);
  }, []);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  useEffect(() => {
    const unsub = window.inix?.downloads.onUpdated(() => {
      void refresh();
    });
    return () => unsub?.();
  }, [refresh]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="downloads-backdrop"
        aria-label="Close downloads"
        onClick={onClose}
      />
      <div className="downloads-panel" role="dialog" aria-label="Downloads">
        <header className="panel-header">
          <h2>Downloads</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        {downloads.length === 0 ? (
          <p className="panel-empty">No downloads yet</p>
        ) : (
          <ul className="downloads-list">
            {downloads.map((d) => (
              <li key={d.id} className={`download-item download-${d.state}`}>
                <div className="download-info">
                  <strong>{d.filename}</strong>
                  <span className="download-meta">
                    {d.state === "progressing" && d.totalBytes > 0
                      ? `${Math.round((d.receivedBytes / d.totalBytes) * 100)}%`
                      : d.state}
                  </span>
                </div>
                <div className="download-actions">
                  {d.state === "progressing" && (
                    <button onClick={() => void window.inix?.downloads.cancel(d.id)}>Cancel</button>
                  )}
                  {d.state === "completed" && (
                    <button onClick={() => void window.inix?.downloads.open(d.id)}>Show in folder</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {downloads.some((d) => d.state !== "progressing") && (
          <footer className="downloads-footer">
            <button onClick={() => void window.inix?.downloads.clear().then(refresh)}>Clear completed</button>
          </footer>
        )}
      </div>
    </>
  );
}
