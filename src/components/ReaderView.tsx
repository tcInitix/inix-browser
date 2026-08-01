interface ReaderViewProps {
  title: string;
  url: string;
  text: string;
  onClose: () => void;
}

export function ReaderView({ title, url, text, onClose }: ReaderViewProps) {
  return (
    <div className="reader-overlay">
      <header className="reader-header">
        <div>
          <h2>{title}</h2>
          <span className="reader-url">{url}</span>
        </div>
        <button onClick={onClose} aria-label="Close reader">
          ✕
        </button>
      </header>
      <article className="reader-content">
        {text.split(/\n\n+/).map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </article>
    </div>
  );
}
