import { useEffect } from "react";
import type { PermissionRequest } from "../inix.d";
import { DismissibleOverlay } from "./DismissibleOverlay";

interface PermissionPromptProps {
  request: PermissionRequest | null;
  onRespond: (allow: boolean) => void;
}

const LABELS: Record<string, string> = {
  media: "Camera and microphone",
  geolocation: "Location",
  notifications: "Notifications",
  "clipboard-read": "Clipboard read",
  "clipboard-sanitized-write": "Clipboard write",
  fullscreen: "Fullscreen",
  openExternal: "Open external app",
  unknown: "Site permission",
};

export function PermissionPrompt({ request, onRespond }: PermissionPromptProps) {
  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onRespond(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request, onRespond]);

  if (!request) return null;

  const label = LABELS[request.permission] ?? request.permission.replace(/-/g, " ");
  const accessText =
    request.permission === "unknown" || !LABELS[request.permission]
      ? "wants permission to use a browser feature on this site."
      : `wants access to ${label.toLowerCase()}.`;

  return (
    <DismissibleOverlay onDismiss={() => onRespond(false)}>
      <div className="permission-prompt">
        <h3>{LABELS[request.permission] ?? "Site permission"}</h3>
        <p>
          <strong>{(() => {
            try {
              return new URL(request.requestingUrl).hostname;
            } catch {
              return request.requestingUrl;
            }
          })()}</strong>{" "}
          {accessText}
        </p>
        <div className="permission-actions">
          <button className="permission-deny" onClick={() => onRespond(false)}>
            Block
          </button>
          <button className="permission-allow" onClick={() => onRespond(true)}>
            Allow & remember
          </button>
        </div>
      </div>
    </DismissibleOverlay>
  );
}
