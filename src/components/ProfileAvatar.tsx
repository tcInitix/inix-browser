interface ProfileAvatarProps {
  name: string;
  color: string;
  avatar?: string | null;
  size?: number;
  className?: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]!.charAt(0) + parts[1]!.charAt(0)).toUpperCase();
  }
  return (parts[0]?.charAt(0) ?? "?").toUpperCase();
}

export function ProfileAvatar({
  name,
  color,
  avatar,
  size = 72,
  className = "",
}: ProfileAvatarProps) {
  const style = {
    width: size,
    height: size,
    background: avatar ? undefined : color,
    fontSize: Math.round(size * 0.38),
  };

  return (
    <div
      className={`profile-avatar${className ? ` ${className}` : ""}`}
      style={style}
      aria-hidden={!name}
    >
      {avatar ? <img src={avatar} alt="" className="profile-avatar-img" /> : initials(name || "?")}
    </div>
  );
}

/** Resize an image file to a square data URL (max side length). */
export async function readAvatarDataUrl(file: File, maxSize = 128): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  if (dataUrl.length > 120_000) {
    throw new Error("Image is too large — try a smaller photo");
  }
  return dataUrl;
}

export const PROFILE_COLORS = [
  "#6366f1",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#8b5cf6",
  "#ec4899",
] as const;
