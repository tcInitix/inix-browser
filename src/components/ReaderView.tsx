import { useEffect, useMemo, useRef, useState } from "react";

interface ReaderViewProps {
  title: string;
  url: string;
  text: string;
  onClose: () => void;
}

type ReaderFont = "sans" | "serif" | "mono";
type ReaderTheme = "light" | "sepia" | "dark";
type ReaderSize = "small" | "medium" | "large" | "xl";

const FONT_STACK: Record<ReaderFont, string> = {
  sans: "'Inter', 'Segoe UI', system-ui, sans-serif",
  serif: "'Georgia', 'Cambria', 'Times New Roman', serif",
  mono: "'JetBrains Mono', 'Consolas', monospace",
};

const SIZE_PX: Record<ReaderSize, number> = {
  small: 15,
  medium: 17,
  large: 20,
  xl: 23,
};

const STORAGE_KEY = "inix.reader-prefs";

interface Prefs {
  font: ReaderFont;
  theme: ReaderTheme;
  size: ReaderSize;
}

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Prefs;
      return {
        font: parsed.font ?? "serif",
        theme: parsed.theme ?? "sepia",
        size: parsed.size ?? "medium",
      };
    }
  } catch {
    // fall through
  }
  return { font: "serif", theme: "sepia", size: "medium" };
}

function savePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

export function ReaderView({ title, url, text, onClose }: ReaderViewProps) {
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    savePrefs(prefs);
  }, [prefs]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const paragraphs = useMemo(() => text.split(/\n\n+/), [text]);
  const wordCount = useMemo(() => text.trim().split(/\s+/).length, [text]);
  const readingTimeMin = Math.max(1, Math.round(wordCount / 220));

  const handleSpeak = () => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1;
    utter.pitch = 1;
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    utteranceRef.current = utter;
    window.speechSynthesis.speak(utter);
    setSpeaking(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await window.inix?.bookmarks.addUrlToBar(url);
      if (result) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  };

  const themeClass = `reader-theme-${prefs.theme}`;

  return (
    <div className={`reader-overlay ${themeClass}`}>
      <div className="reader-toolbar">
        <div className="reader-toolbar-group">
          <button className="reader-tool-btn" onClick={onClose} title="Close (Esc)">
            ✕
          </button>
          <span className="reader-toolbar-sep" aria-hidden />
          <span className="reader-toolbar-meta">
            {wordCount.toLocaleString()} words · {readingTimeMin} min read
          </span>
        </div>

        <div className="reader-toolbar-group">
          <div className="reader-seg" role="group" aria-label="Font">
            {(["sans", "serif", "mono"] as ReaderFont[]).map((f) => (
              <button
                key={f}
                className={`reader-seg-btn${prefs.font === f ? " active" : ""}`}
                onClick={() => setPrefs((p) => ({ ...p, font: f }))}
                title={`${f} font`}
              >
                {f === "sans" ? "Aa" : f === "serif" ? "𝐴𝑎" : "</>"}
              </button>
            ))}
          </div>

          <div className="reader-seg" role="group" aria-label="Size">
            {(["small", "medium", "large", "xl"] as ReaderSize[]).map((s) => (
              <button
                key={s}
                className={`reader-seg-btn${prefs.size === s ? " active" : ""}`}
                onClick={() => setPrefs((p) => ({ ...p, size: s }))}
                title={`${s} size`}
              >
                {s === "small" ? "A-" : s === "medium" ? "A" : s === "large" ? "A+" : "A++"}
              </button>
            ))}
          </div>

          <div className="reader-seg" role="group" aria-label="Theme">
            {(["light", "sepia", "dark"] as ReaderTheme[]).map((t) => (
              <button
                key={t}
                className={`reader-seg-btn reader-theme-btn-${t}${prefs.theme === t ? " active" : ""}`}
                onClick={() => setPrefs((p) => ({ ...p, theme: t }))}
                title={`${t} theme`}
                aria-label={`${t} theme`}
              />
            ))}
          </div>

          <button
            className={`reader-tool-btn${speaking ? " active" : ""}`}
            onClick={handleSpeak}
            title={speaking ? "Stop reading aloud" : "Read aloud"}
          >
            {speaking ? "⏸" : "🔊"}
          </button>

          <button
            className={`reader-tool-btn${saved ? " active" : ""}`}
            onClick={handleSave}
            disabled={saving}
            title="Save to Library"
          >
            {saved ? "✓ Saved" : saving ? "Saving…" : "★ Save"}
          </button>
        </div>
      </div>

      <div className="reader-scroll">
        <article
          className="reader-content"
          style={{
            fontFamily: FONT_STACK[prefs.font],
            fontSize: `${SIZE_PX[prefs.size]}px`,
            lineHeight: 1.7,
          }}
        >
          <header className="reader-article-header">
            <h1>{title}</h1>
            <a
              className="reader-url"
              href={url}
              onClick={(e) => {
                e.preventDefault();
                onClose();
              }}
            >
              {(() => {
                try {
                  return new URL(url).hostname;
                } catch {
                  return url;
                }
              })()}
            </a>
          </header>
          {paragraphs.map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </article>
      </div>
    </div>
  );
}
