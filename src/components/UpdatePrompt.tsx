import { useEffect } from "react";
import { DismissibleOverlay } from "./DismissibleOverlay";
import { friendlyUpdateError, isTechnicalUpdateDump } from "../utils/update-text";

export type UpdateState =
  | { status: "idle" }
  | { status: "available"; version: string; releaseNotes?: string }
  | { status: "downloading"; percent: number }
  | { status: "ready"; version: string }
  | { status: "error"; message: string };

interface UpdatePromptProps {
  state: UpdateState;
  onDownload: () => void;
  onInstall: () => void;
  onDismiss: () => void;
}

function safeNotes(notes?: string): string | undefined {
  if (!notes?.trim()) return undefined;
  if (isTechnicalUpdateDump(notes)) return undefined;
  return notes.trim();
}

export function UpdatePrompt({ state, onDownload, onInstall, onDismiss }: UpdatePromptProps) {
  useEffect(() => {
    if (state.status === "idle" || state.status === "downloading") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.status, onDismiss]);

  if (state.status === "idle") return null;

  if (state.status === "downloading") {
    return (
      <DismissibleOverlay passive>
        <div className="permission-prompt update-prompt">
          <h3>Downloading update…</h3>
          <div className="update-progress-track">
            <div className="update-progress-fill" style={{ width: `${Math.round(state.percent)}%` }} />
          </div>
          <p className="settings-note">{Math.round(state.percent)}%</p>
        </div>
      </DismissibleOverlay>
    );
  }

  if (state.status === "ready") {
    return (
      <DismissibleOverlay onDismiss={onDismiss}>
        <div className="permission-prompt update-prompt">
          <h3>Update ready</h3>
          <p>Inix {state.version} has been downloaded. Restart to finish installing.</p>
          <div className="permission-actions">
            <button type="button" className="permission-deny" onClick={onDismiss}>
              Later
            </button>
            <button type="button" className="permission-allow" onClick={onInstall}>
              Restart and update
            </button>
          </div>
        </div>
      </DismissibleOverlay>
    );
  }

  if (state.status === "error") {
    return (
      <DismissibleOverlay onDismiss={onDismiss}>
        <div className="permission-prompt update-prompt">
          <h3>Update failed</h3>
          <p>{friendlyUpdateError(state.message)}</p>
          <div className="permission-actions">
            <button type="button" className="permission-allow" onClick={onDismiss}>
              OK
            </button>
          </div>
        </div>
      </DismissibleOverlay>
    );
  }

  const notes = safeNotes(state.releaseNotes);

  return (
    <DismissibleOverlay onDismiss={onDismiss}>
      <div className="permission-prompt update-prompt">
        <h3>Update available</h3>
        <p>
          Inix <strong>{state.version}</strong> is available. You are on the current installed build.
        </p>
        {notes ? (
          <div className="update-release-notes">{notes}</div>
        ) : (
          <p className="settings-note">See the release on GitHub for what&apos;s new.</p>
        )}
        <div className="permission-actions">
          <button type="button" className="permission-deny" onClick={onDismiss}>
            Not now
          </button>
          <button type="button" className="permission-allow" onClick={onDownload}>
            Download update
          </button>
        </div>
      </div>
    </DismissibleOverlay>
  );
}
