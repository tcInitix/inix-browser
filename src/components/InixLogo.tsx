interface InixLogoProps {
  /** Render height in CSS pixels */
  height?: number;
  className?: string;
}

export function InixLogo({ height = 24, className }: InixLogoProps) {
  const logoSrc = `${import.meta.env.BASE_URL}logo.png`;

  return (
    <img
      src={logoSrc}
      alt="Inix"
      className={className}
      style={{ height, width: "auto" }}
      draggable={false}
    />
  );
}
