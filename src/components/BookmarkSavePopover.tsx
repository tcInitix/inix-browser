import { useEffect, useRef, useState } from "react";

interface BookmarkSavePopoverProps {
  open: boolean;
  bookmarkId?: number;
  initialTitle?: string;
  initialTags?: string[];
  onClose: () => void;
  onRemove: () => void;
  onSave: (data: { title: string; tags: string[] }) => void;
}

export function BookmarkSavePopover({
  open,
  initialTitle = "",
  initialTags = [],
  onClose,
  onRemove,
  onSave,
}: BookmarkSavePopoverProps) {
  const [title, setTitle] = useState(initialTitle);
  const [tagsInput, setTagsInput] = useState(initialTags.join(", "));
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setTagsInput(initialTags.join(", "));
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open, initialTitle, initialTags]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleDone = () => {
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    onSave({ title: title.trim(), tags });
  };

  return (
    <>
      <div className="bookmark-popover-backdrop" onClick={onClose} />
      <div className="bookmark-popover" role="dialog" aria-label="Edit bookmark">
        <div className="bookmark-popover-header">
          <strong>Bookmark saved</strong>
        </div>
        <label className="bookmark-popover-field">
          <span>Name</span>
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleDone();
            }}
          />
        </label>
        <label className="bookmark-popover-field">
          <span>Tags (comma-separated)</span>
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="work, research, favorites"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleDone();
            }}
          />
        </label>
        <div className="bookmark-popover-actions">
          <button type="button" className="permission-deny" onClick={onRemove}>
            Remove
          </button>
          <button type="button" className="permission-allow" onClick={handleDone}>
            Done
          </button>
        </div>
      </div>
    </>
  );
}
