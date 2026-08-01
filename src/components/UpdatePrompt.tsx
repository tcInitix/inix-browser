import { useEffect } from "react";
import { DismissibleOverlay } from "./DismissibleOverlay";
import { MarkdownText } from "./MarkdownText";
import {
  friendlyUpdateError,
  isTechnicalUpdateDump,
  prepareReleaseNotes,
} from "../utils/update-text";

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

function safeNotes(notes: string | undefined, version: string): string | undefined {
  if (!notes?.trim()) return undefined;
  if (isTechnicalUpdateDump(notes)) return undefined;
  return prepareReleaseNotes(notes.trim(), version);
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
        <div className="permission-prompt update-prompt update-prompt-compact">
          <header className="update-prompt-header">
            <span className="update-prompt-badge">Updating</span>
            <h3>Downloading update…</h3>
          </header>
          <div className="update-progress-track">
            <div className="update-progress-fill" style={{ width: `${Math.round(state.percent)}%` }} />
          </div>
          <p className="update-prompt-meta">{Math.round(state.percent)}% complete</p>
        </div>
      </DismissibleOverlay>
    );
  }

  if (state.status === "ready") {
    return (
      <DismissibleOverlay onDismiss={onDismiss}>
        <div className="permission-prompt update-prompt update-prompt-compact">
          <header className="update-prompt-header">
            <span className="update-prompt-badge update-prompt-badge-ready">Ready</span>
            <h3>Update ready</h3>
            <p className="update-prompt-lead">
              Inix <strong>{state.version}</strong> has been downloaded. Restart to finish installing.
            </p>
          </header>
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
        <div className="permission-prompt update-prompt update-prompt-compact">
          <header className="update-prompt-header">
            <span className="update-prompt-badge update-prompt-badge-error">Error</span>
            <h3>Update failed</h3>
            <p className="update-prompt-lead">{friendlyUpdateError(state.message)}</p>
          </header>
          <div className="permission-actions">
            <button type="button" className="permission-allow" onClick={onDismiss}>
              OK
            </button>
          </div>
        </div>
      </DismissibleOverlay>
    );
  }

  const notes = safeNotes(state.releaseNotes, state.version);

  return (
    <DismissibleOverlay onDismiss={onDismiss}>
      <div className="permission-prompt update-prompt">
        <header className="update-prompt-header">
          <span className="update-prompt-badge">New version</span>
          <h3>Update available</h3>
          <p className="update-prompt-lead">
            Inix <strong>{state.version}</strong> is ready to download — new features, improvements,
            and fixes.
          </p>
        </header>

        {notes ? (
          <section className="update-release-notes" aria-label="Release notes">
            <MarkdownText text={notes} />
          </section>
        ) : (
          <p className="update-prompt-fallback">See the release on GitHub for what&apos;s new.</p>
        )}

        <footer className="permission-actions update-prompt-actions">
          <button type="button" className="permission-deny" onClick={onDismiss}>
            Not now
          </button>
          <button type="button" className="permission-allow" onClick={onDownload}>
            Download update
          </button>
        </footer>
      </div>
    </DismissibleOverlay>
  );
}
