import { useEffect } from "react";

export interface SavePasswordOffer {
  origin: string;
  username: string;
  password: string;
  title: string;
  tabId?: string;
}

interface SavePasswordPromptProps {
  offer: SavePasswordOffer | null;
  onSave: () => void;
  onDismiss: () => void;
}

export function SavePasswordPrompt({ offer, onSave, onDismiss }: SavePasswordPromptProps) {
  useEffect(() => {
    if (!offer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [offer, onDismiss]);

  if (!offer) return null;

  let hostname = offer.origin;
  try {
    hostname = new URL(offer.origin).hostname;
  } catch {
    // keep origin string
  }

  return (
    <div className="permission-overlay">
      <div className="permission-prompt">
        <h3>Save password?</h3>
        <p>
          Save login for <strong>{hostname}</strong> as <strong>{offer.username}</strong>?
        </p>
        <p className="settings-note">Stored encrypted in your vault on this device.</p>
        <div className="permission-actions">
          <button className="permission-deny" type="button" onClick={onDismiss}>
            Not now
          </button>
          <button className="permission-allow" type="button" onClick={onSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
