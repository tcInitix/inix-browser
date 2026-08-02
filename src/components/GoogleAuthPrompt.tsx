import { useEffect, useState } from "react";
import type { GoogleAuthSession } from "../inix.d";
import { DismissibleOverlay } from "./DismissibleOverlay";

interface GoogleAuthPromptProps {
  session: GoogleAuthSession | null;
  onComplete: () => Promise<void>;
  onCancel: () => void;
  onReopen: () => void;
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
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DismissibleOverlay onDismiss={busy ? undefined : onCancel}>
      <div className="permission-prompt google-auth-prompt">
        <h3>Sign in with Google</h3>
        <p>
          Google blocks sign-in inside Inix. Finish signing in in{" "}
          <strong>{session.browserLabel}</strong>, then import your session back here.
        </p>
        <ol className="google-auth-steps">
          <li>Complete the Google sign-in in {session.browserLabel}</li>
          <li>Return to Inix and click <strong>Import session</strong></li>
        </ol>
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
