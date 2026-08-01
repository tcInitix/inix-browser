import type { ReactNode } from "react";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  className?: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, className = "", disabled }: SwitchProps) {
  return (
    <label className={`inix-switch${className ? ` ${className}` : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="inix-switch-track" aria-hidden="true">
        <span className="inix-switch-thumb" />
      </span>
      <span className="inix-switch-label">{label}</span>
    </label>
  );
}
