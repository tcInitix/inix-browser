import { type FormEvent, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface VaultUnlockModalProps {
  open: boolean;
  onClose: () => void;
  onUnlocked: () => void;
  setupMode?: boolean;
}

export function VaultUnlockModal({ open, onClose, onUnlocked, setupMode }: VaultUnlockModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    void window.inix?.window.setTypingCapture(true);
    void window.inix?.browser.hide();
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => {
      cancelAnimationFrame(frame);
      void window.inix?.window.setTypingCapture(false);
    };
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    const result = setupMode
      ? await window.inix?.vault.setup(password)
      : await window.inix?.vault.unlock(password);
    if (result?.ok) {
      onUnlocked();
      onClose();
    } else {
      alert(result?.error ?? "Vault access failed");
    }
  };

  return createPortal(
    <div
      className="vault-overlay"
      onClick={onClose}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="vault-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{setupMode ? "Set Vault Password" : "Unlock History Vault"}</h2>
        <p className="vault-warning">
          {setupMode
            ? "Your vault password cannot be recovered if lost. All vaulted history will be permanently inaccessible."
            : "Enter your master password to view vaulted history."}
        </p>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <label>
            Master password
            <input
              ref={inputRef}
              name="password"
              type="password"
              required
              minLength={4}
              autoComplete={setupMode ? "new-password" : "current-password"}
            />
          </label>
          <div className="vault-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit">{setupMode ? "Create vault" : "Unlock"}</button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
