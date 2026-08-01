interface AiThinkingIndicatorProps {
  label?: string;
  compact?: boolean;
}

export function AiThinkingIndicator({
  label = "Thinking…",
  compact = false,
}: AiThinkingIndicatorProps) {
  return (
    <div
      className={`ai-thinking${compact ? " ai-thinking-compact" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className="ai-thinking-ring" aria-hidden="true" />
      <span className="ai-thinking-label">{label}</span>
    </div>
  );
}
