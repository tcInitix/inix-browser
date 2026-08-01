import { extractLinksFromText, linkDisplayLabel, splitMessageWithLinks } from "../utils/extractLinks";
import { MarkdownText } from "./MarkdownText";

interface AiMessageContentProps {
  content: string;
  streaming?: boolean;
  messageId: string;
  dismissedLinks: Set<string>;
  offerLinks?: boolean;
  onDismissLink: (messageId: string, url: string) => void;
  onOpenLink: (url: string) => void;
}

export function AiMessageContent({
  content,
  streaming,
  messageId,
  dismissedLinks,
  offerLinks = true,
  onDismissLink,
  onOpenLink,
}: AiMessageContentProps) {
  const parts = splitMessageWithLinks(content);
  const offers =
    streaming || !offerLinks
      ? []
      : extractLinksFromText(content).filter((l) => !dismissedLinks.has(l.url));

  return (
    <>
      <div className="ai-msg-body">
        {parts.map((part, i) =>
          part.type === "link" ? (
            <span key={i} className="ai-inline-link" title={part.value}>
              {part.value}
            </span>
          ) : (
            <MarkdownText key={i} text={part.value} />
          )
        )}
        {streaming && <span className="ai-cursor">▍</span>}
      </div>

      {offers.length > 0 && (
        <div className="ai-link-offers">
          {offers.map((link) => (
            <div key={link.url} className="ai-link-offer" title={link.url}>
              <div className="ai-link-offer-info">
                <span className="ai-link-offer-label">Open this page?</span>
                <span className="ai-link-offer-title">{linkDisplayLabel(link)}</span>
              </div>
              <div className="ai-link-offer-actions">
                <button
                  type="button"
                  className="ai-link-open"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenLink(link.url);
                  }}
                >
                  Open
                </button>
                <button
                  type="button"
                  className="ai-link-dismiss"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismissLink(messageId, link.url);
                  }}
                >
                  Not now
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
