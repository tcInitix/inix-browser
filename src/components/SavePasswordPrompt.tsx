import { useEffect, useState } from "react";
import { DismissibleOverlay } from "./DismissibleOverlay";
import { PasswordGenerator } from "./PasswordGenerator";

export interface SavePasswordOffer {
  origin: string;
  username: string;
  password: string;
  title: string;
  tabId?: string;
}

interface SavePasswordPromptProps {
  offer: SavePasswordOffer | null;
  onSave: (password: string) => void;
  onDismiss: () => void;
}

export function SavePasswordPrompt({ offer, onSave, onDismiss }: SavePasswordPromptProps) {
  const [showGenerator, setShowGenerator] = useState(false);
  const [overridePassword, setOverridePassword] = useState<string | null>(null);

  useEffect(() => {
    if (!offer) return;
    setShowGenerator(false);
    setOverridePassword(null);
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

  const effectivePassword = overridePassword ?? offer.password;

  return (
    <DismissibleOverlay onDismiss={onDismiss}>
      <div className="permission-prompt save-password-prompt">
        <h3>Save password?</h3>
        <p>
          Save login for <strong>{hostname}</strong> as <strong>{offer.username}</strong>?
        </p>
        {overridePassword && (
          <p className="settings-note">
            Using a suggested strong password (will replace the one you typed).
          </p>
        )}
        <p className="settings-note">Stored encrypted in your vault on this device.</p>

        <div className="save-password-generator-toggle">
          <button
            type="button"
            className="ghost-button"
            onClick={() => setShowGenerator((v) => !v)}
          >
            {showGenerator ? "Hide password generator" : "Suggest strong password"}
          </button>
        </div>
        {showGenerator && (
          <PasswordGenerator
            compact
            onUse={(pw) => {
              setOverridePassword(pw);
              setShowGenerator(false);
            }}
          />
        )}

        <div className="permission-actions">
          <button className="permission-deny" type="button" onClick={onDismiss}>
            Not now
          </button>
          <button className="permission-allow" type="button" onClick={() => onSave(effectivePassword)}>
            Save
          </button>
        </div>
      </div>
    </DismissibleOverlay>
  );
}
