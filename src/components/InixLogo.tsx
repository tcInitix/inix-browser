interface InixLogoProps {
  /** Render height in CSS pixels */
  height?: number;
  className?: string;
}

export function InixLogo({ height = 24, className }: InixLogoProps) {
  return (
    <img
      src="/logo.png"
      alt="Inix"
      className={className}
      style={{ height, width: "auto" }}
      draggable={false}
    />
  );
}
