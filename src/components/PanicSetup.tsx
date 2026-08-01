import { useEffect, useState, type FormEvent } from "react";
import { normalizePanicUrls } from "../utils/panic";
import { DismissibleOverlay } from "./DismissibleOverlay";

interface PanicSetupProps {
  initialUrls?: string[];
  onSave: (urls: string[]) => void | Promise<void>;
  onCancel: () => void;
}

export function PanicSetup({ initialUrls = [""], onSave, onCancel }: PanicSetupProps) {
  const [rows, setRows] = useState<string[]>(initialUrls.length > 0 ? initialUrls : [""]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const addRow = () => setRows((prev) => [...prev, ""]);

  const removeRow = (index: number) => {
    setRows((prev) => (prev.length <= 1 ? [""] : prev.filter((_, i) => i !== index)));
  };

  const updateRow = (index: number, value: string) => {
    setRows((prev) => prev.map((row, i) => (i === index ? value : row)));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const urls = normalizePanicUrls(rows);
    if (urls.length === 0) {
      setError("Add at least one URL (each opens in its own tab).");
      return;
    }
    setError(null);
    await onSave(urls);
  };

  return (
    <DismissibleOverlay onDismiss={onCancel}>
      <form className="panic-setup-panel permission-prompt" onSubmit={(e) => void handleSubmit(e)}>
        <h2>Set up Panic switch</h2>
        <p className="panic-setup-lead">
          Choose the safe pages to show when you hit the panic button. Use one URL or several — each
          opens in its own tab. Press again to return exactly where you left off.
        </p>

        <div className="panic-setup-urls">
          <label className="panic-setup-label">Safe URLs</label>
          {rows.map((row, index) => (
            <div key={index} className="panic-setup-row">
              <input
                type="text"
                className="panic-setup-input"
                placeholder={index === 0 ? "google.com" : "https://example.com"}
                value={row}
                onChange={(e) => updateRow(index, e.target.value)}
                autoFocus={index === 0}
              />
              <button
                type="button"
                className="panic-setup-remove"
                onClick={() => removeRow(index)}
                aria-label="Remove URL"
                disabled={rows.length === 1 && !row.trim()}
              >
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="panic-setup-add" onClick={addRow}>
            + Add another tab
          </button>
        </div>

        {error && <p className="panic-setup-error">{error}</p>}

        <p className="panic-setup-hint">Shortcut: Ctrl+Shift+P · Change these anytime in Settings → Tabs</p>

        <div className="panic-setup-actions">
          <button type="button" className="permission-deny" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="permission-allow">
            Save &amp; switch
          </button>
        </div>
      </form>
    </DismissibleOverlay>
  );
}
