import { type FormEvent } from "react";

interface VaultUnlockModalProps {
  open: boolean;
  onClose: () => void;
  onUnlocked: () => void;
  setupMode?: boolean;
}

export function VaultUnlockModal({ open, onClose, onUnlocked, setupMode }: VaultUnlockModalProps) {
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

  return (
    <div className="vault-overlay" onClick={onClose}>
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
            <input name="password" type="password" autoFocus required minLength={4} />
          </label>
          <div className="vault-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit">{setupMode ? "Create vault" : "Unlock"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
