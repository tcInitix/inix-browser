import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { InixLogo } from "./InixLogo";
import { Switch } from "./Switch";
import { ProfileAvatar, PROFILE_COLORS, readAvatarDataUrl } from "./ProfileAvatar";

export interface OnboardingResult {
  profileName: string;
  profileColor: string;
  profileAvatar: string | null;
  historyMode: "standard" | "transient";
  bookmarkBar: boolean;
  homepageUrl: string;
  newTabUseHomepage: boolean;
  vaultPassword: string;
}

interface OnboardingFlowProps {
  onComplete: (result: OnboardingResult) => void;
}

const STEPS = ["welcome", "profile", "privacy", "customize", "vault", "done"] as const;
type Step = (typeof STEPS)[number];

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [profileName, setProfileName] = useState("");
  const [profileColor, setProfileColor] = useState<string>(PROFILE_COLORS[0]);
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [historyMode, setHistoryMode] = useState<"standard" | "transient">("standard");
  const [bookmarkBar, setBookmarkBar] = useState(false);
  const [homepageUrl, setHomepageUrl] = useState("inix://newtab");
  const [newTabUseHomepage, setNewTabUseHomepage] = useState(false);
  const [vaultPassword, setVaultPassword] = useState("");
  const [vaultConfirm, setVaultConfirm] = useState("");

  const stepIndex = STEPS.indexOf(step);
  const displayName = profileName.trim() || "You";

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
      profileName: profileName.trim() || "Default",
      profileColor,
      profileAvatar,
      historyMode,
      bookmarkBar,
      homepageUrl: homepageUrl.trim() || "inix://newtab",
      newTabUseHomepage,
      vaultPassword: skipVault ? "" : vaultPassword,
    });
  };

  const handleProfileNext = (e: FormEvent) => {
    e.preventDefault();
    goNext();
  };

  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setAvatarError("Please choose an image file");
      return;
    }
    try {
      setAvatarError(null);
      setProfileAvatar(await readAvatarDataUrl(file));
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Could not load image");
    }
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

        {step === "profile" && (
          <div className="onboarding-step">
            <h2>Set up your profile</h2>
            <p className="onboarding-lead">
              Choose a name and look for this browser profile — like Chrome, but everything stays local.
            </p>

            <form className="onboarding-profile-form" onSubmit={handleProfileNext}>
              <div className="onboarding-profile-preview">
                <button
                  type="button"
                  className="onboarding-profile-avatar-btn"
                  onClick={() => avatarInputRef.current?.click()}
                  title="Upload profile photo"
                >
                  <ProfileAvatar
                    name={displayName}
                    color={profileColor}
                    avatar={profileAvatar}
                    size={88}
                    className="onboarding-profile-avatar"
                  />
                  <span className="onboarding-profile-avatar-hint">Add photo</span>
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => void handleAvatarChange(e)}
                />
                {profileAvatar && (
                  <button
                    type="button"
                    className="onboarding-profile-remove-photo"
                    onClick={() => setProfileAvatar(null)}
                  >
                    Remove photo
                  </button>
                )}
              </div>

              {avatarError && <p className="settings-callout settings-callout-error">{avatarError}</p>}

              <label className="onboarding-field">
                <span>Profile name</span>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="Your name"
                  autoFocus
                  maxLength={32}
                />
              </label>

              <fieldset className="onboarding-profile-colors">
                <legend>Accent color</legend>
                <div className="onboarding-profile-swatches" role="list">
                  {PROFILE_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      role="listitem"
                      className={`onboarding-profile-swatch${profileColor === color ? " selected" : ""}`}
                      style={{ background: color }}
                      aria-label={`Color ${color}`}
                      aria-pressed={profileColor === color}
                      onClick={() => setProfileColor(color)}
                    />
                  ))}
                </div>
              </fieldset>

              <div className="onboarding-actions">
                <button type="button" className="onboarding-secondary" onClick={goBack}>
                  Back
                </button>
                <button type="submit" className="onboarding-primary">
                  Continue
                </button>
              </div>
            </form>
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
            <Switch
              className="onboarding-toggle"
              checked={bookmarkBar}
              onChange={setBookmarkBar}
              label="Show classic bookmarks bar (Chrome / Firefox style)"
            />
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
            <Switch
              className="onboarding-toggle"
              checked={newTabUseHomepage}
              onChange={setNewTabUseHomepage}
              label="Open homepage when creating new tabs"
            />
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
            <ProfileAvatar
              name={displayName}
              color={profileColor}
              avatar={profileAvatar}
              size={64}
              className="onboarding-done-avatar"
            />
            <h2>Welcome{displayName !== "You" ? `, ${displayName}` : ""}</h2>
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
