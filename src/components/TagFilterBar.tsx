interface TagFilterBarProps {
  tags: string[];
  active: string[];
  onChange: (tags: string[]) => void;
}

export function TagFilterBar({ tags, active, onChange }: TagFilterBarProps) {
  const toggle = (tag: string) => {
    if (active.includes(tag)) {
      onChange(active.filter((t) => t !== tag));
    } else {
      onChange([...active, tag]);
    }
  };

  if (tags.length === 0) return null;

  return (
    <div className="tag-filter-bar">
      <button
        type="button"
        className={`tag-filter-chip${active.length === 0 ? " active" : ""}`}
        onClick={() => onChange([])}
      >
        All
      </button>
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          className={`tag-filter-chip${active.includes(tag) ? " active" : ""}`}
          onClick={() => toggle(tag)}
        >
          #{tag}
        </button>
      ))}
    </div>
  );
}
