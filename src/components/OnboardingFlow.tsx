import { useState, type FormEvent } from "react";
import { InixLogo } from "./InixLogo";

export interface OnboardingResult {
  historyMode: "standard" | "transient";
  bookmarkBar: boolean;
  homepageUrl: string;
  newTabUseHomepage: boolean;
  vaultPassword: string;
}

interface OnboardingFlowProps {
  onComplete: (result: OnboardingResult) => void;
}

const STEPS = ["welcome", "privacy", "customize", "vault", "done"] as const;
type Step = (typeof STEPS)[number];

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [historyMode, setHistoryMode] = useState<"standard" | "transient">("standard");
  const [bookmarkBar, setBookmarkBar] = useState(false);
  const [homepageUrl, setHomepageUrl] = useState("inix://newtab");
  const [newTabUseHomepage, setNewTabUseHomepage] = useState(false);
  const [vaultPassword, setVaultPassword] = useState("");
  const [vaultConfirm, setVaultConfirm] = useState("");

  const stepIndex = STEPS.indexOf(step);

  const goNext = () => {
    const i = STEPS.indexOf(step);
    if (i < STEPS.length - 1) setStep(STEPS[i + 1]!);
  };

  const goBack = () => {
    const i = STEPS.indexOf(step);
    if (i > 0) setStep(STEPS[i - 1]!);
  };

  const finish = (skipVault = false) => {
    onComplete({
      historyMode,
      bookmarkBar,
      homepageUrl: homepageUrl.trim() || "inix://newtab",
      newTabUseHomepage,
      vaultPassword: skipVault ? "" : vaultPassword,
    });
  };

  const handleVaultNext = (e: FormEvent) => {
    e.preventDefault();
    if (!vaultPassword && !vaultConfirm) {
      goNext();
      return;
    }
    if (vaultPassword.length < 4) {
      alert("Vault password must be at least 4 characters, or leave blank to skip.");
      return;
    }
    if (vaultPassword !== vaultConfirm) {
      alert("Passwords do not match.");
      return;
    }
    goNext();
  };

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-panel">
        <div className="onboarding-progress" aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s} className={`onboarding-dot${i <= stepIndex ? " active" : ""}`} />
          ))}
        </div>

        {step === "welcome" && (
          <div className="onboarding-step">
            <InixLogo height={72} className="onboarding-logo" />
            <h1>Welcome to Inix</h1>
            <p className="onboarding-lead">
              A fast, private browser that keeps your data on your device — not in the cloud.
            </p>
            <ul className="onboarding-features">
              <li>Tracker blocking enabled by default</li>
              <li>Local AI assistant (optional, runs on your machine or your own API)</li>
              <li>Encrypted vault for passwords and sensitive history</li>
              <li>Library canvas for bookmarks — plus an optional classic bar</li>
            </ul>
            <div className="onboarding-actions">
              <button type="button" className="onboarding-primary" onClick={goNext}>
                Get started
              </button>
            </div>
          </div>
        )}

        {step === "privacy" && (
          <div className="onboarding-step">
            <h2>Privacy & history</h2>
            <p className="onboarding-lead">
              Choose how Inix remembers where you&apos;ve been. You can change this anytime in Settings.
            </p>
            <div className="onboarding-options">
              <label className={`onboarding-option${historyMode === "standard" ? " selected" : ""}`}>
                <input
                  type="radio"
                  name="history"
                  checked={historyMode === "standard"}
                  onChange={() => setHistoryMode("standard")}
                />
                <span className="onboarding-option-title">Standard history</span>
                <span className="onboarding-option-desc">
                  Save browsing history locally for search and autocomplete.
                </span>
              </label>
              <label className={`onboarding-option${historyMode === "transient" ? " selected" : ""}`}>
                <input
                  type="radio"
                  name="history"
                  checked={historyMode === "transient"}
                  onChange={() => setHistoryMode("transient")}
                />
                <span className="onboarding-option-title">Transient history</span>
                <span className="onboarding-option-desc">
                  Visits expire automatically — lighter footprint, less persistence.
                </span>
              </label>
            </div>
            <p className="settings-note">Third-party tracker blocking is always on.</p>
            <div className="onboarding-actions">
              <button type="button" className="onboarding-secondary" onClick={goBack}>
                Back
              </button>
              <button type="button" className="onboarding-primary" onClick={goNext}>
                Continue
              </button>
            </div>
          </div>
        )}

        {step === "customize" && (
          <div className="onboarding-step">
            <h2>Make it yours</h2>
            <p className="onboarding-lead">Optional tweaks — all changeable later in Settings.</p>
            <label className="onboarding-toggle">
              <input
                type="checkbox"
                checked={bookmarkBar}
                onChange={(e) => setBookmarkBar(e.target.checked)}
              />
              <span>Show classic bookmarks bar (Chrome / Firefox style)</span>
            </label>
            <label className="onboarding-field">
              <span>Homepage</span>
              <input
                type="text"
                value={homepageUrl}
                onChange={(e) => setHomepageUrl(e.target.value)}
                placeholder="inix://newtab or https://..."
                spellCheck={false}
              />
            </label>
            <label className="onboarding-toggle">
              <input
                type="checkbox"
                checked={newTabUseHomepage}
                onChange={(e) => setNewTabUseHomepage(e.target.checked)}
              />
              <span>Open homepage when creating new tabs</span>
            </label>
            <div className="onboarding-actions">
              <button type="button" className="onboarding-secondary" onClick={goBack}>
                Back
              </button>
              <button type="button" className="onboarding-primary" onClick={goNext}>
                Continue
              </button>
            </div>
          </div>
        )}

        {step === "vault" && (
          <div className="onboarding-step">
            <h2>Vault & passwords</h2>
            <p className="onboarding-lead">
              The vault encrypts saved passwords and sensitive data on this device. Set a master password
              now, or skip and configure it later in Settings.
            </p>
            <form className="onboarding-vault-form" onSubmit={handleVaultNext}>
              <label className="onboarding-field">
                <span>Master password (optional)</span>
                <input
                  type="password"
                  value={vaultPassword}
                  onChange={(e) => setVaultPassword(e.target.value)}
                  minLength={4}
                  autoComplete="new-password"
                />
              </label>
              <label className="onboarding-field">
                <span>Confirm password</span>
                <input
                  type="password"
                  value={vaultConfirm}
                  onChange={(e) => setVaultConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </label>
              <p className="settings-note">There is no password recovery if you forget it.</p>
              <div className="onboarding-actions">
                <button type="button" className="onboarding-secondary" onClick={goBack}>
                  Back
                </button>
                <button
                  type="button"
                  className="onboarding-secondary"
                  onClick={() => {
                    setVaultPassword("");
                    setVaultConfirm("");
                    goNext();
                  }}
                >
                  Skip for now
                </button>
                <button type="submit" className="onboarding-primary">
                  Continue
                </button>
              </div>
            </form>
          </div>
        )}

        {step === "done" && (
          <div className="onboarding-step onboarding-step-done">
            <h2>You&apos;re all set</h2>
            <p className="onboarding-lead">
              Inix is ready. Press <kbd>Ctrl</kbd>+<kbd>L</kbd> to focus the address bar, or open the
              Inix AI sidebar from the toolbar when you need help summarizing a page.
            </p>
            <div className="onboarding-actions">
              <button type="button" className="onboarding-secondary" onClick={goBack}>
                Back
              </button>
              <button type="button" className="onboarding-primary" onClick={() => finish(false)}>
                Start browsing
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
