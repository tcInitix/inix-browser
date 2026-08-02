import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ProfileAvatar, PROFILE_COLORS, readAvatarDataUrl } from "./ProfileAvatar";

export interface BrowserProfile {
  id: string;
  name: string;
  color: string;
  avatar?: string | null;
}

interface BrowserProfileEditorProps {
  profile: BrowserProfile;
  onSaved: () => void;
  onCancel: () => void;
}

export function BrowserProfileEditor({ profile, onSaved, onCancel }: BrowserProfileEditorProps) {
  const [name, setName] = useState(profile.name);
  const [color, setColor] = useState(profile.color);
  const [avatar, setAvatar] = useState<string | null>(profile.avatar ?? null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(profile.name);
    setColor(profile.color);
    setAvatar(profile.avatar ?? null);
    setAvatarError(null);
  }, [profile]);

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
      setAvatar(await readAvatarDataUrl(file));
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Could not load image");
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await window.inix?.profiles.update(profile.id, {
        name: name.trim() || "Profile",
        color,
        avatar,
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const displayName = name.trim() || "Profile";

  return (
    <div className="profile-editor">
      <p className="profile-editor-title">
        Edit {profile.id === "default" ? "default profile" : "profile"}
      </p>

      <div className="profile-editor-preview">
        <button
          type="button"
          className="onboarding-profile-avatar-btn"
          onClick={() => avatarInputRef.current?.click()}
          title="Upload profile photo"
        >
          <ProfileAvatar
            name={displayName}
            color={color}
            avatar={avatar}
            size={64}
            className="onboarding-profile-avatar"
          />
          <span className="onboarding-profile-avatar-hint">Change photo</span>
        </button>
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => void handleAvatarChange(e)}
        />
        {avatar && (
          <button type="button" className="onboarding-profile-remove-photo" onClick={() => setAvatar(null)}>
            Remove photo
          </button>
        )}
      </div>

      {avatarError && <p className="settings-callout settings-callout-error">{avatarError}</p>}

      <label className="settings-field">
        <span>Profile name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={32}
          autoFocus
        />
      </label>

      <fieldset className="onboarding-profile-colors">
        <legend>Accent color</legend>
        <div className="onboarding-profile-swatches" role="list">
          {PROFILE_COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              role="listitem"
              className={`onboarding-profile-swatch${color === swatch ? " selected" : ""}`}
              style={{ background: swatch }}
              aria-label={`Color ${swatch}`}
              aria-pressed={color === swatch}
              onClick={() => setColor(swatch)}
            />
          ))}
        </div>
      </fieldset>

      <div className="settings-actions-row">
        <button type="button" className="settings-primary-btn" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save profile"}
        </button>
        <button type="button" className="settings-secondary-btn" disabled={saving} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
