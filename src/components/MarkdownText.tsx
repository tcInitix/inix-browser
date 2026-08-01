import { Fragment, type ReactElement } from "react";

type InlinePart =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string };

function parseInline(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  const re = /\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      parts.push({ type: "text", value: text.slice(last, match.index) });
    }
    if (match[1] != null) parts.push({ type: "bold", value: match[1] });
    else if (match[2] != null) parts.push({ type: "bold", value: match[2] });
    else if (match[3] != null) parts.push({ type: "bold", value: match[3] });
    else if (match[4] != null) parts.push({ type: "italic", value: match[4] });
    last = match.index + match[0].length;
  }

  if (last < text.length) {
    parts.push({ type: "text", value: text.slice(last) });
  }

  return parts.length ? parts : [{ type: "text", value: text }];
}

function InlineMarkdown({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((part, i) => {
        if (part.type === "bold") {
          return <strong key={i}>{part.value}</strong>;
        }
        if (part.type === "italic") {
          return <em key={i}>{part.value}</em>;
        }
        return <Fragment key={i}>{part.value}</Fragment>;
      })}
    </>
  );
}

const HEADING_RE = /^(#{1,3})\s+(.+)$/;
const BULLET_LINE_RE = /^(\s*)[*\-]\s+(.+)$/;
const NUMBERED_LINE_RE = /^(\s*)\d+\.\s+(.+)$/;

/** Lightweight markdown: bullets, bold (** or *), italic (_). */
export function MarkdownText({ text }: { text: string }) {
  if (!text) return null;

  const lines = text.split("\n");
  const blocks: ReactElement[] = [];
  let bulletItems: string[] = [];
  let numberedItems: string[] = [];
  let key = 0;

  const flushBullets = () => {
    if (bulletItems.length === 0) return;
    blocks.push(
      <ul key={key++} className="ai-md-list">
        {bulletItems.map((item, i) => (
          <li key={i}>
            <InlineMarkdown text={item} />
          </li>
        ))}
      </ul>
    );
    bulletItems = [];
  };

  const flushNumbered = () => {
    if (numberedItems.length === 0) return;
    blocks.push(
      <ol key={key++} className="ai-md-list ai-md-list-ordered">
        {numberedItems.map((item, i) => (
          <li key={i}>
            <InlineMarkdown text={item} />
          </li>
        ))}
      </ol>
    );
    numberedItems = [];
  };

  const flushLists = () => {
    flushBullets();
    flushNumbered();
  };

  for (const line of lines) {
    const headingMatch = line.match(HEADING_RE);
    const bulletMatch = line.match(BULLET_LINE_RE);
    const numberedMatch = line.match(NUMBERED_LINE_RE);

    if (headingMatch) {
      flushLists();
      const level = headingMatch[1].length;
      const headingClass =
        level === 1 ? "ai-md-h1" : level === 2 ? "ai-md-h2" : "ai-md-h3";
      blocks.push(
        <div key={key++} className={headingClass}>
          <InlineMarkdown text={headingMatch[2]} />
        </div>
      );
      continue;
    }

    if (bulletMatch) {
      flushNumbered();
      bulletItems.push(bulletMatch[2]);
      continue;
    }

    if (numberedMatch) {
      flushBullets();
      numberedItems.push(numberedMatch[2]);
      continue;
    }

    flushLists();

    if (!line.trim()) {
      blocks.push(<div key={key++} className="ai-md-spacer" />);
      continue;
    }

    blocks.push(
      <p key={key++} className="ai-md-paragraph">
        <InlineMarkdown text={line} />
      </p>
    );
  }

  flushLists();

  return <>{blocks}</>;
}
