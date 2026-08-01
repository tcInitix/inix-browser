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

function looksLikeTechnicalDump(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes('"statuscode"') ||
    lower.includes("httpexecutor") ||
    lower.includes("x-github-request-id") ||
    lower.includes("content-security-policy") ||
    lower.includes("app.asar")
  );
}

function safeNotes(notes?: string): string | undefined {
  if (!notes?.trim()) return undefined;
  if (looksLikeTechnicalDump(notes)) return undefined;
  return notes.trim();
}

function safeError(message: string): string {
  if (looksLikeTechnicalDump(message)) {
    return "Something went wrong while fetching the update. Try again from Settings → Data.";
  }
  return message.length > 240 ? `${message.slice(0, 240)}…` : message;
}

export function UpdatePrompt({ state, onDownload, onInstall, onDismiss }: UpdatePromptProps) {
  if (state.status === "idle") return null;

  if (state.status === "downloading") {
    return (
      <div className="permission-overlay permission-overlay-passive">
        <div className="permission-prompt update-prompt">
          <h3>Downloading update…</h3>
          <div className="update-progress-track">
            <div className="update-progress-fill" style={{ width: `${Math.round(state.percent)}%` }} />
          </div>
          <p className="settings-note">{Math.round(state.percent)}%</p>
        </div>
      </div>
    );
  }

  if (state.status === "ready") {
    return (
      <div className="permission-overlay">
        <div className="permission-prompt update-prompt">
          <h3>Update ready</h3>
          <p>
            Inix {state.version} has been downloaded. Restart to finish installing.
          </p>
          <div className="permission-actions">
            <button type="button" className="permission-deny" onClick={onDismiss}>
              Later
            </button>
            <button type="button" className="permission-allow" onClick={onInstall}>
              Restart and update
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="permission-overlay">
        <div className="permission-prompt update-prompt">
          <h3>Update failed</h3>
          <p>{safeError(state.message)}</p>
          <div className="permission-actions">
            <button type="button" className="permission-allow" onClick={onDismiss}>
              OK
            </button>
          </div>
        </div>
      </div>
    );
  }

  const notes = safeNotes(state.releaseNotes);

  return (
    <div className="permission-overlay">
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
    </div>
  );
}
