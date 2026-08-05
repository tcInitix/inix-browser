import { useEffect, useState } from "react";
import type { GoogleAuthSession } from "../inix.d";
import { DismissibleOverlay } from "./DismissibleOverlay";

interface GoogleAuthPromptProps {
  session: GoogleAuthSession | null;
  onComplete: () => Promise<void>;
  onCancel: () => void;
  onReopen: () => void;
}

function friendlyImportError(message: string): string {
  const ipcMatch = message.match(/Error invoking remote method '[^']+':(?: Error:)?\s*(.+)$/i);
  return ipcMatch?.[1]?.trim() || message;
}

export function GoogleAuthPrompt({ session, onComplete, onCancel, onReopen }: GoogleAuthPromptProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      setError(null);
      setBusy(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, busy, onCancel]);

  if (!session) return null;

  const handleImport = async () => {
    setBusy(true);
    setError(null);
    try {
      await onComplete();
    } catch (err) {
      setError(friendlyImportError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DismissibleOverlay onDismiss={busy ? undefined : onCancel}>
      <div className="permission-prompt google-auth-prompt">
        <h3>Sign in with Google</h3>
        <p>
          Google blocks sign-in inside Inix. Inix opens a separate{" "}
          <strong>{session.browserLabel}</strong> window for sign-in — not your everyday browser profile.
        </p>
        <ol className="google-auth-steps">
          <li>Sign in with Google in the {session.browserLabel} window Inix opened</li>
          <li>Click <strong>Import session</strong> — Inix closes that window and copies your login</li>
        </ol>
        <p className="google-auth-note">
          Your regular {session.browserLabel} windows are not affected. You can leave them open.
        </p>
        {error && <p className="google-auth-error">{error}</p>}
        <div className="permission-actions">
          <button className="permission-deny" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="permission-deny" onClick={onReopen} disabled={busy}>
            Open {session.browserLabel} again
          </button>
          <button className="permission-allow" onClick={() => void handleImport()} disabled={busy}>
            {busy ? "Importing…" : "Import session"}
          </button>
        </div>
      </div>
    </DismissibleOverlay>
  );
}
